import asyncio
import json
from typing import Dict, List, Optional
from uuid import UUID
from fastapi import WebSocket
from ..utils.logging import get_logger
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
        """
        logger.info(f"Started timer loop for Ludo match {match_id}")
        match_uuid = UUID(match_id)

        try:
            while True:
                await asyncio.sleep(1.0)
                if match_id not in self.rooms or not self.rooms[match_id]:
                    # Keep running for at least 60s even if all disconnected
                    pass

                db = SessionLocal()
                try:
                    match = db.query(LudoMatch).filter(LudoMatch.id == match_uuid).first()
                    if not match or match.status != LudoMatchStatus.IN_PROGRESS:
                        break

                    # Check if 10 seconds passed
                    if match.turn_started_at:
                        from datetime import datetime, timezone
                        elapsed = (datetime.now(timezone.utc) - match.turn_started_at).total_seconds()
                        if elapsed >= match.turn_timeout_seconds:
                            async with self.get_lock(match_id):
                                engine = LudoEngine(db)
                                result = engine.handle_timeout(match_uuid)
                                if result.get("status") == "TIMEOUT":
                                    logger.info(f"Turn timed out in match {match_id}: {result}")
                                    await self.broadcast(match_id, {
                                        "type": "TIMEOUT",
                                        "data": result,
                                    })
                                    if result.get("game_over"):
                                        break
                finally:
                    db.close()
        except asyncio.CancelledError:
            logger.info(f"Timer loop cancelled for match {match_id}")
        except Exception as e:
            logger.error(f"Error in Ludo timer loop: {e}")
        finally:
            self.timer_tasks.pop(match_id, None)

ludo_ws_manager = LudoConnectionManager()
