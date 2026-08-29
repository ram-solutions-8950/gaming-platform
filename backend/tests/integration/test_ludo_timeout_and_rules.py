import pytest
import uuid
import datetime
from datetime import timezone, timedelta
from decimal import Decimal

from app.database import SessionLocal
from app.models.user import User, UserStatus
from app.models.wallet import Wallet
from app.models.transaction import WalletTransactionType
from app.models.ludo import LudoMatch, LudoPlayer, LudoColor, LudoMatchStatus, LudoToken
from app.models.game_catalog import Game
from app.services.ludo.engine import LudoEngine
from app.services.ludo.matchmaking import LudoMatchmakingService
from app.security.password import hash_password

@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()

@pytest.fixture
def setup_users(db):
    users = []
    for i in range(2):
        username = f"timeout_test_user_{i}_{uuid.uuid4().hex[:6]}"
        u = User(
            name=f"User {i}",
            username=username,
            email=f"{username}@test.com",
            password_hash=hash_password("12345678"),
            status=UserStatus.ACTIVE
        )
        db.add(u)
        db.flush()
        w = Wallet(user_id=u.id, balance=50000)
        db.add(w)
        users.append(u)
    db.commit()
    return users

def test_ludo_turn_timeout_30s_and_advance(db, setup_users):
    u1, u2 = setup_users
    engine = LudoEngine(db)
    service = LudoMatchmakingService(db)

    # Both join matchmaking for 2P
    service.join_queue(u1.id, 2, 1000)
    res = service.join_queue(u2.id, 2, 1000)
    assert res["status"] == "MATCH_FOUND"
    match_id = uuid.UUID(res["match_id"])

    match = db.query(LudoMatch).filter(LudoMatch.id == match_id).first()
    assert match.status == LudoMatchStatus.IN_PROGRESS
    assert match.current_turn_color == LudoColor.RED

    # Turn timer initialized
    assert match.turn_started_at is not None

    # 1. Attempt timeout before 30s -> Error
    with pytest.raises(ValueError, match="Turn has not timed out yet"):
        engine.timeout_turn(match_id, u1.id)

    # 2. Advance time past 30 seconds
    match.turn_started_at = datetime.datetime.now(timezone.utc) - timedelta(seconds=31)
    db.commit()

    # 3. Timeout turn -> should succeed, advance turn to YELLOW
    result = engine.timeout_turn(match_id, u2.id)
    assert result["timeout"] is True
    assert result["consecutive_timeouts"] == 1
    assert result["next_turn_color"] == "YELLOW"

    db.refresh(match)
    assert match.current_turn_color == LudoColor.YELLOW
    # Opponent gets fresh 30s timer
    assert match.turn_started_at is not None
    diff_new = (datetime.datetime.now(timezone.utc) - match.turn_started_at).total_seconds()
    assert diff_new < 5.0

def test_ludo_consecutive_timeout_reset_on_play(db, setup_users):
    u1, u2 = setup_users
    engine = LudoEngine(db)
    service = LudoMatchmakingService(db)

    service.join_queue(u1.id, 2, 1000)
    res = service.join_queue(u2.id, 2, 1000)
    match_id = uuid.UUID(res["match_id"])

    # RED (u1) misses turn 1
    match = db.query(LudoMatch).filter(LudoMatch.id == match_id).first()
    match.turn_started_at = datetime.datetime.now(timezone.utc) - timedelta(seconds=31)
    db.commit()
    engine.timeout_turn(match_id, u2.id)

    p1 = next(p for p in match.players if p.user_id == u1.id)
    assert p1.consecutive_timeouts == 1

    # YELLOW (u2) misses turn 1
    match.turn_started_at = datetime.datetime.now(timezone.utc) - timedelta(seconds=31)
    db.commit()
    engine.timeout_turn(match_id, u1.id)

    # Now it is RED (u1)'s turn again. RED plays roll_dice
    db.refresh(match)
    assert match.current_turn_color == LudoColor.RED
    engine.roll_dice(match_id, u1.id, str(uuid.uuid4()))

    db.refresh(p1)
    assert p1.consecutive_timeouts == 0, "consecutive_timeouts must reset to 0 after successful play!"

