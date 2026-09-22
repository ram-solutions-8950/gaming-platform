"""Deposit play-through (wager) requirement tests.

Business rule: a credited deposit of Rs X must be wagered in full before the
user may withdraw. Every GAME_ENTRY debit counts towards it, win or lose.
"""

import pytest
from uuid import uuid4
from sqlalchemy.orm import Session

from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.models.deposit import Deposit, DepositStatus
from app.models.wager import WagerRequirement
from app.models.transaction import WalletTransactionType
from app.security.jwt import create_access_token
from app.services import wallet_service, withdrawal_service
from app.services.wager_service import (
    create_wager_requirement,
    record_wager,
    reverse_wager,
    check_wager_fulfilled,
    get_remaining_wager,
    get_wager_status,
)


@pytest.fixture
def player(db: Session):
    suffix = uuid4().hex[:8]
    user = User(
        id=uuid4(),
        name="Wager Player",
        username=f"wager_{suffix}",
        email=f"wager_{suffix}@example.com",
        password_hash="fakehash",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    wallet = Wallet(id=uuid4(), user_id=user.id, balance=1_000_000)  # Rs 10,000
    db.add(wallet)
    db.commit()
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}, user, wallet


def _deposit(db, user, wallet, paise):
    """Persist a credited deposit so requirements can reference a real row."""
    dep = Deposit(
        id=uuid4(),
        user_id=user.id,
        wallet_id=wallet.id,
        amount=paise,
        status=DepositStatus.SUCCESS,
        provider="test",
        external_reference=f"dep_{uuid4().hex}",
    )
    db.add(dep)
    db.commit()
    return dep


def _bet(db, user_id, paise, game="triple_777"):
    """Simulate a game stake through the normal wallet path."""
    wallet_service.debit_wallet(
        db=db,
        user_id=user_id,
        amount=paise,
        tx_type=WalletTransactionType.GAME_ENTRY,
        reference_type=f"{game}_entry",
        reference_id=f"{game}_{uuid4().hex}",
        metadata={"game": game},
    )
    db.commit()


# ─── Requirement creation ────────────────────────────────────────────────

def test_deposit_creates_requirement_for_full_amount(db, player):
    _, user, wallet = player
    create_wager_requirement(db, user.id, 500_000)  # Rs 5,000
    db.commit()

    assert get_remaining_wager(db, user.id) == 500_000
    assert check_wager_fulfilled(db, user.id) is False


def test_requirement_is_idempotent_per_deposit(db, player):
    _, user, wallet = player
    dep = _deposit(db, user, wallet, 100_000)
    # A replayed webhook must not double the requirement.
    create_wager_requirement(db, user.id, 100_000, deposit_id=dep.id)
    create_wager_requirement(db, user.id, 100_000, deposit_id=dep.id)
    db.commit()

    rows = db.query(WagerRequirement).filter(WagerRequirement.user_id == user.id).all()
    assert len(rows) == 1
    assert get_remaining_wager(db, user.id) == 100_000


def test_zero_or_negative_deposit_creates_nothing(db, player):
    _, user, wallet = player
    assert create_wager_requirement(db, user.id, 0) is None
    assert create_wager_requirement(db, user.id, -500) is None
    db.commit()
    assert get_remaining_wager(db, user.id) == 0


# ─── Play-through accumulation ───────────────────────────────────────────

def test_game_entry_debit_records_wager_automatically(db, player):
    _, user, wallet = player
    create_wager_requirement(db, user.id, 100_000)  # Rs 1,000
    db.commit()

    _bet(db, user.id, 40_000)
    assert get_remaining_wager(db, user.id) == 60_000

    _bet(db, user.id, 60_000)
    assert get_remaining_wager(db, user.id) == 0
    assert check_wager_fulfilled(db, user.id) is True


def test_non_game_debit_does_not_count(db, player):
    _, user, wallet = player
    create_wager_requirement(db, user.id, 100_000)
    db.commit()

    wallet_service.debit_wallet(
        db=db,
        user_id=user.id,
        amount=50_000,
        tx_type=WalletTransactionType.WITHDRAWAL,
        reference_type="withdrawal",
        reference_id=f"wd_{uuid4().hex}",
    )
    db.commit()

    assert get_remaining_wager(db, user.id) == 100_000


def test_surplus_cascades_into_the_next_requirement(db, player):
    _, user, wallet = player
    create_wager_requirement(db, user.id, 50_000, deposit_id=_deposit(db, user, wallet, 50_000).id)
    db.commit()
    create_wager_requirement(db, user.id, 50_000, deposit_id=_deposit(db, user, wallet, 50_000).id)
    db.commit()

    # One large stake clears the first requirement and spills into the second.
    _bet(db, user.id, 80_000)

    assert get_remaining_wager(db, user.id) == 20_000
    rows = db.query(WagerRequirement).filter(
        WagerRequirement.user_id == user.id
    ).order_by(WagerRequirement.created_at.asc()).all()
    assert rows[0].is_fulfilled is True
    assert rows[1].is_fulfilled is False
    assert rows[1].completed_amount == 30_000


