import json
import time
import uuid
import asyncio
import random
from typing import Dict, Set, Optional, Tuple
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from sqlalchemy.orm import Session
from ..database import SessionLocal
from ..security.jwt import decode_access_token
from ..services.poker.game_manager import poker_manager
from ..services.poker.engine import PokerEngine, BETTING_PHASES
from ..services.poker.cashout import cash_out_stack
from ..models.user import User
from ..models.poker import PokerTable, PokerHand, PokerPlayer

router = APIRouter(prefix="/poker", tags=["Poker WebSocket"])

class PokerConnectionManager:
    def __init__(self):
        # table_id -> user_id -> WebSocket
        self.connections: Dict[str, Dict[str, WebSocket]] = {}

    async def connect(self, table_id: str, user_id: str, ws: WebSocket):
        await ws.accept()
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

    async def send_to_user(self, table_id: str, user_id: str, payload: dict):
        if table_id in self.connections and user_id in self.connections[table_id]:
            ws = self.connections[table_id][user_id]
            try:
                await ws.send_text(json.dumps(payload))
            except Exception as e:
                print(f"[POKER WS] Failed to send message to user {user_id}: {e}")

    async def broadcast_table_state(self, engine: PokerEngine):
        table_id = engine.table_id
        if table_id not in self.connections:
            return

        for user_id, ws in list(self.connections[table_id].items()):
            try:
                state = engine.get_public_state(for_user_id=user_id)
                await ws.send_text(json.dumps({
                    "type": "table_state",
                    "state": state
                }))
            except Exception as e:
                print(f"[POKER WS] Broadcast error for user {user_id}: {e}")

poker_ws_manager = PokerConnectionManager()

BOT_NAMES = ["Bot Aarav", "Bot Vihaan", "Bot Kabir", "Bot Zara", "Bot Meera", "Bot Rohan"]

def _seat_practice_bots(engine: PokerEngine, table: PokerTable):
    """Fills remaining seats at a practice table with bot players so the user always has opponents."""
    if not table.is_practice:
        return
    buy_in = table.min_buy_in or 2000
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


async def tidy_seats(engine: PokerEngine, db: Session) -> None:
    """Between hands: players out of chips give up their seat (they can buy in
    again), and humans whose connection is gone sit out instead of being dealt
    in to fold and bleed blinds."""
    if engine.phase in BETTING_PHASES:
        return
    table_id = engine.table_id
    if not engine.is_practice:
        busted = [p for p in engine.players if _is_human(p) and p.stack <= 0]
        if busted:
            table = db.query(PokerTable).filter(PokerTable.id == table_id).first()
            for p in busted:
                engine.remove_player(p.user_id)
                cash_out_stack(db, table, table_id, p.user_id, 0)
                await poker_ws_manager.send_to_user(table_id, p.user_id, {
                    "type": "busted",
                    "message": "You're out of chips. Buy in again to keep playing.",
                    "min_buy_in": table.min_buy_in if table else None,
                    "max_buy_in": table.max_buy_in if table else None,
                })
    for p in engine.players:
        if _is_human(p):
            p.is_sitting_out = not poker_ws_manager.is_connected(table_id, p.user_id)


async def deal_next_hand(engine: PokerEngine, db: Session) -> bool:
    """Tidy the seats and deal, telling every client the outcome either way."""
    await tidy_seats(engine, db)
    ok, _ = engine.start_hand()
    if ok:
        await broadcast_hand_start(engine)
    else:
        await poker_ws_manager.broadcast_table_state(engine)
    return ok


async def on_seat_taken(engine: PokerEngine) -> None:
    """Someone bought in: show them to the table, and deal if it was idle."""
    await poker_ws_manager.broadcast_table_state(engine)
    if engine.phase == 'WAITING' and len(engine.players) >= 2:
        db = SessionLocal()
        try:
            if await deal_next_hand(engine, db):
                asyncio.create_task(run_bot_turns(engine))
        finally:
            db.close()


def ensure_turn_clock(engine: PokerEngine) -> None:
    task = _turn_clocks.get(engine.table_id)
    if task is None or task.done():
        _turn_clocks[engine.table_id] = asyncio.create_task(_run_turn_clock(engine))


