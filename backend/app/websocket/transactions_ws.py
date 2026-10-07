"""
WebSocket connection manager for real-time deposit and withdrawal updates.
Strictly isolated to 4 pages:
1. User Deposit (/api/v1/ws/user/deposits)
2. User Withdrawal (/api/v1/ws/user/withdrawals)
3. Admin Deposits (/api/v1/ws/admin/deposits)
4. Admin Withdrawals (/api/v1/ws/admin/withdrawals)
"""

from __future__ import annotations

import asyncio
import json
import uuid

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models.user import User, UserRole, UserStatus
from ..models.wallet import Wallet
from ..security.jwt import decode_access_token
from ..utils.logging import get_logger

logger = get_logger("transactions_ws")

router = APIRouter(tags=["Financial WS"])


def get_user_wallet_snapshot(db: Session, user_id: uuid.UUID) -> dict | None:
    wallet = db.query(Wallet).filter(Wallet.user_id == user_id).first()
    if not wallet:
        return None
    return {
        "balance": wallet.balance,
        "balance_inr": round(wallet.balance / 100.0, 2),
        "currency": "INR",
    }


class FinancialWsManager:
    def __init__(self):
        # user_id (string) -> set of WebSockets
        self.user_deposits: dict[str, set[WebSocket]] = {}
        self.user_withdrawals: dict[str, set[WebSocket]] = {}
        # admin WebSockets
        self.admin_deposits: set[WebSocket] = set()
        self.admin_withdrawals: set[WebSocket] = set()

    async def connect_user_deposit(self, user_id: str, ws: WebSocket):
        await ws.accept()
        if user_id not in self.user_deposits:
            self.user_deposits[user_id] = set()
        self.user_deposits[user_id].add(ws)
        logger.info("WS user_deposit connected: user=%s (active=%d)", user_id, len(self.user_deposits[user_id]))

    def disconnect_user_deposit(self, user_id: str, ws: WebSocket):
        if user_id in self.user_deposits:
            self.user_deposits[user_id].discard(ws)
            if not self.user_deposits[user_id]:
                del self.user_deposits[user_id]
        logger.info("WS user_deposit disconnected: user=%s", user_id)

    async def connect_user_withdrawal(self, user_id: str, ws: WebSocket):
        await ws.accept()
        if user_id not in self.user_withdrawals:
            self.user_withdrawals[user_id] = set()
        self.user_withdrawals[user_id].add(ws)
        logger.info("WS user_withdrawal connected: user=%s (active=%d)", user_id, len(self.user_withdrawals[user_id]))

    def disconnect_user_withdrawal(self, user_id: str, ws: WebSocket):
        if user_id in self.user_withdrawals:
            self.user_withdrawals[user_id].discard(ws)
            if not self.user_withdrawals[user_id]:
                del self.user_withdrawals[user_id]
        logger.info("WS user_withdrawal disconnected: user=%s", user_id)

    async def connect_admin_deposit(self, ws: WebSocket):
        await ws.accept()
        self.admin_deposits.add(ws)
        logger.info("WS admin_deposit connected (active=%d)", len(self.admin_deposits))

    def disconnect_admin_deposit(self, ws: WebSocket):
        self.admin_deposits.discard(ws)
        logger.info("WS admin_deposit disconnected (active=%d)", len(self.admin_deposits))

    async def connect_admin_withdrawal(self, ws: WebSocket):
        await ws.accept()
        self.admin_withdrawals.add(ws)
        logger.info("WS admin_withdrawal connected (active=%d)", len(self.admin_withdrawals))

    def disconnect_admin_withdrawal(self, ws: WebSocket):
        self.admin_withdrawals.discard(ws)
        logger.info("WS admin_withdrawal disconnected (active=%d)", len(self.admin_withdrawals))

    async def _send_safe(self, ws: WebSocket, message: str) -> bool:
        try:
            await ws.send_text(message)
            return True
        except Exception as e:  # noqa: BLE001
            logger.debug("WS send failed: %s", e)
            return False

    async def broadcast_user_deposit(self, user_id: str, payload: dict):
        connections = self.user_deposits.get(str(user_id))
        if not connections:
            return
        msg = json.dumps(payload, default=str)
        dead = []
        for ws in list(connections):
            ok = await self._send_safe(ws, msg)
            if not ok:
                dead.append(ws)
        for ws in dead:
            self.disconnect_user_deposit(str(user_id), ws)

    async def broadcast_user_withdrawal(self, user_id: str, payload: dict):
        connections = self.user_withdrawals.get(str(user_id))
        if not connections:
            return
        msg = json.dumps(payload, default=str)
        dead = []
        for ws in list(connections):
            ok = await self._send_safe(ws, msg)
            if not ok:
                dead.append(ws)
        for ws in dead:
            self.disconnect_user_withdrawal(str(user_id), ws)

    async def broadcast_admin_deposit(self, payload: dict):
        if not self.admin_deposits:
            return
        msg = json.dumps(payload, default=str)
        dead = []
        for ws in list(self.admin_deposits):
            ok = await self._send_safe(ws, msg)
            if not ok:
                dead.append(ws)
        for ws in dead:
            self.disconnect_admin_deposit(ws)

    async def broadcast_admin_withdrawal(self, payload: dict):
        if not self.admin_withdrawals:
            return
        msg = json.dumps(payload, default=str)
        dead = []
        for ws in list(self.admin_withdrawals):
            ok = await self._send_safe(ws, msg)
            if not ok:
                dead.append(ws)
        for ws in dead:
            self.disconnect_admin_withdrawal(ws)

    def _dispatch(self, coro):
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(coro)
        except RuntimeError:
            try:
                asyncio.run(coro)
            except Exception as exc:  # noqa: BLE001
                logger.debug("Dispatch fallback error: %s", exc)

    def notify_deposit(self, user_id: str | uuid.UUID, deposit_data: dict, wallet_data: dict | None = None):
        """Notify user and admins about an updated deposit."""
        u_id = str(user_id)
        user_payload = {
            "type": "deposit_updated",
            "deposit": deposit_data,
            "wallet": wallet_data,
        }
        admin_payload = {
            "type": "deposit_updated",
            "deposit": deposit_data,
        }
        self._dispatch(self.broadcast_user_deposit(u_id, user_payload))
        self._dispatch(self.broadcast_admin_deposit(admin_payload))

    def notify_deposit_created(self, user_id: str | uuid.UUID, deposit_data: dict):
        """Notify user and admins about a new deposit request."""
        u_id = str(user_id)
        user_payload = {
            "type": "deposit_created",
            "deposit": deposit_data,
        }
        admin_payload = {
            "type": "deposit_created",
            "deposit": deposit_data,
        }
        self._dispatch(self.broadcast_user_deposit(u_id, user_payload))
        self._dispatch(self.broadcast_admin_deposit(admin_payload))

    def notify_withdrawal(self, user_id: str | uuid.UUID, withdrawal_data: dict, wallet_data: dict | None = None):
        """Notify user and admins about an updated withdrawal."""
        u_id = str(user_id)
        user_payload = {
            "type": "withdrawal_updated",
            "withdrawal": withdrawal_data,
            "wallet": wallet_data,
        }
        admin_payload = {
            "type": "withdrawal_updated",
            "withdrawal": withdrawal_data,
        }
        self._dispatch(self.broadcast_user_withdrawal(u_id, user_payload))
        self._dispatch(self.broadcast_admin_withdrawal(admin_payload))

    def notify_withdrawal_created(self, user_id: str | uuid.UUID, withdrawal_data: dict, wallet_data: dict | None = None):
        """Notify user and admins about a new withdrawal request."""
        u_id = str(user_id)
        user_payload = {
            "type": "withdrawal_created",
            "withdrawal": withdrawal_data,
            "wallet": wallet_data,
        }
        admin_payload = {
            "type": "withdrawal_created",
            "withdrawal": withdrawal_data,
        }
        self._dispatch(self.broadcast_user_withdrawal(u_id, user_payload))
        self._dispatch(self.broadcast_admin_withdrawal(admin_payload))


