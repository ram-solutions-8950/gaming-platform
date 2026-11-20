"""Live delivery of in-app notifications to connected players.

This is the "popup while the app is open" half of the feature. The inbox is
the source of truth and is read over HTTP; this socket only pushes a
notification the moment it is sent, so a player already in the app sees it
without refreshing.

Delivery here is best-effort by design. A player who is offline, or whose
socket drops mid-send, simply sees the notification in their inbox on next
load -- nothing is lost, because nothing about read state is decided here.
"""
from __future__ import annotations

import asyncio
import json
import uuid
from typing import Iterable

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status

from ..database import SessionLocal
from ..models.user import User, UserStatus
from ..security.jwt import decode_access_token
from ..utils.async_db import in_thread
from ..utils.logging import get_logger

logger = get_logger("notifications_ws")

router = APIRouter(tags=["Notifications WS"])


class NotificationWsManager:
    def __init__(self) -> None:
        # user_id (string) -> set of that player's open sockets. A player may
        # have several (two tabs, phone and desktop), and all should light up.
        self.connections: dict[str, set[WebSocket]] = {}

    async def connect(self, user_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self.connections.setdefault(str(user_id), set()).add(ws)
        logger.info(
            "Notification WS connected: user=%s (sockets=%d)",
            user_id,
            len(self.connections[str(user_id)]),
        )

    def disconnect(self, user_id: str, ws: WebSocket) -> None:
        sockets = self.connections.get(str(user_id))
        if not sockets:
            return
        sockets.discard(ws)
        if not sockets:
            # Drop the empty set, or this dict grows without bound as players
            # come and go over a long-running process.
            self.connections.pop(str(user_id), None)

    async def _send_safe(self, ws: WebSocket, message: str) -> bool:
        try:
            await ws.send_text(message)
            return True
        except Exception as exc:  # noqa: BLE001
            logger.debug("Notification WS send failed: %s", exc)
            return False

    async def push(self, user_ids: Iterable[str | uuid.UUID], payload: dict) -> int:
        """Send one payload to every open socket of each listed player."""
        message = json.dumps(payload, default=str)
        delivered = 0

        for raw_id in user_ids:
            user_id = str(raw_id)
            sockets = self.connections.get(user_id)
            if not sockets:
                continue
            dead = []
            for ws in list(sockets):
                if await self._send_safe(ws, message):
                    delivered += 1
                else:
                    dead.append(ws)
            for ws in dead:
                self.disconnect(user_id, ws)

        return delivered

    def notify(self, user_ids: Iterable[str | uuid.UUID], notification: dict) -> None:
        """Fire-and-forget push, callable from sync request handlers."""
        payload = {"type": "notification", "notification": notification}
        # Materialise before handing to the loop: the caller's database
        # session may well be closed by the time the task actually runs.
        targets = [str(uid) for uid in user_ids]
        self._dispatch(self.push(targets, payload))

    def _dispatch(self, coro) -> None:
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(coro)
        except RuntimeError:
            # No running loop (a sync worker thread): run it to completion.
            try:
                asyncio.run(coro)
            except Exception as exc:  # noqa: BLE001
                logger.debug("Notification dispatch fallback error: %s", exc)


notification_ws_manager = NotificationWsManager()


def _authenticate(token: str) -> User | None:
    """Resolve the token to an active user, on its own session."""
    try:
        payload = decode_access_token(token)
    except Exception:  # noqa: BLE001
        return None
    if not payload:
        return None

    user_id = payload.get("sub")
    if not user_id:
        return None

    with SessionLocal() as db:
        user = db.query(User).filter(User.id == uuid.UUID(str(user_id))).first()
        if not user or user.status != UserStatus.ACTIVE:
            return None
        # Detach only what the socket layer needs; the session closes here.
        return user.id


@router.websocket("/ws/user/notifications")
async def user_notifications_ws(
    websocket: WebSocket,
    token: str = Query(default=""),
):
    """Player socket that receives notifications the moment they are sent."""
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Token verification touches the database, so it runs off the event loop.
    user_id = await in_thread(_authenticate, token)
    if not user_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_key = str(user_id)
    await notification_ws_manager.connect(user_key, websocket)
    try:
        while True:
            # Nothing is expected from the client; this await simply holds the
            # connection open and surfaces the disconnect.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # noqa: BLE001
        logger.debug("Notification WS error for user=%s: %s", user_key, exc)
    finally:
        # Always unregister, including on cancellation, or the manager keeps
        # pushing to a dead socket forever.
        notification_ws_manager.disconnect(user_key, websocket)
