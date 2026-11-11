"""Poker table websockets.

Concurrency notes, because this file is real money and the rules here are not
obvious from any single function:

*Engine state lives in memory and has no internal locking.* It used to be safe
only because one uvicorn worker runs one event loop, so synchronous engine
calls could not interleave. That guarantee never covered multi-step sequences:
``run_bot_turns`` already awaited between a bot's decision and the next one, so
a human action could land in the middle of a hand progressing.

Two changes make that explicit:

1. **Blocking database work runs in a worker thread.** psycopg2 is synchronous
   and wallet writes take ``SELECT ... FOR UPDATE`` row locks, so a settlement
   done inline would park every request and every websocket in the process.
   Each unit of database work below is a plain function that opens its own
   session and is handed to :func:`in_thread`. Nothing passes a ``Session``
   between tasks, and no ORM instance escapes the thread that loaded it.

2. **A per-table lock guards every mutating sequence**, so a sequence that now
   contains an ``await`` cannot interleave with another one.

The lock is acquired *only at top-level entry points*: client messages, the
turn clock, bot turns, seat/leave calls and disconnect handling. Helpers named
``*_locked`` assume it is already held and must never acquire it themselves.
``asyncio.Lock`` is not reentrant, so a nested acquire would deadlock the table
permanently -- in code that is holding players' chips.

Two further rules keep the lock from becoming its own problem:

* It is **released across every deliberate pause** (bot think time, the
  settlement cooldown). Holding it through a four-second cooldown would make a
  player's fold wait four seconds.
* Websocket sends happen **after** the lock is released. The payloads are
  snapshotted synchronously while it is held, then delivered; a client that
  stops reading applies backpressure to its own socket instead of freezing the
  table for everyone.
"""
import json
import time
import uuid
import asyncio
import random
from typing import Dict, List, Set, Tuple
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from ..database import SessionLocal
from ..security.jwt import decode_access_token
from ..services.poker.game_manager import poker_manager
from ..services.poker.engine import PokerEngine, BETTING_PHASES
from ..services.poker.cashout import cash_out_stack
from ..models.user import User
from ..models.poker import PokerTable, PokerHand, PokerPlayer
from ..utils.async_db import in_thread
from ..utils.logging import get_logger

logger = get_logger("poker_ws")

router = APIRouter(prefix="/poker", tags=["Poker WebSocket"])

# A message queued to be sent once the table lock is released.
Outbox = List[Tuple[str, dict]]


class PokerConnectionManager:
    def __init__(self):
        # table_id -> user_id -> WebSocket
        self.connections: Dict[str, Dict[str, WebSocket]] = {}

    async def connect(self, table_id: str, user_id: str, ws: WebSocket):
        await ws.accept()
        self.register(table_id, user_id, ws)

    def register(self, table_id: str, user_id: str, ws: WebSocket) -> None:
        if table_id not in self.connections:
            self.connections[table_id] = {}
        self.connections[table_id][user_id] = ws

    def disconnect(self, table_id: str, user_id: str, ws: WebSocket):
        # Only remove if `ws` is still the currently-registered connection
        # for this user. A stale/superseded connection's cleanup must never
        # evict a newer, still-live connection from the same user — this
        # happens whenever a client reconnects quickly (e.g. React
        # StrictMode's dev-mode double-connect), and previously caused the
        # game to silently stop broadcasting updates to the live socket.
        if table_id in self.connections and self.connections[table_id].get(user_id) is ws:
            self.connections[table_id].pop(user_id, None)

    def is_connected(self, table_id: str, user_id: str) -> bool:
        return user_id in self.connections.get(table_id, {})

    def connected_users(self, table_id: str) -> List[str]:
        return list(self.connections.get(table_id, {}))

    async def send_to_user(self, table_id: str, user_id: str, payload: dict):
        ws = self.connections.get(table_id, {}).get(user_id)
        if ws is None:
            return
        try:
            await ws.send_text(json.dumps(payload))
        except Exception as e:
            logger.warning("failed to send to user=%s table=%s: %s", user_id, table_id, e)

    async def deliver(self, table_id: str, outbox: Outbox) -> None:
        """Send messages snapshotted earlier, now that no lock is held."""
        for user_id, payload in outbox:
            await self.send_to_user(table_id, user_id, payload)

    async def broadcast_table_state(self, engine: PokerEngine):
        """Convenience wrapper for callers that are not holding the table lock."""
        await self.deliver(engine.table_id, state_outbox(engine))


