"""Concurrency regression tests for wallet money movement.

These exercise the shape that corrupted real balances in production: a request
reads the balance to check funds, and a game round settles a credit for the
same user before the request's locked write lands. Without
``populate_existing`` on the ``FOR UPDATE`` load the credit is silently
discarded, and the wallet ends up short.
"""
from __future__ import annotations

import threading
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.transaction import WalletTransaction, WalletTransactionType
from app.models.user import User
from app.models.wallet import Wallet
from app.services import wallet_service

from .conftest import TEST_DB_URL

# A dedicated engine: these tests need genuinely concurrent connections, so
# they cannot share the suite's single session.
_engine = create_engine(TEST_DB_URL, pool_size=20, max_overflow=10)
_Session = sessionmaker(autocommit=False, autoflush=False, bind=_engine)

START = 100_000  # paisa


def _make_user() -> uuid.UUID:
    uid = uuid.uuid4()
    with _Session() as s:
        s.add(
            User(
                id=uid,
                name="Race Test",
                username=f"race_{uid.hex[:12]}",
                email="race@test.local",
                password_hash="x",
            )
        )
        s.add(Wallet(user_id=uid, balance=START))
        s.commit()
    return uid


def _balance(uid: uuid.UUID) -> int:
    with _Session() as s:
        return s.query(Wallet).filter(Wallet.user_id == uid).one().balance


