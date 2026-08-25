"""
Aviator WebSocket handler — manages real-time game loop and client connections.

Endpoint: /api/v1/aviator/ws
Clients authenticate via ?token=<JWT> query parameter.

Server broadcasts:
  round_start, betting_open, betting_locked, flight_start,
  multiplier_update, cashout_broadcast, crash, settled, sync

Clients send:
  place_bet, cashout
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import jwt, JWTError
from ..database import SessionLocal
from ..security.jwt import decode_access_token
from ..services.aviator.engine import (
    engine as aviator_engine,
    BETTING_DURATION,
    COOLDOWN_DURATION,
    MULTIPLIER_TICK_INTERVAL,
    time_for_multiplier,
)
from ..services.aviator.models import RoundPhase, BetStatus
from ..utils.logging import get_logger

logger = get_logger("aviator_ws")

router = APIRouter(tags=["Aviator WS"])

# ── Connection registry ──
_connections: dict[str, tuple[WebSocket, uuid.UUID]] = {}  # conn_id → (ws, user_id)
_game_loop_task: Optional[asyncio.Task] = None


# ──────────────────────────────────────────────────────────────
#  Helpers
# ──────────────────────────────────────────────────────────────

def _authenticate(token: str) -> Optional[uuid.UUID]:
    """Validate JWT and return user_id, or None."""
    if not token:
        return None
    try:
        payload = decode_access_token(token)
        if not payload:
            return None
        uid = payload.get("sub")
        if uid:
            return uuid.UUID(str(uid))
    except (JWTError, ValueError, AttributeError, Exception):
        pass
    return None


async def _broadcast(msg: dict) -> None:
    """Send a JSON message to all connected clients."""
    text = json.dumps(msg, default=str)
    dead: list[str] = []
    for cid, (ws, _uid) in _connections.items():
        try:
            await ws.send_text(text)
        except Exception:
            dead.append(cid)
    for cid in dead:
        _connections.pop(cid, None)


async def _send(ws: WebSocket, msg: dict) -> None:
    """Send a JSON message to a single client."""
    try:
        await ws.send_text(json.dumps(msg, default=str))
    except Exception:
        pass


# ──────────────────────────────────────────────────────────────
#  Game loop
# ──────────────────────────────────────────────────────────────

async def _game_loop() -> None:
    """
    Infinite loop managing round lifecycle:
      BETTING (10s) → FLYING (variable) → CRASHED → SETTLED → COOLDOWN (3s) → repeat
    """
    logger.info("Aviator game loop started")

    while True:
        # ── 1. Create round ──
        db = SessionLocal()
        try:
            rnd = aviator_engine.create_round(db)
        finally:
            db.close()

        await _broadcast({
            "type": "round_start",
            "round_id": str(rnd.round_id),
            "phase": "BETTING",
            "server_seed_hash": rnd.server_seed_hash,
            "nonce": rnd.nonce,
            "betting_duration": BETTING_DURATION,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        # ── 2. Betting phase ──
        await asyncio.sleep(BETTING_DURATION)

        # ── 3. Start flight ──
        db = SessionLocal()
        try:
            aviator_engine.start_flight(db)
        finally:
            db.close()

        flight_start_time = datetime.now(timezone.utc)
        crash_time = time_for_multiplier(rnd.crash_point)

        await _broadcast({
            "type": "flight_start",
            "round_id": str(rnd.round_id),
            "phase": "FLYING",
            "flight_started_at": flight_start_time.isoformat(),
            "timestamp": flight_start_time.isoformat(),
        })

        # ── 4. Flying phase — send multiplier snapshots ──
        elapsed = 0.0
        while elapsed < crash_time:
            await asyncio.sleep(MULTIPLIER_TICK_INTERVAL)
            elapsed += MULTIPLIER_TICK_INTERVAL

            # Process auto cashouts
            db = SessionLocal()
            try:
                auto_results = aviator_engine.process_auto_cashouts(db)
                for bet, mult in auto_results:
                    await _broadcast({
                        "type": "cashout_broadcast",
                        "round_id": str(rnd.round_id),
                        "user_id": str(bet.user_id),
                        "slot": bet.slot,
                        "multiplier": round(mult, 2),
                        "payout": bet.payout,
                        "auto": True,
                    })
            finally:
                db.close()

            now = datetime.now(timezone.utc)
            current_mult = rnd.current_multiplier(now)
            await _broadcast({
                "type": "multiplier_update",
                "round_id": str(rnd.round_id),
                "multiplier": round(current_mult, 2),
                "timestamp": now.isoformat(),
            })

        # ── 5. Crash ──
        db = SessionLocal()
        try:
            aviator_engine.crash_round(db)
        finally:
            db.close()

        await _broadcast({
            "type": "crash",
            "round_id": str(rnd.round_id),
            "phase": "CRASHED",
            "crash_point": rnd.crash_point,
            "server_seed": rnd.server_seed,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        # ── 6. Settle ──
        await asyncio.sleep(0.5)  # brief pause for clients to see crash
        db = SessionLocal()
        try:
            aviator_engine.settle_round(db)
        finally:
            db.close()

        await _broadcast({
            "type": "settled",
            "round_id": str(rnd.round_id),
            "phase": "SETTLED",
            "crash_point": rnd.crash_point,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        # ── 7. Cooldown ──
        aviator_engine.rotate_seed_if_needed()
        await asyncio.sleep(COOLDOWN_DURATION)


def _ensure_game_loop() -> None:
    """Start the game loop if not already running."""
    global _game_loop_task
    if _game_loop_task is None or _game_loop_task.done():
        _game_loop_task = asyncio.create_task(_game_loop())
        logger.info("Aviator game loop task created")


# ──────────────────────────────────────────────────────────────
#  WebSocket endpoint
# ──────────────────────────────────────────────────────────────

@router.websocket("/aviator/ws")
async def aviator_websocket(ws: WebSocket, token: str = Query(...)):
    user_id = _authenticate(token)
    if user_id is None:
        await ws.close(code=4001, reason="Unauthorized")
        return

    await ws.accept()
    conn_id = str(uuid.uuid4())
    _connections[conn_id] = (ws, user_id)
    logger.info("WS connected  user=%s  conn=%s", user_id, conn_id)

    # Ensure game loop is running
    _ensure_game_loop()

    # Send sync/reconnect state
    snap = aviator_engine.get_round_state_snapshot()
    if snap:
        await _send(ws, {"type": "sync", **snap})

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await _send(ws, {"type": "error", "message": "Invalid JSON"})
                continue

            action = msg.get("action")
            action_id = msg.get("action_id")

            if action == "place_bet":
                await _handle_place_bet(ws, user_id, msg, action_id)
            elif action == "cashout":
                await _handle_cashout(ws, user_id, msg, action_id)
            elif action == "sync":
                snap = aviator_engine.get_round_state_snapshot()
                if snap:
                    await _send(ws, {"type": "sync", **snap})
            else:
                await _send(ws, {"type": "error", "message": f"Unknown action: {action}"})

    except WebSocketDisconnect:
        logger.info("WS disconnected  user=%s  conn=%s", user_id, conn_id)
    except Exception as e:
        logger.exception("WS error  user=%s: %s", user_id, e)
    finally:
        _connections.pop(conn_id, None)


async def _handle_place_bet(
    ws: WebSocket,
    user_id: uuid.UUID,
    msg: dict,
    action_id: Optional[str],
) -> None:
    """Handle a place_bet message from a client."""
    try:
        slot = int(msg.get("slot", 1))
        amount = int(msg.get("amount", 0))
        auto_cashout = msg.get("auto_cashout")
        if auto_cashout is not None:
            auto_cashout = float(auto_cashout)
    except (ValueError, TypeError):
        await _send(ws, {"type": "error", "message": "Invalid bet parameters"})
        return

    db = SessionLocal()
    try:
        bet = aviator_engine.place_bet(
            db, user_id, slot, amount,
            auto_cashout=auto_cashout,
            action_id=action_id,
        )
        await _send(ws, {
            "type": "bet_accepted",
            "slot": bet.slot,
            "amount": bet.amount,
            "auto_cashout": bet.auto_cashout,
            "action_id": action_id,
        })
        # Broadcast to all
        await _broadcast({
            "type": "new_bet",
            "round_id": str(aviator_engine.current_round.round_id) if aviator_engine.current_round else None,
            "user_id": str(user_id),
            "slot": slot,
            "amount": amount,
        })
    except ValueError as e:
        await _send(ws, {"type": "error", "message": str(e), "action_id": action_id})
    finally:
        db.close()


async def _handle_cashout(
    ws: WebSocket,
    user_id: uuid.UUID,
    msg: dict,
    action_id: Optional[str],
) -> None:
    """Handle a cashout message from a client."""
    try:
        slot = int(msg.get("slot", 1))
    except (ValueError, TypeError):
        await _send(ws, {"type": "error", "message": "Invalid slot"})
        return

    db = SessionLocal()
    try:
        bet, mult = aviator_engine.cashout(db, user_id, slot, action_id=action_id)
        await _send(ws, {
            "type": "cashout_confirmed",
            "slot": bet.slot,
            "multiplier": round(mult, 2),
            "payout": bet.payout,
            "action_id": action_id,
        })
        # Broadcast to all
        await _broadcast({
            "type": "cashout_broadcast",
            "round_id": str(aviator_engine.current_round.round_id) if aviator_engine.current_round else None,
            "user_id": str(user_id),
            "slot": slot,
            "multiplier": round(mult, 2),
            "payout": bet.payout,
            "auto": False,
        })
    except ValueError as e:
        await _send(ws, {"type": "error", "message": str(e), "action_id": action_id})
    finally:
        db.close()