financial_ws_manager = FinancialWsManager()


def _authenticate_user(token: str) -> tuple[uuid.UUID, str] | None:
    if not token:
        return None
    try:
        payload = decode_access_token(token)
        if not payload:
            return None
        uid = payload.get("sub")
        role = payload.get("role", "player")
        if uid:
            return uuid.UUID(str(uid)), role
    except Exception:  # noqa: BLE001, S110
        pass
    return None


def _authenticate_admin(token: str) -> tuple[uuid.UUID, str] | None:
    auth = _authenticate_user(token)
    if not auth:
        return None
    user_id, role = auth
    if str(role).upper() in ("ADMIN", "SUPER_ADMIN"):
        return user_id, role
    # Fallback check DB
    try:
        with SessionLocal() as db:
            user = db.query(User).filter(User.id == user_id).first()
            if user and user.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN) and user.status == UserStatus.ACTIVE:
                return user_id, user.role.value
    except Exception:  # noqa: BLE001, S110
        pass
    return None


@router.websocket("/ws/user/deposits")
async def ws_user_deposits(ws: WebSocket, token: str = Query(...)):
    auth = _authenticate_user(token)
    if not auth:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    user_id, _ = auth
    await financial_ws_manager.connect_user_deposit(str(user_id), ws)
    try:
        await ws.send_text(json.dumps({"type": "connected", "channel": "user_deposits"}))
        while True:
            text = await ws.receive_text()
            if text == "ping" or '"ping"' in text:
                await ws.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        financial_ws_manager.disconnect_user_deposit(str(user_id), ws)
    except Exception as exc:  # noqa: BLE001
        logger.debug("WS user_deposit error: %s", exc)
        financial_ws_manager.disconnect_user_deposit(str(user_id), ws)