poker_ws_manager = PokerConnectionManager()

# ---------------------------------------------------------------- table locks

_table_locks: Dict[str, asyncio.Lock] = {}


def table_lock(table_id: str) -> asyncio.Lock:
    """The lock serialising every mutating sequence for one table.

    Acquire it at a top-level entry point only; see the module docstring.
    """
    lock = _table_locks.get(table_id)
    if lock is None:
        lock = _table_locks[table_id] = asyncio.Lock()
    return lock


# ----------------------------------------------------------- payload snapshots


def state_outbox(engine: PokerEngine) -> Outbox:
    """Per-viewer table state, built synchronously so it cannot tear.

    Each player's view hides other players' hole cards, so this is one payload
    per connection rather than one broadcast.
    """
    return [
        (
            user_id,
            {"type": "table_state", "state": engine.get_public_state(for_user_id=user_id)},
        )
        for user_id in poker_ws_manager.connected_users(engine.table_id)
    ]


def hole_card_outbox(engine: PokerEngine) -> Outbox:
    return [
        (p.user_id, {"type": "hole_cards", "hole_cards": [c.to_str() for c in p.hole_cards]})
        for p in engine.players
        if p.hole_cards
    ]


# ------------------------------------------------------------- database units
#
# Each function here opens its own session, returns primitives only, and is
# called through `in_thread`. None of them touch engine state.


def _load_table_context(user_id: str, table_id: str) -> dict:
    """Everything the websocket handshake needs, in one round trip."""
    with SessionLocal() as db:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return {"error": "User not found"}
        table = db.query(PokerTable).filter(PokerTable.id == table_id).first()
        if not table:
            return {"error": "Table not found"}
        seat = (
            db.query(PokerPlayer)
            .filter(PokerPlayer.table_id == table_id, PokerPlayer.user_id == user.id)
            .first()
        )
        return {
            "username": user.username or user.email.split("@")[0],
            "table": {
                "id": table.id,
                "is_practice": bool(table.is_practice),
                "small_blind": table.small_blind,
                "big_blind": table.big_blind,
                "max_players": table.max_players,
                "min_buy_in": table.min_buy_in,
                "max_buy_in": table.max_buy_in,
            },
            # A seat record with no live seat means the server restarted; the
            # stack is restored as-is rather than charging a new buy-in.
            "seat_stack": seat.stack if seat else None,
        }


def _cash_out_to_wallet(table_id: str, user_id: str, stack: int) -> dict:
    """Credit a departing player's chips and free their seat record."""
    with SessionLocal() as db:
        try:
            table = db.query(PokerTable).filter(PokerTable.id == table_id).first()
            # Read the limits before the commit inside cash_out_stack expires
            # the instance and forces a re-read.
            limits = {
                "min_buy_in": table.min_buy_in if table else None,
                "max_buy_in": table.max_buy_in if table else None,
            }
            credited = cash_out_stack(db, table, table_id, user_id, stack)
            return {"ok": True, "credited": credited, **limits}
        except Exception:
            db.rollback()
            logger.critical(
                "poker cash-out FAILED table=%s user=%s stack=%s", table_id, user_id, stack,
                exc_info=True,
            )
            return {"ok": False, "credited": 0, "min_buy_in": None, "max_buy_in": None}


def _persist_hand(values: dict) -> None:
    """Record a finished hand. Values are snapshotted off the engine first."""
    with SessionLocal() as db:
        try:
            db.add(PokerHand(**values))
            db.commit()
        except Exception:
            db.rollback()
            logger.error("poker hand save failed hand=%s", values.get("id"), exc_info=True)


