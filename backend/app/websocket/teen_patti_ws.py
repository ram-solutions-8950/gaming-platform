"""
Real-time Teen Patti WebSocket Table Handler.
"""
from __future__ import annotations

import asyncio
import json
import logging
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
from ..services.settlement_service import settle_winning_bet
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


    def is_connected(self, table_id: str, user_id: str) -> bool:
        return user_id in self._tables.get(table_id, {})


manager = TeenPattiConnectionManager()

router = APIRouter()

# Turn / countdown timers
_turn_timers: Dict[str, asyncio.Task] = {}
_bot_timers: Dict[str, asyncio.Task] = {}
_start_timers: Dict[str, asyncio.Task] = {}
_bot_join_timers: Dict[str, asyncio.Task] = {}
_disconnect_timers: Dict[Tuple[str, str], asyncio.Task] = {}
_pending_side_show: Dict[str, Dict[str, str]] = {}
_processed_actions: Dict[str, set] = defaultdict(set)
_rng_per_table: Dict[str, random.Random] = {}
_hand_number: Dict[str, int] = defaultdict(lambda: 1)
_table_locks: Dict[str, asyncio.Lock] = {}


def _cancel_disconnect_timer(key: Tuple[str, str]) -> None:
    task = _disconnect_timers.pop(key, None)
    if task and not task.done():
        task.cancel()


def _get_table_lock(table_id: str) -> asyncio.Lock:
    if table_id not in _table_locks:
        _table_locks[table_id] = asyncio.Lock()
    return _table_locks[table_id]


_BOT_JOIN_DELAY_SECONDS = 3.0
_START_COUNTDOWN_SECONDS = 3.0
# After a show: both hands stay face-up on the table (phase SHOWDOWN, no result
# popup) for this long before the result is announced (phase FINISHED).
_SHOWDOWN_REVEAL_SECONDS = 5.5
# How long the result (FINISHED) stays up before the next hand is dealt.
_NEXT_HAND_DELAY_SECONDS = 5.0
_DISCONNECT_GRACE_SECONDS = 1.5
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
            return _with_standard_limits(GameConfig(
                boot_amount=table.boot_amount,
                max_players=table.max_players,
                turn_seconds=table.turn_seconds,
            )), table.mode.value
    return _with_standard_limits(GameConfig(boot_amount=1000, max_players=2, turn_seconds=15)), "real"


# Standard Teen Patti limits: the chaal (stake) tops out at 128x the boot and
# the pot at 1024x, after which the hand goes to a compulsory show. Without
# them a player could open with any amount they like and price others out.
CHAAL_LIMIT_BOOTS = 128
POT_LIMIT_BOOTS = 1024


def _with_standard_limits(cfg: GameConfig) -> GameConfig:
    cfg.max_stake = cfg.boot_amount * CHAAL_LIMIT_BOOTS
    cfg.pot_limit = cfg.boot_amount * POT_LIMIT_BOOTS
    return cfg


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


async def _close_table(
    table_id: str,
    reason: str = "Opponent left the match. Match ended.",
    winner_seat: Optional[int] = None,
) -> None:
    _cancel(_turn_timers, table_id)
    _cancel(_bot_timers, table_id)
    _cancel(_start_timers, table_id)
    _cancel(_bot_join_timers, table_id)
    _pending_side_show.pop(table_id, None)

    with _get_db_session() as db:
        try:
            tid = uuid.UUID(str(table_id))
            tbl = db.query(TeenPattiTable).filter(TeenPattiTable.id == tid).first()
            if tbl:
                tbl.status = TeenPattiTableStatus.FINISHED
                db.commit()
        except Exception as e:
            logging.getLogger(__name__).warning("Error setting table %s to FINISHED: %s", table_id, e)

    await manager.broadcast(table_id, {
        "type": "event",
        "event": "table_closed",
        "reason": reason,
        "winner_seat": winner_seat,
    })

    teen_patti_manager.remove(table_id)
    _processed_actions.pop(table_id, None)
    _rng_per_table.pop(table_id, None)
    _hand_number.pop(table_id, None)



