"""Covers the Aviator websocket round loop after its concurrency rework.

The loop and the client handlers used to do blocking psycopg2 work directly
on the event loop, which froze every connected player while a wallet row
lock was held. That work now runs in a worker thread, which introduces an
await where there was none, so the in-memory engine -- which has no internal
locking -- is serialised behind ``_engine_lock``.

Nothing exercised this path before, so these tests pin the behaviour that
matters: money moves exactly once, and concurrent client actions cannot
interleave with the round loop.
"""
from __future__ import annotations

import asyncio
import uuid

import pytest

from app.models.transaction import WalletTransaction
from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.websocket import aviator_ws
from app.websocket.aviator_ws import (
    _cashout_locked,
    _engine_call,
    _engine_lock,
    _place_bet_locked,
)

START = 100_000  # ₹1000 in paisa


@pytest.fixture()
def live_user():
    """A user with a wallet in the database the engine singleton talks to."""
    from app.database import SessionLocal

    uid = uuid.uuid4()
    uname = f"avws_{uid.hex[:10]}"
    with SessionLocal() as s:
        s.add(
            User(
                id=uid,
                name="Aviator WS User",
                username=uname,
                email=f"{uname}@test.local",
                password_hash="x",
                role=UserRole.USER,
                status=UserStatus.ACTIVE,
            )
        )
        s.add(Wallet(id=uuid.uuid4(), user_id=uid, balance=START))
        s.commit()
    return uid


def _balance(uid) -> int:
    from app.database import SessionLocal

    with SessionLocal() as s:
        return s.query(Wallet).filter(Wallet.user_id == uid).one().balance


@pytest.fixture(autouse=True)
def fresh_engine():
    """Reset the engine singleton so rounds do not leak between tests."""
    from app.services.aviator.engine import AviatorEngine

    original = aviator_ws.aviator_engine
    aviator_ws.aviator_engine = AviatorEngine()
    yield
    aviator_ws.aviator_engine = original


def test_engine_call_runs_off_the_loop_and_returns_the_round():
    async def scenario():
        rnd = await _engine_call(aviator_ws.aviator_engine.create_round)
        assert rnd is not None
        assert rnd.round_id is not None
        # The lock must be released again, or the next action would hang.
        assert not _engine_lock.locked()
        return rnd

    rnd = asyncio.run(scenario())
    assert rnd.server_seed_hash


def test_place_bet_debits_once_and_builds_its_payload(live_user):
    async def scenario():
        await _engine_call(aviator_ws.aviator_engine.create_round)
        return await _place_bet_locked(live_user, 1, 1000, None, "act-1")

    accepted, broadcast = asyncio.run(scenario())

    assert accepted["type"] == "bet_accepted"
    assert accepted["slot"] == 1
    assert accepted["amount"] == 1000
    assert accepted["action_id"] == "act-1"
    # Built inside the worker thread, so the round id must still be populated.
    assert broadcast["type"] == "new_bet"
    assert broadcast["round_id"] is not None
    assert _balance(live_user) == START - 1000


def test_concurrent_bets_on_two_slots_both_settle_correctly(live_user):
    """Two client actions at once must serialise, not interleave."""

    async def scenario():
        await _engine_call(aviator_ws.aviator_engine.create_round)
        return await asyncio.gather(
            _place_bet_locked(live_user, 1, 1000, None, "s1"),
            _place_bet_locked(live_user, 2, 2500, None, "s2"),
        )

    results = asyncio.run(scenario())

    assert len(results) == 2
    assert {r[0]["slot"] for r in results} == {1, 2}
    # Neither debit may be lost: this is the exact failure the rework targets.
    assert _balance(live_user) == START - 1000 - 2500
    assert not _engine_lock.locked()


def test_cashout_credits_the_payout_and_keeps_the_ledger_consistent(live_user):
    from app.database import SessionLocal

    async def scenario():
        await _engine_call(aviator_ws.aviator_engine.create_round)
        await _place_bet_locked(live_user, 1, 1000, None, "bet")
        await _engine_call(aviator_ws.aviator_engine.start_flight)
        return await _cashout_locked(live_user, 1, "cash")

    confirmed, broadcast = asyncio.run(scenario())

    assert confirmed["type"] == "cashout_confirmed"
    assert confirmed["multiplier"] >= 1.0
    assert broadcast["auto"] is False

    payout = confirmed["payout"]
    assert _balance(live_user) == START - 1000 + payout

    # Same invariant the live ledger is audited against.
    with SessionLocal() as s:
        rows = (
            s.query(WalletTransaction)
            .filter(WalletTransaction.user_id == live_user)
            .order_by(WalletTransaction.created_at, WalletTransaction.id)
            .all()
        )
    for prev, cur in zip(rows, rows[1:]):
        assert prev.balance_after == cur.balance_before, (
            "ledger chain broken: a concurrent update was lost"
        )
    assert rows[-1].balance_after == _balance(live_user)


def test_bet_failure_releases_the_engine_lock(live_user):
    """A rejected action must not leave the loop wedged."""

    async def scenario():
        await _engine_call(aviator_ws.aviator_engine.create_round)
        with pytest.raises(Exception):
            # Slot 3 does not exist; the engine raises.
            await _place_bet_locked(live_user, 3, 1000, None, "bad")
        assert not _engine_lock.locked()
        # The engine must still be usable afterwards.
        accepted, _ = await _place_bet_locked(live_user, 1, 1000, None, "good")
        return accepted

    accepted = asyncio.run(scenario())
    assert accepted["slot"] == 1
    assert _balance(live_user) == START - 1000