def _hand_row_values(engine: PokerEngine) -> dict:
    return {
        "id": engine.hand_id or f"hand_{uuid.uuid4().hex[:16]}",
        "table_id": engine.table_id,
        "dealer_seat_idx": engine.dealer_seat_idx,
        "small_blind": engine.small_blind,
        "big_blind": engine.big_blind,
        "community_cards": [c.to_str() for c in engine.community_cards],
        "pot": engine.pot,
        "winners_summary": engine.winners_summary,
    }


# ------------------------------------------------------------------- practice

BOT_NAMES = ["Bot Aarav", "Bot Vihaan", "Bot Kabir", "Bot Zara", "Bot Meera", "Bot Rohan"]


def _seat_practice_bots(engine: PokerEngine, table: dict):
    """Fills remaining seats at a practice table with bot players so the user always has opponents."""
    if not table["is_practice"]:
        return
    buy_in = table["min_buy_in"] or 2000
    idx = 0
    while len(engine.players) < engine.max_players and idx < len(BOT_NAMES):
        bot_id = f"bot_{engine.table_id}_{idx}"
        if not engine.get_player_by_id(bot_id):
            engine.add_player(user_id=bot_id, username=BOT_NAMES[idx], buy_in_amount=buy_in, is_bot=True)
        idx += 1


def _decide_bot_action(engine: PokerEngine, player) -> Tuple[str, int]:
    """Simple weighted-random bot strategy: mostly calls/checks, occasionally raises or folds."""
    call_amount = engine.current_high_bet - player.current_bet
    max_total = player.stack + player.current_bet
    r = random.random()

    if call_amount <= 0:
        if r < 0.70 or max_total <= engine.current_high_bet + engine.min_raise_amount:
            return 'check', 0
        return 'raise', min(engine.current_high_bet + engine.min_raise_amount, max_total)

    if call_amount >= player.stack:
        return ('call', 0) if r < 0.55 else ('fold', 0)

    if r < 0.12:
        return 'fold', 0
    if r < 0.85:
        return 'call', 0

    raise_to = min(engine.current_high_bet + engine.min_raise_amount, max_total)
    if raise_to <= engine.current_high_bet:
        return 'call', 0
    return 'raise', raise_to


_bot_turns_active: Set[str] = set()

# How long a settled hand's result stays on the felt before the table moves on.
_SETTLEMENT_COOLDOWN_SECONDS = 4
# Range of the pause before each bot action, so bots don't act instantly.
_BOT_THINK_SECONDS = (0.8, 1.6)
# Slack after a player's turn clock runs out before the table acts for them.
_TURN_GRACE_SECONDS = 1.0
# A player whose connection stays gone this long is cashed out and unseated,
# so their chips never sit stranded at a table they aren't coming back to.
_DISCONNECT_CASHOUT_SECONDS = 120

_turn_clocks: Dict[str, asyncio.Task] = {}
_cashout_timers: Dict[Tuple[str, str], asyncio.Task] = {}


def _is_human(player) -> bool:
    return not player.is_bot


# ------------------------------------------------- locked sequences (helpers)
#
# Everything below named `*_locked` runs with the table lock already held and
# must not acquire it again. Each returns the messages to deliver afterwards.


async def tidy_seats_locked(engine: PokerEngine) -> Outbox:
    """Between hands: players out of chips give up their seat (they can buy in
    again), and humans whose connection is gone sit out instead of being dealt
    in to fold and bleed blinds."""
    if engine.phase in BETTING_PHASES:
        return []
    table_id = engine.table_id
    outbox: Outbox = []
    if not engine.is_practice:
        for p in [p for p in engine.players if _is_human(p) and p.stack <= 0]:
            engine.remove_player(p.user_id)
            # A busted player has no chips, so a failed write strands nothing;
            # _cash_out_to_wallet logs it either way.
            result = await in_thread(_cash_out_to_wallet, table_id, p.user_id, 0)
            outbox.append((
                p.user_id,
                {
                    "type": "busted",
                    "message": "You're out of chips. Buy in again to keep playing.",
                    "min_buy_in": result["min_buy_in"],
                    "max_buy_in": result["max_buy_in"],
                },
            ))
    for p in engine.players:
        if _is_human(p):
            p.is_sitting_out = not poker_ws_manager.is_connected(table_id, p.user_id)
    return outbox


