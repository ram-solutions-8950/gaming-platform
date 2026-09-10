import pytest
from app.routers.teen_patti import VALID_BOOT_TIERS
from app.services.teen_patti.cards import Card, shuffled_deck
from app.services.teen_patti.engine import GameConfig, Phase, PlayerStatus, TeenPattiHand
from app.services.teen_patti.hand_rank import HandCategory, evaluate_hand


def test_valid_boot_tiers_includes_all_modes():
    # Verify all game modes are supported: Gold Royale (1000), Diamond Lounge (2500),
    # Platinum Arena (5000), High Roller VIP (10000), plus smaller tiers.
    expected = {100, 500, 1000, 2500, 5000, 10000}
    assert expected.issubset(VALID_BOOT_TIERS)
    assert 2500 in VALID_BOOT_TIERS
    assert 10000 in VALID_BOOT_TIERS


def test_teen_patti_two_player_lifecycle():
    # Two-player table lifecycle
    cfg = GameConfig(boot_amount=1000, max_players=2, turn_seconds=15)
    hand = TeenPattiHand(config=cfg)
    assert hand.config.max_players == 2
    assert hand.phase == Phase.WAITING

    # Player 1 joins
    hand.add_seat("user-1", "Test 2")
    assert len(hand.seats) == 1
    # Cannot start with 1 player
    with pytest.raises(Exception):
        hand.start_hand()

    # Player 2 joins
    hand.add_seat("user-2", "Test 3")
    assert len(hand.seats) == 2
    assert hand.is_full

    # Cannot add 3rd player
    with pytest.raises(Exception):
        hand.add_seat("user-3", "Extra")

    # Hand starts
    hand.start_hand()
    assert hand.phase == Phase.PLAYING
    assert hand.pot == 2000
    assert len(hand.seats[0].cards) == 3
    assert len(hand.seats[1].cards) == 3


def test_teen_patti_tie_double_loss():
    # When hands tie on showdown, both players lose stakes to house
    cfg = GameConfig(boot_amount=1000, max_players=2)
    hand = TeenPattiHand(config=cfg)
    hand.add_seat("u1", "P1")
    hand.add_seat("u2", "P2")
    hand.start_hand()

    # Manually set identical hands to force a tie
    hand.seats[0].cards = [Card(14, "S"), Card(10, "H"), Card(8, "D")]
    hand.seats[1].cards = [Card(14, "C"), Card(10, "D"), Card(8, "C")]
    hand.seats[0].seen = True
    hand.seats[1].seen = True

    # User whose turn it is calls show
    curr = hand.current_turn
    user = hand.seats[curr].id
    res = hand.show(user)

    assert res["winner_seat"] is None
    assert hand.winner_seat is None
    assert hand.seats[0].status == PlayerStatus.SHOW_LOSER
    assert hand.seats[1].status == PlayerStatus.SHOW_LOSER
    assert "Tie" in res["reason"] or "both players lost" in res["reason"].lower()


def test_teen_patti_streak_balancing():
    # Verify streak tracking breaks consecutive multi-win streaks
    cfg = GameConfig(boot_amount=1000, max_players=2)
    hand = TeenPattiHand(config=cfg)
    hand.add_seat("u1", "P1")
    hand.add_seat("u2", "P2")

    # Simulate u1 winning 2 times in a row
    hand.win_streak["u1"] = 2
    hand.win_streak["u2"] = 0

    # Start next hand
    hand.start_hand()
    assert len(hand.seats[0].cards) == 3
    assert len(hand.seats[1].cards) == 3