def test_ludo_three_consecutive_timeouts_forfeit_and_settlement(db, setup_users):
    u1, u2 = setup_users
    engine = LudoEngine(db)
    service = LudoMatchmakingService(db)

    w1_before = db.query(Wallet).filter_by(user_id=u1.id).first().balance
    w2_before = db.query(Wallet).filter_by(user_id=u2.id).first().balance

    service.join_queue(u1.id, 2, 1000)
    res = service.join_queue(u2.id, 2, 1000)
    match_id = uuid.UUID(res["match_id"])

    match = db.query(LudoMatch).filter(LudoMatch.id == match_id).first()

    # Turn 1: RED (u1) misses
    match.turn_started_at = datetime.datetime.now(timezone.utc) - timedelta(seconds=31)
    db.commit()
    r1 = engine.timeout_turn(match_id, u2.id)
    assert r1["consecutive_timeouts"] == 1
    assert r1["game_over"] is False

    # Turn 1 for YELLOW (u2): YELLOW plays (advances or misses)
    match.turn_started_at = datetime.datetime.now(timezone.utc) - timedelta(seconds=31)
    db.commit()
    engine.timeout_turn(match_id, u1.id)

    # Turn 2: RED (u1) misses again
    match.turn_started_at = datetime.datetime.now(timezone.utc) - timedelta(seconds=31)
    db.commit()
    r2 = engine.timeout_turn(match_id, u2.id)
    assert r2["consecutive_timeouts"] == 2
    assert r2["game_over"] is False

    # Turn 2 for YELLOW (u2): YELLOW plays / misses
    match.turn_started_at = datetime.datetime.now(timezone.utc) - timedelta(seconds=31)
    db.commit()
    engine.timeout_turn(match_id, u1.id)

    # Turn 3: RED (u1) misses 3rd consecutive time -> FORFEIT / OPPONENT WINS
    match.turn_started_at = datetime.datetime.now(timezone.utc) - timedelta(seconds=31)
    db.commit()
    r3 = engine.timeout_turn(match_id, u2.id)
    assert r3["game_over"] is True
    assert r3["forfeited"] is True
    assert r3["winner_user_id"] == str(u2.id)
    assert r3["match_status"] == "COMPLETED"

    db.refresh(match)
    assert match.status == LudoMatchStatus.COMPLETED
    assert match.is_settled is True

    # Check winner rank
    p1 = next(p for p in match.players if p.user_id == u1.id)
    p2 = next(p for p in match.players if p.user_id == u2.id)
    assert p2.rank == 1
    assert p1.rank is not None and p1.rank > 1

    # Check winner wallet credited
    w2_after = db.query(Wallet).filter_by(user_id=u2.id).first().balance
    assert w2_after > w2_before - 1000, "Winner wallet was not credited!"

def test_ludo_duplicate_timeout_protection(db, setup_users):
    u1, u2 = setup_users
    engine = LudoEngine(db)
    service = LudoMatchmakingService(db)

    service.join_queue(u1.id, 2, 1000)
    res = service.join_queue(u2.id, 2, 1000)
    match_id = uuid.UUID(res["match_id"])

    match = db.query(LudoMatch).filter(LudoMatch.id == match_id).first()
    match.turn_started_at = datetime.datetime.now(timezone.utc) - timedelta(seconds=31)
    db.commit()

    # First call succeeds
    r = engine.timeout_turn(match_id, u2.id)
    assert r["timeout"] is True

    # Immediate second call for the same match must fail because turn already advanced and new turn timer reset
    with pytest.raises(ValueError, match="Turn has not timed out yet"):
        engine.timeout_turn(match_id, u1.id)

def test_ludo_diagonal_colors_and_fairness(db, setup_users):
    u1, u2 = setup_users
    service = LudoMatchmakingService(db)

    service.join_queue(u1.id, 2, 1000)
    res = service.join_queue(u2.id, 2, 1000)
    match_id = uuid.UUID(res["match_id"])

    match = db.query(LudoMatch).filter(LudoMatch.id == match_id).first()
    sorted_players = sorted(match.players, key=lambda p: p.seat_index)
    colors = [p.color for p in sorted_players]
    assert colors == [LudoColor.RED, LudoColor.YELLOW], f"Expected [RED, YELLOW], got {colors}"