def test_overshooting_never_leaves_negative_remaining(db, player):
    _, user, wallet = player
    create_wager_requirement(db, user.id, 10_000)
    db.commit()

    _bet(db, user.id, 90_000)
    assert get_remaining_wager(db, user.id) == 0

    status = get_wager_status(db, user.id)
    assert status["remaining_inr"] == 0
    assert status["is_fulfilled"] is True
    # Play-through is capped at what was required, not the full stake.
    assert status["total_completed_inr"] == 100.0


def test_wager_with_no_pending_requirement_is_a_noop(db, player):
    _, user, wallet = player
    assert record_wager(db, user.id, 50_000, "aviator") == 0
    assert check_wager_fulfilled(db, user.id) is True


# ─── Refund reversal ─────────────────────────────────────────────────────

def test_refund_reverses_recorded_wager(db, player):
    _, user, wallet = player
    create_wager_requirement(db, user.id, 100_000)
    db.commit()

    _bet(db, user.id, 40_000)
    assert get_remaining_wager(db, user.id) == 60_000

    # A push/tie returns the stake, so it is not real play-through.
    reverse_wager(db, user.id, 40_000, "dragon-tiger")
    db.commit()
    assert get_remaining_wager(db, user.id) == 100_000


def test_refund_reopens_a_fulfilled_requirement(db, player):
    _, user, wallet = player
    create_wager_requirement(db, user.id, 50_000)
    db.commit()

    _bet(db, user.id, 50_000)
    assert check_wager_fulfilled(db, user.id) is True

    reverse_wager(db, user.id, 20_000, "dragon-tiger")
    db.commit()
    assert check_wager_fulfilled(db, user.id) is False
    assert get_remaining_wager(db, user.id) == 20_000


# ─── Withdrawal gate ─────────────────────────────────────────────────────

def test_withdrawal_blocked_until_deposit_is_played_through(db, player):
    _, user, wallet = player
    create_wager_requirement(db, user.id, 500_000)  # Rs 5,000 deposit
    db.commit()

    with pytest.raises(ValueError) as exc:
        withdrawal_service.create_withdrawal(db, user.id, 100_000, "upi", "player@upi")
    assert "Wager requirement not fulfilled" in str(exc.value)
    assert "5000.00" in str(exc.value)


def test_partial_play_through_still_blocks_and_reports_the_balance(db, player):
    _, user, wallet = player
    create_wager_requirement(db, user.id, 500_000)
    db.commit()

    _bet(db, user.id, 200_000)

    with pytest.raises(ValueError) as exc:
        withdrawal_service.create_withdrawal(db, user.id, 50_000, "upi", "player@upi")
    assert "3000.00" in str(exc.value)  # Rs 5,000 - Rs 2,000 remaining


def test_withdrawal_allowed_once_play_through_completes(db, player):
    _, user, wallet = player
    create_wager_requirement(db, user.id, 100_000)
    db.commit()

    _bet(db, user.id, 100_000)

    w = withdrawal_service.create_withdrawal(db, user.id, 50_000, "upi", "player@upi")
    db.commit()
    assert w.amount == 50_000


def test_user_without_deposits_can_withdraw(db, player):
    _, user, wallet = player
    w = withdrawal_service.create_withdrawal(db, user.id, 50_000, "upi", "player@upi")
    db.commit()
    assert w.amount == 50_000


# ─── Status endpoint ─────────────────────────────────────────────────────

def test_wager_status_endpoint_reports_progress(client, db, player):
    headers, user, wallet = player
    create_wager_requirement(db, user.id, 500_000)
    db.commit()
    _bet(db, user.id, 125_000)

    res = client.get("/api/v1/wallet/wager-status", headers=headers)
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["total_required_inr"] == 5000.0
    assert data["total_completed_inr"] == 1250.0
    assert data["remaining_inr"] == 3750.0
    assert data["progress_percent"] == 25.0
    assert data["is_fulfilled"] is False


# ─── Refund paths must not let players farm the requirement ──────────────

def test_clearing_a_roulette_bet_undoes_its_play_through(client, db, player):
    """bet -> clear -> repeat would otherwise clear the requirement for free."""
    from app.services.roulette import engine as roulette_engine

    headers, user, wallet = player
    create_wager_requirement(db, user.id, 100_000)
    db.commit()

    # Stake counted at debit time...
    _bet(db, user.id, 50_000, game="roulette")
    assert get_remaining_wager(db, user.id) == 50_000

    # ...and given back when the bet is cleared before the window closes.
    reverse_wager(db, user.id, 50_000, "roulette")
    db.commit()
    assert get_remaining_wager(db, user.id) == 100_000


