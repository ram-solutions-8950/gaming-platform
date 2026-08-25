"""Real-time Deals Rummy WebSocket endpoint and connection manager."""
from __future__ import annotations

import asyncio
import json
import random
import uuid
from collections import OrderedDict, defaultdict
from typing import Dict, List, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from pydantic import ValidationError

from contextlib import contextmanager
from ..database import SessionLocal
from ..dependencies.database import get_db
from ..models.rummy import RummyRound, RummyTable, RummyTableMode, RummyTableStatus
from ..models.transaction import WalletTransactionType
from ..models.user import User, UserStatus
from ..schemas.rummy import TableCreate
from ..security.jwt import decode_access_token
from ..services.rummy import bot_strategy
from ..services.rummy.deals_rummy import DealsRummyGame, GameConfig, Phase, Player
from ..services.rummy.errors import GameError
from ..services.rummy.game_manager import game_manager
from ..services.wallet_service import credit_wallet, debit_wallet


@contextmanager
def _get_db_session():
    # Check FastAPI dependency overrides (used during pytest / test database)
    from ..main import app
    override = app.dependency_overrides.get(get_db, get_db)
    gen = override()
    db = next(gen)
    try:
        yield db
    finally:
        try:
            next(gen, None)
        except Exception:
            pass

router = APIRouter()