# Real-money stakes leave the wallet the moment they go into the pot (boot,
# chaal, raise, show, side show). Settling a hand then only pays winners, so a
# player can't bet and then empty their wallet before the hand is over.
# hand key -> seat id -> amount collected so far in that hand.
_collected: Dict[str, Dict[str, int]] = defaultdict(dict)


def _hand_key(table_id: str) -> str:
    return f"{table_id}:{_hand_number[table_id]}"


def _is_real_table(table_id: str) -> bool:
    return _load_config(table_id)[1] == "real"


def _collect_stakes(table_id: str, hand: TeenPattiHand) -> None:
    """Debit every real-money player for what they added to the pot since the
    last collection. A bet a player can't cover comes back out of the pot and
    the player is packed."""
    if not _is_real_table(table_id):
        return
    key = _hand_key(table_id)
    collected = _collected[key]
    with _get_db_session() as db:
        for idx, seat in enumerate(hand.seats):
            owed = seat.total_bet - collected.get(seat.id, 0)
            if _is_bot(seat.id) or owed <= 0:
                continue
            try:
                debit_wallet(
                    db=db,
                    user_id=uuid.UUID(seat.id),
                    amount=owed,
                    tx_type=WalletTransactionType.GAME_ENTRY,
                    reference_type="TEEN_PATTI_STAKE",
                    reference_id=f"tp_stake_{key}_{seat.id}_{seat.total_bet}",
                    metadata={"game": "teen-patti", "hand_key": key},
                )
                db.commit()
                collected[seat.id] = seat.total_bet
            except ValueError:
                db.rollback()
                seat.total_bet -= owed
                hand.pot -= owed
                if hand.phase == Phase.PLAYING and seat.is_in_hand:
                    seat.status = PlayerStatus.PACKED
                    active = hand._active_seats()
                    if len(active) == 1:
                        hand._finish_hand(winner_idx=active[0], reason="Opponent could not cover their bet")
                    elif hand.current_turn == idx:
                        hand._advance_turn()


def refund_live_hands() -> None:
    """On shutdown: a hand still being played is void, so every stake already
    collected for it goes back to the player."""
    from ..services.wager_service import reverse_wager
    for table_id, hand in list(teen_patti_manager._games.items()):
        if hand.phase not in (Phase.BOOT, Phase.PLAYING):
            continue
        key = _hand_key(table_id)
        with _get_db_session() as db:
            for seat_id, amount in _collected.pop(key, {}).items():
                try:
                    credit_wallet(
                        db=db,
                        user_id=uuid.UUID(seat_id),
                        amount=amount,
                        tx_type=WalletTransactionType.REFUND,
                        reference_type="TEEN_PATTI_VOID",
                        reference_id=f"tp_void_{key}_{seat_id}",
                        metadata={"hand_key": key, "reason": "server_shutdown"},
                    )
                    reverse_wager(db, uuid.UUID(seat_id), amount, "teen-patti")
                    db.commit()
                except Exception:
                    db.rollback()


async def _start_hand(table_id: str) -> None:
    hand = teen_patti_manager.get(table_id)
    if hand is None or hand.phase != Phase.WAITING:
        return

    # Strictly purge any disconnected human seats before starting a hand
    for s in list(hand.seats):
        if not _is_bot(s.id) and not manager.is_connected(table_id, s.id):
            hand.remove_seat(s.id)

    # Everyone dealt in has to be able to pay the boot
    if _is_real_table(table_id):
        with _get_db_session() as db:
            for s in list(hand.seats):
                if _is_bot(s.id):
                    continue
                wallet = get_balance(db, uuid.UUID(s.id))
                if not wallet or wallet.balance < hand.config.boot_amount:
                    hand.remove_seat(s.id)
                    await manager.send_to_user(table_id, s.id, {
                        "type": "error",
                        "message": "Insufficient balance for the boot. Add money to keep playing.",
                    })

    connected_players = [s for s in hand.seats if s.id and (_is_bot(s.id) or manager.is_connected(table_id, s.id))]
    if len(connected_players) < 2:
        await _close_table(table_id, reason="Waiting for opponent timed out or player left.")
        return

    _cancel(_turn_timers, table_id)
    _cancel(_bot_timers, table_id)
    _cancel(_start_timers, table_id)
    _pending_side_show.pop(table_id, None)

    hand.start_hand(client_seed=f"tp_{table_id}_{_hand_number[table_id]}", nonce=_hand_number[table_id])
    _collect_stakes(table_id, hand)

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
    lock = _get_table_lock(table_id)
    async with lock:
        hand = teen_patti_manager.get(table_id)
        if hand is None or hand.phase != Phase.PLAYING:
            return
        curr_seat = hand.seats[hand.current_turn]
        if curr_seat.id == expected_user:
            if not manager.is_connected(table_id, expected_user):
                await _handle_player_leave(table_id, expected_user)
                return
            try:
                hand.pack(expected_user)
            except GameError:
                return
            await _after_action(table_id)