async def _run_turn_clock(engine: PokerEngine) -> None:
    """Acts for a player whose turn clock runs out: check if it's free, otherwise
    fold. Covers players who are away or have lost their connection."""
    while engine.phase in BETTING_PHASES:
        seat, started, hand_id = engine.current_turn_seat_idx, engine.turn_start_time, engine.hand_id
        deadline = started + engine.turn_duration + _TURN_GRACE_SECONDS
        await asyncio.sleep(max(0.05, deadline - time.time()))
        still_waiting = (
            engine.phase in BETTING_PHASES
            and engine.hand_id == hand_id
            and engine.current_turn_seat_idx == seat
            and engine.turn_start_time == started
        )
        if not still_waiting:
            continue  # they acted in time, or the hand moved on
        player = next((p for p in engine.players if p.seat_index == seat), None)
        if player is None or player.is_bot:
            # Bots are driven by run_bot_turns; nudge it in case nothing is.
            asyncio.create_task(run_bot_turns(engine))
            await asyncio.sleep(1)
            continue
        owed = engine.current_high_bet - player.current_bet
        engine.process_action(player.user_id, 'check' if owed <= 0 else 'fold')
        await poker_ws_manager.broadcast_table_state(engine)
        asyncio.create_task(run_bot_turns(engine))


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
        ok, _, stack = engine.remove_player(user_id)
        if not ok:
            return
        db = SessionLocal()
        try:
            table = db.query(PokerTable).filter(PokerTable.id == table_id).first()
            cash_out_stack(db, table, table_id, user_id, stack)
        finally:
            db.close()
        await poker_ws_manager.broadcast_table_state(engine)
        if engine.phase != 'WAITING':
            asyncio.create_task(run_bot_turns(engine))
    except asyncio.CancelledError:
        pass


async def cash_out_all_tables() -> None:
    """On shutdown: table stacks only live in memory, so void any hand in
    progress and return every player's chips to their wallet."""
    db = SessionLocal()
    try:
        for engine in list(poker_manager.tables.values()):
            engine.abort_hand()
            table = db.query(PokerTable).filter(PokerTable.id == engine.table_id).first()
            for p in [p for p in engine.players if _is_human(p)]:
                try:
                    ok, _, stack = engine.remove_player(p.user_id)
                    if ok:
                        cash_out_stack(db, table, engine.table_id, p.user_id, stack)
                except Exception as e:
                    db.rollback()
                    print(f"[POKER SHUTDOWN CASHOUT] {engine.table_id}/{p.user_id}: {e}")
    finally:
        db.close()

async def run_bot_turns(engine: PokerEngine, db: Optional[Session] = None):
    """Drives bot actions for the current hand, and iteratively progresses through
    settlement + subsequent auto-started hands as long as it stays a bot's turn."""
    if engine.table_id in _bot_turns_active:
        return
    _bot_turns_active.add(engine.table_id)
    own_db = False
    if db is None:
        db = SessionLocal()
        own_db = True
    try:
        while True:
            while engine.phase not in ('WAITING', 'SETTLEMENT'):
                seat = engine.current_turn_seat_idx
                player = next((p for p in engine.players if p.seat_index == seat), None) if seat is not None else None
                if not player or not player.is_bot:
                    return
                await asyncio.sleep(random.uniform(*_BOT_THINK_SECONDS))
                action, amount = _decide_bot_action(engine, player)
                ok, _ = engine.process_action(user_id=player.user_id, action=action, amount=amount)
                if not ok:
                    engine.process_action(user_id=player.user_id, action='fold')
                await poker_ws_manager.broadcast_table_state(engine)

            if engine.phase != 'SETTLEMENT':
                return

            await persist_hand_result(engine, db)
            await asyncio.sleep(_SETTLEMENT_COOLDOWN_SECONDS)
            if engine.phase != 'SETTLEMENT':
                return  # the table already moved on
            await tidy_seats(engine, db)
            # Nobody left to play against (or only bots, with every human gone or
            # sitting out): end here and clear the settled hand rather than
            # leaving its pot, bets and cards on the felt.
            if len(engine.players) < 2 or not any(_is_human(p) and not p.is_sitting_out for p in engine.players):
                engine.reset_to_waiting()
                await poker_ws_manager.broadcast_table_state(engine)
                return
            if not await deal_next_hand(engine, db):
                return
    finally:
        _bot_turns_active.discard(engine.table_id)
        if own_db and db:
            db.close()

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
        print(f"[POKER WS] Auth error: {e}")
        await ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid authentication token")
        return

    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            await ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="User not found")
            return
        username = user.username or user.email.split('@')[0]

        table = db.query(PokerTable).filter(PokerTable.id == table_id).first()
        if not table:
            await ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="Table not found")
            return

        engine = poker_manager.get_or_create_table(
            table_id=table.id,
            is_practice=table.is_practice,
            small_blind=table.small_blind,
            big_blind=table.big_blind,
            max_players=table.max_players
        )

        await poker_ws_manager.connect(table_id, user_id, ws)
        _cancel_cashout_timer(table_id, user_id)

        # Seat the user if they aren't at the table. Opening the table never
        # charges a buy-in: that only happens through the explicit join call.
        # A cash seat record without a live seat (the server restarted) is
        # restored as-is.
        if not engine.get_player_by_id(user_id):
            if table.is_practice:
                engine.add_player(user_id=user_id, username=username, buy_in_amount=table.min_buy_in or 2000)
            else:
                db_player = db.query(PokerPlayer).filter(
                    PokerPlayer.table_id == table_id,
                    PokerPlayer.user_id == user.id
                ).first()
                if db_player:
                    engine.add_player(user_id=user_id, username=username, buy_in_amount=db_player.stack)

        # Fill remaining seats with bots on practice tables
        _seat_practice_bots(engine, table)

        # Send initial sync payload with private hole card isolation
        await poker_ws_manager.send_to_user(table_id, user_id, {
            "type": "sync",
            "state": engine.get_public_state(for_user_id=user_id)
        })

        # Send private hole cards explicitly if hand active
        p_state = engine.get_player_by_id(user_id)
        if p_state and p_state.hole_cards:
            await poker_ws_manager.send_to_user(table_id, user_id, {
                "type": "hole_cards",
                "hole_cards": [c.to_str() for c in p_state.hole_cards]
            })

        if engine.phase == 'WAITING' and len(engine.players) >= 2:
            await deal_next_hand(engine, db)
        elif engine.phase in BETTING_PHASES:
            # Reconnecting mid-hand: keep bots and the turn clock moving
            asyncio.create_task(run_bot_turns(engine))
            ensure_turn_clock(engine)

        while True:
            data_text = await ws.receive_text()
            try:
                msg = json.loads(data_text)
                if not isinstance(msg, dict):
                    raise json.JSONDecodeError("not an object", data_text, 0)
                action_type = str(msg.get("action", "")).lower().strip()
                action_id = msg.get("action_id")

                if action_type == "sync":
                    await poker_ws_manager.send_to_user(table_id, user_id, {
                        "type": "sync",
                        "state": engine.get_public_state(for_user_id=user_id)
                    })
                    continue

                if action_type == "start_hand":
                    # Only an idle table can be dealt by hand; after a hand the
                    # settlement cooldown deals the next one itself.
                    if engine.phase == 'WAITING':
                        if await deal_next_hand(engine, db):
                            asyncio.create_task(run_bot_turns(engine))
                        else:
                            await poker_ws_manager.send_to_user(table_id, user_id, {
                                "type": "error",
                                "message": "Need at least 2 players with chips to deal"
                            })
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
                ok, err_msg = engine.process_action(
                    user_id=user_id,
                    action=action_type,
                    amount=amount,
                    action_id=action_id
                )

                if not ok:
                    # Action rejected by server-authoritative turn enforcement
                    await poker_ws_manager.send_to_user(table_id, user_id, {
                        "type": "error",
                        "message": err_msg
                    })
                else:
                    # Broadcast updated table state to all clients
                    await poker_ws_manager.broadcast_table_state(engine)

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
        print(f"[POKER WS] User {user_id} disconnected from table {table_id}")
    except Exception as e:
        print(f"[POKER WS EXCEPTION] {e}")
    finally:
        poker_ws_manager.disconnect(table_id, user_id, ws)
        db.close()
        await _on_player_gone(table_id, user_id)


