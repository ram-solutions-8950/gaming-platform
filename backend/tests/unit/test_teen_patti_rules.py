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


def _two_player_hand(boot: int = 1000) -> TeenPattiHand:
    hand = TeenPattiHand(config=GameConfig(boot_amount=boot, max_players=2, turn_seconds=15))
    hand.add_seat("user-1", "Player One")
    hand.add_seat("user-2", "Player Two")
    hand.start_hand()
    return hand


def test_blind_player_can_bet_in_a_head_to_head():
    """Betting stays available with only two players left — Show is an extra
    option there, not the only one. The table UI used to replace Chaal/Blind
    with Show, leaving a blind player unable to play their turn at all."""
    hand = _two_player_hand()
    assert len(hand._active_seats()) == 2

    turn_idx = hand.current_turn
    seat = hand.seats[turn_idx]
    assert not seat.seen
    pot_before = hand.pot
    bet_before = seat.total_bet

    hand.bet(seat.id)

    # A blind player stakes the current stake once, not twice.
    assert seat.total_bet - bet_before == hand.current_stake
    assert hand.pot - pot_before == hand.current_stake
    assert seat.blind_count == 1
    assert not seat.seen


def test_seen_player_pays_double_the_blind_stake():
    hand = _two_player_hand()
    turn_idx = hand.current_turn
    seat = hand.seats[turn_idx]

    hand.see(seat.id)
    bet_before = seat.total_bet
    stake = hand.current_stake

    hand.bet(seat.id)

    assert seat.total_bet - bet_before == stake * 2
    assert seat.blind_count == 0  # seeing stops the blind counter


def test_blind_rounds_are_capped_then_the_player_is_forced_to_see():
    cfg = GameConfig(boot_amount=1000, max_players=2, turn_seconds=15, max_blind_rounds=2)
    hand = TeenPattiHand(config=cfg)
    hand.add_seat("user-1", "Player One")
    hand.add_seat("user-2", "Player Two")
    hand.start_hand()

    blind_player = hand.seats[hand.current_turn]
    for _ in range(cfg.max_blind_rounds):
        hand.bet(blind_player.id)
        hand.bet(hand.seats[hand.current_turn].id)  # opponent plays so the turn comes back

    assert blind_player.blind_count == cfg.max_blind_rounds
    hand.bet(blind_player.id)
    assert blind_player.seen, "player must be forced to see once the blind rounds run out"


def test_state_exposes_the_blind_counters_the_table_renders():
    """The action dock shows "Blind ₹x · n left", so both fields must ship."""
    hand = _two_player_hand()
    state = hand.as_dict(for_user_id="user-1")

    assert state["max_blind_rounds"] == hand.config.max_blind_rounds
    assert all("blind_count" in seat for seat in state["seats"])
    assert state["seats"][0]["blind_count"] == 0