_MIN_PLAYERS_TO_START = 2

def _schedule_bot_fill(table_id: str) -> None:
    """Teen Patti is strictly a 2-player multiplayer game.
    Bots are never injected; players wait for real opponents (BUG-038)."""
    return


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
        await _broadcast_state(table_id)
        if len(hand.seats) >= _MIN_PLAYERS_TO_START:
            async def _auto_start_delayed():
                try:
                    await asyncio.sleep(2.0)
                    h = teen_patti_manager.get(table_id)
                    if h and h.phase == Phase.WAITING and len(h.seats) >= _MIN_PLAYERS_TO_START:
                        await _start_hand(table_id)
                except asyncio.CancelledError:
                    pass
            _start_timers[table_id] = asyncio.create_task(_auto_start_delayed())


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


def _settle_hand(table_id: str, hand: TeenPattiHand, finish_table: bool = False) -> None:
    if hand.is_settled:
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

        # Stakes were collected as they went into the pot (_collect_stakes);
        # settling only pays each winner their share of it.
        sp = db.begin_nested()
        try:
            winners = getattr(hand, "winner_seats", None)
            if not winners:
                winners = [hand.winner_seat] if hand.winner_seat is not None else []
            for i, s in enumerate(hand.seats):
                if _is_bot(s.id) or i not in winners or not is_real:
                    continue
                try:
                    uid = uuid.UUID(str(s.id))
                except ValueError:
                    continue
                share = hand.pot // len(winners)
                # Any indivisible remainder goes to the first winner so the
                # pot is always paid out in full.
                if i == winners[0]:
                    share += hand.pot - share * len(winners)
                if share <= 0:
                    continue
                gross_profit = share - s.total_bet
                ref = f"tp_payout_{hand_key}_{s.id}"
                meta = {"hand_key": hand_key, "pot": hand.pot}
                if gross_profit > 0:
                    settle_winning_bet(
                        db=db,
                        user_id=uid,
                        original_bet=s.total_bet,
                        gross_profit=gross_profit,
                        reference_type="TEEN_PATTI_PAYOUT",
                        reference_id=ref,
                        game_slug="teen-patti",
                        metadata=meta,
                    )
                else:
                    # A split share smaller than the player's own stake: no
                    # profit to charge a fee on, the share is simply returned.
                    credit_wallet(
                        db=db,
                        user_id=uid,
                        amount=share,
                        tx_type=WalletTransactionType.GAME_WIN,
                        reference_type="TEEN_PATTI_PAYOUT",
                        reference_id=ref,
                        metadata=meta,
                    )
            sp.commit()
        except Exception as e:
            sp.rollback()
            err_msg = str(e)
            if "Duplicate transaction reference" in err_msg or "already exists" in err_msg:
                logging.getLogger(__name__).warning("TEEN_PATTI_SETTLEMENT_ALREADY_DONE: table_id=%s %s", table_id, err_msg)
            else:
                logging.getLogger(__name__).error("TEEN_PATTI_SETTLEMENT_FAILED: table_id=%s error=%s", table_id, err_msg)
                raise
        finally:
            _collected.pop(hand_key, None)

        # Store hand records
        for i, s in enumerate(hand.seats):
            if _is_bot(s.id):
                continue
            try:
                uid = uuid.UUID(str(s.id))
            except ValueError:
                continue

            won_this = (hand.winner_seat is not None and i == hand.winner_seat)
            payout = hand.pot if won_this else 0

            db.add(TeenPattiHandHistory(
                user_id=uid,
                table_id=table.id,
                mode=table.mode.value,
                boot=table.boot_amount,
                pot=hand.pot,
                winner_seat=hand.winner_seat if hand.winner_seat is not None else -1,
                won=won_this,
                payout=payout,
                hand_json=json.dumps(hand.as_dict(for_user_id=s.id)),
                client_seed=hand.client_seed or "",
                nonce=hand.nonce or 0,
                server_seed=hand.server_seed or "",
                server_seed_hash=s_seed_hash,
            ))
        table.status = TeenPattiTableStatus.FINISHED if finish_table else TeenPattiTableStatus.OPEN
        db.commit()


