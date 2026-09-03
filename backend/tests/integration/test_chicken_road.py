"""
Comprehensive QA & Security Audit tests for Chicken Road arcade road-crossing game.
Covers:
  - Gameplay lifecycle (start, cross-lanes, finish, collision, cashout)
  - Server-authoritative security (ignoring client-forged multipliers/win_amounts)
  - Double payout protection (double cashout, double finish, repeat requests)
  - Invalid state transitions (LOST -> CASHOUT, WON -> CASHOUT, CASHED_OUT -> FINISH)
  - Atomic wallet debit & credit verification in transaction ledger
  - Refresh / reconnect recovery state verification
"""

import pytest
from uuid import uuid4
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.models.transaction import WalletTransaction, WalletTransactionType, WalletTransactionStatus
from app.security.jwt import create_access_token
from app.routers.chicken_road import ACTIVE_ROUNDS, USER_ACTIVE_ROUND, DIFFICULTY_MULTIPLIERS


@pytest.fixture
def auth_user(db: Session):
    rand_suffix = str(uuid4())[:8]
    user = User(
        id=uuid4(),
        name="Chicken Auditor",
        username=f"auditor_{rand_suffix}",
        email=f"auditor_{rand_suffix}@example.com",
        password_hash="fakehash",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    wallet = Wallet(id=uuid4(), user_id=user.id, balance=500000)  # 5,000 INR (500,000 paise)
    db.add(wallet)
    db.commit()
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}, user, wallet


# ─── 1. READY STATE & STATE SYNC ──────────────────────────────────────────

def test_ready_state_returns_wallet_and_multipliers(client, auth_user):
    headers, user, _ = auth_user
    res = client.get("/api/v1/games/chicken-road/state", headers=headers)
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["status"] == "READY"
    assert "difficulty_multipliers" in data
    assert data["wallet_balance"] == 5000.0


# ─── 2. RECONNECT & REFRESH RECOVERY ──────────────────────────────────────

def test_refresh_during_active_round_restores_state(client, auth_user, db: Session):
    headers, user, wallet = auth_user

    # Start round
    res_start = client.post(
        "/api/v1/games/chicken-road/start",
        json={"bet_amount": 100, "difficulty": "MEDIUM"},
        headers=headers,
    )
    assert res_start.status_code == 200
    round_id = res_start.json()["data"]["round_id"]

    # Cross 2 lanes
    client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": round_id, "lane_index": 1}, headers=headers)
    client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": round_id, "lane_index": 2}, headers=headers)

    # Player refreshes browser: GET /state
    res_sync = client.get("/api/v1/games/chicken-road/state", headers=headers)
    assert res_sync.status_code == 200
    sync_data = res_sync.json()["data"]

    assert sync_data["status"] == "ACTIVE"
    assert sync_data["round_id"] == round_id
    assert sync_data["difficulty"] == "MEDIUM"
    assert sync_data["bet_amount"] == 100
    assert sync_data["current_lane"] == 2
    assert sync_data["current_multiplier"] == DIFFICULTY_MULTIPLIERS["MEDIUM"][1]
    assert sync_data["wallet_balance"] == 4900.0


# ─── 3. DOUBLE PAYOUT / IDEMPOTENCY PROTECTION ────────────────────────────

def test_double_cashout_prevention(client, auth_user, db: Session):
    headers, user, wallet = auth_user

    # Start game
    res = client.post("/api/v1/games/chicken-road/start", json={"bet_amount": 100, "difficulty": "EASY"}, headers=headers)
    round_id = res.json()["data"]["round_id"]

    # Cross lane 1
    client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": round_id, "lane_index": 1}, headers=headers)

    # First Cashout Request -> Must Succeed
    res_co1 = client.post("/api/v1/games/chicken-road/cashout", json={"round_id": round_id}, headers=headers)
    assert res_co1.status_code == 200
    assert res_co1.json()["data"]["status"] == "CASHED_OUT"

    # Second / Duplicate Cashout Request -> Must Be Rejected
    res_co2 = client.post("/api/v1/games/chicken-road/cashout", json={"round_id": round_id}, headers=headers)
    assert res_co2.status_code == 400

    # Verify wallet ledger: Exactly 1 GAME_ENTRY and 1 GAME_WIN
    txs = db.scalars(
        select(WalletTransaction).where(WalletTransaction.user_id == user.id)
    ).all()
    assert len(txs) == 2
    types = [t.type for t in txs]
    assert types == [WalletTransactionType.GAME_ENTRY, WalletTransactionType.GAME_WIN]


