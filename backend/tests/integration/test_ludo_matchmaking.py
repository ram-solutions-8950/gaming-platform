import pytest
from uuid import uuid4
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.ludo import LudoMatchmakingQueue, QueueStatus, LudoMatch, LudoPlayer, LudoMatchStatus
from app.services.ludo.matchmaking import LudoMatchmakingService
from app.services.wallet_service import credit_wallet
from app.models.transaction import WalletTransactionType

@pytest.fixture
def ludo_game_active(db: Session):
    from app.models.game_catalog import Game, GameStatus
    from app.models.ludo import LudoMatchmakingQueue

    # Clear queue for test isolation
    db.query(LudoMatchmakingQueue).delete()
    db.commit()

    # Find existing Ludo game
    g = db.query(Game).filter_by(slug="ludo").first()

    if not g:
        g = Game(
            name="Ludo",
            slug="ludo",
            game_type="ludo",
            description="Ludo multiplayer game",
            status=GameStatus.ACTIVE,
            min_bet=1000,
            max_bet=10000,
            config={
                "entry_fee": 1000,
                "platform_fee_percent": 10,
            },
        )
        db.add(g)
        db.commit()
        db.refresh(g)
    else:
        # Ensure the existing game is usable for matchmaking tests
        g.status = GameStatus.ACTIVE
        g.config = {
            "entry_fee": 1000,
            "platform_fee_percent": 10,
        }
        db.commit()
        db.refresh(g)

    yield g

def create_funded_user(db: Session, email_prefix: str, amount: int = 5000):
    from app.models.user import UserStatus
    from app.models.wallet import Wallet
    import uuid
    suffix = str(uuid.uuid4())[:8]
    email = f"{email_prefix}_{suffix}@test.com"
    u = User(name="Test User", email=email, password_hash="pw", status=UserStatus.ACTIVE, username=f"{email_prefix}_{suffix}")
    db.add(u)
    db.flush()
    w = Wallet(user_id=u.id, balance=amount)
    db.add(w)
    db.commit()
    return u

def test_two_compatible_players_get_same_match(db: Session, ludo_game_active):
    u1 = create_funded_user(db, "u1@match.com")
    u2 = create_funded_user(db, "u2@match.com")
    
    svc1 = LudoMatchmakingService(db)
    svc2 = LudoMatchmakingService(db)
    
    res1 = svc1.join_queue(u1.id, 2, 1000)
    assert res1["status"] == "SEARCHING"
    
    res2 = svc2.join_queue(u2.id, 2, 1000)
    assert res2["status"] == "MATCH_FOUND"
    
    # Check u1 status now
    stat1 = svc1.get_status(u1.id)
    assert stat1["status"] == "MATCH_FOUND"
    
    # They must have the EXACT SAME match_id!
    assert stat1["match_id"] == res2["match_id"]
    
    # Verify the match was created with 2 players
    match = db.query(LudoMatch).filter_by(id=res2["match_id"]).first()
    assert match is not None
    assert len(match.players) == 2
    assert match.status == LudoMatchStatus.IN_PROGRESS

def test_four_compatible_players_get_same_match(db: Session, ludo_game_active):
    users = [create_funded_user(db, f"u4_{i}@match.com") for i in range(4)]
    svc = LudoMatchmakingService(db)
    
    for i in range(3):
        res = svc.join_queue(users[i].id, 4, 1000)
        assert res["status"] == "SEARCHING"
        
    res4 = svc.join_queue(users[3].id, 4, 1000)
    assert res4["status"] == "MATCH_FOUND"
    
    for i in range(4):
        stat = svc.get_status(users[i].id)
        assert stat["status"] == "MATCH_FOUND"
        assert stat["match_id"] == res4["match_id"]

def test_different_entry_fee_not_matched(db: Session, ludo_game_active):
    u1 = create_funded_user(db, "diff1@match.com")
    u2 = create_funded_user(db, "diff2@match.com")
    
    # Temporarily override game config to allow different fees, or just bypass config checks
    ludo_game_active.config = {}
    db.commit()
    
    svc = LudoMatchmakingService(db)
    res1 = svc.join_queue(u1.id, 2, 1000)
    res2 = svc.join_queue(u2.id, 2, 5000)
    
    assert res1["status"] == "SEARCHING"
    assert res2["status"] == "SEARCHING"
    assert svc.get_status(u1.id)["status"] == "SEARCHING"

def test_different_player_count_not_matched(db: Session, ludo_game_active):
    u1 = create_funded_user(db, "diff3@match.com")
    u2 = create_funded_user(db, "diff4@match.com")
        # This test checks player-count compatibility,
    # not the configured entry-fee validation.
    ludo_game_active.config = {}
    db.commit()
    
    svc = LudoMatchmakingService(db)
    res1 = svc.join_queue(u1.id, 2, 1002)
    res2 = svc.join_queue(u2.id, 4, 1002)
    
    assert res1["status"] == "SEARCHING"
    assert res2["status"] == "SEARCHING"

def test_concurrent_matching_creates_one_match(db: Session, ludo_game_active):
    # This tests our bug fix where a user has duplicate SEARCHING queue rows
    u1 = create_funded_user(db, "u5@match.com")
    u2 = create_funded_user(db, "u6@match.com")
    
    svc = LudoMatchmakingService(db)
    
    # Force insert multiple SEARCHING queue rows for u1
    q1 = LudoMatchmakingQueue(user_id=u1.id, player_count=2, entry_fee=1000, status=QueueStatus.SEARCHING)
    q2 = LudoMatchmakingQueue(user_id=u1.id, player_count=2, entry_fee=1000, status=QueueStatus.SEARCHING)
    q3 = LudoMatchmakingQueue(user_id=u2.id, player_count=2, entry_fee=1000, status=QueueStatus.SEARCHING)
    db.add(q1)
    db.add(q2)
    db.add(q3)
    db.commit()
    
    # Process queue should only create ONE match for u1 and u2
    svc.process_queue(2, 1000)
    
    # Refresh statuses
    stat1 = svc.get_status(u1.id)
    stat2 = svc.get_status(u2.id)
    
    assert stat1["status"] == "MATCH_FOUND"
    assert stat2["status"] == "MATCH_FOUND"
    assert stat1["match_id"] == stat2["match_id"]
    
    # The duplicate queue row should be CANCELLED or ignored
    db.refresh(q1)
    db.refresh(q2)
    
    # One matched, one cancelled
    assert (q1.status == QueueStatus.MATCHED and q2.status == QueueStatus.CANCELLED) or (q2.status == QueueStatus.MATCHED and q1.status == QueueStatus.CANCELLED)

def test_matched_users_status_returns_same_match_id(db: Session, ludo_game_active):
    u1 = create_funded_user(db, "u7@match.com")
    u2 = create_funded_user(db, "u8@match.com")
    
    svc = LudoMatchmakingService(db)
    svc.join_queue(u1.id, 2, 1000)
    svc.join_queue(u2.id, 2, 1000)
    
    assert svc.get_status(u1.id)["match_id"] == svc.get_status(u2.id)["match_id"]
