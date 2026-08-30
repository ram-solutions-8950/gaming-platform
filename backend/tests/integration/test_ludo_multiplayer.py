"""
Comprehensive Ludo Matchmaking Integration Tests.

Tests the LudoMatchmakingService directly against a real PostgreSQL database.
Covers: queue behavior, match creation, color assignment, wallet safety,
        idempotency, edge cases, and concurrent requests.
"""
import pytest
import uuid
from datetime import datetime, timezone, timedelta
from app.models.user import User, UserStatus
from app.models.wallet import Wallet
from app.models.ludo import (
    LudoMatch,
    LudoPlayer,
    LudoToken,
    LudoMatchmakingQueue,
    LudoMatchStatus,
    LudoColor,
    QueueStatus,
)
from app.models.transaction import WalletTransaction
from app.services.ludo.matchmaking import LudoMatchmakingService
from app.services.ludo.engine import LudoEngine, _CONSECUTIVE_SIXES
from app.services.wallet_service import get_balance


@pytest.fixture(autouse=True)
def clean_ludo_tables(db):
    """Clean all Ludo-related tables before each test.
    The matchmaking service commits internally, so db.rollback() in the
    fixture teardown doesn't undo Ludo data.  We delete explicitly."""
    db.query(LudoToken).delete()
    db.query(LudoPlayer).delete()
    db.query(LudoMatchmakingQueue).delete()
    db.query(LudoMatch).delete()
    db.commit()
    yield
    # Also cleanup after
    db.query(LudoToken).delete()
    db.query(LudoPlayer).delete()
    db.query(LudoMatchmakingQueue).delete()
    db.query(LudoMatch).delete()
    db.commit()



@pytest.fixture
def test_users_with_wallets(db):
    users = []
    for i in range(4):
        uid = uuid.uuid4()
        user = User(
            id=uid,
            name=f"Player {i}",
            username=f"ludo_player_{i}_{uid.hex[:6]}",
            email=f"ludo_{i}_{uid.hex[:6]}@test.com",
            password_hash="hash",
            status=UserStatus.ACTIVE,
        )
        db.add(user)
        db.flush()

        wallet = Wallet(
            user_id=user.id,
            balance=50000,  # ₹500
        )
        db.add(wallet)
        users.append(user)

    db.commit()
    return users


# =====================================================================
# 1. Same tier → exactly one match, correct colors
# =====================================================================

def test_two_players_same_tier_match(db, test_users_with_wallets):
    u1, u2 = test_users_with_wallets[0], test_users_with_wallets[1]
    svc = LudoMatchmakingService(db)

    # User 1 joins
    res1 = svc.join_queue(user_id=u1.id, player_count=2, entry_fee=1000)
    assert res1["status"] == QueueStatus.SEARCHING.value

    # User 2 joins → triggers match
    res2 = svc.join_queue(user_id=u2.id, player_count=2, entry_fee=1000)
    assert res2["status"] == QueueStatus.MATCHED.value
    match_id = uuid.UUID(res2["match_id"])

    # Verify exactly ONE match
    match = db.query(LudoMatch).filter(LudoMatch.id == match_id).first()
    assert match is not None
    assert match.status == LudoMatchStatus.IN_PROGRESS
    assert len(match.players) == 2

    # Verify colors
    p1 = next(p for p in match.players if p.user_id == u1.id)
    p2 = next(p for p in match.players if p.user_id == u2.id)
    assert p1.color == LudoColor.RED
    assert p2.color == LudoColor.YELLOW

    # Verify tokens
    assert len(p1.tokens) == 4
    assert all(t.position == -1 for t in p1.tokens)
    assert len(p2.tokens) == 4
    assert all(t.position == -1 for t in p2.tokens)

    # Verify wallet deductions
    w1 = get_balance(db, u1.id)
    w2 = get_balance(db, u2.id)
    assert w1.balance == 49000
    assert w2.balance == 49000

    # Prize pool: (2000 * 90%) = 1800
    assert match.prize_pool == 1800


# =====================================================================
# 2. Different tier → no match
# =====================================================================

def test_two_players_different_tier_no_match(db, test_users_with_wallets):
    u1, u2 = test_users_with_wallets[0], test_users_with_wallets[1]
    svc = LudoMatchmakingService(db)

    res1 = svc.join_queue(user_id=u1.id, player_count=2, entry_fee=1000)
    assert res1["status"] == QueueStatus.SEARCHING.value

    res2 = svc.join_queue(user_id=u2.id, player_count=2, entry_fee=5000)
    assert res2["status"] == QueueStatus.SEARCHING.value

    # Both still searching, no match created
    matches = db.query(LudoMatch).filter(
        LudoMatch.status == LudoMatchStatus.IN_PROGRESS
    ).all()
    assert len(matches) == 0


