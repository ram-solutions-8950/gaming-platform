"""
Adversarial Security & Concurrency Test Suite for Chicken Road Backend.

Covers:
  1. Payout Manipulation (spoofed multiplier, win_amount, position, etc.)
  2. Round Ownership (User B attacking User A's round)
  3. Replay Attacks (START, CROSS, FINISH, CASHOUT replay)
  4. Concurrent Cashout (10 simultaneous threads)
  5. Concurrent Finish (10 simultaneous threads)
  6. Finish + Cashout Race (simultaneous finish and cashout)
  7. Collision + Cashout Race (simultaneous collision and cashout)
  8. Wallet Invariants (balance matching, ledger uniqueness)
  9. Active Round Duplication (START while active)
 10. Integer / Float / Decimal / NaN / Extreme Bet Abuse
 11. Authentication & Token Tampering (missing, invalid, forged tokens)
"""

import math
import concurrent.futures
from uuid import uuid4
import pytest
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.models.transaction import WalletTransaction, WalletTransactionType
from app.security.jwt import create_access_token
from app.routers.chicken_road import DIFFICULTY_MULTIPLIERS


@pytest.fixture
def user_a(db: Session):
    rand = str(uuid4())[:8]
    user = User(
        id=uuid4(),
        name="Attacker User A",
        username=f"user_a_{rand}",
        email=f"user_a_{rand}@example.com",
        password_hash="hash_a",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    wallet = Wallet(id=uuid4(), user_id=user.id, balance=1000000)  # ₹10,000.00
    db.add(wallet)
    db.commit()
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}, user, wallet


@pytest.fixture
def user_b(db: Session):
    rand = str(uuid4())[:8]
    user = User(
        id=uuid4(),
        name="Victim User B",
        username=f"user_b_{rand}",
        email=f"user_b_{rand}@example.com",
        password_hash="hash_b",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    wallet = Wallet(id=uuid4(), user_id=user.id, balance=500000)  # ₹5,000.00
    db.add(wallet)
    db.commit()
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}, user, wallet


# ─── 1. PAYOUT MANIPULATION ───────────────────────────────────────────────

def test_payout_manipulation_is_prevented(client, user_a, db: Session):
    headers, user, wallet = user_a
    db.refresh(wallet)
    start_bal = wallet.balance

    # Start game with ₹100
    res = client.post("/api/v1/games/chicken-road/start", json={"bet_amount": 100, "difficulty": "EASY"}, headers=headers)
    assert res.status_code == 200
    round_id = res.json()["data"]["round_id"]

    # Cross 1 lane legitimately
    client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": round_id, "lane_index": 1}, headers=headers)

    # Malicious injection payloads
    attack_payload = {
        "round_id": round_id,
        "multiplier": 1000000,
        "win_amount": 999999999,
        "amount": 999999999,
        "current_lane": 999,
        "next_multiplier": 999999,
        "position": "finish",
        "finished": True,
    }

    res_cashout = client.post("/api/v1/games/chicken-road/cashout", json=attack_payload, headers=headers)
    assert res_cashout.status_code == 200
    data = res_cashout.json()["data"]

    # Server must use authoritative multiplier (1.01x)
    auth_mult = DIFFICULTY_MULTIPLIERS["EASY"][0]
    assert data["multiplier"] == auth_mult
    # The won_amount may include winning fee deduction on the profit portion.
    # Key security: server uses 1.01x multiplier, NOT client-injected 1000000x.
    assert data["won_amount"] <= round(100 * auth_mult, 2)
    assert data["won_amount"] < 999999999  # NOT the client-injected amount

    # Verify wallet ledger
    db.refresh(wallet)
    expected_balance = start_bal - 10000 + int(round(data["won_amount"] * 100))
    assert wallet.balance == expected_balance


# ─── 2. ROUND OWNERSHIP ───────────────────────────────────────────────────

def test_round_ownership_enforcement(client, user_a, user_b, db: Session):
    headers_a, user_a_obj, wallet_a = user_a
    headers_b, user_b_obj, wallet_b = user_b

    # User A starts round
    res_start = client.post("/api/v1/games/chicken-road/start", json={"bet_amount": 100, "difficulty": "EASY"}, headers=headers_a)
    round_id_a = res_start.json()["data"]["round_id"]

    db.refresh(wallet_b)
    bal_b_before = wallet_b.balance

    # User B attempts to manipulate User A's round
    res_cross = client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": round_id_a, "lane_index": 5}, headers=headers_b)
    assert res_cross.status_code == 400

    res_fin = client.post("/api/v1/games/chicken-road/finish", json={"round_id": round_id_a}, headers=headers_b)
    assert res_fin.status_code == 400

    res_co = client.post("/api/v1/games/chicken-road/cashout", json={"round_id": round_id_a}, headers=headers_b)
    assert res_co.status_code == 400

    res_col = client.post("/api/v1/games/chicken-road/collision", json={"round_id": round_id_a, "lane_index": 2}, headers=headers_b)
    assert res_col.status_code == 400

    # User B's wallet must remain unchanged
    db.refresh(wallet_b)
    assert wallet_b.balance == bal_b_before