def start_hand_locked(engine: PokerEngine) -> Tuple[bool, Outbox]:
    """Deal, telling every client the outcome either way."""
    ok, _ = engine.start_hand()
    outbox = state_outbox(engine)
    if ok:
        outbox += hole_card_outbox(engine)
        ensure_turn_clock(engine)
    return ok, outbox


async def deal_next_hand_locked(engine: PokerEngine) -> Tuple[bool, Outbox]:
    outbox = await tidy_seats_locked(engine)
    ok, dealt_outbox = start_hand_locked(engine)
    return ok, outbox + dealt_outbox


# ----------------------------------------------------------- entry points


async def on_seat_taken(engine: PokerEngine) -> None:
    """Someone bought in: show them to the table, and deal if it was idle."""
    outbox: Outbox
    deal = False
    async with table_lock(engine.table_id):
        outbox = state_outbox(engine)
        if engine.phase == 'WAITING' and len(engine.players) >= 2:
            dealt, dealt_outbox = await deal_next_hand_locked(engine)
            outbox += dealt_outbox
            deal = dealt
    await poker_ws_manager.deliver(engine.table_id, outbox)
    if deal:
        asyncio.create_task(run_bot_turns(engine))


def ensure_turn_clock(engine: PokerEngine) -> None:
    task = _turn_clocks.get(engine.table_id)
    if task is None or task.done():
        _turn_clocks[engine.table_id] = asyncio.create_task(_run_turn_clock(engine))


async def _run_turn_clock(engine: PokerEngine) -> None:
    """Acts for a player whose turn clock runs out: check if it's free, otherwise
    fold. Covers players who are away or have lost their connection."""
    table_id = engine.table_id
    lock = table_lock(table_id)
    while engine.phase in BETTING_PHASES:
        seat, started, hand_id = engine.current_turn_seat_idx, engine.turn_start_time, engine.hand_id
        deadline = started + engine.turn_duration + _TURN_GRACE_SECONDS
        await asyncio.sleep(max(0.05, deadline - time.time()))

        outbox: Outbox = []
        was_bot_turn = False
        async with lock:
            still_waiting = (
                engine.phase in BETTING_PHASES
                and engine.hand_id == hand_id
                and engine.current_turn_seat_idx == seat
                and engine.turn_start_time == started
            )
            if still_waiting:
                player = next((p for p in engine.players if p.seat_index == seat), None)
                if player is None or player.is_bot:
                    # Bots are driven by run_bot_turns; nudge it in case nothing is.
                    was_bot_turn = True
                else:
                    owed = engine.current_high_bet - player.current_bet
                    engine.process_action(player.user_id, 'check' if owed <= 0 else 'fold')
                    outbox = state_outbox(engine)

        if not still_waiting:
            continue  # they acted in time, or the hand moved on
        await poker_ws_manager.deliver(table_id, outbox)
        asyncio.create_task(run_bot_turns(engine))
        if was_bot_turn:
            # Give run_bot_turns room to act rather than spinning on the clock.
            await asyncio.sleep(1)


def _cancel_cashout_timer(table_id: str, user_id: str) -> None:
    task = _cashout_timers.pop((table_id, user_id), None)
    if task and not task.done():
        task.cancel()


