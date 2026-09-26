"""
Unit tests for Chicken Road game schemas and bet constraints.
"""
import pytest
from pydantic import ValidationError
from app.routers.chicken_road import StartGameIn, DIFFICULTY_MULTIPLIERS, _advance
from app.models.chicken_road import ChickenRoadRound
import uuid

def test_start_game_allowed_bets():
    """Verify standard bet options (10, 20, 50, 100) are valid."""
    for bet in [10, 20, 50, 100]:
        model = StartGameIn(bet_amount=bet, difficulty="MEDIUM")
        assert model.bet_amount == bet

def test_start_game_bet_exceeding_max_rejected():
    """Verify bet amount cannot increase beyond 100."""
    with pytest.raises(ValidationError):
        StartGameIn(bet_amount=101, difficulty="MEDIUM")

    with pytest.raises(ValidationError):
        StartGameIn(bet_amount=500, difficulty="MEDIUM")

def test_start_game_bet_below_min_rejected():
    """Verify bet amount below 10 is rejected."""
    with pytest.raises(ValidationError):
        StartGameIn(bet_amount=9, difficulty="MEDIUM")

    with pytest.raises(ValidationError):
        StartGameIn(bet_amount=0, difficulty="MEDIUM")

def test_difficulty_multipliers():
    """Verify multiplier arrays exist and are monotonic."""
    for diff in ["EASY", "MEDIUM", "HARD"]:
        assert diff in DIFFICULTY_MULTIPLIERS
        mults = DIFFICULTY_MULTIPLIERS[diff]
        assert len(mults) == 10
        # Multipliers should increase as chicken advances
        for i in range(len(mults) - 1):
            assert mults[i] < mults[i + 1]

def test_advance_stops_at_the_hit_lane():
    """Progress goes through the draw: the chicken never gets past its hit lane."""
    rnd = ChickenRoadRound(id=uuid.uuid4(), user_id=uuid.uuid4(), difficulty="MEDIUM",
                           multipliers=DIFFICULTY_MULTIPLIERS["MEDIUM"], bet_amount=10000,
                           hit_lane=4, current_lane=0, status="ACTIVE")
    assert _advance(rnd, 3) and rnd.current_lane == 3
    assert not _advance(rnd, 10)
    assert (rnd.status, rnd.lost_lane, rnd.current_lane) == ("LOST", 4, 3)