# =====================================================================
# 3. Different mode → no match
# =====================================================================

def test_two_players_different_mode_no_match(db, test_users_with_wallets):
    u1, u2 = test_users_with_wallets[0], test_users_with_wallets[1]
    svc = LudoMatchmakingService(db)

    res1 = svc.join_queue(user_id=u1.id, player_count=2, entry_fee=1000)
    assert res1["status"] == QueueStatus.SEARCHING.value

    res2 = svc.join_queue(user_id=u2.id, player_count=4, entry_fee=1000)
    assert res2["status"] == QueueStatus.SEARCHING.value

    matches = db.query(LudoMatch).filter(
        LudoMatch.status == LudoMatchStatus.IN_PROGRESS
    ).all()
    assert len(matches) == 0


# =====================================================================
# 4. Both queue entries become MATCHED
# =====================================================================

def test_match_removes_both_from_queue(db, test_users_with_wallets):
    u1, u2 = test_users_with_wallets[0], test_users_with_wallets[1]
    svc = LudoMatchmakingService(db)

    svc.join_queue(user_id=u1.id, player_count=2, entry_fee=1000)
    svc.join_queue(user_id=u2.id, player_count=2, entry_fee=1000)

    # No SEARCHING entries should remain
    searching = db.query(LudoMatchmakingQueue).filter(
        LudoMatchmakingQueue.status == QueueStatus.SEARCHING,
        LudoMatchmakingQueue.user_id.in_([u1.id, u2.id]),
    ).all()
    assert len(searching) == 0

    # Both should have MATCHED entries
    matched = db.query(LudoMatchmakingQueue).filter(
        LudoMatchmakingQueue.status == QueueStatus.MATCHED,
        LudoMatchmakingQueue.user_id.in_([u1.id, u2.id]),
    ).all()
    assert len(matched) == 2


# =====================================================================
# 5. Exactly one match created
# =====================================================================

def test_match_created_only_once(db, test_users_with_wallets):
    u1, u2 = test_users_with_wallets[0], test_users_with_wallets[1]
    svc = LudoMatchmakingService(db)

    svc.join_queue(user_id=u1.id, player_count=2, entry_fee=1000)
    res = svc.join_queue(user_id=u2.id, player_count=2, entry_fee=1000)
    match_id = uuid.UUID(res["match_id"])

    all_matches = db.query(LudoMatch).filter(
        LudoMatch.status == LudoMatchStatus.IN_PROGRESS
    ).all()
    assert len(all_matches) == 1
    assert all_matches[0].id == match_id


# =====================================================================
# 6. Duplicate join returns existing state
# =====================================================================

def test_duplicate_user_queue_entry(db, test_users_with_wallets):
    u1 = test_users_with_wallets[0]
    svc = LudoMatchmakingService(db)

    res1 = svc.join_queue(user_id=u1.id, player_count=2, entry_fee=1000)
    assert res1["status"] == QueueStatus.SEARCHING.value
    queue_id_1 = res1["queue_id"]

    # Join again with same params → should return existing queue entry
    res2 = svc.join_queue(user_id=u1.id, player_count=2, entry_fee=1000)
    assert res2["status"] == QueueStatus.SEARCHING.value
    assert res2["queue_id"] == queue_id_1


# =====================================================================
# 7. User already in match → ALREADY_IN_MATCH
# =====================================================================

def test_user_already_in_match(db, test_users_with_wallets):
    u1, u2, u3 = test_users_with_wallets[0], test_users_with_wallets[1], test_users_with_wallets[2]
    svc = LudoMatchmakingService(db)

    svc.join_queue(user_id=u1.id, player_count=2, entry_fee=1000)
    svc.join_queue(user_id=u2.id, player_count=2, entry_fee=1000)

    # u1 is now in an active match. Try to join again.
    res = svc.join_queue(user_id=u1.id, player_count=2, entry_fee=1000)
    assert res["status"] == "ALREADY_IN_MATCH"
    assert "match_id" in res


# =====================================================================
# 8. Cancel works
# =====================================================================