async def _cash_out_when_gone(table_id: str, user_id: str) -> None:
    try:
        await asyncio.sleep(_DISCONNECT_CASHOUT_SECONDS)
        engine = poker_manager.get_table(table_id)
        # Let a hand they are still contesting finish first (the turn clock plays it out)
        while engine and engine.phase in BETTING_PHASES:
            player = engine.get_player_by_id(user_id)
            if player is None or not player.in_hand or player.is_folded:
                break
            await asyncio.sleep(2)
        if not engine or poker_ws_manager.is_connected(table_id, user_id):
            return
        _cashout_timers.pop((table_id, user_id), None)

        outbox: Outbox = []
        keep_bots_running = False
        async with table_lock(table_id):
            player = engine.get_player_by_id(user_id)
            if player is None:
                return
            username = player.username
            ok, _, stack = engine.remove_player(user_id)
            if not ok:
                return
            result = await in_thread(_cash_out_to_wallet, table_id, user_id, stack)
            if not result["ok"] and stack > 0:
                # The chips only existed in memory. Rather than destroy them,
                # put the player back in their seat so the stack is still
                # there to be cashed out on the next attempt.
                reseated, msg = engine.add_player(
                    user_id=user_id, username=username, buy_in_amount=stack
                )
                if not reseated:
                    logger.critical(
                        "poker chips STRANDED table=%s user=%s stack=%s reseat_failed=%s",
                        table_id, user_id, stack, msg,
                    )
                return
            outbox = state_outbox(engine)
            keep_bots_running = engine.phase != 'WAITING'

        await poker_ws_manager.deliver(table_id, outbox)
        if keep_bots_running:
            asyncio.create_task(run_bot_turns(engine))
    except asyncio.CancelledError:
        pass


async def cash_out_all_tables() -> None:
    """On shutdown: table stacks only live in memory, so void any hand in
    progress and return every player's chips to their wallet."""
    for engine in list(poker_manager.tables.values()):
        async with table_lock(engine.table_id):
            engine.abort_hand()
            for p in [p for p in engine.players if _is_human(p)]:
                try:
                    ok, _, stack = engine.remove_player(p.user_id)
                    if ok:
                        await in_thread(
                            _cash_out_to_wallet, engine.table_id, p.user_id, stack
                        )
                except Exception:
                    logger.critical(
                        "poker shutdown cash-out FAILED table=%s user=%s",
                        engine.table_id, p.user_id, exc_info=True,
                    )


async def run_bot_turns(engine: PokerEngine):
    """Drives bot actions for the current hand, and iteratively progresses through
    settlement + subsequent auto-started hands as long as it stays a bot's turn.

    One of these runs per table at a time. The table lock is taken for each
    step and released across the pauses, so a human at the same table is never
    waiting on a bot's think time or on the settlement cooldown.
    """
    table_id = engine.table_id
    if table_id in _bot_turns_active:
        return
    _bot_turns_active.add(table_id)  # no await between the check and the add
    lock = table_lock(table_id)
    try:
        while True:
            # --- bots act until it is a human's turn, or the hand ends -------
            while True:
                async with lock:
                    if engine.phase in ('WAITING', 'SETTLEMENT'):
                        break
                    seat = engine.current_turn_seat_idx
                    player = (
                        next((p for p in engine.players if p.seat_index == seat), None)
                        if seat is not None else None
                    )
                    if not player or not player.is_bot:
                        return
                    bot_id, hand_id = player.user_id, engine.hand_id

                # Think without the lock: a human's action must not queue behind it.
                await asyncio.sleep(random.uniform(*_BOT_THINK_SECONDS))

                async with lock:
                    # The hand may have moved on while this bot was thinking.
                    if (
                        engine.hand_id != hand_id
                        or engine.phase not in BETTING_PHASES
                        or engine.current_turn_seat_idx != seat
                    ):
                        continue
                    player = engine.get_player_by_id(bot_id)
                    if player is None or not player.is_bot:
                        continue
                    action, amount = _decide_bot_action(engine, player)
                    ok, _ = engine.process_action(user_id=bot_id, action=action, amount=amount)
                    if not ok:
                        engine.process_action(user_id=bot_id, action='fold')
                    outbox = state_outbox(engine)
                await poker_ws_manager.deliver(table_id, outbox)

            # --- settlement --------------------------------------------------
            async with lock:
                if engine.phase != 'SETTLEMENT':
                    return
                hand_values = _hand_row_values(engine)
            # Derived from the snapshot above, so this is safe outside the lock.
            await in_thread(_persist_hand, hand_values)

            await asyncio.sleep(_SETTLEMENT_COOLDOWN_SECONDS)

            async with lock:
                if engine.phase != 'SETTLEMENT':
                    return  # the table already moved on
                outbox = await tidy_seats_locked(engine)
                # Nobody left to play against (or only bots, with every human gone or
                # sitting out): end here and clear the settled hand rather than
                # leaving its pot, bets and cards on the felt.
                if len(engine.players) < 2 or not any(
                    _is_human(p) and not p.is_sitting_out for p in engine.players
                ):
                    engine.reset_to_waiting()
                    outbox += state_outbox(engine)
                    dealt = False
                else:
                    dealt, dealt_outbox = start_hand_locked(engine)
                    outbox += dealt_outbox
            await poker_ws_manager.deliver(table_id, outbox)
            if not dealt:
                return
    finally:
        _bot_turns_active.discard(table_id)