class RummyConnectionManager:
    def __init__(self) -> None:
        self._tables: Dict[str, Dict[str, WebSocket]] = defaultdict(dict)
        self._lock = asyncio.Lock()

    async def connect(self, table_id: str, user_id: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            old = self._tables[table_id].get(user_id)
            if old is not None:
                try:
                    await old.close()
                except Exception:
                    pass
            self._tables[table_id][user_id] = ws

    async def disconnect(self, table_id: str, user_id: str) -> None:
        async with self._lock:
            conns = self._tables.get(table_id)
            if conns and conns.get(user_id):
                conns.pop(user_id, None)
                if not conns:
                    self._tables.pop(table_id, None)

    async def send_to_user(self, table_id: str, user_id: str, message: dict) -> None:
        ws = self._tables.get(table_id, {}).get(user_id)
        if ws is not None:
            try:
                await ws.send_json(message)
            except Exception:
                await self.disconnect(table_id, user_id)

    async def broadcast(self, table_id: str, message: dict) -> None:
        for user_id, ws in list(self._tables.get(table_id, {}).items()):
            try:
                await ws.send_json(message)
            except Exception:
                await self.disconnect(table_id, user_id)

    def connected_users(self, table_id: str) -> list[str]:
        return list(self._tables.get(table_id, {}).keys())


manager = RummyConnectionManager()

_turn_timers: dict[str, asyncio.Task] = {}
_BOT_ID_PREFIX = "bot-"
_BOT_JOIN_DELAY_SECONDS = 10
_BOT_NAMES = ["Rummy Master", "Asha (Bot)", "Rahul (Bot)", "Meera (Bot)", "Vikram (Bot)", "Priya (Bot)"]
_bot_join_timers: dict[str, asyncio.Task] = {}
_bot_turn_pending: set[str] = set()

_processed_action_ids: dict[str, "OrderedDict[str, bool]"] = defaultdict(OrderedDict)
_MAX_TRACKED_ACTIONS_PER_TABLE = 500


def _is_bot(player_id: str) -> bool:
    return player_id.startswith(_BOT_ID_PREFIX)


def _already_processed(table_id: str, action_id: Optional[str]) -> bool:
    if not action_id:
        return False
    return action_id in _processed_action_ids[table_id]


def _mark_processed(table_id: str, action_id: Optional[str]) -> None:
    if not action_id:
        return
    bucket = _processed_action_ids[table_id]
    bucket[action_id] = True
    if len(bucket) > _MAX_TRACKED_ACTIONS_PER_TABLE:
        bucket.popitem(last=False)


def _authenticate(token: Optional[str]) -> Optional[tuple[str, str]]:
    if not token:
        return None
    try:
        payload = decode_access_token(token)
        if not payload:
            return None
        user_id = payload.get("sub")
    except Exception:
        return None
    if not user_id:
        return None
    with _get_db_session() as db:
        try:
            uid = uuid.UUID(str(user_id))
        except ValueError:
            return None
        user = db.query(User).filter(User.id == uid).first()
        if user is None or user.status != UserStatus.ACTIVE:
            return None
        return str(user.id), user.username


def _load_config(table_id: str) -> GameConfig:
    with _get_db_session() as db:
        try:
            tid = uuid.UUID(str(table_id))
            table = db.query(RummyTable).filter(RummyTable.id == tid).first()
        except Exception:
            table = None
        if table is None:
            return GameConfig()
        return GameConfig(
            num_deals=table.num_deals,
            pool_limit=table.pool_limit,
            turn_seconds=table.turn_seconds,
            starting_chips=table.starting_chips,
            max_players=table.max_players,
            mode=table.mode.value if hasattr(table.mode, "value") else str(table.mode),
        )


async def _broadcast_state(table_id: str) -> None:
    game = game_manager.get(table_id)
    if game is None:
        return
    await manager.broadcast(table_id, {"type": "state", "state": game.public_state()})
    for uid in manager.connected_users(table_id):
        try:
            hand = game.private_hand(uid)
        except Exception:
            hand = []
        await manager.send_to_user(table_id, uid, {"type": "hand", "cards": hand})


def _cancel_timer(table_id: str) -> None:
    task = _turn_timers.pop(table_id, None)
    if task and not task.done():
        task.cancel()


def _arm_timer(table_id: str) -> None:
    _cancel_timer(table_id)
    game = game_manager.get(table_id)
    if game is None or game.phase not in (Phase.AWAIT_DRAW, Phase.AWAIT_DISCARD):
        return
    _turn_timers[table_id] = asyncio.create_task(_turn_timeout(table_id, game.config.turn_seconds))


async def _turn_timeout(table_id: str, seconds: int) -> None:
    try:
        await asyncio.sleep(seconds)
    except asyncio.CancelledError:
        return
    game = game_manager.get(table_id)
    if game is None:
        return
    try:
        current = game.current_player().id
        if game.phase == Phase.AWAIT_DRAW:
            drawn = game.draw(current, "stock")
            game.discard(current, drawn.code)
        elif game.phase == Phase.AWAIT_DISCARD:
            worst = max(game.current_player().hand, key=lambda c: c.deadwood_points(game.wild_rank))
            game.discard(current, worst.code)
    except GameError:
        return
    await manager.broadcast(table_id, {"type": "event", "event": "turn_timeout", "player": current})
    await _broadcast_state(table_id)
    if game.phase in (Phase.AWAIT_DRAW, Phase.AWAIT_DISCARD):
        _arm_timer(table_id)
    _maybe_trigger_bot_turn(table_id)


def _maybe_schedule_bot_join(table_id: str) -> None:
    game = game_manager.get(table_id)
    if game is None or game.config.mode != "free":
        return
    if game.phase != Phase.WAITING or len(game.players) != 1:
        return
    if table_id in _bot_join_timers:
        return
    _bot_join_timers[table_id] = asyncio.create_task(_bot_join_after_delay(table_id))


async def _bot_join_after_delay(table_id: str) -> None:
    try:
        await asyncio.sleep(_BOT_JOIN_DELAY_SECONDS)
    except asyncio.CancelledError:
        return
    finally:
        _bot_join_timers.pop(table_id, None)

    game = game_manager.get(table_id)
    if game is None or game.phase != Phase.WAITING or len(game.players) != 1:
        return
    lone = game.players[0]
    if lone.id not in manager.connected_users(table_id):
        return

    bot_id = f"{_BOT_ID_PREFIX}{table_id[:8]}"
    try:
        game.add_player(bot_id, random.choice(_BOT_NAMES))
    except GameError:
        return
    await manager.broadcast(table_id, {"type": "event", "event": "bot_joined", "player": bot_id})
    await _broadcast_state(table_id)


def _maybe_trigger_bot_turn(table_id: str) -> None:
    game = game_manager.get(table_id)
    if game is None or game.phase != Phase.AWAIT_DRAW or not game.players:
        return
    if not _is_bot(game.current_player().id):
        return
    if table_id in _bot_turn_pending:
        return
    _bot_turn_pending.add(table_id)
    asyncio.create_task(_run_bot_turn(table_id))


async def _run_bot_turn(table_id: str) -> None:
    try:
        await asyncio.sleep(random.uniform(1.0, 2.0))
        game = game_manager.get(table_id)
        if game is None or game.phase != Phase.AWAIT_DRAW or not game.players:
            return
        player: Player = game.current_player()
        if not _is_bot(player.id):
            return
        bot_id = player.id
        _cancel_timer(table_id)

        try:
            source = bot_strategy.choose_draw_source(player.hand, game.shoe.top_discard(), game.wild_rank)
            game.draw(bot_id, source)

            declare_groups = bot_strategy.try_find_declare(player.hand, game.wild_rank)
            if declare_groups is not None:
                result = game.declare(bot_id, declare_groups)
                await manager.broadcast(table_id, {"type": "event", "event": "declared",
                                                   "player": bot_id, "valid": result.valid,
                                                   "reason": result.reason})
            else:
                discard_code = bot_strategy.choose_discard(player.hand, game.wild_rank)
                game.discard(bot_id, discard_code)
        except GameError:
            return

        await _broadcast_state(table_id)

        if game.phase == Phase.GAME_OVER:
            _cancel_timer(table_id)
            _settle_real_money(table_id, game)
            await manager.broadcast(table_id, {"type": "event", "event": "game_over",
                                               "winner": game.winner_id})
        elif game.phase == Phase.DEAL_OVER:
            _cancel_timer(table_id)
            _settle_real_money(table_id, game)
            await manager.broadcast(table_id, {"type": "event", "event": "deal_over"})
        elif game.phase in (Phase.AWAIT_DRAW, Phase.AWAIT_DISCARD):
            _arm_timer(table_id)
    finally:
        _bot_turn_pending.discard(table_id)
        _maybe_trigger_bot_turn(table_id)


def _settle_real_money(table_id: str, game: DealsRummyGame) -> None:
    if game.winner_id is None:
        return
    with _get_db_session() as db:
        try:
            tid = uuid.UUID(str(table_id))
            table = db.query(RummyTable).filter(RummyTable.id == tid).first()
        except Exception:
            return
        if table is None or str(table.mode.value if hasattr(table.mode, "value") else table.mode) != "real_money":
            return
        point_value = table.entry_fee_paise
        if point_value <= 0:
            return

        deal_key = f"{table_id}:{game.deal_number}"
        total_credit = 0
        for p in game.players:
            if p.id == game.winner_id or p.deal_points <= 0 or _is_bot(p.id):
                continue
            amount = p.deal_points * point_value
            try:
                uid = uuid.UUID(p.id)
                debit_wallet(
                    db=db,
                    user_id=uid,
                    amount=amount,
                    tx_type=WalletTransactionType.GAME_ENTRY,
                    reference_type="RUMMY_STAKE",
                    reference_id=f"rummy_stake_{deal_key}_{p.id}",
                    metadata={"table_id": table_id, "deal_number": game.deal_number, "points": p.deal_points}
                )
                total_credit += amount
            except Exception:
                pass

        if total_credit > 0 and not _is_bot(game.winner_id):
            try:
                winner_uid = uuid.UUID(game.winner_id)
                credit_wallet(
                    db=db,
                    user_id=winner_uid,
                    amount=total_credit,
                    tx_type=WalletTransactionType.GAME_WIN,
                    reference_type="RUMMY_PAYOUT",
                    reference_id=f"rummy_payout_{deal_key}",
                    metadata={"table_id": table_id, "deal_number": game.deal_number, "prize_pool": total_credit}
                )
            except Exception:
                pass

        # Record finished round
        try:
            round_record = RummyRound(
                table_id=tid,
                winner_user_id=uuid.UUID(game.winner_id) if not _is_bot(game.winner_id) else None,
                deals_played=game.deal_number,
                result_json=json.dumps(game.public_state()),
                prize_pool_paise=total_credit,
            )
            db.add(round_record)
            if game.phase == Phase.GAME_OVER:
                table.status = RummyTableStatus.FINISHED
        except Exception:
            pass

        db.commit()


@router.websocket("/ws/game/{table_id}")
async def game_socket(websocket: WebSocket, table_id: str) -> None:
    token = websocket.query_params.get("token")
    auth = _authenticate(token)
    if auth is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    user_id, username = auth

    game = game_manager.get_or_create(table_id, _load_config(table_id))
    await manager.connect(table_id, user_id, websocket)

    try:
        if not any(p.id == user_id for p in game.players):
            game.add_player(user_id, username)
    except GameError as exc:
        await manager.send_to_user(table_id, user_id, {"type": "error", "message": str(exc)})

    await manager.send_to_user(table_id, user_id, {"type": "event", "event": "joined"})
    await _broadcast_state(table_id)
    _maybe_schedule_bot_join(table_id)
    _maybe_trigger_bot_turn(table_id)

    try:
        while True:
            msg = await websocket.receive_json()
            await _handle_action(table_id, user_id, msg)
    except WebSocketDisconnect:
        await manager.disconnect(table_id, user_id)
        await manager.broadcast(table_id, {"type": "event", "event": "left", "player": user_id})
    except Exception as exc:
        await manager.send_to_user(table_id, user_id, {"type": "error", "message": str(exc)})
        await manager.disconnect(table_id, user_id)


_MUTATING_ACTIONS = {"start", "draw", "discard", "drop", "declare"}


async def _handle_action(table_id: str, user_id: str, msg: dict) -> None:
    game = game_manager.get(table_id)
    if game is None:
        return
    action = msg.get("action")
    action_id = msg.get("action_id")

    if action in _MUTATING_ACTIONS and _already_processed(table_id, action_id):
        await _broadcast_state(table_id)
        return

    try:
        if action == "start":
            game.start_deal()
            await manager.broadcast(table_id, {"type": "event", "event": "deal_started",
                                               "deal": game.deal_number})
        elif action == "draw":
            game.draw(user_id, msg.get("source", "stock"))
        elif action == "discard":
            game.discard(user_id, msg["card"])
        elif action == "drop":
            game.drop(user_id)
        elif action == "declare":
            result = game.declare(user_id, msg.get("groups", []))
            await manager.broadcast(table_id, {"type": "event", "event": "declared",
                                               "player": user_id, "valid": result.valid,
                                               "reason": result.reason})
        elif action == "sync":
            pass
        else:
            await manager.send_to_user(table_id, user_id,
                                       {"type": "error", "message": f"unknown action {action}"})
            return
    except GameError as exc:
        await manager.send_to_user(table_id, user_id, {"type": "error", "message": str(exc)})
        return

    if action in _MUTATING_ACTIONS:
        _mark_processed(table_id, action_id)

    await _broadcast_state(table_id)

    if game.phase == Phase.GAME_OVER:
        _cancel_timer(table_id)
        _settle_real_money(table_id, game)
        await manager.broadcast(table_id, {"type": "event", "event": "game_over",
                                           "winner": game.winner_id})
    elif game.phase == Phase.DEAL_OVER:
        _cancel_timer(table_id)
        _settle_real_money(table_id, game)
        await manager.broadcast(table_id, {"type": "event", "event": "deal_over"})
    elif game.phase in (Phase.AWAIT_DRAW, Phase.AWAIT_DISCARD):
        _arm_timer(table_id)

    _maybe_trigger_bot_turn(table_id)


# --- Matchmaking WebSocket -------------------------------------------------------------
_MATCHMAKING_TIMEOUT_SECONDS = 15
_QueueKey = tuple
_queue: dict[_QueueKey, list["asyncio.Future[str]"]] = defaultdict(list)
_queue_lock = asyncio.Lock()


def _queue_key(cfg: TableCreate) -> _QueueKey:
    return (cfg.mode, cfg.entry_fee_paise, cfg.max_players, cfg.num_deals, cfg.pool_limit)


def _create_table_record(cfg: TableCreate) -> str:
    with SessionLocal() as db:
        table = RummyTable(
            name=cfg.name,
            mode=RummyTableMode(cfg.mode),
            max_players=cfg.max_players,
            num_deals=cfg.num_deals,
            entry_fee_paise=cfg.entry_fee_paise,
            pool_limit=cfg.pool_limit,
            turn_seconds=cfg.turn_seconds,
            starting_chips=cfg.starting_chips,
            is_private=False,
        )
        db.add(table)
        db.commit()
        db.refresh(table)
        return str(table.id)


async def _dequeue(key: _QueueKey, fut: "asyncio.Future[str]") -> None:
    async with _queue_lock:
        bucket = _queue.get(key)
        if bucket and fut in bucket:
            bucket.remove(fut)


@router.websocket("/ws/matchmaking")
async def matchmaking_socket(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    auth = _authenticate(token)
    if auth is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()

    try:
        criteria = await websocket.receive_json()
    except WebSocketDisconnect:
        return

    try:
        cfg = TableCreate(**{**criteria, "is_private": False})
    except ValidationError as exc:
        await websocket.send_json({"type": "error", "message": str(exc)})
        await websocket.close()
        return

    if cfg.mode == "real_money" and cfg.entry_fee_paise <= 0:
        await websocket.send_json({"type": "error", "message": "real-money tables need an entry fee"})
        await websocket.close()
        return

    key = _queue_key(cfg)
    loop = asyncio.get_event_loop()
    my_future: "asyncio.Future[str]" = loop.create_future()

    matched_table_id: Optional[str] = None
    async with _queue_lock:
        bucket = _queue[key]
        if bucket:
            opponent_future = bucket.pop(0)
            matched_table_id = _create_table_record(cfg)
            if not opponent_future.done():
                opponent_future.set_result(matched_table_id)
        else:
            bucket.append(my_future)

    if matched_table_id:
        await websocket.send_json({"type": "matched", "table_id": matched_table_id, "solo": False})
        await websocket.close()
        return

    recv_task = asyncio.create_task(websocket.receive_json())
    try:
        done, _pending = await asyncio.wait(
            {my_future, recv_task},
            timeout=_MATCHMAKING_TIMEOUT_SECONDS,
            return_when=asyncio.FIRST_COMPLETED,
        )

        if my_future in done:
            recv_task.cancel()
            await websocket.send_json({"type": "matched", "table_id": my_future.result(), "solo": False})
            return

        if recv_task in done:
            await _dequeue(key, my_future)
            recv_task.result()
            if my_future.done():
                await websocket.send_json({"type": "matched", "table_id": my_future.result(), "solo": False})
            else:
                await websocket.send_json({"type": "cancelled"})
            return

        recv_task.cancel()
        await _dequeue(key, my_future)
        if my_future.done():
            await websocket.send_json({"type": "matched", "table_id": my_future.result(), "solo": False})
        elif cfg.mode == "free":
            table_id = _create_table_record(cfg)
            await websocket.send_json({"type": "matched", "table_id": table_id, "solo": True})
        else:
            await websocket.send_json({"type": "no_opponent"})
    except WebSocketDisconnect:
        recv_task.cancel()
        await _dequeue(key, my_future)
        return
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