async def _schedule_next_hand(table_id: str) -> None:
    """Paces the end of a hand: SHOWDOWN (hands face-up) -> FINISHED (result) -> next deal.

    A fold win has nothing to reveal, so it starts at FINISHED.
    """
    lock = _get_table_lock(table_id)
    try:
        hand = teen_patti_manager.get(table_id)
        if hand is not None and hand.phase == Phase.SHOWDOWN:
            await asyncio.sleep(_SHOWDOWN_REVEAL_SECONDS)
            async with lock:
                hand = teen_patti_manager.get(table_id)
                if hand is None or hand.phase != Phase.SHOWDOWN:
                    return
                hand.complete_showdown()
                await _broadcast_state(table_id)
        await asyncio.sleep(_NEXT_HAND_DELAY_SECONDS)
    except asyncio.CancelledError:
        return
    async with lock:
        hand = teen_patti_manager.get(table_id)
        if hand is not None and hand.phase == Phase.FINISHED:
            for s in list(hand.seats):
                if not _is_bot(s.id) and not manager.is_connected(table_id, s.id):
                    hand.remove_seat(s.id)
            connected_players = [s for s in hand.seats if s.id and (_is_bot(s.id) or manager.is_connected(table_id, s.id))]
            if len(connected_players) >= 2:
                hand.reset_for_next_hand()
                await _start_hand(table_id)
            else:
                await _close_table(table_id, reason="Opponent left the table. Match ended.")


async def _after_action(table_id: str) -> None:
    hand = teen_patti_manager.get(table_id)
    if hand is None:
        return
    _collect_stakes(table_id, hand)
    await _broadcast_state(table_id)

    # A show lands in SHOWDOWN, a fold win in FINISHED: either way the hand is
    # decided, so settle now and let _schedule_next_hand pace the reveal.
    if hand.phase in (Phase.SHOWDOWN, Phase.FINISHED):
        _cancel(_turn_timers, table_id)
        _cancel(_bot_timers, table_id)
        _cancel(_start_timers, table_id)
        _settle_hand(table_id, hand)
        await manager.broadcast(table_id, {
            "type": "event",
            "event": "hand_over",
            "winner_seat": hand.winner_seat,
            "reason": hand.reason,
        })
        _hand_number[table_id] += 1

        # Check if enough connected players remain for another hand
        for s in list(hand.seats):
            if not _is_bot(s.id) and not manager.is_connected(table_id, s.id):
                hand.remove_seat(s.id)
        connected_players = [s for s in hand.seats if s.id and (_is_bot(s.id) or manager.is_connected(table_id, s.id))]
        if len(connected_players) < 2:
            await _close_table(table_id, reason="Opponent left the table. Match ended.", winner_seat=hand.winner_seat)
            return

        _start_timers[table_id] = asyncio.create_task(_schedule_next_hand(table_id))
    elif hand.phase == Phase.PLAYING and table_id not in _pending_side_show:
        _arm_turn_timer(table_id)
        _maybe_trigger_bot_turn(table_id)


