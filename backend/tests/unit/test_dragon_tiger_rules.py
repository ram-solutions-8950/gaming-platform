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
    assert calculate_payout_gross(9500, "TIE", "TIE", payouts) == 104500
    custom = {"dragon": 1.0, "tiger": 1.0, "tie": 8.0}
    assert calculate_payout_gross(9500, "TIE", "TIE", custom) == 76000


def test_payout_dragon_and_tiger_from_config():
    payouts = {"dragon": "1.0", "tiger": "2.5", "tie": "11.0"}
    assert calculate_payout_gross(10000, "DRAGON", "DRAGON", payouts) == 10000
    assert calculate_payout_gross(10000, "TIGER", "TIGER", payouts) == 25000


def test_losing_bet_payout_is_zero():
    payouts = DEFAULT_CONFIG["payouts"]
    assert calculate_payout_gross(10000, "DRAGON", "TIGER", payouts) == 0


def test_payout_uses_decimal_rounding():
    payouts = {"dragon": Decimal("1.5"), "tiger": 1.0, "tie": 11.0}
    # 10001 * 1.5 = 15001.5 -> 15002 ROUND_HALF_UP
    assert calculate_payout_gross(10001, "DRAGON", "DRAGON", payouts) == 15002


def test_draw_cards_returns_two_unique_from_standard_deck():
    cards = draw_cards(count=2, deck_type="STANDARD_52_CARD")
    assert len(cards) == 2
    assert cards[0] != cards[1]
    for card in cards:
        rank, suit = card.split("-")
        assert rank in RANK_ORDER
        assert suit in ("S", "H", "D", "C")
