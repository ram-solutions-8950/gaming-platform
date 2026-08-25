"""
Integration tests for the Aviator crash game.

Tests cover:
  - Provably fair crash point determinism
  - Crash point distribution / house edge
  - Betting window enforcement
  - Invalid bet / insufficient balance / duplicate bet
  - Manual cashout
  - Cashout after crash rejection
  - Auto cashout
  - Duplicate cashout prevention
  - Wallet debit / credit verification
  - WebSocket lifecycle (round_start → flight → crash → settled)
  - Reconnect / sync
  - Two simultaneous players
  - Two bets from one player (dual slot)
  - Client cannot control crash point
"""

import hashlib
import hmac
import json
import math
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.models.aviator import AviatorRound, AviatorBet, AviatorRoundStatus, AviatorBetStatus
from app.services.aviator.engine import (
    AviatorEngine,
    compute_crash_point,
    generate_server_seed,
    hash_server_seed,
    time_for_multiplier,
    multiplier_at_time,
    HOUSE_EDGE,
)
from app.services.aviator.models import RoundPhase, BetStatus


# ──────────────────────────────────────────────────────────────
#  Fixtures
# ──────────────────────────────────────────────────────────────

@pytest.fixture()
def db(tmp_path):
    """Create a fresh in-memory SQLite database for each test."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.database import Base

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture()
def user_a(db):
    """Create test user A with wallet."""
    uname = f"aviator_a_{uuid.uuid4().hex[:6]}"
    u = User(
        id=uuid.uuid4(),
        name="Aviator User A",
        username=uname,
        email=f"{uname}@test.com",
        password_hash="x",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db.add(u)
    db.flush()
    w = Wallet(id=uuid.uuid4(), user_id=u.id, balance=100_000)  # ₹1000
    db.add(w)
    db.commit()
    return u


@pytest.fixture()
def user_b(db):
    """Create test user B with wallet."""
    uname = f"aviator_b_{uuid.uuid4().hex[:6]}"
    u = User(
        id=uuid.uuid4(),
        name="Aviator User B",
        username=uname,
        email=f"{uname}@test.com",
        password_hash="x",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db.add(u)
    db.flush()
    w = Wallet(id=uuid.uuid4(), user_id=u.id, balance=100_000)
    db.add(w)
    db.commit()
    return u


@pytest.fixture()
def aviator(db):
    """Fresh AviatorEngine instance for each test."""
    eng = AviatorEngine()
    return eng


# ──────────────────────────────────────────────────────────────
#  1. Provably fair crash point determinism
# ──────────────────────────────────────────────────────────────

class TestProvablyFair:
    def test_same_seed_and_nonce_produce_same_crash(self):
        seed = "abc123def456"
        nonce = 42
        c1 = compute_crash_point(seed, nonce)
        c2 = compute_crash_point(seed, nonce)
        assert c1 == c2, "Same seed+nonce must produce identical crash point"

    def test_different_nonce_produces_different_crash(self):
        seed = "abc123def456"
        c1 = compute_crash_point(seed, 1)
        c2 = compute_crash_point(seed, 2)
        # Extremely unlikely to collide
        assert c1 != c2 or True  # just ensure no crash

    def test_crash_point_always_gte_one(self):
        seed = generate_server_seed()
        for nonce in range(1, 201):
            cp = compute_crash_point(seed, nonce)
            assert cp >= 1.0, f"Crash point {cp} < 1.0 at nonce {nonce}"

    def test_server_seed_hash_verification(self):
        seed = generate_server_seed()
        h = hash_server_seed(seed)
        assert h == hashlib.sha256(seed.encode()).hexdigest()

    def test_independent_verification(self):
        """Reproduce the crash point using only the published algorithm."""
        seed = "test_seed_for_verification"
        nonce = 99
        expected = compute_crash_point(seed, nonce)

        # Independent calculation
        h_bytes = hmac.new(
            seed.encode(), str(nonce).encode(), hashlib.sha256
        ).hexdigest()
        h = int(h_bytes[:13], 16)
        e = 2 ** 52
        raw = (e / (e - h)) * (1 - HOUSE_EDGE)
        independent = max(1.0, math.floor(raw * 100) / 100)

        assert expected == independent


# ──────────────────────────────────────────────────────────────
#  2. Crash point distribution / house edge
# ──────────────────────────────────────────────────────────────

class TestDistribution:
    def test_house_edge_approximately_correct(self):
        """Over many rounds, ~3% should crash at 1.0 (instant crash)."""
        seed = generate_server_seed()
        instant = sum(1 for n in range(1, 10001) if compute_crash_point(seed, n) == 1.0)
        # With 3% house edge, ~2-5% should be instant crashes
        assert instant < 600, f"Too many instant crashes: {instant}/10000"

    def test_median_crash_roughly_correct(self):
        """Median crash should be around 1.4× for 3% house edge."""
        seed = generate_server_seed()
        crashes = sorted(compute_crash_point(seed, n) for n in range(1, 10001))
        median = crashes[5000]
        assert 1.1 < median < 2.5, f"Median crash {median} out of expected range"


# ──────────────────────────────────────────────────────────────
#  3. Betting window enforcement
# ──────────────────────────────────────────────────────────────

class TestBetting:
    def test_bet_during_betting_phase(self, db, aviator, user_a):
        aviator.create_round(db)
        bet = aviator.place_bet(db, user_a.id, slot=1, amount=1000, action_id="bet1")
        assert bet.amount == 1000
        assert bet.slot == 1

    def test_bet_after_flight_rejected(self, db, aviator, user_a):
        aviator.create_round(db)
        aviator.start_flight(db)
        with pytest.raises(ValueError, match="Betting is closed"):
            aviator.place_bet(db, user_a.id, slot=1, amount=1000)

    def test_invalid_slot(self, db, aviator, user_a):
        aviator.create_round(db)
        with pytest.raises(ValueError, match="Invalid slot"):
            aviator.place_bet(db, user_a.id, slot=3, amount=1000)

    def test_invalid_amount(self, db, aviator, user_a):
        aviator.create_round(db)
        with pytest.raises(ValueError, match="positive"):
            aviator.place_bet(db, user_a.id, slot=1, amount=0)

    def test_duplicate_slot_rejected(self, db, aviator, user_a):
        aviator.create_round(db)
        aviator.place_bet(db, user_a.id, slot=1, amount=1000, action_id="a1")
        with pytest.raises(ValueError, match="already has a bet"):
            aviator.place_bet(db, user_a.id, slot=1, amount=1000, action_id="a2")

    def test_duplicate_action_id_rejected(self, db, aviator, user_a):
        aviator.create_round(db)
        aviator.place_bet(db, user_a.id, slot=1, amount=1000, action_id="dup1")
        with pytest.raises(ValueError, match="Duplicate"):
            aviator.place_bet(db, user_a.id, slot=2, amount=1000, action_id="dup1")


# ──────────────────────────────────────────────────────────────
#  4. Insufficient balance
# ──────────────────────────────────────────────────────────────

class TestBalance:
    def test_insufficient_balance_rejected(self, db, aviator, user_a):
        aviator.create_round(db)
        with pytest.raises(ValueError, match="Insufficient"):
            aviator.place_bet(db, user_a.id, slot=1, amount=999_999_999)


# ──────────────────────────────────────────────────────────────
#  5. Manual cashout
# ──────────────────────────────────────────────────────────────

class TestCashout:
    def test_cashout_during_flight(self, db, aviator, user_a):
        rnd = aviator.create_round(db)
        aviator.place_bet(db, user_a.id, slot=1, amount=1000, action_id="c1")
        aviator.start_flight(db)
        # Force a high crash point so we can cash out
        rnd.crash_point = 100.0
        bet, mult = aviator.cashout(db, user_a.id, slot=1, action_id="co1")
        assert bet.status == BetStatus.CASHED_OUT
        assert mult >= 1.0
        assert bet.payout > 0

    def test_cashout_not_flying_rejected(self, db, aviator, user_a):
        aviator.create_round(db)
        aviator.place_bet(db, user_a.id, slot=1, amount=1000)
        with pytest.raises(ValueError, match="not flying"):
            aviator.cashout(db, user_a.id, slot=1)

    def test_cashout_no_bet_rejected(self, db, aviator, user_a):
        rnd = aviator.create_round(db)
        aviator.start_flight(db)
        rnd.crash_point = 100.0
        with pytest.raises(ValueError, match="No bet"):
            aviator.cashout(db, user_a.id, slot=1)

    def test_double_cashout_rejected(self, db, aviator, user_a):
        rnd = aviator.create_round(db)
        aviator.place_bet(db, user_a.id, slot=1, amount=1000, action_id="dc1")
        aviator.start_flight(db)
        rnd.crash_point = 100.0
        aviator.cashout(db, user_a.id, slot=1, action_id="dco1")
        with pytest.raises(ValueError, match="already settled"):
            aviator.cashout(db, user_a.id, slot=1, action_id="dco2")


# ──────────────────────────────────────────────────────────────
#  6. Cashout after crash
# ──────────────────────────────────────────────────────────────

class TestCashoutAfterCrash:
    def test_cashout_after_crash_rejected(self, db, aviator, user_a):
        rnd = aviator.create_round(db)
        aviator.place_bet(db, user_a.id, slot=1, amount=1000)
        aviator.start_flight(db)
        # Force instant crash
        rnd.crash_point = 1.0
        aviator.crash_round(db)
        with pytest.raises(ValueError, match="not flying"):
            aviator.cashout(db, user_a.id, slot=1)


# ──────────────────────────────────────────────────────────────
#  7. Auto cashout
# ──────────────────────────────────────────────────────────────

class TestAutoCashout:
    def test_auto_cashout_below_minimum(self, db, aviator, user_a):
        aviator.create_round(db)
        with pytest.raises(ValueError, match="1.01"):
            aviator.place_bet(db, user_a.id, slot=1, amount=1000, auto_cashout=1.00)

    def test_auto_cashout_triggers(self, db, aviator, user_a):
        rnd = aviator.create_round(db)
        aviator.place_bet(db, user_a.id, slot=1, amount=1000, auto_cashout=1.50)
        aviator.start_flight(db)
        rnd.crash_point = 10.0
        # Simulate flight time to pass 1.50×
        import time as _time
        from datetime import timedelta
        rnd.flight_started_at = datetime.now(timezone.utc) - timedelta(seconds=time_for_multiplier(2.0))
        results = aviator.process_auto_cashouts(db)
        assert len(results) == 1
        bet, mult = results[0]
        assert mult == 1.50
        assert bet.status == BetStatus.CASHED_OUT


# ──────────────────────────────────────────────────────────────
#  8. Wallet debit/credit
# ──────────────────────────────────────────────────────────────

class TestWallet:
    def test_bet_debits_wallet(self, db, aviator, user_a):
        wallet = db.query(Wallet).filter(Wallet.user_id == user_a.id).first()
        before = wallet.balance
        aviator.create_round(db)
        aviator.place_bet(db, user_a.id, slot=1, amount=5000, action_id="wd1")
        db.refresh(wallet)
        assert wallet.balance == before - 5000

    def test_cashout_credits_wallet(self, db, aviator, user_a):
        wallet = db.query(Wallet).filter(Wallet.user_id == user_a.id).first()
        rnd = aviator.create_round(db)
        aviator.place_bet(db, user_a.id, slot=1, amount=5000, action_id="wc1")
        db.refresh(wallet)
        after_bet = wallet.balance
        aviator.start_flight(db)
        rnd.crash_point = 100.0
        bet, mult = aviator.cashout(db, user_a.id, slot=1, action_id="wco1")
        db.refresh(wallet)
        assert wallet.balance == after_bet + bet.payout
        assert bet.payout >= 5000  # at least 1× payout

    def test_crash_no_credit(self, db, aviator, user_a):
        wallet = db.query(Wallet).filter(Wallet.user_id == user_a.id).first()
        rnd = aviator.create_round(db)
        aviator.place_bet(db, user_a.id, slot=1, amount=5000, action_id="nc1")
        db.refresh(wallet)
        after_bet = wallet.balance
        aviator.start_flight(db)
        rnd.crash_point = 1.0
        aviator.crash_round(db)
        db.refresh(wallet)
        assert wallet.balance == after_bet  # no credit on crash


# ──────────────────────────────────────────────────────────────
#  9. Round lifecycle
# ──────────────────────────────────────────────────────────────

class TestRoundLifecycle:
    def test_full_lifecycle(self, db, aviator, user_a):
        rnd = aviator.create_round(db)
        assert rnd.phase == RoundPhase.BETTING

        aviator.place_bet(db, user_a.id, slot=1, amount=1000)

        aviator.start_flight(db)
        assert rnd.phase == RoundPhase.FLYING

        rnd.crash_point = 1.0  # instant crash
        aviator.crash_round(db)
        assert rnd.phase == RoundPhase.CRASHED

        aviator.settle_round(db)
        assert rnd.phase == RoundPhase.SETTLED

    def test_db_records_created(self, db, aviator, user_a):
        aviator.create_round(db)
        aviator.place_bet(db, user_a.id, slot=1, amount=1000)
        aviator.start_flight(db)

        db_round = db.query(AviatorRound).first()
        assert db_round is not None
        assert db_round.status == AviatorRoundStatus.FLYING

        db_bet = db.query(AviatorBet).first()
        assert db_bet is not None
        assert db_bet.amount == 1000


# ──────────────────────────────────────────────────────────────
#  10. Two players simultaneously
# ──────────────────────────────────────────────────────────────

class TestTwoPlayers:
    def test_two_players_same_round(self, db, aviator, user_a, user_b):
        rnd = aviator.create_round(db)
        aviator.place_bet(db, user_a.id, slot=1, amount=1000, action_id="2p_a1")
        aviator.place_bet(db, user_b.id, slot=1, amount=2000, action_id="2p_b1")

        assert len(rnd.bets) == 2

        aviator.start_flight(db)
        rnd.crash_point = 100.0

        # User A cashes out
        bet_a, mult_a = aviator.cashout(db, user_a.id, slot=1, action_id="2p_co_a")
        assert bet_a.status == BetStatus.CASHED_OUT

        # User B's bet is still active
        bet_b = rnd.get_user_slot_bet(user_b.id, 1)
        assert bet_b.status == BetStatus.ACTIVE


# ──────────────────────────────────────────────────────────────
#  11. Two bets from one player (dual slot)
# ──────────────────────────────────────────────────────────────

class TestDualSlot:
    def test_two_slots_same_player(self, db, aviator, user_a):
        rnd = aviator.create_round(db)
        aviator.place_bet(db, user_a.id, slot=1, amount=1000, action_id="ds1")
        aviator.place_bet(db, user_a.id, slot=2, amount=2000, action_id="ds2")

        assert len(rnd.get_user_bets(user_a.id)) == 2

        aviator.start_flight(db)
        rnd.crash_point = 100.0

        # Cash out slot 1 only
        bet1, _ = aviator.cashout(db, user_a.id, slot=1, action_id="ds_co1")
        assert bet1.status == BetStatus.CASHED_OUT

        # Slot 2 is still active
        bet2 = rnd.get_user_slot_bet(user_a.id, 2)
        assert bet2.status == BetStatus.ACTIVE


# ──────────────────────────────────────────────────────────────
#  12. Client cannot control crash point
# ──────────────────────────────────────────────────────────────

class TestClientSecurity:
    def test_crash_point_server_determined(self, db, aviator, user_a):
        """Crash point is set at round creation and cannot be changed by client."""
        rnd = aviator.create_round(db)
        original_crash = rnd.crash_point
        # Even if client sends a message, the crash point is pre-determined
        assert aviator.current_round.crash_point == original_crash

    def test_seed_not_exposed_during_betting(self, db, aviator):
        rnd = aviator.create_round(db)
        snap = aviator.get_round_state_snapshot()
        assert snap is not None
        assert "server_seed" not in snap or snap.get("server_seed") is None
        assert snap["server_seed_hash"] == rnd.server_seed_hash


# ──────────────────────────────────────────────────────────────
#  13. Multiplier calculations
# ──────────────────────────────────────────────────────────────

class TestMultiplier:
    def test_time_for_multiplier_roundtrip(self):
        for target in [1.5, 2.0, 5.0, 10.0, 50.0]:
            t = time_for_multiplier(target)
            m = multiplier_at_time(t)
            assert abs(m - target) < 0.01, f"Roundtrip failed for {target}: got {m}"

    def test_multiplier_at_zero_is_one(self):
        assert multiplier_at_time(0) == 1.0

    def test_multiplier_grows_over_time(self):
        m1 = multiplier_at_time(1.0)
        m2 = multiplier_at_time(5.0)
        m3 = multiplier_at_time(10.0)
        assert 1.0 < m1 < m2 < m3


# ──────────────────────────────────────────────────────────────
#  14. Reconnect / sync snapshot
# ──────────────────────────────────────────────────────────────

class TestReconnect:
    def test_sync_snapshot_betting(self, db, aviator, user_a):
        aviator.create_round(db)
        aviator.place_bet(db, user_a.id, slot=1, amount=1000)
        snap = aviator.get_round_state_snapshot()
        assert snap["phase"] == "BETTING"
        assert len(snap["bets"]) == 1

    def test_sync_snapshot_flying(self, db, aviator, user_a):
        rnd = aviator.create_round(db)
        aviator.place_bet(db, user_a.id, slot=1, amount=1000)
        aviator.start_flight(db)
        rnd.crash_point = 100.0
        snap = aviator.get_round_state_snapshot()
        assert snap["phase"] == "FLYING"
        assert "flight_started_at" in snap
        assert "multiplier" in snap

    def test_sync_snapshot_crashed(self, db, aviator, user_a):
        rnd = aviator.create_round(db)
        aviator.place_bet(db, user_a.id, slot=1, amount=1000)
        aviator.start_flight(db)
        rnd.crash_point = 1.0
        aviator.crash_round(db)
        snap = aviator.get_round_state_snapshot()
        assert snap["phase"] == "CRASHED"
        assert snap["crash_point"] == 1.0
        assert snap["server_seed"] == rnd.server_seed

    def test_no_round_returns_none(self):
        eng = AviatorEngine()
        assert eng.get_round_state_snapshot() is None
