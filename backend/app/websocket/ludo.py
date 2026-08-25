from fastapi import WebSocket
from typing import Dict, List
import uuid
import json
import asyncio


class LudoWebSocketManager:
    def __init__(self):
        # map match_id -> list of connections
        self.active_connections: Dict[uuid.UUID, List[WebSocket]] = {}
        self._loop: asyncio.AbstractEventLoop | None = None

    async def connect(self, websocket: WebSocket, match_id: uuid.UUID):
        await websocket.accept()
        if match_id not in self.active_connections:
            self.active_connections[match_id] = []
        self.active_connections[match_id].append(websocket)
        # Capture the running event loop for later use from sync code
        self._loop = asyncio.get_running_loop()

    def disconnect(self, websocket: WebSocket, match_id: uuid.UUID):
        if match_id in self.active_connections:
            if websocket in self.active_connections[match_id]:
                self.active_connections[match_id].remove(websocket)
            if not self.active_connections[match_id]:
                del self.active_connections[match_id]

    def broadcast_to_match(self, match_id: uuid.UUID, message: dict):
        """
        Broadcast to all WebSocket connections for a match.
        Safe to call from synchronous FastAPI route handlers that run in a threadpool.
        Uses run_coroutine_threadsafe to schedule sends on the main event loop.
        """
        if match_id not in self.active_connections:
            return
        connections = list(self.active_connections[match_id])
        if not connections:
            return
        msg_text = json.dumps(message)

        loop = self._loop
        if loop is None:
            return

        async def _send_all():
            dead = []
            for ws in connections:
                try:
                    await ws.send_text(msg_text)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self.disconnect(ws, match_id)

        try:
            asyncio.run_coroutine_threadsafe(_send_all(), loop)
        except RuntimeError:
            pass


ludo_ws_manager = LudoWebSocketManager()