def test_double_finish_prevention(client, auth_user, db: Session):
    headers, user, wallet = auth_user

    # Start game
    res = client.post("/api/v1/games/chicken-road/start", json={"bet_amount": 50, "difficulty": "EASY"}, headers=headers)
    round_id = res.json()["data"]["round_id"]

    # First Finish -> Must Succeed
    res_fin1 = client.post("/api/v1/games/chicken-road/finish", json={"round_id": round_id}, headers=headers)
    assert res_fin1.status_code == 200
    assert res_fin1.json()["data"]["status"] == "WON"

    # Repeat Finish -> Must Be Rejected
    res_fin2 = client.post("/api/v1/games/chicken-road/finish", json={"round_id": round_id}, headers=headers)
    assert res_fin2.status_code == 400


# ─── 4. INVALID STATE TRANSITIONS & COLLISION LOSS ────────────────────────

def test_cannot_cashout_after_collision(client, auth_user, db: Session):
    headers, user, wallet = auth_user

    # Start game
    res = client.post("/api/v1/games/chicken-road/start", json={"bet_amount": 100, "difficulty": "EASY"}, headers=headers)
    round_id = res.json()["data"]["round_id"]

    # Collision in lane 2
    res_col = client.post("/api/v1/games/chicken-road/collision", json={"round_id": round_id, "lane_index": 2}, headers=headers)
    assert res_col.status_code == 200
    assert res_col.json()["data"]["status"] == "LOST"

    # Attempt cashout after loss -> Must fail
    res_co = client.post("/api/v1/games/chicken-road/cashout", json={"round_id": round_id}, headers=headers)
    assert res_co.status_code == 400

    # Ensure no winning transaction exists
    db.refresh(wallet)
    assert wallet.balance == 490000  # Bet was debited, no payout added
    txs = db.scalars(select(WalletTransaction).where(WalletTransaction.user_id == user.id)).all()
    assert len(txs) == 1
    assert txs[0].type == WalletTransactionType.GAME_ENTRY


def test_cannot_finish_after_collision(client, auth_user):
    headers, user, wallet = auth_user

    res = client.post("/api/v1/games/chicken-road/start", json={"bet_amount": 100, "difficulty": "EASY"}, headers=headers)
    round_id = res.json()["data"]["round_id"]

    client.post("/api/v1/games/chicken-road/collision", json={"round_id": round_id, "lane_index": 1}, headers=headers)

    res_fin = client.post("/api/v1/games/chicken-road/finish", json={"round_id": round_id}, headers=headers)
    assert res_fin.status_code == 400


# ─── 5. CLIENT PAYLOAD TAMPERING RESISTANCE ───────────────────────────────

def test_server_ignores_manipulated_client_payloads(client, auth_user, db: Session):
    headers, user, wallet = auth_user

    # Start game
    res = client.post("/api/v1/games/chicken-road/start", json={"bet_amount": 50, "difficulty": "EASY"}, headers=headers)
    round_id = res.json()["data"]["round_id"]

    # Cross 1 lane legitimately
    client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": round_id, "lane_index": 1}, headers=headers)

    # Malicious client sends fraudulent fields (multiplier: 9999, win_amount: 500000)
    res_co = client.post(
        "/api/v1/games/chicken-road/cashout",
        json={
            "round_id": round_id,
            "multiplier": 9999.0,
            "win_amount": 500000.0,
            "position": "finish",
        },
        headers=headers,
    )
    assert res_co.status_code == 200
    co_data = res_co.json()["data"]

    # Server MUST use authoritative multiplier (1.00x, road-1 base) NOT the client-injected 9999.0x
    authoritative_mult = DIFFICULTY_MULTIPLIERS["EASY"][0]
    assert co_data["multiplier"] == authoritative_mult
    # The won_amount includes winning fee deduction on the profit portion.
    # The key security assertion is that the multiplier is server-authoritative, not client-injected.
    assert co_data["won_amount"] <= round(50 * authoritative_mult, 2)
    assert co_data["won_amount"] < 500000.0  # NOT the client-injected amount

    db.refresh(wallet)
    # Wallet credit must match the server-computed won_amount (in paise)
    assert wallet.balance == 495000 + int(round(co_data["won_amount"] * 100))