# ─── 3. REPLAY ATTACKS ────────────────────────────────────────────────────

def test_replay_attacks(client, user_a, db: Session):
    headers, user, wallet = user_a

    # 1. START Replay
    res1 = client.post("/api/v1/games/chicken-road/start", json={"bet_amount": 50, "difficulty": "EASY"}, headers=headers)
    assert res1.status_code == 200
    round_id = res1.json()["data"]["round_id"]

    # Replay START while active -> Must fail with 400
    res1_replay = client.post("/api/v1/games/chicken-road/start", json={"bet_amount": 50, "difficulty": "EASY"}, headers=headers)
    assert res1_replay.status_code == 400

    # 2. CROSS Replay
    res_cross1 = client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": round_id, "lane_index": 1}, headers=headers)
    assert res_cross1.status_code == 200

    # Replaying lane 1 is idempotent on server
    res_cross1_rep = client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": round_id, "lane_index": 1}, headers=headers)
    assert res_cross1_rep.status_code == 200
    assert res_cross1_rep.json()["data"]["current_lane"] == 1

    # 3. CASHOUT Replay
    res_co = client.post("/api/v1/games/chicken-road/cashout", json={"round_id": round_id}, headers=headers)
    assert res_co.status_code == 200

    # Replaying CASHOUT -> Must fail with 400
    res_co_rep = client.post("/api/v1/games/chicken-road/cashout", json={"round_id": round_id}, headers=headers)
    assert res_co_rep.status_code == 400


# ─── 4. CONCURRENT CASHOUT ────────────────────────────────────────────────

def test_concurrent_cashout_race(client, user_a, db: Session):
    headers, user, wallet = user_a

    res = client.post("/api/v1/games/chicken-road/start", json={"bet_amount": 100, "difficulty": "EASY"}, headers=headers)
    round_id = res.json()["data"]["round_id"]
    client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": round_id, "lane_index": 2}, headers=headers)

    # Fire 10 simultaneous cashout requests
    def do_cashout():
        return client.post("/api/v1/games/chicken-road/cashout", json={"round_id": round_id}, headers=headers)

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(do_cashout) for _ in range(10)]
        results = [f.result() for f in futures]

    status_codes = [r.status_code for r in results]
    assert status_codes.count(200) == 1
    assert status_codes.count(400) == 9

    # Exactly 1 GAME_ENTRY and 1 GAME_WIN
    txs = db.scalars(select(WalletTransaction).where(WalletTransaction.user_id == user.id)).all()
    assert len(txs) == 2
    types = [t.type for t in txs]
    assert types.count(WalletTransactionType.GAME_ENTRY) == 1
    assert types.count(WalletTransactionType.GAME_WIN) == 1


# ─── 5. CONCURRENT FINISH ─────────────────────────────────────────────────

def test_concurrent_finish_race(client, user_a, db: Session):
    headers, user, wallet = user_a

    res = client.post("/api/v1/games/chicken-road/start", json={"bet_amount": 100, "difficulty": "EASY"}, headers=headers)
    round_id = res.json()["data"]["round_id"]

    # Fire 10 simultaneous finish requests
    def do_finish():
        return client.post("/api/v1/games/chicken-road/finish", json={"round_id": round_id}, headers=headers)

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(do_finish) for _ in range(10)]
        results = [f.result() for f in futures]

    status_codes = [r.status_code for r in results]
    assert status_codes.count(200) == 1
    assert status_codes.count(400) == 9

    txs = db.scalars(select(WalletTransaction).where(WalletTransaction.user_id == user.id)).all()
    assert len(txs) == 2
    types = [t.type for t in txs]
    assert types.count(WalletTransactionType.GAME_WIN) == 1


# ─── 6. FINISH + CASHOUT RACE ─────────────────────────────────────────────

def test_finish_plus_cashout_race(client, user_a, db: Session):
    headers, user, wallet = user_a

    res = client.post("/api/v1/games/chicken-road/start", json={"bet_amount": 100, "difficulty": "EASY"}, headers=headers)
    round_id = res.json()["data"]["round_id"]
    client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": round_id, "lane_index": 3}, headers=headers)

    def req_finish():
        return client.post("/api/v1/games/chicken-road/finish", json={"round_id": round_id}, headers=headers)

    def req_cashout():
        return client.post("/api/v1/games/chicken-road/cashout", json={"round_id": round_id}, headers=headers)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f_fin = executor.submit(req_finish)
        f_co = executor.submit(req_cashout)
        res_fin = f_fin.result()
        res_co = f_co.result()

    # Exactly one must succeed with 200, the other must fail with 400
    codes = [res_fin.status_code, res_co.status_code]
    assert sorted(codes) == [200, 400]

    # Exactly 1 GAME_WIN transaction
    txs = db.scalars(select(WalletTransaction).where(WalletTransaction.user_id == user.id)).all()
    win_txs = [t for t in txs if t.type == WalletTransactionType.GAME_WIN]
    assert len(win_txs) == 1