def test_credit_is_not_lost_by_a_concurrent_debit():
    """A win credited mid-request must survive that request's debit."""
    uid = _make_user()
    read_done = threading.Event()
    credit_done = threading.Event()
    errors: list[Exception] = []

    def better():
        db = _Session()
        try:
            # Unlocked funds check first — this is what caches the stale row.
            # The reference must be held: SQLAlchemy's identity map is weak,
            # so dropping it would let the cached row be collected and the
            # staleness would vanish along with the bug being tested.
            cached = wallet_service.get_balance(db, uid)
            assert cached.balance == START
            read_done.set()
            credit_done.wait(timeout=10)
            wallet_service.debit_wallet(
                db, uid, 5_000,
                WalletTransactionType.GAME_ENTRY,
                "race_bet", f"bet_{uuid.uuid4()}",
            )
            db.commit()
        except Exception as exc:  # pragma: no cover - surfaced via errors
            db.rollback()
            errors.append(exc)
        finally:
            db.close()

    def settler():
        db = _Session()
        try:
            read_done.wait(timeout=10)
            wallet_service.credit_wallet(
                db, uid, 70_000,
                WalletTransactionType.GAME_WIN,
                "race_win", f"win_{uuid.uuid4()}",
            )
            db.commit()
            credit_done.set()
        except Exception as exc:  # pragma: no cover
            db.rollback()
            errors.append(exc)
            credit_done.set()
        finally:
            db.close()

    threads = [threading.Thread(target=better), threading.Thread(target=settler)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    assert not errors, f"unexpected errors: {errors}"
    assert _balance(uid) == START + 70_000 - 5_000


def test_parallel_credits_and_debits_all_land():
    """Many interleaved writes must sum exactly — no lost updates."""
    uid = _make_user()
    rounds = 12
    errors: list[Exception] = []

    def credit():
        for _ in range(rounds):
            db = _Session()
            try:
                wallet_service.credit_wallet(
                    db, uid, 900,
                    WalletTransactionType.GAME_WIN,
                    "race_win_many", f"w_{uuid.uuid4()}",
                )
                db.commit()
            except Exception as exc:  # pragma: no cover
                db.rollback()
                errors.append(exc)
            finally:
                db.close()

    def debit():
        for _ in range(rounds):
            db = _Session()
            try:
                cached = wallet_service.get_balance(db, uid)
                _ = cached.balance  # hold the cached row, as real callers do
                wallet_service.debit_wallet(
                    db, uid, 500,
                    WalletTransactionType.GAME_ENTRY,
                    "race_bet_many", f"b_{uuid.uuid4()}",
                )
                db.commit()
            except Exception as exc:  # pragma: no cover
                db.rollback()
                errors.append(exc)
            finally:
                db.close()

    threads = [threading.Thread(target=credit) for _ in range(3)]
    threads += [threading.Thread(target=debit) for _ in range(3)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)

    assert not errors, f"unexpected errors: {errors}"
    expected = START + (3 * rounds * 900) - (3 * rounds * 500)
    assert _balance(uid) == expected


def test_balance_never_goes_negative_under_concurrent_debits():
    """Parallel debits must not oversell the balance."""
    uid = _make_user()
    stake = 30_000  # only 3 of these fit in START
    results: list[bool] = []
    lock = threading.Lock()

    def spend():
        db = _Session()
        try:
            cached = wallet_service.get_balance(db, uid)
            _ = cached.balance  # hold the cached row, as real callers do
            wallet_service.debit_wallet(
                db, uid, stake,
                WalletTransactionType.GAME_ENTRY,
                "race_oversell", f"o_{uuid.uuid4()}",
            )
            db.commit()
            with lock:
                results.append(True)
        except Exception:
            db.rollback()
            with lock:
                results.append(False)
        finally:
            db.close()

    threads = [threading.Thread(target=spend) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    final = _balance(uid)
    assert final >= 0, f"wallet went negative: {final}"
    assert final == START - (sum(results) * stake)
    assert sum(results) == START // stake


def test_duplicate_reference_is_rejected_under_concurrency():
    """The same reference must only ever move money once."""
    uid = _make_user()
    ref = f"idem_{uuid.uuid4()}"
    accepted: list[bool] = []
    lock = threading.Lock()

    def credit_same_ref():
        db = _Session()
        try:
            wallet_service.credit_wallet(
                db, uid, 10_000,
                WalletTransactionType.GAME_WIN,
                "race_idem", ref,
            )
            db.commit()
            with lock:
                accepted.append(True)
        except Exception:
            db.rollback()
            with lock:
                accepted.append(False)
        finally:
            db.close()

    threads = [threading.Thread(target=credit_same_ref) for _ in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    assert sum(accepted) == 1, "a duplicate reference was credited more than once"
    assert _balance(uid) == START + 10_000


def test_ledger_chain_stays_unbroken_under_concurrency():
    """The invariant the production ledger is audited against.

    For each wallet, every transaction's ``balance_before`` must equal the
    previous transaction's ``balance_after``, and the wallet's cached
    ``balance`` must equal the final ``balance_after``. A lost update breaks
    this chain, which is exactly how such corruption is detected in the live
    database -- so it is worth asserting directly.
    """
    uid = _make_user()
    rounds = 10
    errors: list[Exception] = []

    def churn(credit: bool):
        for _ in range(rounds):
            db = _Session()
            try:
                cached = wallet_service.get_balance(db, uid)
                _ = cached.balance  # hold the cached row, as real callers do
                if credit:
                    wallet_service.credit_wallet(
                        db, uid, 700,
                        WalletTransactionType.GAME_WIN,
                        "chain_win", f"cw_{uuid.uuid4()}",
                    )
                else:
                    wallet_service.debit_wallet(
                        db, uid, 300,
                        WalletTransactionType.GAME_ENTRY,
                        "chain_bet", f"cb_{uuid.uuid4()}",
                    )
                db.commit()
            except Exception as exc:  # pragma: no cover
                db.rollback()
                errors.append(exc)
            finally:
                db.close()

    threads = [threading.Thread(target=churn, args=(i % 2 == 0,)) for i in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)

    assert not errors, f"unexpected errors: {errors}"

    with _Session() as s:
        rows = (
            s.query(WalletTransaction)
            .filter(WalletTransaction.user_id == uid)
            .order_by(WalletTransaction.created_at, WalletTransaction.id)
            .all()
        )
        wallet_balance = s.query(Wallet).filter(Wallet.user_id == uid).one().balance

    assert rows, "no ledger rows were written"

    breaks = [
        (prev.balance_after, cur.balance_before)
        for prev, cur in zip(rows, rows[1:])
        if prev.balance_after != cur.balance_before
    ]
    assert not breaks, (
        f"{len(breaks)} chain break(s): a concurrent update was lost. "
        f"First: previous balance_after={breaks[0][0]} but next "
        f"balance_before={breaks[0][1]}"
    )

    # Each row's delta must match its own amount and direction.
    for row in rows:
        delta = row.balance_after - row.balance_before
        expected = row.amount if row.type == WalletTransactionType.GAME_WIN else -row.amount
        assert delta == expected, f"row {row.id} delta {delta} != {expected}"

    assert wallet_balance == rows[-1].balance_after, (
        "cached wallet balance drifted from the end of the ledger"
    )
