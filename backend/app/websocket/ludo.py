import asyncio
import json
from datetime import datetime, timezone
from typing import Dict, List
from uuid import UUID
from fastapi import WebSocket
from ..utils.logging import get_logger
from ..utils.async_db import in_thread
from ..database import SessionLocal
from ..services.ludo.engine import LudoEngine
from ..models.ludo import LudoMatch, LudoMatchStatus

logger = get_logger("ludo_ws")

class LudoConnectionManager:
    def __init__(self):
        # match_id -> list of active WebSockets
        self.rooms: Dict[str, List[WebSocket]] = {}
        # match_id -> asyncio.Lock
        self.locks: Dict[str, asyncio.Lock] = {}
        # match_id -> background timer task
        self.timer_tasks: Dict[str, asyncio.Task] = {}

    def get_lock(self, match_id: str) -> asyncio.Lock:
        if match_id not in self.locks:
            self.locks[match_id] = asyncio.Lock()
        return self.locks[match_id]

    async def connect(self, match_id: str, websocket: WebSocket):
        await websocket.accept()
        if match_id not in self.rooms:
            self.rooms[match_id] = []
        self.rooms[match_id].append(websocket)
        logger.info(f"Ludo WS connected: match={match_id}, total={len(self.rooms[match_id])}")

        # Start timer worker for this match if not already running
        if match_id not in self.timer_tasks or self.timer_tasks[match_id].done():
            self.timer_tasks[match_id] = asyncio.create_task(self._match_timer_loop(match_id))

    def disconnect(self, match_id: str, websocket: WebSocket):
        if match_id in self.rooms and websocket in self.rooms[match_id]:
            self.rooms[match_id].remove(websocket)
            if not self.rooms[match_id]:
                self.rooms.pop(match_id, None)
        logger.info(f"Ludo WS disconnected: match={match_id}")

    async def broadcast(self, match_id: str, message: dict):
        if match_id not in self.rooms:
            return
        payload = json.dumps(message, default=str)
        dead = []
        for ws in self.rooms[match_id]:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(match_id, ws)

    async def _match_timer_loop(self, match_id: str):
        """
        Authoritative server turn timer worker.
        Checks every 1 second if the active player exceeded 10 seconds.

        The whole check runs in a worker thread on a session opened *inside*
        the match lock, which matters for two reasons. psycopg2 is synchronous,
        so querying here on the event loop would stall every other match and
        request once a second. And a session opened before the lock could hand
        back an identity-mapped match row loaded before a dice roll committed
        on another session -- a stale ``turn_started_at`` would time out a
        player who in fact acted in time.
        """
        logger.info(f"Started timer loop for Ludo match {match_id}")
        match_uuid = UUID(match_id)

        try:
            while True:
                await asyncio.sleep(1.0)

                async with self.get_lock(match_id):
                    outcome = await in_thread(_check_turn_timeout, match_uuid)

                if outcome["stop"]:
                    break
                if outcome["result"] is not None:
                    logger.info(f"Turn timed out in match {match_id}: {outcome['result']}")
                    await self.broadcast(match_id, {
                        "type": "TIMEOUT",
                        "data": outcome["result"],
                        "state": outcome["state"],
                    })
                    if outcome["result"].get("game_over"):
                        break
        except asyncio.CancelledError:
            logger.info(f"Timer loop cancelled for match {match_id}")
        except Exception as e:
            logger.error(f"Error in Ludo timer loop: {e}", exc_info=True)
        finally:
            self.timer_tasks.pop(match_id, None)


def _check_turn_timeout(match_uuid: UUID) -> dict:
    """Time out the active player's turn if their clock has run out.

    Runs in a worker thread with the match lock held. Returns ``stop`` when the
    match is over or gone, and a ``result`` only when a turn actually expired
    -- ``handle_timeout`` re-validates the elapsed time itself and reports
    ``TOO_EARLY`` if the player got their move in first.
    """
    with SessionLocal() as db:
        match = db.query(LudoMatch).filter(LudoMatch.id == match_uuid).first()
        if not match or match.status != LudoMatchStatus.IN_PROGRESS:
            return {"stop": True, "result": None, "state": None}
        if not match.turn_started_at:
            return {"stop": False, "result": None, "state": None}

        elapsed = (datetime.now(timezone.utc) - match.turn_started_at).total_seconds()
        if elapsed < match.turn_timeout_seconds:
            return {"stop": False, "result": None, "state": None}

        engine = LudoEngine(db)
        result = engine.handle_timeout(match_uuid)
        if result.get("status") != "TIMEOUT":
            return {"stop": False, "result": None, "state": None}

        # handle_timeout commits, so re-read before formatting the state.
        match = engine.get_match(match_uuid)
        state = engine.format_match_state(match) if match else None
        return {"stop": False, "result": result, "state": state}

ludo_ws_manager = LudoConnectionManager()
