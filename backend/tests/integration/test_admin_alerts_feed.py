"""The admin alerts feed must not silently drop pending withdrawals.

Every source in this feed was previously capped at 10 rows regardless of the
requested limit, and the merged list was then trimmed again. With 11 or more
pending withdrawals the oldest simply never appeared -- so an admin watching
this page could miss payouts owed to players, with nothing on screen
indicating anything was hidden.
"""
from __future__ import annotations

from uuid import uuid4

import pytest

from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.models.withdrawal import Withdrawal, WithdrawalStatus
from app.security.jwt import create_access_token


def _make_user(db, role=UserRole.USER) -> User:
    suffix = uuid4().hex[:8]
    user = User(
        id=uuid4(),
        name=f"Feed {suffix}",
        username=f"feed_{suffix}",
        email=f"feed_{suffix}@example.com",
        password_hash="fakehash",
        role=role,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    db.add(Wallet(id=uuid4(), user_id=user.id, balance=1_000_000))
    db.commit()
    db.refresh(user)
    return user


def _headers(user: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


@pytest.fixture()
def admin(db):
    return _make_user(db, role=UserRole.SUPER_ADMIN)


@pytest.fixture(autouse=True)
def clean_withdrawals(db):
    db.query(Withdrawal).delete()
    db.commit()
    yield
    db.query(Withdrawal).delete()
    db.commit()


def _pending_withdrawals(db, count: int) -> list[Withdrawal]:
    user = _make_user(db)
    wallet = db.query(Wallet).filter(Wallet.user_id == user.id).one()
    rows = []
    for i in range(count):
        wd = Withdrawal(
            id=uuid4(),
            user_id=user.id,
            wallet_id=wallet.id,
            amount=10_000 + i,
            fee_amount=0,
            net_amount=10_000 + i,
            status=WithdrawalStatus.PENDING,
            method="upi",
            destination="player@upi",
        )
        db.add(wd)
        rows.append(wd)
    db.commit()
    return rows


def test_more_than_ten_pending_withdrawals_all_appear(client, db, admin):
    """The regression: the 11th+ pending payout used to vanish."""
    _pending_withdrawals(db, 14)

    data = client.get("/api/v1/admin/notifications?limit=50", headers=_headers(admin)).json()["data"]
    withdrawal_items = [i for i in data["items"] if i["type"] == "WITHDRAWAL"]

    assert len(withdrawal_items) == 14, (
        f"only {len(withdrawal_items)} of 14 pending withdrawals surfaced"
    )


def test_the_true_pending_count_is_always_reported(client, db, admin):
    """Even when the list is trimmed, the real number must be visible."""
    _pending_withdrawals(db, 25)

    data = client.get("/api/v1/admin/notifications?limit=5", headers=_headers(admin)).json()["data"]
    assert data["pending_withdrawal_count"] == 25
    assert data["truncated"] is True


def test_action_items_are_not_pushed_out_by_newer_low_priority_noise(client, db, admin):
    """Pending payouts outrank audit chatter when the feed is trimmed.

    Audit rows are written constantly (every admin action logs one) and are
    newer than older withdrawals, so a purely chronological trim would bury
    the thing an admin actually has to act on.
    """
    _pending_withdrawals(db, 8)
    # Generate newer, lower-priority rows by performing admin actions.
    for _ in range(12):
        client.get("/api/v1/admin/support/config", headers=_headers(admin))

    data = client.get("/api/v1/admin/notifications?limit=10", headers=_headers(admin)).json()["data"]
    withdrawal_items = [i for i in data["items"] if i["type"] == "WITHDRAWAL"]

    assert len(withdrawal_items) == 8, "pending payouts were trimmed away by newer noise"


def test_the_limit_is_still_respected(client, db, admin):
    _pending_withdrawals(db, 30)
    data = client.get("/api/v1/admin/notifications?limit=10", headers=_headers(admin)).json()["data"]
    assert len(data["items"]) <= 10


def test_no_pending_withdrawals_reports_zero(client, admin):
    data = client.get("/api/v1/admin/notifications", headers=_headers(admin)).json()["data"]
    assert data["pending_withdrawal_count"] == 0


def test_items_stay_in_reverse_chronological_order(client, db, admin):
    _pending_withdrawals(db, 5)
    items = client.get("/api/v1/admin/notifications?limit=30", headers=_headers(admin)).json()["data"]["items"]
    timestamps = [i["created_at"] for i in items]
    assert timestamps == sorted(timestamps, reverse=True)