def _authenticate(token: str) -> str:
    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise ValueError("Invalid token payload")
    return str(user_id)


@router.websocket("/ws/{table_id}")
async def poker_websocket_endpoint(
    ws: WebSocket,
    table_id: str,
    token: str = Query(...)
):
    try:
        user_id = _authenticate(token)
    except Exception as e:
        logger.info("poker ws auth rejected table=%s: %s", table_id, e)
        await ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid authentication token")
        return

    # One round trip for the handshake, off the event loop. Nothing holds a
    # database session for the life of the connection: with a dozen players at
    # the tables that alone could exhaust the connection pool.
    context = await in_thread(_load_table_context, user_id, table_id)
    if "error" in context:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION, reason=context["error"])
        return
    table = context["table"]

    engine = poker_manager.get_or_create_table(
        table_id=table["id"],
        is_practice=table["is_practice"],
        small_blind=table["small_blind"],
        big_blind=table["big_blind"],
        max_players=table["max_players"],
    )

    await poker_ws_manager.connect(table_id, user_id, ws)
    _cancel_cashout_timer(table_id, user_id)

    try:
        outbox: Outbox = []
        start_bots = False
        async with table_lock(table_id):
            # Seat the user if they aren't at the table. Opening the table never
            # charges a buy-in: that only happens through the explicit join call.
            if not engine.get_player_by_id(user_id):
                if table["is_practice"]:
                    engine.add_player(
                        user_id=user_id,
                        username=context["username"],
                        buy_in_amount=table["min_buy_in"] or 2000,
                    )
                elif context["seat_stack"] is not None:
                    engine.add_player(
                        user_id=user_id,
                        username=context["username"],
                        buy_in_amount=context["seat_stack"],
                    )

            # Fill remaining seats with bots on practice tables
            _seat_practice_bots(engine, table)

            # Initial sync, with private hole cards kept to their owner.
            outbox.append((
                user_id,
                {"type": "sync", "state": engine.get_public_state(for_user_id=user_id)},
            ))
            seated = engine.get_player_by_id(user_id)
            if seated and seated.hole_cards:
                outbox.append((
                    user_id,
                    {"type": "hole_cards", "hole_cards": [c.to_str() for c in seated.hole_cards]},
                ))

            if engine.phase == 'WAITING' and len(engine.players) >= 2:
                _, dealt_outbox = await deal_next_hand_locked(engine)
                outbox += dealt_outbox
            elif engine.phase in BETTING_PHASES:
                # Reconnecting mid-hand: keep bots and the turn clock moving
                start_bots = True
                ensure_turn_clock(engine)

        await poker_ws_manager.deliver(table_id, outbox)
        if start_bots:
            asyncio.create_task(run_bot_turns(engine))

        while True:
            data_text = await ws.receive_text()
            try:
                msg = json.loads(data_text)
                if not isinstance(msg, dict):
                    raise json.JSONDecodeError("not an object", data_text, 0)
                action_type = str(msg.get("action", "")).lower().strip()
                action_id = msg.get("action_id")

                if action_type == "sync":
                    # Read-only, and engine reads are synchronous, so this needs
                    # no lock.
                    await poker_ws_manager.send_to_user(table_id, user_id, {
                        "type": "sync",
                        "state": engine.get_public_state(for_user_id=user_id)
                    })
                    continue

                if action_type == "start_hand":
                    # Only an idle table can be dealt by hand; after a hand the
                    # settlement cooldown deals the next one itself.
                    outbox = []
                    dealt = False
                    async with table_lock(table_id):
                        if engine.phase == 'WAITING':
                            dealt, outbox = await deal_next_hand_locked(engine)
                            if not dealt:
                                outbox.append((user_id, {
                                    "type": "error",
                                    "message": "Need at least 2 players with chips to deal",
                                }))
                    await poker_ws_manager.deliver(table_id, outbox)
                    if dealt:
                        asyncio.create_task(run_bot_turns(engine))
                    continue

                # Process turn action (fold, check, call, bet, raise, all_in)
                try:
                    amount = int(msg.get("amount") or 0)
                except (TypeError, ValueError):
                    await poker_ws_manager.send_to_user(table_id, user_id, {
                        "type": "error",
                        "message": "Invalid amount"
                    })
                    continue

                async with table_lock(table_id):
                    ok, err_msg = engine.process_action(
                        user_id=user_id,
                        action=action_type,
                        amount=amount,
                        action_id=action_id
                    )
                    if ok:
                        outbox = state_outbox(engine)
                    else:
                        # Action rejected by server-authoritative turn enforcement
                        outbox = [(user_id, {"type": "error", "message": err_msg})]

                await poker_ws_manager.deliver(table_id, outbox)
                if ok:
                    # Drive any bot turns that follow, and handle settlement +
                    # automatic next-hand progression (persists DB, applies
                    # cooldown) without holding up this player's messages.
                    asyncio.create_task(run_bot_turns(engine))

            except json.JSONDecodeError:
                await poker_ws_manager.send_to_user(table_id, user_id, {
                    "type": "error",
                    "message": "Invalid JSON format"
                })

    except WebSocketDisconnect:
        logger.info("poker ws disconnected user=%s table=%s", user_id, table_id)
    except Exception:
        logger.error("poker ws error user=%s table=%s", user_id, table_id, exc_info=True)
    finally:
        poker_ws_manager.disconnect(table_id, user_id, ws)
        await _on_player_gone(table_id, user_id)


async def _on_player_gone(table_id: str, user_id: str) -> None:
    """A connection dropped. A hand in progress isn't folded on the spot: the
    turn clock plays it out if they don't come back in time. Between hands they
    sit out, and a cash player who stays away is cashed out."""
    engine = poker_manager.get_table(table_id)
    if not engine or poker_ws_manager.is_connected(table_id, user_id):
        return  # a newer connection from the same user is live

    outbox: Outbox = []
    keep_bots_running = False
    async with table_lock(table_id):
        player = engine.get_player_by_id(user_id)
        if player is None:
            return
        if engine.phase not in BETTING_PHASES:
            player.is_sitting_out = True
        if not engine.is_practice:
            _cancel_cashout_timer(table_id, user_id)
            _cashout_timers[(table_id, user_id)] = asyncio.create_task(
                _cash_out_when_gone(table_id, user_id)
            )
        outbox = state_outbox(engine)
        keep_bots_running = engine.phase != 'WAITING'

    await poker_ws_manager.deliver(table_id, outbox)
    if keep_bots_running:
        asyncio.create_task(run_bot_turns(engine))