# ─── 5. MULTIPLIER PROGRESSION FORMULA: 1 + ((successfulCrossings - 1) * 0.03) ────────
# Road 1 = 1.00x (base), then +0.03x for every road crossed after that.

@pytest.fixture
def zero_winning_fee(db: Session):
    """Pin FeeConfiguration.winning_fee_percent to 0% so payout-exactness assertions
    below aren't polluted by whatever another test file's fee_config fixture last set."""
    from app.models.fee_configuration import FeeConfiguration
    from decimal import Decimal as _Decimal
    row = db.query(FeeConfiguration).first()
    if not row:
        row = FeeConfiguration(game_entry_fee_percent=_Decimal("0.00"), winning_fee_percent=_Decimal("0.00"))
        db.add(row)
    else:
        row.game_entry_fee_percent = _Decimal("0.00")
        row.winning_fee_percent = _Decimal("0.00")
    db.commit()
    return row


def test_multiplier_table_matches_003_step_formula():
    """Road 1 = 1.00x, Road 2 = 1.03x, Road 3 = 1.06x ... Road 8 = 1.21x, for every difficulty."""
    expected = [1.00, 1.03, 1.06, 1.09, 1.12, 1.15, 1.18, 1.21, 1.24, 1.27]
    for difficulty in ("EASY", "MEDIUM", "HARD"):
        assert DIFFICULTY_MULTIPLIERS[difficulty][:8] == expected[:8]
        assert DIFFICULTY_MULTIPLIERS[difficulty] == expected


def test_multiplier_only_increases_after_successful_crossing(client, auth_user):
    headers, _, _ = auth_user
    res = client.post("/api/v1/games/chicken-road/start", json={"bet_amount": 100, "difficulty": "MEDIUM"}, headers=headers)
    round_id = res.json()["data"]["round_id"]
    assert res.json()["data"]["current_multiplier"] == 1.0  # base, before any crossing

    res1 = client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": round_id, "lane_index": 1}, headers=headers)
    assert res1.json()["data"]["current_multiplier"] == 1.00  # Road 1 = base multiplier

    res2 = client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": round_id, "lane_index": 2}, headers=headers)
    assert res2.json()["data"]["current_multiplier"] == 1.03  # Road 2 = first +0.03x step

    res3 = client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": round_id, "lane_index": 3}, headers=headers)
    assert res3.json()["data"]["current_multiplier"] == 1.06

    # Re-sending an already-crossed lane index must not advance/double-count the multiplier
    res_repeat = client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": round_id, "lane_index": 2}, headers=headers)
    assert res_repeat.json()["data"]["current_multiplier"] == 1.06


def test_hundred_rupee_bet_road1_pays_100_at_base_multiplier(client, auth_user, db: Session, zero_winning_fee):
    headers, user, wallet = auth_user
    res = client.post("/api/v1/games/chicken-road/start", json={"bet_amount": 100, "difficulty": "MEDIUM"}, headers=headers)
    round_id = res.json()["data"]["round_id"]
    client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": round_id, "lane_index": 1}, headers=headers)

    res_co = client.post("/api/v1/games/chicken-road/cashout", json={"round_id": round_id}, headers=headers)
    data = res_co.json()["data"]
    assert data["multiplier"] == 1.00
    assert data["won_amount"] == 100.0


def test_hundred_rupee_bet_road2_pays_103(client, auth_user, db: Session, zero_winning_fee):
    headers, user, wallet = auth_user
    res = client.post("/api/v1/games/chicken-road/start", json={"bet_amount": 100, "difficulty": "MEDIUM"}, headers=headers)
    round_id = res.json()["data"]["round_id"]
    client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": round_id, "lane_index": 1}, headers=headers)
    client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": round_id, "lane_index": 2}, headers=headers)

    res_co = client.post("/api/v1/games/chicken-road/cashout", json={"round_id": round_id}, headers=headers)
    data = res_co.json()["data"]
    assert data["multiplier"] == 1.03
    assert data["won_amount"] == 103.0


