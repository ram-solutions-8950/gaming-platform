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


def test_default_payouts_are_2x_dragon_tiger_10x_tie():
    assert DEFAULT_CONFIG["payouts"] == {"dragon": 2.0, "tiger": 2.0, "tie": 10.0}


def test_payout_uses_configuration_not_hardcoded_tie():
    payouts = {"dragon": 2.0, "tiger": 2.0, "tie": 10.0}
    assert calculate_payout_gross(9500, "TIE", "TIE", payouts) == 95000
    custom = {"dragon": 2.0, "tiger": 2.0, "tie": 8.0}
    assert calculate_payout_gross(9500, "TIE", "TIE", custom) == 76000


def test_payout_dragon_and_tiger_from_config():
    payouts = {"dragon": "2.0", "tiger": "3.0", "tie": "10.0"}
    assert calculate_payout_gross(10000, "DRAGON", "DRAGON", payouts) == 20000
    assert calculate_payout_gross(10000, "TIGER", "TIGER", payouts) == 30000


def test_losing_bet_payout_is_zero():
    payouts = DEFAULT_CONFIG["payouts"]
    assert calculate_payout_gross(10000, "DRAGON", "TIGER", payouts) == 0


def test_tie_bet_loses_when_result_is_dragon_or_tiger():
    payouts = DEFAULT_CONFIG["payouts"]
    assert calculate_payout_gross(10000, "TIE", "DRAGON", payouts) == 0
    assert calculate_payout_gross(10000, "TIE", "TIGER", payouts) == 0


def test_payout_uses_decimal_rounding():
    payouts = {"dragon": Decimal("1.5"), "tiger": 2.0, "tie": 10.0}
    # round(10001 * 1.5) = round(15001.5) = 15002 (ROUND_HALF_UP)
    assert calculate_payout_gross(10001, "DRAGON", "DRAGON", payouts) == 15002


def test_draw_cards_returns_two_unique_from_standard_deck():
    cards = draw_cards(count=2, deck_type="STANDARD_52_CARD")
    assert len(cards) == 2
    assert cards[0] != cards[1]
    for card in cards:
        rank, suit = card.split("-")
        assert rank in RANK_ORDER
        assert suit in ("S", "H", "D", "C")


# --- Explicit payout-multiplier requirements -------------------------------------------
# Multiplier semantics: total return INCLUDING stake, not profit added on top of stake.
# A winning Rs.100 (10000 paise) bet at 2x must return Rs.200 (20000 paise) total, never
# Rs.300 (which would happen if the stake were mistakenly added a second time).

def test_hundred_rupee_dragon_bet_returns_two_hundred_total():
    assert calculate_payout_gross(10000, "DRAGON", "DRAGON", DEFAULT_CONFIG["payouts"]) == 20000


def test_hundred_rupee_tiger_bet_returns_two_hundred_total():
    assert calculate_payout_gross(10000, "TIGER", "TIGER", DEFAULT_CONFIG["payouts"]) == 20000


def test_hundred_rupee_tie_bet_returns_thousand_total_at_10x():
    assert calculate_payout_gross(10000, "TIE", "TIE", DEFAULT_CONFIG["payouts"]) == 100000
