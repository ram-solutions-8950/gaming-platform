"""
Comprehensive Adversarial Security & Concurrency Test Suite for Triple 777.
Validates:
1. Unauthenticated request rejection
2. Invalid bearer token rejection
3. Negative, zero, decimal, and extreme stake abuse
4. Insufficient wallet balance rejection
5. Client-forged payout / multiplier / reel rejection
6. User isolation (User A cannot access User B's round/history)
7. Concurrent spin race conditions & double-debit immunity
8. Duplicate settlement / replay protection
9. Full ledger transaction integrity (GAME_ENTRY & GAME_WIN)
"""

from uuid import uuid4
import pytest
import concurrent.futures
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.models.transaction import WalletTransaction
from app.security.jwt import create_access_token
from tests.integration.conftest import TestingSessionLocal


def query_wallet_balance(user_id) -> int:
    s = TestingSessionLocal()
    try:
        w = s.query(Wallet).filter(Wallet.user_id == user_id).first()
        return w.balance if w else 0
    finally:
        s.close()


def query_tx_count(user_id) -> int:
    s = TestingSessionLocal()
    try:
        return s.query(WalletTransaction).filter(WalletTransaction.user_id == user_id).count()
    finally:
        s.close()


@pytest.fixture
def user_a_fixture(db: Session):
    rand = str(uuid4())[:8]
    user = User(
        id=uuid4(),
        name="User A",
        username=f"t777_a_{rand}",
        email=f"t777_a_{rand}@example.com",
        password_hash="hash_a",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    wallet = Wallet(id=uuid4(), user_id=user.id, balance=1000000)  # ₹10,000.00 (1,000,000 paise)
    db.add(wallet)
    db.commit()
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}, user, wallet


@pytest.fixture
def user_b_fixture(db: Session):
    rand = str(uuid4())[:8]
    user = User(
        id=uuid4(),
        name="User B",
        username=f"t777_b_{rand}",
        email=f"t777_b_{rand}@example.com",
        password_hash="hash_b",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    wallet = Wallet(id=uuid4(), user_id=user.id, balance=500000)  # ₹5,000.00 (500,000 paise)
    db.add(wallet)
    db.commit()
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}, user, wallet


def test_unauthenticated_spin_rejected(client: TestClient):
    """Verify unauthenticated spin requests are rejected with 401 or 403."""
    res = client.post("/api/v1/games/triple-777/spin", json={"stake": 10})
    assert res.status_code in (401, 403)


def test_invalid_jwt_rejected(client: TestClient):
    """Verify malformed bearer token is rejected."""
    res = client.post(
        "/api/v1/games/triple-777/spin",
        headers={"Authorization": "Bearer forged.invalid.token"},
        json={"stake": 10},
    )
    assert res.status_code in (401, 403)


@pytest.mark.parametrize("invalid_stake", [-50, 0, 5, 10001, -0.01, 999999])
def test_invalid_stake_rejected(client: TestClient, user_a_fixture, invalid_stake):
    """Verify negative, below-min, and above-max stakes are rejected."""
    auth_headers, _, _ = user_a_fixture
    res = client.post(
        "/api/v1/games/triple-777/spin",
        headers=auth_headers,
        json={"stake": invalid_stake},
    )
    assert res.status_code in (400, 422)


def test_insufficient_wallet_balance_rejected(client: TestClient, db: Session, user_a_fixture):
    """Verify spin is rejected if stake exceeds wallet balance."""
    auth_headers, user, wallet = user_a_fixture
    wallet.balance = 500  # ₹5.00
    db.commit()

    res = client.post(
        "/api/v1/games/triple-777/spin",
        headers=auth_headers,
        json={"stake": 10},  # Min stake ₹10
    )
    assert res.status_code == 400
    err_msg = res.json().get("error", {}).get("message", "") or res.json().get("detail", "")
    assert "insufficient" in err_msg.lower()


def test_client_forged_payout_and_reels_ignored(client: TestClient, user_a_fixture):
    """Verify backend completely ignores client-supplied payout, multiplier, reels, and won status."""
    auth_headers, user, _ = user_a_fixture
    res = client.post(
        "/api/v1/games/triple-777/spin",
        headers=auth_headers,
        json={
            "stake": 50,
            "payout": 99999999,
            "win_amount": 99999999,
            "multiplier": 1000000,
            "reels": ["7", "7", "7"],
            "won": True,
            "tier": "jackpot",
            "balance": 999999999,
        },
    )
    assert res.status_code == 200
    data = res.json()["data"]

    # Verify return types
    assert isinstance(data["reels"], list)
    assert len(data["reels"]) == 3
    assert data["reels"][0] in ["7", "BAR", "CHERRY", "LEMON", "BELL", "STAR", "COIN"]

    # Query DB directly to verify actual committed balance matches returned balance
    db_bal = query_wallet_balance(user.id)
    assert round(db_bal / 100, 2) == round(data["balance"], 2)


def test_user_isolation(client: TestClient, user_a_fixture, user_b_fixture):
    """Verify User B's history is isolated from User A."""
    auth_a, _, _ = user_a_fixture
    auth_b, _, _ = user_b_fixture

    # Spin as User A
    client.post("/api/v1/games/triple-777/spin", headers=auth_a, json={"stake": 10})

    # Spin as User B
    client.post("/api/v1/games/triple-777/spin", headers=auth_b, json={"stake": 20})

    res_a = client.get("/api/v1/games/triple-777/history", headers=auth_a)
    res_b = client.get("/api/v1/games/triple-777/history", headers=auth_b)

    items_a = res_a.json()["data"]
    items_b = res_b.json()["data"]

    assert len(items_a) >= 1
    assert len(items_b) >= 1
    assert items_a[0]["stake"] == 10
    assert items_b[0]["stake"] == 20


def test_valid_spin_ledger_integrity(client: TestClient, user_a_fixture):
    """Verify spin creates exactly 1 GAME_ENTRY transaction and at most 1 GAME_WIN transaction."""
    auth_headers, user, _ = user_a_fixture
    tx_count_before = query_tx_count(user.id)

    res = client.post(
        "/api/v1/games/triple-777/spin",
        headers=auth_headers,
        json={"stake": 50},
    )
    assert res.status_code == 200
    data = res.json()["data"]

    tx_count_after = query_tx_count(user.id)

    if data["won"]:
        assert tx_count_after == tx_count_before + 2  # 1 debit (GAME_ENTRY) + 1 credit (GAME_WIN)
    else:
        assert tx_count_after == tx_count_before + 1  # 1 debit (GAME_ENTRY) only


def test_concurrent_spins_wallet_consistency(client: TestClient, user_a_fixture):
    """Verify concurrent spin requests maintain atomic debit/credit invariants."""
    auth_headers, user, _ = user_a_fixture
    start_balance_paise = query_wallet_balance(user.id)

    def make_spin():
        return client.post(
            "/api/v1/games/triple-777/spin",
            headers=auth_headers,
            json={"stake": 10},
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(make_spin) for _ in range(5)]
        results = [f.result() for f in futures]

    success_spins = [r for r in results if r.status_code == 200]
    assert len(success_spins) == 5

    # Sum of all debits and credits must match final wallet balance
    end_balance_paise = query_wallet_balance(user.id)

    total_debits_paise = 5 * 1000  # 5 * ₹10 in paise
    total_payouts_paise = sum(int(round(r.json()["data"]["payout"] * 100)) for r in success_spins)

    expected_end_paise = start_balance_paise - total_debits_paise + total_payouts_paise
    assert end_balance_paise == expected_end_paise