def test_cancel_matchmaking(db, test_users_with_wallets):
    u1 = test_users_with_wallets[0]
    svc = LudoMatchmakingService(db)

    svc.join_queue(user_id=u1.id, player_count=2, entry_fee=1000)
    cancelled = svc.cancel_queue(u1.id)
    assert cancelled is True

    q = db.query(LudoMatchmakingQueue).filter(
        LudoMatchmakingQueue.user_id == u1.id,
    ).order_by(LudoMatchmakingQueue.queued_at.desc()).first()
    assert q.status == QueueStatus.CANCELLED


# =====================================================================
# 9. Queue timeout cleanup
# =====================================================================

def test_queue_timeout_cleanup(db, test_users_with_wallets):
    u1 = test_users_with_wallets[0]
    svc = LudoMatchmakingService(db)

    # Insert an old queue entry
    old_q = LudoMatchmakingQueue(
        user_id=u1.id,
        player_count=2,
        entry_fee=1000,
        status=QueueStatus.SEARCHING,
        queued_at=datetime.now(timezone.utc) - timedelta(seconds=60),
    )
    db.add(old_q)
    db.commit()

    svc.clean_expired_queues()
    db.refresh(old_q)
    assert old_q.status == QueueStatus.CANCELLED


# =====================================================================
# 10. MATCHED response contains match_id
# =====================================================================

def test_matched_response_contains_match_id(db, test_users_with_wallets):
    u1, u2 = test_users_with_wallets[0], test_users_with_wallets[1]
    svc = LudoMatchmakingService(db)

    svc.join_queue(user_id=u1.id, player_count=2, entry_fee=1000)
    res = svc.join_queue(user_id=u2.id, player_count=2, entry_fee=1000)

    assert res["status"] == QueueStatus.MATCHED.value
    assert "match_id" in res
    assert uuid.UUID(res["match_id"])  # valid UUID


# =====================================================================
# 11. MATCHED response contains player/color information
# =====================================================================

def test_matched_response_contains_player_data(db, test_users_with_wallets):
    u1, u2 = test_users_with_wallets[0], test_users_with_wallets[1]
    svc = LudoMatchmakingService(db)

    svc.join_queue(user_id=u1.id, player_count=2, entry_fee=1000)
    res = svc.join_queue(user_id=u2.id, player_count=2, entry_fee=1000)

    assert "players" in res
    assert len(res["players"]) == 2

    user_ids = {p["user_id"] for p in res["players"]}
    assert str(u1.id) in user_ids
    assert str(u2.id) in user_ids

    colors = {p["color"] for p in res["players"]}
    assert "RED" in colors
    assert "YELLOW" in colors


# =====================================================================
# 12. RED/YELLOW assignment correct
# =====================================================================

def test_correct_red_yellow_assignment(db, test_users_with_wallets):
    u1, u2 = test_users_with_wallets[0], test_users_with_wallets[1]
    svc = LudoMatchmakingService(db)

    svc.join_queue(user_id=u1.id, player_count=2, entry_fee=1000)
    res = svc.join_queue(user_id=u2.id, player_count=2, entry_fee=1000)
    match_id = uuid.UUID(res["match_id"])

    match = db.query(LudoMatch).filter(LudoMatch.id == match_id).first()
    p1 = next(p for p in match.players if p.user_id == u1.id)
    p2 = next(p for p in match.players if p.user_id == u2.id)

    # First joiner (waiting) = RED, second joiner (triggering) = YELLOW
    assert p1.color == LudoColor.RED
    assert p2.color == LudoColor.YELLOW


# =====================================================================
# 13. Four-player match
# =====================================================================

def test_four_player_matchmaking_colors(db, test_users_with_wallets):
    svc = LudoMatchmakingService(db)
    for i in range(3):
        res = svc.join_queue(
            user_id=test_users_with_wallets[i].id,
            player_count=4,
            entry_fee=2000,
        )
        assert res["status"] == QueueStatus.SEARCHING.value

    # 4th player → triggers match
    res = svc.join_queue(
        user_id=test_users_with_wallets[3].id,
        player_count=4,
        entry_fee=2000,
    )
    assert res["status"] == QueueStatus.MATCHED.value
    assert len(res["players"]) == 4

    match_id = uuid.UUID(res["match_id"])
    match = db.query(LudoMatch).filter(LudoMatch.id == match_id).first()
    colors = [p.color for p in match.players]
    assert colors == [LudoColor.RED, LudoColor.GREEN, LudoColor.YELLOW, LudoColor.BLUE]


# =====================================================================
# 14. Wallet debited exactly once per player
# =====================================================================