def test_repeated_bet_and_refund_cycles_make_no_progress(db, player):
    _, user, wallet = player
    create_wager_requirement(db, user.id, 500_000)
    db.commit()

    for _ in range(10):
        _bet(db, user.id, 50_000, game="roulette")
        reverse_wager(db, user.id, 50_000, "roulette")
        db.commit()

    assert get_remaining_wager(db, user.id) == 500_000
    assert check_wager_fulfilled(db, user.id) is False


def test_reversing_more_than_was_recorded_is_clamped(db, player):
    _, user, wallet = player
    create_wager_requirement(db, user.id, 100_000)
    db.commit()

    _bet(db, user.id, 30_000)
    # A buggy caller asking to reverse more than exists must not go negative.
    reverse_wager(db, user.id, 999_999, "roulette")
    db.commit()

    rows = db.query(WagerRequirement).filter(WagerRequirement.user_id == user.id).all()
    assert all(r.completed_amount >= 0 for r in rows)
    assert get_remaining_wager(db, user.id) == 100_000


# ─── Both deposit credit paths must create the requirement ───────────────

class _StubProvider:
    """Minimal payment provider that always verifies, for webhook tests."""

    def __init__(self, event):
        self._event = event

    def verify_webhook(self, raw_body, headers):
        return True

    def process_webhook(self, raw_body, headers):
        return self._event


def test_webhook_credited_deposit_creates_requirement(db, player, monkeypatch):
    """The gateway webhook is the production deposit path, not just checkout."""
    from app.payment import webhook as webhook_module

    _, user, wallet = player
    order_id = f"order_{uuid4().hex[:12]}"
    dep = Deposit(
        id=uuid4(),
        user_id=user.id,
        wallet_id=wallet.id,
        amount=500_000,  # Rs 5,000
        status=DepositStatus.PENDING,
        provider="razorpay",
        provider_order_id=order_id,
        external_reference=f"dep_{uuid4().hex}",
    )
    db.add(dep)
    db.commit()

    event = {
        "event_id": f"evt_{uuid4().hex[:12]}",
        "provider": "razorpay",
        "status": "SUCCESS",
        "event_type": "payment.captured",
        "provider_order_id": order_id,
        "provider_payment_id": f"pay_{uuid4().hex[:12]}",
        "amount": 500_000,
    }
    monkeypatch.setattr(webhook_module, "get_provider", lambda name: _StubProvider(event))

    result = webhook_module.handle_webhook(b"{}", {}, "razorpay", db=db)
    assert result["status"] == "success", result

    db.expire_all()
    # Rs 5,000 deposited -> Rs 5,000 of play-through required.
    assert get_remaining_wager(db, user.id) == 500_000
    assert check_wager_fulfilled(db, user.id) is False

    with pytest.raises(ValueError) as exc:
        withdrawal_service.create_withdrawal(db, user.id, 100_000, "upi", "player@upi")
    assert "Wager requirement not fulfilled" in str(exc.value)


def test_checkout_and_webhook_do_not_double_the_requirement(db, player, monkeypatch):
    """Both paths can fire for one deposit; the requirement must stay single."""
    from app.payment import webhook as webhook_module
    from app.services.wager_service import create_wager_requirement as make_req

    _, user, wallet = player
    order_id = f"order_{uuid4().hex[:12]}"
    dep = Deposit(
        id=uuid4(), user_id=user.id, wallet_id=wallet.id, amount=200_000,
        status=DepositStatus.PENDING, provider="razorpay",
        provider_order_id=order_id, external_reference=f"dep_{uuid4().hex}",
    )
    db.add(dep)
    db.commit()

    # Checkout verification got there first.
    make_req(db, user.id, 200_000, deposit_id=dep.id)
    db.commit()

    event = {
        "event_id": f"evt_{uuid4().hex[:12]}", "provider": "razorpay",
        "status": "SUCCESS", "event_type": "payment.captured",
        "provider_order_id": order_id, "provider_payment_id": f"pay_{uuid4().hex[:12]}",
        "amount": 200_000,
    }
    monkeypatch.setattr(webhook_module, "get_provider", lambda name: _StubProvider(event))
    webhook_module.handle_webhook(b"{}", {}, "razorpay", db=db)

    db.expire_all()
    rows = db.query(WagerRequirement).filter(WagerRequirement.user_id == user.id).all()
    assert len(rows) == 1
    assert get_remaining_wager(db, user.id) == 200_000