def test_cashout_rejected_before_any_lane_crossed(client, auth_user):
    """Backend must independently enforce this rule, not just the frontend button state."""
    headers, _, _ = auth_user
    res = client.post("/api/v1/games/chicken-road/start", json={"bet_amount": 100, "difficulty": "MEDIUM"}, headers=headers)
    round_id = res.json()["data"]["round_id"]

    res_co = client.post("/api/v1/games/chicken-road/cashout", json={"round_id": round_id}, headers=headers)
    assert res_co.status_code == 400

    # Round must still be ACTIVE and cashable after the rejected attempt (not consumed)
    client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": round_id, "lane_index": 1}, headers=headers)
    res_co2 = client.post("/api/v1/games/chicken-road/cashout", json={"round_id": round_id}, headers=headers)
    assert res_co2.status_code == 200


def test_hundred_rupee_bet_road3_pays_106(client, auth_user, db: Session, zero_winning_fee):
    headers, user, wallet = auth_user
    res = client.post("/api/v1/games/chicken-road/start", json={"bet_amount": 100, "difficulty": "MEDIUM"}, headers=headers)
    round_id = res.json()["data"]["round_id"]
    client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": round_id, "lane_index": 1}, headers=headers)
    client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": round_id, "lane_index": 2}, headers=headers)
    client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": round_id, "lane_index": 3}, headers=headers)

    res_co = client.post("/api/v1/games/chicken-road/cashout", json={"round_id": round_id}, headers=headers)
    data = res_co.json()["data"]
    assert data["multiplier"] == 1.06
    assert data["won_amount"] == 106.0


def test_cross_lane_potential_win_matches_actual_cashout_payout(client, auth_user, db: Session):
    """The preview shown after crossing a lane (potential_win) must exactly equal
    what cashing out right now actually pays — including the platform winning fee,
    which existing settlement logic already applies and this must not change."""
    from app.models.fee_configuration import FeeConfiguration
    from decimal import Decimal as _Decimal
    row = db.query(FeeConfiguration).first()
    if not row:
        row = FeeConfiguration(game_entry_fee_percent=_Decimal("0.00"), winning_fee_percent=_Decimal("15.00"))
        db.add(row)
    else:
        row.game_entry_fee_percent = _Decimal("0.00")
        row.winning_fee_percent = _Decimal("15.00")
    db.commit()

    headers, user, wallet = auth_user
    res = client.post("/api/v1/games/chicken-road/start", json={"bet_amount": 100, "difficulty": "MEDIUM"}, headers=headers)
    round_id = res.json()["data"]["round_id"]
    client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": round_id, "lane_index": 1}, headers=headers)
    res_cross = client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": round_id, "lane_index": 2}, headers=headers)
    previewed = res_cross.json()["data"]["potential_win"]

    res_co = client.post("/api/v1/games/chicken-road/cashout", json={"round_id": round_id}, headers=headers)
    data = res_co.json()["data"]
    assert data["multiplier"] == 1.03
    # 100 * 1.03 = 103 total return; 15% fee on the 3 profit = 0.45 -> won_amount = 102.55
    assert data["won_amount"] == 102.55
    assert previewed == data["won_amount"]


def test_state_potential_win_matches_actual_cashout_payout_on_resume(client, auth_user, db: Session):
    """Same guarantee on refresh/reconnect: GET /state's potential_win must match
    what /cashout actually pays for the round already in progress."""
    from app.models.fee_configuration import FeeConfiguration
    from decimal import Decimal as _Decimal
    row = db.query(FeeConfiguration).first()
    if not row:
        row = FeeConfiguration(game_entry_fee_percent=_Decimal("0.00"), winning_fee_percent=_Decimal("20.00"))
        db.add(row)
    else:
        row.game_entry_fee_percent = _Decimal("0.00")
        row.winning_fee_percent = _Decimal("20.00")
    db.commit()

    headers, user, wallet = auth_user
    res = client.post("/api/v1/games/chicken-road/start", json={"bet_amount": 100, "difficulty": "EASY"}, headers=headers)
    round_id = res.json()["data"]["round_id"]
    client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": round_id, "lane_index": 1}, headers=headers)

    res_state = client.get("/api/v1/games/chicken-road/state", headers=headers)
    previewed = res_state.json()["data"]["potential_win"]

    res_co = client.post("/api/v1/games/chicken-road/cashout", json={"round_id": round_id}, headers=headers)
    data = res_co.json()["data"]
    assert previewed == data["won_amount"]