async def _on_player_gone(table_id: str, user_id: str) -> None:
    """A connection dropped. A hand in progress isn't folded on the spot: the
    turn clock plays it out if they don't come back in time. Between hands they
    sit out, and a cash player who stays away is cashed out."""
    engine = poker_manager.get_table(table_id)
    if not engine or poker_ws_manager.is_connected(table_id, user_id):
        return  # a newer connection from the same user is live
    player = engine.get_player_by_id(user_id)
    if player is None:
        return
    if engine.phase not in BETTING_PHASES:
        player.is_sitting_out = True
    if not engine.is_practice:
        _cancel_cashout_timer(table_id, user_id)
        _cashout_timers[(table_id, user_id)] = asyncio.create_task(_cash_out_when_gone(table_id, user_id))
    await poker_ws_manager.broadcast_table_state(engine)
    if engine.phase != 'WAITING':
        asyncio.create_task(run_bot_turns(engine))


async def broadcast_hand_start(engine: PokerEngine):
    """Sends public table state + private hole cards directly to individual clients."""
    table_id = engine.table_id
    await poker_ws_manager.broadcast_table_state(engine)

    # Send individual private hole_cards to respective players
    for p in engine.players:
        if p.hole_cards:
            await poker_ws_manager.send_to_user(table_id, p.user_id, {
                "type": "hole_cards",
                "hole_cards": [c.to_str() for c in p.hole_cards]
            })
    ensure_turn_clock(engine)

async def persist_hand_result(engine: PokerEngine, db: Optional[Session] = None):
    """Persists a completed hand's result to the database."""
    own_db = False
    if db is None:
        db = SessionLocal()
        own_db = True
    try:
        db_hand = PokerHand(
            id=engine.hand_id or f"hand_{int(asyncio.get_event_loop().time())}",
            table_id=engine.table_id,
            dealer_seat_idx=engine.dealer_seat_idx,
            small_blind=engine.small_blind,
            big_blind=engine.big_blind,
            community_cards=[c.to_str() for c in engine.community_cards],
            pot=engine.pot,
            winners_summary=engine.winners_summary,
        )
        db.add(db_hand)
        db.commit()
    except Exception as e:
        print(f"[POKER DB SAVE ERROR] {e}")
    finally:
        if own_db and db:
            db.close()