# ─── 7. COLLISION + CASHOUT RACE ──────────────────────────────────────────

def test_collision_plus_cashout_race(client, user_a, db: Session):
    headers, user, wallet = user_a

    res = client.post("/api/v1/games/chicken-road/start", json={"bet_amount": 100, "difficulty": "EASY"}, headers=headers)
    round_id = res.json()["data"]["round_id"]
    client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": round_id, "lane_index": 2}, headers=headers)

    def req_collision():
        return client.post("/api/v1/games/chicken-road/collision", json={"round_id": round_id, "lane_index": 2}, headers=headers)

    def req_cashout():
        return client.post("/api/v1/games/chicken-road/cashout", json={"round_id": round_id}, headers=headers)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f_col = executor.submit(req_collision)
        f_co = executor.submit(req_cashout)
        res_col = f_col.result()
        res_co = f_co.result()

    # Exactly one terminal state succeeds
    codes = [res_col.status_code, res_co.status_code]
    assert sorted(codes) == [200, 400]


# ─── 8. WALLET INVARIANTS ─────────────────────────────────────────────────

def test_wallet_invariants_across_multiple_rounds(client, user_a, db: Session):
    headers, user, wallet = user_a
    db.refresh(wallet)
    current_expected = wallet.balance

    # Round 1: Win
    res1 = client.post("/api/v1/games/chicken-road/start", json={"bet_amount": 100, "difficulty": "EASY"}, headers=headers)
    r1_id = res1.json()["data"]["round_id"]
    current_expected -= 10000

    client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": r1_id, "lane_index": 1}, headers=headers)
    res_fin = client.post("/api/v1/games/chicken-road/finish", json={"round_id": r1_id}, headers=headers)
    won_1 = int(round(res_fin.json()["data"]["won_amount"] * 100))
    current_expected += won_1

    db.refresh(wallet)
    assert wallet.balance == current_expected

    # Round 2: Loss
    res2 = client.post("/api/v1/games/chicken-road/start", json={"bet_amount": 200, "difficulty": "MEDIUM"}, headers=headers)
    r2_id = res2.json()["data"]["round_id"]
    current_expected -= 20000

    client.post("/api/v1/games/chicken-road/collision", json={"round_id": r2_id, "lane_index": 1}, headers=headers)
    db.refresh(wallet)
    assert wallet.balance == current_expected

    # Round 3: Cashout
    res3 = client.post("/api/v1/games/chicken-road/start", json={"bet_amount": 50, "difficulty": "HARD"}, headers=headers)
    r3_id = res3.json()["data"]["round_id"]
    current_expected -= 5000

    client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": r3_id, "lane_index": 2}, headers=headers)
    res_co = client.post("/api/v1/games/chicken-road/cashout", json={"round_id": r3_id}, headers=headers)
    won_3 = int(round(res_co.json()["data"]["won_amount"] * 100))
    current_expected += won_3

    db.refresh(wallet)
    assert wallet.balance == current_expected


# ─── 9. INTEGER / FLOAT / DECIMAL / NAN / EXTREME BET ABUSE ───────────────

@pytest.mark.parametrize("invalid_bet", [-50, 0, 0.5, 999999, "invalid", None])
def test_invalid_bet_amounts_rejected(client, user_a, invalid_bet):
    headers, user, _ = user_a
    res = client.post(
        "/api/v1/games/chicken-road/start",
        json={"bet_amount": invalid_bet, "difficulty": "EASY"},
        headers=headers,
    )
    assert res.status_code in (400, 422)


def test_extreme_lane_indices_rejected(client, user_a):
    headers, user, _ = user_a
    res = client.post("/api/v1/games/chicken-road/start", json={"bet_amount": 50, "difficulty": "EASY"}, headers=headers)
    round_id = res.json()["data"]["round_id"]

    res_bad_lane = client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": round_id, "lane_index": 999}, headers=headers)
    assert res_bad_lane.status_code in (400, 422)


# ─── 10. AUTHENTICATION & TOKEN TAMPERING ─────────────────────────────────

def test_unauthenticated_requests_rejected(client):
    assert client.get("/api/v1/games/chicken-road/state").status_code in (401, 403)
    assert client.post("/api/v1/games/chicken-road/start", json={"bet_amount": 50}).status_code in (401, 403)
    assert client.post("/api/v1/games/chicken-road/cross-lane", json={"round_id": "test", "lane_index": 1}).status_code in (401, 403)
    assert client.post("/api/v1/games/chicken-road/finish", json={"round_id": "test"}).status_code in (401, 403)
    assert client.post("/api/v1/games/chicken-road/cashout", json={"round_id": "test"}).status_code in (401, 403)
    assert client.post("/api/v1/games/chicken-road/collision", json={"round_id": "test", "lane_index": 1}).status_code in (401, 403)


def test_invalid_bearer_token_rejected(client):
    bad_headers = {"Authorization": "Bearer invalid_forged_jwt_token_123"}
    res = client.get("/api/v1/games/chicken-road/state", headers=bad_headers)
    assert res.status_code in (401, 403)
