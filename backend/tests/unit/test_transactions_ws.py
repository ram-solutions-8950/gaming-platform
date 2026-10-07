import pytest
import uuid
from unittest.mock import AsyncMock
from app.websocket.transactions_ws import FinancialWsManager


@pytest.mark.asyncio
async def test_financial_ws_manager_user_deposit():
    mgr = FinancialWsManager()
    user_id = str(uuid.uuid4())
    ws1 = AsyncMock()

    await mgr.connect_user_deposit(user_id, ws1)
    assert user_id in mgr.user_deposits
    assert ws1 in mgr.user_deposits[user_id]

    payload = {"type": "deposit_updated", "deposit": {"id": "dep_1", "status": "SUCCESS"}}
    await mgr.broadcast_user_deposit(user_id, payload)
    ws1.send_text.assert_called_once()

    mgr.disconnect_user_deposit(user_id, ws1)
    assert user_id not in mgr.user_deposits


@pytest.mark.asyncio
async def test_financial_ws_manager_user_withdrawal():
    mgr = FinancialWsManager()
    user_id = str(uuid.uuid4())
    ws1 = AsyncMock()

    await mgr.connect_user_withdrawal(user_id, ws1)
    assert user_id in mgr.user_withdrawals
    assert ws1 in mgr.user_withdrawals[user_id]

    payload = {"type": "withdrawal_updated", "withdrawal": {"id": "w_1", "status": "APPROVED"}}
    await mgr.broadcast_user_withdrawal(user_id, payload)
    ws1.send_text.assert_called_once()

    mgr.disconnect_user_withdrawal(user_id, ws1)
    assert user_id not in mgr.user_withdrawals


@pytest.mark.asyncio
async def test_financial_ws_manager_admin_deposit():
    mgr = FinancialWsManager()
    ws1 = AsyncMock()

    await mgr.connect_admin_deposit(ws1)
    assert ws1 in mgr.admin_deposits

    payload = {"type": "deposit_created", "deposit": {"id": "dep_2", "amount": 50000}}
    await mgr.broadcast_admin_deposit(payload)
    ws1.send_text.assert_called_once()

    mgr.disconnect_admin_deposit(ws1)
    assert ws1 not in mgr.admin_deposits


@pytest.mark.asyncio
async def test_financial_ws_manager_admin_withdrawal():
    mgr = FinancialWsManager()
    ws1 = AsyncMock()

    await mgr.connect_admin_withdrawal(ws1)
    assert ws1 in mgr.admin_withdrawals

    payload = {"type": "withdrawal_created", "withdrawal": {"id": "w_2", "amount": 100000}}
    await mgr.broadcast_admin_withdrawal(payload)
    ws1.send_text.assert_called_once()

    mgr.disconnect_admin_withdrawal(ws1)
    assert ws1 not in mgr.admin_withdrawals