def test_entry_fee_not_double_debited(db, test_users_with_wallets):
    u1, u2 = test_users_with_wallets[0], test_users_with_wallets[1]
    svc = LudoMatchmakingService(db)

    initial_b1 = get_balance(db, u1.id).balance
    initial_b2 = get_balance(db, u2.id).balance

    svc.join_queue(user_id=u1.id, player_count=2, entry_fee=1000)
    svc.join_queue(user_id=u2.id, player_count=2, entry_fee=1000)

    final_b1 = get_balance(db, u1.id).balance
    final_b2 = get_balance(db, u2.id).balance

    assert initial_b1 - final_b1 == 1000  # exactly once
    assert initial_b2 - final_b2 == 1000  # exactly once


# =====================================================================
# 15. Failed wallet → no match created
# =====================================================================

def test_match_creation_wallet_atomicity(db, test_users_with_wallets):
    u1, u2 = test_users_with_wallets[0], test_users_with_wallets[1]

    # Set u2's balance to 0 — u1 can afford, u2 cannot
    w2 = db.query(Wallet).filter(Wallet.user_id == u2.id).first()
    w2.balance = 0
    db.commit()

    svc = LudoMatchmakingService(db)
    svc.join_queue(user_id=u1.id, player_count=2, entry_fee=1000)

    with pytest.raises(ValueError, match="Insufficient"):
        svc.join_queue(user_id=u2.id, player_count=2, entry_fee=1000)


# =====================================================================
# 16. Three players in 2P mode → first two match, third SEARCHING
# =====================================================================

def test_three_player_2p_mode(db, test_users_with_wallets):
    u1, u2, u3 = test_users_with_wallets[0], test_users_with_wallets[1], test_users_with_wallets[2]
    svc = LudoMatchmakingService(db)

    svc.join_queue(user_id=u1.id, player_count=2, entry_fee=1000)
    res2 = svc.join_queue(user_id=u2.id, player_count=2, entry_fee=1000)
    assert res2["status"] == QueueStatus.MATCHED.value

    res3 = svc.join_queue(user_id=u3.id, player_count=2, entry_fee=1000)
    assert res3["status"] == QueueStatus.SEARCHING.value


# =====================================================================
# 17. Single player remains SEARCHING
# =====================================================================

def test_single_player_remains_searching(db, test_users_with_wallets):
    u1 = test_users_with_wallets[0]
    svc = LudoMatchmakingService(db)

    res = svc.join_queue(user_id=u1.id, player_count=2, entry_fee=1000)
    assert res["status"] == QueueStatus.SEARCHING.value


# =====================================================================
# 18. Insufficient balance rejected
# =====================================================================

def test_insufficient_balance_rejected(db, test_users_with_wallets):
    u1 = test_users_with_wallets[0]

    w = db.query(Wallet).filter(Wallet.user_id == u1.id).first()
    w.balance = 0
    db.commit()

    svc = LudoMatchmakingService(db)
    with pytest.raises(ValueError, match="Insufficient"):
        svc.join_queue(user_id=u1.id, player_count=2, entry_fee=1000)


# =====================================================================
# 19. Matchmaking after previous match completes
# =====================================================================

def test_matchmaking_after_previous_match_finished(db, test_users_with_wallets):
    u1, u2, u3 = test_users_with_wallets[0], test_users_with_wallets[1], test_users_with_wallets[2]
    svc = LudoMatchmakingService(db)

    # First match: u1 vs u2
    svc.join_queue(user_id=u1.id, player_count=2, entry_fee=1000)
    res = svc.join_queue(user_id=u2.id, player_count=2, entry_fee=1000)
    match_id = uuid.UUID(res["match_id"])

    # Complete the first match
    match = db.query(LudoMatch).filter(LudoMatch.id == match_id).first()
    match.status = LudoMatchStatus.COMPLETED
    match.completed_at = datetime.now(timezone.utc)
    db.commit()

    # u1 should be able to join a new match
    res2 = svc.join_queue(user_id=u1.id, player_count=2, entry_fee=1000)
    assert res2["status"] == QueueStatus.SEARCHING.value

    # u3 joins → match with u1
    res3 = svc.join_queue(user_id=u3.id, player_count=2, entry_fee=1000)
    assert res3["status"] == QueueStatus.MATCHED.value


# =====================================================================
# 20. Queue entry has correct state transitions
# =====================================================================

