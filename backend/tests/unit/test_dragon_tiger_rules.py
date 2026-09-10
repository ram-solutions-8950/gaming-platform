from decimal import Decimal

from app.services.game_engines.dragon_tiger import calculate_payout_gross, DEFAULT_CONFIG
from app.services.game_engines.dragon_tiger_cards import determine_result, draw_cards, RANK_ORDER


def test_dragon_wins_when_rank_higher():
    assert determine_result("K-S", "7-H") == "DRAGON"


def test_tiger_wins_when_rank_higher():
    assert determine_result("4-D", "Q-C") == "TIGER"


def test_tie_when_ranks_equal():
    assert determine_result("9-S", "9-H") == "TIE"


def test_suit_does_not_affect_winner():
    assert determine_result("A-C", "A-S") == "TIE"
    assert determine_result("K-H", "Q-S") == "DRAGON"


def test_rank_order_ace_high():
    assert RANK_ORDER.index("A") > RANK_ORDER.index("K")
    assert determine_result("A-S", "K-S") == "DRAGON"


def test_payout_uses_configuration_not_hardcoded_tie():
    payouts = {"dragon": 1.0, "tiger": 1.0, "tie": 11.0}
    assert calculate_payout_gross(9500, "TIE", "TIE", payouts) == 114000
    custom = {"dragon": 1.0, "tiger": 1.0, "tie": 8.0}
    assert calculate_payout_gross(9500, "TIE", "TIE", custom) == 85500


def test_payout_dragon_and_tiger_from_config():
    payouts = {"dragon": "1.0", "tiger": "2.5", "tie": "11.0"}
    assert calculate_payout_gross(10000, "DRAGON", "DRAGON", payouts) == 20000
    assert calculate_payout_gross(10000, "TIGER", "TIGER", payouts) == 35000


def test_losing_bet_payout_is_zero():
    payouts = DEFAULT_CONFIG["payouts"]
    assert calculate_payout_gross(10000, "DRAGON", "TIGER", payouts) == 0


def test_payout_uses_decimal_rounding():
    payouts = {"dragon": Decimal("1.5"), "tiger": 1.0, "tie": 11.0}
    # 10001 + round(10001 * 1.5) = 10001 + 15002 = 25003 ROUND_HALF_UP
    assert calculate_payout_gross(10001, "DRAGON", "DRAGON", payouts) == 25003


def test_draw_cards_returns_two_unique_from_standard_deck():
    cards = draw_cards(count=2, deck_type="STANDARD_52_CARD")
    assert len(cards) == 2
    assert cards[0] != cards[1]
    for card in cards:
        rank, suit = card.split("-")
        assert rank in RANK_ORDER
        assert suit in ("S", "H", "D", "C")


def test_dragon_tiger_round_duration_defaults():
    from app.services.game_engines.dragon_tiger import merge_dragon_tiger_config
    from app.models.game_catalog import Game

    assert DEFAULT_CONFIG["round_duration_seconds"] == 18
    assert DEFAULT_CONFIG["betting_duration_seconds"] == 15

    dummy_game = Game(
        name="Dragon Tiger",
        slug="dragon-tiger",
        game_type="DRAGON_TIGER",
        min_bet=1000,
        max_bet=200000,
        config={"round_duration_seconds": 60, "betting_duration_seconds": 30},
    )
    cfg = merge_dragon_tiger_config(dummy_game)
    # Must be clamped to 18s total and 15s betting for prompt result delivery
    assert cfg["round_duration_seconds"] == 18
    assert cfg["betting_duration_seconds"] == 15