async def _handle_player_leave(table_id: str, user_id: str) -> None:
    hand = teen_patti_manager.get(table_id)
    if hand is None:
        return

    seat_idx = hand._seat_index(user_id)
    if seat_idx is None:
        return

    was_playing = (hand.phase in (Phase.BOOT, Phase.PLAYING, Phase.SHOWDOWN))
    # 1. If currently playing and this player is in the hand, pack them to forfeit
    if was_playing and hand.seats[seat_idx].is_in_hand:
        hand.seats[seat_idx].status = PlayerStatus.PACKED
        active_remaining = [i for i, s in enumerate(hand.seats) if i != seat_idx and s.is_in_hand]
        if len(active_remaining) == 1:
            hand._finish_hand(winner_idx=active_remaining[0], reason="Opponent left the match")
        elif seat_idx == hand.current_turn:
            hand._advance_turn()

    # 2. If forfeit ended the hand, settle and broadcast hand_over
    if was_playing and hand.phase == Phase.FINISHED:
        winner_seat = hand.winner_seat
        _cancel(_turn_timers, table_id)
        _cancel(_bot_timers, table_id)
        _cancel(_start_timers, table_id)
        _cancel(_bot_join_timers, table_id)
        _cancel_disconnect_timer((table_id, user_id))
        _pending_side_show.pop(table_id, None)

        try:
            _settle_hand(table_id, hand, finish_table=True)
        except Exception as e:
            logging.getLogger(__name__).warning("Error settling hand on player leave: %s", e)

        # Broadcast state with Phase.FINISHED and winner_seat BEFORE closing table so remaining player sees they won!
        await _broadcast_state(table_id)
        await manager.broadcast(table_id, {
            "type": "event",
            "event": "hand_over",
            "winner_seat": winner_seat,
            "reason": "Opponent left the match",
        })
        await manager.broadcast(table_id, {"type": "event", "event": "left", "seat": user_id})

        # Close the table completely
        await _close_table(table_id, reason="Opponent left the match. Match ended.", winner_seat=winner_seat)
        return

    # 3. If hand was not playing (waiting or already finished)
    hand.remove_seat(user_id)
    await manager.broadcast(table_id, {"type": "event", "event": "left", "seat": user_id})
    seated = [s for s in hand.seats if s.id is not None]
    if len(seated) < 2:
        await _close_table(table_id, reason="Opponent left the table. Match ended.")
        return

    await _broadcast_state(table_id)


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
        with _get_db_session() as db:
            try:
                tid = uuid.UUID(str(table_id))
                tbl = db.query(TeenPattiTable).filter(TeenPattiTable.id == tid).first()
                if tbl and tbl.status == TeenPattiTableStatus.FINISHED:
                    await websocket.accept()
                    await websocket.send_json({"type": "error", "message": "This table has ended."})
                    await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                    return
            except Exception:
                pass

        hand = teen_patti_manager.get_or_create(table_id, cfg)
        if hand.phase == Phase.WAITING:
            for s in list(hand.seats):
                if not _is_bot(s.id) and not manager.is_connected(table_id, s.id) and s.id != user_id:
                    hand.remove_seat(s.id)
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

        _cancel_disconnect_timer((table_id, user_id))
        await manager.connect(table_id, user_id, websocket)
        await manager.send_to_user(table_id, user_id, {"type": "event", "event": "joined"})
        await _broadcast_state(table_id)

        # Start hand once minimum required players have joined the table
        if len(hand.seats) >= _MIN_PLAYERS_TO_START and hand.phase == Phase.WAITING:
            async def _auto_start_delayed():
                try:
                    await asyncio.sleep(2.5)
                    h = teen_patti_manager.get(table_id)
                    if h and h.phase == Phase.WAITING and len(h.seats) >= _MIN_PLAYERS_TO_START:
                        await _start_hand(table_id)
                except asyncio.CancelledError:
                    pass
            _cancel(_start_timers, table_id)
            _start_timers[table_id] = asyncio.create_task(_auto_start_delayed())

    try:
        while True:
            msg = await websocket.receive_json()
            async with lock:
                await _handle_action(table_id, user_id, msg)
    except WebSocketDisconnect:
        await manager.disconnect(table_id, user_id)
        key = (table_id, user_id)
        _cancel_disconnect_timer(key)
        _cancel(_start_timers, table_id)
        h = teen_patti_manager.get(table_id)
        if h and h.phase == Phase.PLAYING:
            async def _disconnect_grace(t_id=table_id, u_id=user_id):
                try:
                    await asyncio.sleep(_DISCONNECT_GRACE_SECONDS)
                    if not manager.is_connected(t_id, u_id):
                        t_lock = _get_table_lock(t_id)
                        async with t_lock:
                            await _handle_player_leave(t_id, u_id)
                except asyncio.CancelledError:
                    pass
            _disconnect_timers[key] = asyncio.create_task(_disconnect_grace())
        else:
            async with lock:
                await _handle_player_leave(table_id, user_id)
    except Exception as exc:
        await manager.send_to_user(table_id, user_id, {"type": "error", "message": str(exc)})
        await manager.disconnect(table_id, user_id)
        _cancel_disconnect_timer((table_id, user_id))
        _cancel(_start_timers, table_id)
        async with lock:
            await _handle_player_leave(table_id, user_id)


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
            if hand.phase == Phase.SHOWDOWN:
                # Nobody can cut the reveal short for the rest of the table:
                # "Deal now" only works once the result is up.
                return
            if hand.phase == Phase.FINISHED:
                _cancel(_start_timers, table_id)
                hand.reset_for_next_hand()
            if hand.phase == Phase.WAITING:
                for s in list(hand.seats):
                    if not _is_bot(s.id) and not manager.is_connected(table_id, s.id):
                        hand.remove_seat(s.id)
                connected_players = [s for s in hand.seats if s.id and (_is_bot(s.id) or manager.is_connected(table_id, s.id))]
                if len(connected_players) < 2:
                    await manager.send_to_user(table_id, user_id, {
                        "type": "error",
                        "message": "Need at least 2 players to start"
                    })
                    await _broadcast_state(table_id)
                    return
                await _start_hand(table_id)
            return
        elif action == "leave":
            _cancel_disconnect_timer((table_id, user_id))
            _cancel(_start_timers, table_id)
            await manager.disconnect(table_id, user_id)
            await _handle_player_leave(table_id, user_id)
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
            raw_amount = msg.get("amount")
            custom_amount: Optional[int] = None
            if raw_amount is not None:
                try:
                    custom_amount = int(raw_amount)
                except (ValueError, TypeError):
                    custom_amount = None

            seat = hand.seats[seat_idx]
            if is_real:
                if custom_amount is not None:
                    bet_cost = custom_amount
                else:
                    mult = 2 if seat.seen else 1
                    next_stake = hand.current_stake * 2 if is_raise else hand.current_stake
                    if hand.config.max_stake and next_stake > hand.config.max_stake:
                        next_stake = hand.config.max_stake
                    bet_cost = next_stake * mult

                # Earlier stakes this hand are already collected: only the new
                # bet has to be covered.
                with _get_db_session() as db:
                    wallet = get_balance(db, uuid.UUID(user_id))
                    if not wallet or wallet.balance < bet_cost:
                        await manager.send_to_user(table_id, user_id, {"type": "error", "message": "Insufficient balance to place bet"})
                        hand.pack(user_id)
                        await _broadcast_state(table_id)
                        await _after_action(table_id)
                        return

            hand.bet(user_id, raise_=is_raise, amount=custom_amount)
        elif action == "pack":
            hand.pack(user_id)
        elif action == "show":
            if is_real:
                seat = hand.seats[seat_idx]
                show_cost = hand.current_stake * (2 if seat.seen else 1)
                with _get_db_session() as db:
                    wallet = get_balance(db, uuid.UUID(user_id))
                    if not wallet or wallet.balance < show_cost:
                        await manager.send_to_user(table_id, user_id, {"type": "error", "message": "Insufficient balance to call a show"})
                        return
            hand.show(user_id)
        elif action == "side_show":
            if is_real:
                seat = hand.seats[seat_idx]
                cost = hand.current_stake * 2
                with _get_db_session() as db:
                    wallet = get_balance(db, uuid.UUID(user_id))
                    if not wallet or wallet.balance < cost:
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