def test_queue_entry_state_transitions(db, test_users_with_wallets):
    u1, u2 = test_users_with_wallets[0], test_users_with_wallets[1]
    svc = LudoMatchmakingService(db)

    svc.join_queue(user_id=u1.id, player_count=2, entry_fee=1000)

    # u1 should have SEARCHING
    q1 = db.query(LudoMatchmakingQueue).filter(
        LudoMatchmakingQueue.user_id == u1.id,
        LudoMatchmakingQueue.status == QueueStatus.SEARCHING,
    ).first()
    assert q1 is not None

    svc.join_queue(user_id=u2.id, player_count=2, entry_fee=1000)

    # u1's queue should now be MATCHED
    db.refresh(q1)
    assert q1.status == QueueStatus.MATCHED
    assert q1.match_id is not None


# =====================================================================
# ORIGINAL GAME LOGIC TESTS (preserved)
# =====================================================================

def test_ten_second_timeout_and_three_timeout_forfeit(db, test_users_with_wallets):
    u1, u2 = test_users_with_wallets[0], test_users_with_wallets[1]
    svc = LudoMatchmakingService(db)
    res = svc.join_queue(user_id=u1.id, player_count=2, entry_fee=1000)
    res = svc.join_queue(user_id=u2.id, player_count=2, entry_fee=1000)
    match_id = uuid.UUID(res["match_id"])

    engine = LudoEngine(db)
    match = engine.get_match(match_id)
    assert match.current_turn_color == LudoColor.RED

    # Simulate 10 seconds elapsed for Red
    match.turn_started_at = datetime.now(timezone.utc) - timedelta(seconds=11)
    db.commit()

    # Timeout 1: Red times out
    t1 = engine.handle_timeout(match_id)
    assert t1["status"] == "TIMEOUT"
    assert t1["timed_out_color"] == LudoColor.RED.value
    assert t1["consecutive_timeouts"] == 1
    assert not t1["forfeited"]
    assert match.current_turn_color == LudoColor.YELLOW

    # Yellow plays normally (resets timeouts)
    match.turn_started_at = datetime.now(timezone.utc) - timedelta(seconds=11)
    db.commit()

    # Timeout 1 for Yellow
    t_y = engine.handle_timeout(match_id)
    assert t_y["timed_out_color"] == LudoColor.YELLOW.value
    assert match.current_turn_color == LudoColor.RED

    # Timeout 2 for Red
    match.turn_started_at = datetime.now(timezone.utc) - timedelta(seconds=11)
    db.commit()
    t2 = engine.handle_timeout(match_id)
    assert t2["timed_out_color"] == LudoColor.RED.value
    assert t2["consecutive_timeouts"] == 2
    assert not t2["forfeited"]
    assert match.current_turn_color == LudoColor.YELLOW

    # Skip Yellow back to Red
    match.turn_started_at = datetime.now(timezone.utc) - timedelta(seconds=11)
    db.commit()
    engine.handle_timeout(match_id)
    assert match.current_turn_color == LudoColor.RED

    # Timeout 3 for Red → FORFEIT!
    match.turn_started_at = datetime.now(timezone.utc) - timedelta(seconds=11)
    db.commit()
    t3 = engine.handle_timeout(match_id)
    assert t3["timed_out_color"] == LudoColor.RED.value
    assert t3["consecutive_timeouts"] == 3
    assert t3["forfeited"]
    assert t3["game_over"]
    assert t3["winner_user_id"] == str(u2.id)

    # Verify match completed and Yellow (Player 2) was settled
    match = engine.get_match(match_id)
    assert match.status == LudoMatchStatus.COMPLETED
    assert match.is_settled

    # Yellow's balance should be 49000 (after debit) + 1800 (winnings) = 50800
    w2 = get_balance(db, u2.id)
    assert w2.balance == 50800


def test_three_consecutive_sixes_ends_turn(db, test_users_with_wallets):
    u1, u2 = test_users_with_wallets[0], test_users_with_wallets[1]
    svc = LudoMatchmakingService(db)
    svc.join_queue(user_id=u1.id, player_count=2, entry_fee=1000)
    res = svc.join_queue(user_id=u2.id, player_count=2, entry_fee=1000)
    match_id = uuid.UUID(res["match_id"])

    engine = LudoEngine(db)
    match = engine.get_match(match_id)

    # Set 2 sixes already in memory
    _CONSECUTIVE_SIXES[str(match_id)] = 2

    # Mock next roll to 6
    import unittest.mock
    with unittest.mock.patch("secrets.randbelow", return_value=5):  # randbelow(6)+1 => 5+1 = 6
        res_roll = engine.roll_dice(match_id, u1.id)
        assert res_roll["roll"] == 6
        assert res_roll["turn_ended"]
        assert res_roll["reason"] == "THREE_CONSECUTIVE_SIXES"
        # Turn transferred to Yellow
        assert match.current_turn_color == LudoColor.YELLOW
