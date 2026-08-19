"""
WebSocket connection manager for real-time game state broadcasts.
"""

import json
from typing import List
from fastapi import WebSocket
from ..utils.logging import get_logger

logger = get_logger("ws_manager")


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info("WS connected, total=%d", len(self.active_connections))

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info("WS disconnected, total=%d", len(self.active_connections))

    async def broadcast(self, data: dict):
        message = json.dumps(data, default=str)
        disconnected = []
        for ws in self.active_connections:
            try:
                await ws.send_text(message)
            except Exception:
                disconnected.append(ws)
        for ws in disconnected:
            self.disconnect(ws)


# Singleton
game_ws_manager = ConnectionManager()
