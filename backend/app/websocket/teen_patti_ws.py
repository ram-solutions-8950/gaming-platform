"""
Real-time Teen Patti WebSocket Table Handler.
"""
from __future__ import annotations

import asyncio
import json
import random
import uuid
from collections import defaultdict
from contextlib import contextmanager
from typing import Any, Dict, Optional, Tuple

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from ..database import SessionLocal
from ..dependencies.database import get_db
from ..models.teen_patti import TeenPattiHandHistory, TeenPattiTable, TeenPattiTableMode, TeenPattiTableStatus
from ..models.transaction import WalletTransactionType
from ..models.user import User, UserStatus
from ..security.jwt import decode_access_token
from ..services.rummy.errors import GameError
from ..services.teen_patti import bot_strategy
from ..services.teen_patti.cards import Card, new_server_seed, server_seed_hash
from ..services.teen_patti.engine import GameConfig, Phase, PlayerStatus, Seat, TeenPattiHand
from ..services.teen_patti.hand_rank import category_of
from ..services.teen_patti.manager import teen_patti_manager
from ..services.wallet_service import credit_wallet, debit_wallet, get_balance
class TeenPattiConnectionManager:
    def __init__(self) -> None:
        self._tables: Dict[str, Dict[str, WebSocket]] = defaultdict(dict)

    async def connect(self, table_id: str, user_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._tables[table_id][user_id] = websocket

    async def disconnect(self, table_id: str, user_id: str) -> None:
        self._tables[table_id].pop(user_id, None)
        if not self._tables[table_id]:
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


manager = TeenPattiConnectionManager()

router = APIRouter()

# Turn / countdown timers
_turn_timers: Dict[str, asyncio.Task] = {}
_bot_timers: Dict[str, asyncio.Task] = {}
_start_timers: Dict[str, asyncio.Task] = {}
_bot_join_timers: Dict[str, asyncio.Task] = {}
_pending_side_show: Dict[str, Dict[str, str]] = {}
_processed_actions: Dict[str, set] = defaultdict(set)
_rng_per_table: Dict[str, random.Random] = {}
_hand_number: Dict[str, int] = defaultdict(lambda: 1)
_table_locks: Dict[str, asyncio.Lock] = {}


def _get_table_lock(table_id: str) -> asyncio.Lock:
    if table_id not in _table_locks:
        _table_locks[table_id] = asyncio.Lock()
    return _table_locks[table_id]


_BOT_JOIN_DELAY_SECONDS = 3.0
_START_COUNTDOWN_SECONDS = 3.0
_NEXT_HAND_DELAY_SECONDS = 5.0
_BOT_NAMES = ["Aryan", "Rohan", "Kabir", "Aditya", "Vikram", "Neha", "Priya", "Ananya"]

_MUTATING_ACTIONS = {"see", "bet", "pack", "show", "side_show", "side_show_respond"}


@contextmanager
def _get_db_session():
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


def _authenticate(token: Optional[str]) -> Optional[Tuple[str, str]]:
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
        return str(user.id), user.name or user.username


def _load_config(table_id: str) -> Tuple[GameConfig, str]:
    with _get_db_session() as db:
        try:
            tid = uuid.UUID(str(table_id))
            table = db.query(TeenPattiTable).filter(TeenPattiTable.id == tid).first()
        except Exception:
            table = None
        if table:
            return GameConfig(
                boot_amount=table.boot_amount,
                max_players=table.max_players,
                turn_seconds=table.turn_seconds,
            ), table.mode.value
    return GameConfig(boot_amount=1000, max_players=4, turn_seconds=15), "real"


def _already_processed(table_id: str, action_id: Optional[str]) -> bool:
    return bool(action_id and action_id in _processed_actions[table_id])


def _mark_processed(table_id: str, action_id: Optional[str]) -> None:
    if action_id:
        _processed_actions[table_id].add(action_id)


def _cancel(timer_map: Dict[str, asyncio.Task], table_id: str) -> None:
    task = timer_map.pop(table_id, None)
    if task and not task.done():
        task.cancel()


def _is_bot(seat_id: str) -> bool:
    return seat_id.startswith("bot_")


def _rng(table_id: str) -> random.Random:
    if table_id not in _rng_per_table:
        _rng_per_table[table_id] = random.Random()
    return _rng_per_table[table_id]


async def _broadcast_state(table_id: str) -> None:
    hand = teen_patti_manager.get(table_id)
    if hand is None:
        return
    for seat in hand.seats:
        if _is_bot(seat.id):
            continue
        payload = {"type": "state", "state": hand.as_dict(for_user_id=seat.id)}
        await manager.send_to_user(table_id, seat.id, payload)


async def _start_hand(table_id: str) -> None:
    hand = teen_patti_manager.get(table_id)
    if hand is None or hand.phase != Phase.WAITING:
        return
    if len(hand.seats) < 2:
        return

    _cancel(_turn_timers, table_id)
    _cancel(_bot_timers, table_id)
    _cancel(_start_timers, table_id)
    _pending_side_show.pop(table_id, None)

    hand.start_hand(client_seed=f"tp_{table_id}_{_hand_number[table_id]}", nonce=_hand_number[table_id])

    try:
        with _get_db_session() as db:
            tid = uuid.UUID(str(table_id))
            table = db.query(TeenPattiTable).filter(TeenPattiTable.id == tid).first()
            if table:
                table.status = TeenPattiTableStatus.RUNNING
                db.commit()
    except Exception:
        pass

    await manager.broadcast(table_id, {
        "type": "event",
        "event": "hand_started",
        "hand_number": _hand_number[table_id],
        "pot": hand.pot,
        "current_stake": hand.current_stake,
    })
    await _broadcast_state(table_id)
    _arm_turn_timer(table_id)
    _maybe_trigger_bot_turn(table_id)


def _arm_turn_timer(table_id: str) -> None:
    _cancel(_turn_timers, table_id)
    hand = teen_patti_manager.get(table_id)
    if hand is None or hand.phase != Phase.PLAYING:
        return
    curr_seat = hand.seats[hand.current_turn]
    if _is_bot(curr_seat.id):
        return  # Bot has its own trigger
    seconds = hand.config.turn_seconds
    _turn_timers[table_id] = asyncio.create_task(_turn_timeout(table_id, curr_seat.id, seconds))


async def _turn_timeout(table_id: str, expected_user: str, seconds: int) -> None:
    try:
        await asyncio.sleep(seconds)
    except asyncio.CancelledError:
        return
    hand = teen_patti_manager.get(table_id)
    if hand is None or hand.phase != Phase.PLAYING:
        return
    curr_seat = hand.seats[hand.current_turn]
    if curr_seat.id == expected_user:
        try:
            hand.pack(expected_user)
        except GameError:
            return
        await _after_action(table_id)


_MIN_PLAYERS_TO_START = 2

def _schedule_bot_fill(table_id: str) -> None:
    """Schedules bots to fill up to the minimum player count if the table is
    still short after a delay. This was previously dead code — the
    _BOT_JOIN_DELAY_SECONDS / _BOT_NAMES constants existed but nothing ever
    called add_seat(is_bot=True), so a lone player just sat waiting forever.

    Only fills up to _MIN_PLAYERS_TO_START (not all the way to max_players):
    real players can still join a WAITING table afterwards, and topping it
    all the way up with bots would needlessly displace genuine opponents —
    bots never get credited on a win, so a bot winning against real players
    would just make their stakes vanish for nothing."""
    hand = teen_patti_manager.get(table_id)
    if hand is None or hand.phase != Phase.WAITING:
        return
    if len(hand.seats) >= _MIN_PLAYERS_TO_START:
        return
    _cancel(_bot_join_timers, table_id)
    _bot_join_timers[table_id] = asyncio.create_task(_bot_fill_task(table_id))


async def _bot_fill_task(table_id: str) -> None:
    try:
        await asyncio.sleep(_BOT_JOIN_DELAY_SECONDS)
    except asyncio.CancelledError:
        return
    lock = _get_table_lock(table_id)
    async with lock:
        hand = teen_patti_manager.get(table_id)
        if hand is None or hand.phase != Phase.WAITING:
            return
        idx = 0
        target = min(hand.config.max_players, _MIN_PLAYERS_TO_START)
        while len(hand.seats) < target and idx < len(_BOT_NAMES):
            bot_id = f"bot_{table_id}_{idx}"
            if not any(s.id == bot_id for s in hand.seats):
                try:
                    hand.add_seat(bot_id, _BOT_NAMES[idx], is_bot=True)
                except GameError:
                    break
            idx += 1
        await _broadcast_state(table_id)


def _maybe_trigger_bot_turn(table_id: str) -> None:
    hand = teen_patti_manager.get(table_id)
    if hand is None or hand.phase != Phase.PLAYING:
        return
    curr_seat = hand.seats[hand.current_turn]
    if not _is_bot(curr_seat.id):
        return
    _cancel(_bot_timers, table_id)
    _bot_timers[table_id] = asyncio.create_task(_bot_turn_task(table_id, curr_seat.id))


async def _bot_turn_task(table_id: str, bot_id: str) -> None:
    await asyncio.sleep(1.0 + random.random() * 1.5)
    hand = teen_patti_manager.get(table_id)
    if hand is None or hand.phase != Phase.PLAYING:
        return
    curr_seat = hand.seats[hand.current_turn]
    if curr_seat.id != bot_id:
        return

    # Decide see
    if not curr_seat.seen:
        if bot_strategy.decide_see(curr_seat.cards, curr_seat.blind_count, hand.pot, hand.current_stake, _rng(table_id)):
            hand.see(bot_id)

    active_count = len(hand._active_seats())
    can_side_show = curr_seat.seen and hand.prev_seen_seat_index(hand.current_turn) is not None
    can_show = (active_count == 2)

    act = bot_strategy.decide_action(
        cards=curr_seat.cards,
        seen=curr_seat.seen,
        active_count=active_count,
        can_side_show=can_side_show,
        can_show=can_show,
        current_stake=hand.current_stake,
        pot=hand.pot,
        rng=_rng(table_id),
    )

    try:
        if act == bot_strategy.Action.PACK:
            hand.pack(bot_id)
        elif act == bot_strategy.Action.RAISE:
            hand.bet(bot_id, raise_=True)
        elif act == bot_strategy.Action.SHOW and can_show:
            hand.show(bot_id)
        elif act == bot_strategy.Action.SIDE_SHOW and can_side_show:
            target_idx = hand.prev_seen_seat_index(hand.current_turn)
            if target_idx is not None:
                tgt = hand.seats[target_idx]
                if _is_bot(tgt.id):
                    hand.side_show(bot_id, rng=_rng(table_id))
                else:
                    await _request_side_show(table_id, bot_id, tgt.id)
                    return
        else:
            hand.bet(bot_id, raise_=False)
    except GameError:
        return

    await _after_action(table_id)


async def _request_side_show(table_id: str, requester_id: str, target_id: str) -> None:
    _cancel(_turn_timers, table_id)
    _pending_side_show[table_id] = {"requester": requester_id, "target": target_id}
    await manager.send_to_user(table_id, target_id, {
        "type": "event", "event": "side_show_request", "requester": requester_id,
    })
    await manager.broadcast(table_id, {
        "type": "event", "event": "side_show_pending", "requester": requester_id, "target": target_id,
    })
    hand = teen_patti_manager.get(table_id)
    seconds = hand.config.turn_seconds if hand else 15
    _turn_timers[table_id] = asyncio.create_task(_side_show_timeout(table_id, seconds))


async def _side_show_timeout(table_id: str, seconds: int) -> None:
    try:
        await asyncio.sleep(seconds)
    except asyncio.CancelledError:
        return
    if table_id not in _pending_side_show:
        return
    await _resolve_side_show(table_id, accept=False)


async def _resolve_side_show(table_id: str, accept: bool) -> None:
    pending = _pending_side_show.pop(table_id, None)
    if pending is None:
        return
    hand = teen_patti_manager.get(table_id)
    if hand is None:
        return
    try:
        result = hand.side_show(pending["requester"], accept=accept)
    except GameError:
        return
    await manager.broadcast(table_id, {"type": "event", "event": "side_show_result", **result})
    await _after_action(table_id)


def _settle_hand(table_id: str, hand: TeenPattiHand) -> None:
    if hand.winner_seat is None or hand.is_settled:
        return
    hand.is_settled = True

    with _get_db_session() as db:
        try:
            tid = uuid.UUID(str(table_id))
            table = db.query(TeenPattiTable).filter(TeenPattiTable.id == tid).first()
        except Exception:
            table = None
        if not table:
            return

        is_real = (table.mode == TeenPattiTableMode.REAL)
        hand_key = f"{table_id}:{_hand_number[table_id]}"
        s_seed_hash = server_seed_hash(hand.server_seed) if hand.server_seed else ""

        # Enforce atomic savepoint transaction for all wallet entries in this deal
        sp = db.begin_nested()
        try:
            for i, s in enumerate(hand.seats):
                if _is_bot(s.id):
                    continue
                try:
                    uid = uuid.UUID(str(s.id))
                except ValueError:
                    continue

                won_this = (i == hand.winner_seat)
                payout = hand.pot if won_this else 0

                # Debit net stakes contributed by this user
                if is_real and s.total_bet > 0:
                    debit_wallet(
                        db=db,
                        user_id=uid,
                        amount=s.total_bet,
                        tx_type=WalletTransactionType.GAME_ENTRY,
                        reference_type="TEEN_PATTI_STAKE",
                        reference_id=f"tp_stake_{hand_key}_{s.id}",
                    )

                if is_real and won_this and payout > 0:
                    credit_wallet(
                        db=db,
                        user_id=uid,
                        amount=payout,
                        tx_type=WalletTransactionType.GAME_WIN,
                        reference_type="TEEN_PATTI_PAYOUT",
                        reference_id=f"tp_payout_{hand_key}",
                    )
            sp.commit()
        except Exception as e:
            sp.rollback()
            raise

        # Store hand records
        for i, s in enumerate(hand.seats):
            if _is_bot(s.id):
                continue
            try:
                uid = uuid.UUID(str(s.id))
            except ValueError:
                continue

            won_this = (i == hand.winner_seat)
            payout = hand.pot if won_this else 0

            db.add(TeenPattiHandHistory(
                user_id=uid,
                table_id=table.id,
                mode=table.mode.value,
                boot=table.boot_amount,
                pot=hand.pot,
                winner_seat=hand.winner_seat,
                won=won_this,
                payout=payout,
                hand_json=json.dumps(hand.as_dict(for_user_id=s.id)),
                client_seed=hand.client_seed or "",
                nonce=hand.nonce or 0,
                server_seed=hand.server_seed or "",
                server_seed_hash=s_seed_hash,
            ))
        table.status = TeenPattiTableStatus.OPEN
        db.commit()


async def _schedule_next_hand(table_id: str) -> None:
    try:
        await asyncio.sleep(_NEXT_HAND_DELAY_SECONDS)
    except asyncio.CancelledError:
        return
    lock = _get_table_lock(table_id)
    async with lock:
        hand = teen_patti_manager.get(table_id)
        if hand is not None and hand.phase == Phase.FINISHED:
            hand.reset_for_next_hand()
            await manager.broadcast(table_id, {
                "type": "event",
                "event": "next_hand_ready",
                "hand_number": _hand_number[table_id],
            })
            await _broadcast_state(table_id)


async def _after_action(table_id: str) -> None:
    hand = teen_patti_manager.get(table_id)
    if hand is None:
        return
    await _broadcast_state(table_id)

    if hand.phase == Phase.FINISHED:
        _cancel(_turn_timers, table_id)
        _cancel(_bot_timers, table_id)
        _settle_hand(table_id, hand)
        await manager.broadcast(table_id, {
            "type": "event",
            "event": "hand_over",
            "winner_seat": hand.winner_seat,
            "reason": hand.reason,
        })
        _hand_number[table_id] += 1
        _start_timers[table_id] = asyncio.create_task(_schedule_next_hand(table_id))
    elif hand.phase == Phase.PLAYING and table_id not in _pending_side_show:
        _arm_turn_timer(table_id)
        _maybe_trigger_bot_turn(table_id)


@router.websocket("/ws/teen-patti/{table_id}")
async def teen_patti_socket(websocket: WebSocket, table_id: str) -> None:
    token = websocket.query_params.get("token")
    auth = _authenticate(token)
    if auth is None:
        await websocket.accept()
        await websocket.send_json({"type": "error", "message": "Authentication failure. Please log in again."})
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    user_id, username = auth

    # Check player balance for real money tables
    cfg, mode = _load_config(table_id)
    if mode == "real":
        with _get_db_session() as db:
            wallet = get_balance(db, uuid.UUID(user_id))
            current_bal = wallet.balance if wallet else 0
            if not wallet or current_bal < cfg.boot_amount:
                await websocket.accept()
                await websocket.send_json({
                    "type": "error",
                    "message": f"Insufficient wallet balance. Required: ₹{cfg.boot_amount / 100:.2f}, Available: ₹{current_bal / 100:.2f}"
                })
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return

    lock = _get_table_lock(table_id)
    async with lock:
        hand = teen_patti_manager.get_or_create(table_id, cfg)
        is_already_seated = any(s.id == user_id for s in hand.seats)

        if not is_already_seated:
            # Late join check
            if hand.phase != Phase.WAITING:
                await websocket.accept()
                await websocket.send_json({
                    "type": "error",
                    "message": "Game is currently in progress at this table. Please wait or choose another table."
                })
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return

            # Table full check
            if len(hand.seats) >= hand.config.max_players:
                await websocket.accept()
                await websocket.send_json({
                    "type": "error",
                    "message": "Table is full."
                })
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return

            try:
                hand.add_seat(user_id, username, is_bot=False)
            except GameError as ge:
                await websocket.accept()
                await websocket.send_json({"type": "error", "message": str(ge)})
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return

            # If still short of players after joining, fill remaining seats
            # with bots after a short delay so the table doesn't sit waiting
            # forever for another real player.
            _schedule_bot_fill(table_id)

        await manager.connect(table_id, user_id, websocket)
        await manager.send_to_user(table_id, user_id, {"type": "event", "event": "joined"})
        await _broadcast_state(table_id)

    try:
        while True:
            msg = await websocket.receive_json()
            async with lock:
                await _handle_action(table_id, user_id, msg)
    except WebSocketDisconnect:
        await manager.disconnect(table_id, user_id)
        async with lock:
            h = teen_patti_manager.get(table_id)
            if h and h.phase == Phase.WAITING:
                h.remove_seat(user_id)
                await _broadcast_state(table_id)
        await manager.broadcast(table_id, {"type": "event", "event": "left", "seat": user_id})
    except Exception as exc:
        await manager.send_to_user(table_id, user_id, {"type": "error", "message": str(exc)})
        await manager.disconnect(table_id, user_id)


async def _handle_action(table_id: str, user_id: str, msg: dict) -> None:
    hand = teen_patti_manager.get(table_id)
    if hand is None:
        return
    action = msg.get("action")
    action_id = msg.get("action_id")

    if action in _MUTATING_ACTIONS and _already_processed(table_id, action_id):
        await _broadcast_state(table_id)
        return

    # Check table mode
    _, mode = _load_config(table_id)
    is_real = (mode == "real")

    try:
        if action == "start":
            if hand.phase == Phase.WAITING:
                if len(hand.seats) < 2:
                    await manager.send_to_user(table_id, user_id, {
                        "type": "error",
                        "message": "Need at least 2 players to start"
                    })
                    return
                await _start_hand(table_id)
            return
        elif action == "leave":
            if hand.phase == Phase.WAITING:
                hand.remove_seat(user_id)
                await manager.disconnect(table_id, user_id)
                await manager.broadcast(table_id, {"type": "event", "event": "left", "seat": user_id})
                await _broadcast_state(table_id)
            return
        elif action == "sync":
            await _broadcast_state(table_id)
            return

        # Player must be seated for in-game actions
        seat_idx = hand._seat_index(user_id)
        if seat_idx is None:
            await manager.send_to_user(table_id, user_id, {"type": "error", "message": "Player not at table"})
            return

        if action == "see":
            hand.see(user_id)
        elif action == "bet":
            is_raise = bool(msg.get("raise", False))
            if is_real:
                seat = hand.seats[seat_idx]
                mult = 2 if seat.seen else 1
                next_stake = hand.current_stake * 2 if is_raise else hand.current_stake
                if hand.config.max_stake and next_stake > hand.config.max_stake:
                    next_stake = hand.config.max_stake
                bet_cost = next_stake * mult

                with _get_db_session() as db:
                    wallet = get_balance(db, uuid.UUID(user_id))
                    if not wallet or wallet.balance < (seat.total_bet + bet_cost):
                        await manager.send_to_user(table_id, user_id, {"type": "error", "message": "Insufficient balance to place bet"})
                        hand.pack(user_id)
                        await _broadcast_state(table_id)
                        await _after_action(table_id)
                        return

            hand.bet(user_id, raise_=is_raise)
        elif action == "pack":
            hand.pack(user_id)
        elif action == "show":
            hand.show(user_id)
        elif action == "side_show":
            if is_real:
                seat = hand.seats[seat_idx]
                cost = hand.current_stake * 2
                with _get_db_session() as db:
                    wallet = get_balance(db, uuid.UUID(user_id))
                    if not wallet or wallet.balance < (seat.total_bet + cost):
                        await manager.send_to_user(table_id, user_id, {"type": "error", "message": "Insufficient balance to request side show"})
                        hand.pack(user_id)
                        await _broadcast_state(table_id)
                        await _after_action(table_id)
                        return

            target_idx = hand.prev_seen_seat_index(seat_idx)
            if target_idx is None:
                await manager.send_to_user(table_id, user_id,
                                           {"type": "error", "message": "no seen seat to compare with"})
                return
            target = hand.seats[target_idx]
            if _is_bot(target.id):
                hand.side_show(user_id, rng=_rng(table_id))
            else:
                _mark_processed(table_id, action_id)
                await _request_side_show(table_id, user_id, target.id)
                return
        elif action == "side_show_respond":
            pending = _pending_side_show.get(table_id)
            if pending is None or pending["target"] != user_id:
                await manager.send_to_user(table_id, user_id,
                                           {"type": "error", "message": "no side-show pending for you"})
                return
            _mark_processed(table_id, action_id)
            await _resolve_side_show(table_id, accept=bool(msg.get("accept")))
            return
        else:
            await manager.send_to_user(table_id, user_id, {"type": "error", "message": f"unknown action {action}"})
            return
    except GameError as exc:
        await manager.send_to_user(table_id, user_id, {"type": "error", "message": str(exc)})
        return

    if action in _MUTATING_ACTIONS:
        _mark_processed(table_id, action_id)

    await _after_action(table_id)