@router.websocket("/ws/user/withdrawals")
async def ws_user_withdrawals(ws: WebSocket, token: str = Query(...)):
    auth = _authenticate_user(token)
    if not auth:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    user_id, _ = auth
    await financial_ws_manager.connect_user_withdrawal(str(user_id), ws)
    try:
        await ws.send_text(json.dumps({"type": "connected", "channel": "user_withdrawals"}))
        while True:
            text = await ws.receive_text()
            if text == "ping" or '"ping"' in text:
                await ws.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        financial_ws_manager.disconnect_user_withdrawal(str(user_id), ws)
    except Exception as exc:  # noqa: BLE001
        logger.debug("WS user_withdrawal error: %s", exc)
        financial_ws_manager.disconnect_user_withdrawal(str(user_id), ws)


@router.websocket("/ws/admin/deposits")
async def ws_admin_deposits(ws: WebSocket, token: str = Query(...)):
    auth = _authenticate_admin(token)
    if not auth:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await financial_ws_manager.connect_admin_deposit(ws)
    try:
        await ws.send_text(json.dumps({"type": "connected", "channel": "admin_deposits"}))
        while True:
            text = await ws.receive_text()
            if text == "ping" or '"ping"' in text:
                await ws.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        financial_ws_manager.disconnect_admin_deposit(ws)
    except Exception as exc:  # noqa: BLE001
        logger.debug("WS admin_deposit error: %s", exc)
        financial_ws_manager.disconnect_admin_deposit(ws)


@router.websocket("/ws/admin/withdrawals")
async def ws_admin_withdrawals(ws: WebSocket, token: str = Query(...)):
    auth = _authenticate_admin(token)
    if not auth:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await financial_ws_manager.connect_admin_withdrawal(ws)
    try:
        await ws.send_text(json.dumps({"type": "connected", "channel": "admin_withdrawals"}))
        while True:
            text = await ws.receive_text()
            if text == "ping" or '"ping"' in text:
                await ws.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        financial_ws_manager.disconnect_admin_withdrawal(ws)
    except Exception as exc:  # noqa: BLE001
        logger.debug("WS admin_withdrawal error: %s", exc)
        financial_ws_manager.disconnect_admin_withdrawal(ws)
