"""
Ludo Matchmaking WebSocket Connection Manager.

Maps user_id → WebSocket for real-time MATCH_FOUND delivery.
This is separate from the per-match game WebSocket manager in ludo.py.
"""
import asyncio
import json
from typing import Dict, Optional
from fastapi import WebSocket
from ..utils.logging import get_logger

logger = get_logger("ludo_matchmaking_ws")


class LudoMatchmakingManager:
    """
    Manages WebSocket connections for users who are actively searching
    for a Ludo match.  Keyed by user_id (str), NOT socket_id.

    Thread-safety: all mutations go through a single asyncio.Lock so
    that connect / disconnect / notify are serialised within the
    event-loop.
    """

    def __init__(self):
        # user_id (str) → WebSocket
        self._connections: Dict[str, WebSocket] = {}
        self._lock = asyncio.Lock()

    async def connect(self, user_id: str, websocket: WebSocket) -> None:
        """Register an authenticated user's matchmaking WebSocket."""
        async with self._lock:
            # If the user already has a stale socket, remove it first
            old = self._connections.pop(user_id, None)
            if old is not None:
                logger.info(f"[LUDO-MM-WS] Replacing stale socket for user={user_id}")
                try:
                    await old.close(code=1000, reason="replaced")
                except Exception:
                    pass
            self._connections[user_id] = websocket
            logger.info(
                f"[LUDO-MM-WS] Connected user={user_id} "
                f"(total_connected={len(self._connections)})"
            )

    async def disconnect(self, user_id: str) -> None:
        """Remove a user's matchmaking WebSocket."""
        async with self._lock:
            removed = self._connections.pop(user_id, None)
            if removed:
                logger.info(
                    f"[LUDO-MM-WS] Disconnected user={user_id} "
                    f"(total_connected={len(self._connections)})"
                )

    def is_connected(self, user_id: str) -> bool:
        """Check if a user currently has an active matchmaking WebSocket."""
        return user_id in self._connections

    async def notify_match_found(
        self, user_id: str, payload: dict
    ) -> bool:
        """
        Send a MATCH_FOUND event to a specific user.
        Returns True if sent successfully, False otherwise.
        """
        ws = self._connections.get(user_id)
        if ws is None:
            logger.warning(
                f"[LUDO-MM-WS] Cannot notify user={user_id}: no active socket"
            )
            return False

        try:
            await ws.send_text(json.dumps(payload, default=str))
            logger.info(
                f"[LUDO-MM-WS] MATCH_FOUND sent to user={user_id} "
                f"match_id={payload.get('match_id')}"
            )
            return True
        except Exception as e:
            logger.error(
                f"[LUDO-MM-WS] Failed to send MATCH_FOUND to user={user_id}: {e}"
            )
            # Remove the dead socket
            self._connections.pop(user_id, None)
            return False

    async def notify_users(
        self, user_ids: list, base_payload: dict, color_map: dict
    ) -> Dict[str, bool]:
        """
        Send MATCH_FOUND to multiple users, each with their own your_color.

        Args:
            user_ids: list of user_id strings
            base_payload: dict with type, match_id, players, etc.
            color_map: { user_id: color_string }

        Returns:
            { user_id: True/False } indicating delivery success per user.
        """
        results = {}
        for uid in user_ids:
            per_user_payload = {
                **base_payload,
                "your_color": color_map.get(uid, None),
            }
            results[uid] = await self.notify_match_found(uid, per_user_payload)
        return results


# Singleton instance — imported by routers
ludo_mm_manager = LudoMatchmakingManager()
