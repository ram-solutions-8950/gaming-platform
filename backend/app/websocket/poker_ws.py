import json
import asyncio
import random
from typing import Dict, Set, Optional, Tuple
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from sqlalchemy.orm import Session
from ..database import SessionLocal
from ..security.jwt import decode_access_token
from ..services.poker.game_manager import poker_manager
from ..services.poker.engine import PokerEngine
from ..services.wallet_service import credit_wallet, debit_wallet
from ..models.transaction import WalletTransactionType
from ..models.user import User
from ..models.poker import PokerTable, PokerHand, PokerAction

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

async def run_bot_turns(engine: PokerEngine, db: Session):
    """Drives bot actions for the current hand, and iteratively progresses through
    settlement + subsequent auto-started hands as long as it stays a bot's turn."""
    # Guard against two coroutines (e.g. two connections, or a connect racing
    # an in-flight action) concurrently driving the same table's bots — with
    # bots now resumed on every reconnect, this race became meaningfully more
    # likely. Whichever runner is already active will pick up state changes
    # on its own next loop iteration, so a concurrent call is safe to skip.
    if engine.table_id in _bot_turns_active:
        return
    _bot_turns_active.add(engine.table_id)
    try:
        while True:
            while engine.phase not in ('WAITING', 'SETTLEMENT'):
                seat = engine.current_turn_seat_idx
                player = next((p for p in engine.players if p.seat_index == seat), None) if seat is not None else None
                if not player or not player.is_bot:
                    return
                await asyncio.sleep(random.uniform(0.8, 1.6))
                action, amount = _decide_bot_action(engine, player)
                ok, _ = engine.process_action(user_id=player.user_id, action=action, amount=amount)
                if not ok:
                    engine.process_action(user_id=player.user_id, action='fold')
                await poker_ws_manager.broadcast_table_state(engine)

            if engine.phase != 'SETTLEMENT':
                return

            await persist_hand_result(engine, db)
            await asyncio.sleep(4)
            if len(engine.players) < 2:
                return
            ok, _ = engine.start_hand()
            if not ok:
                return
            await broadcast_hand_start(engine)
    finally:
        _bot_turns_active.discard(engine.table_id)

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
            # Auto-create table record if missing
            table = PokerTable(id=table_id, name=f"Table {table_id[:8]}", small_blind=100, big_blind=200)
            db.add(table)
            db.commit()

        engine = poker_manager.get_or_create_table(
            table_id=table.id,
            is_practice=table.is_practice,
            small_blind=table.small_blind,
            big_blind=table.big_blind,
            max_players=table.max_players
        )

        await poker_ws_manager.connect(table_id, user_id, ws)

        # Auto-seat user if not already seated
        if not engine.get_player_by_id(user_id):
            buy_in = table.min_buy_in if table.min_buy_in else 2000
            engine.add_player(user_id=user_id, username=username, buy_in_amount=buy_in)

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

        # Auto-start hand if 2+ players and WAITING
        if engine.phase == 'WAITING' and len(engine.players) >= 2:
            ok, _ = engine.start_hand()
            if ok:
                await broadcast_hand_start(engine)

        # Resume bot turns on (re)connect if it's currently a bot's turn
        # mid-hand (e.g. page refresh while a bot is up) — previously
        # nothing re-triggered the bots in that case since it's not the
        # human's turn either, so the game would sit deadlocked. SETTLEMENT
        # is deliberately excluded: that transient cooldown window is
        # already being driven by whichever connection just finished the
        # hand, and re-entering it here could double-persist/double-start.
        if engine.phase not in ('WAITING', 'SETTLEMENT'):
            await run_bot_turns(engine, db)

        while True:
            data_text = await ws.receive_text()
            try:
                msg = json.loads(data_text)
                action_type = msg.get("action", "").lower().strip()
                action_id = msg.get("action_id")

                if action_type == "sync":
                    await poker_ws_manager.send_to_user(table_id, user_id, {
                        "type": "sync",
                        "state": engine.get_public_state(for_user_id=user_id)
                    })
                    continue

                if action_type == "start_hand":
                    if engine.phase in ['WAITING', 'SETTLEMENT']:
                        ok, err_msg = engine.start_hand()
                        if ok:
                            await broadcast_hand_start(engine)
                            await run_bot_turns(engine, db)
                        else:
                            await poker_ws_manager.send_to_user(table_id, user_id, {
                                "type": "error",
                                "message": err_msg
                            })
                    continue

                # Process turn action (fold, check, call, bet, raise, all_in)
                amount = int(msg.get("amount", 0))
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
                    # automatic next-hand progression (persists DB, applies cooldown)
                    await run_bot_turns(engine, db)

            except json.JSONDecodeError:
                await poker_ws_manager.send_to_user(table_id, user_id, {
                    "type": "error",
                    "message": "Invalid JSON format"
                })

    except WebSocketDisconnect:
        print(f"[POKER WS] User {user_id} disconnected from table {table_id}")
        poker_ws_manager.disconnect(table_id, user_id, ws)
        # Notify remaining table players
        if table_id in poker_ws_manager.connections:
            engine = poker_manager.get_table(table_id)
            if engine:
                await poker_ws_manager.broadcast_table_state(engine)
    except Exception as e:
        print(f"[POKER WS EXCEPTION] {e}")
        poker_ws_manager.disconnect(table_id, user_id, ws)
    finally:
        db.close()

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

async def persist_hand_result(engine: PokerEngine, db: Session):
    """Persists a completed hand's result to the database."""
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
