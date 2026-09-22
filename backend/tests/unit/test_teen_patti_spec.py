"""Teen Patti rules, verified against the written specification.

Section numbers refer to the supplied rules document.
"""

import pytest

from app.services.teen_patti.cards import Card, fresh_deck
from app.services.teen_patti.engine import (
    GameConfig,
    Phase,
    PlayerStatus,
    TeenPattiHand,
    TIE_RULE_HOUSE,
    TIE_RULE_SPLIT,
)
from app.services.teen_patti.hand_rank import (
    CATEGORY_NAMES,
    DEFAULT_SEQUENCE_RULES,
    HandCategory,
    SequenceRules,
    evaluate_hand,
)

S, H, D, C = "S", "H", "D", "C"


def hand(*spec):
    """hand((14, S), (13, S), (12, S)) -> list[Card]"""
    return [Card(rank=r, suit=su) for r, su in spec]


TRAIL_ACES = hand((14, S), (14, H), (14, D))
TRAIL_TWOS = hand((2, S), (2, H), (2, D))
PURE_SEQ_789 = hand((7, S), (8, S), (9, S))
SEQ_789 = hand((7, S), (8, H), (9, C))
COLOR_A83 = hand((14, S), (8, S), (3, S))
PAIR_KINGS = hand((13, S), (13, H), (7, C))
HIGH_CARD_A94 = hand((14, S), (9, H), (4, C))


# ═══ §2 Deck ═════════════════════════════════════════════════════════════

def test_deck_is_52_unique_cards_across_four_suits():
    deck = fresh_deck()
    assert len(deck) == 52
    assert len({(c.rank, c.suit) for c in deck}) == 52
    assert {c.suit for c in deck} == {S, H, D, C}
    assert sorted({c.rank for c in deck}) == list(range(2, 15))


def test_each_suit_has_thirteen_cards():
    deck = fresh_deck()
    for suit in (S, H, D, C):
        assert sum(1 for c in deck if c.suit == suit) == 13


# ═══ §12 Hand rankings, strongest to weakest ═════════════════════════════

def test_categories_are_detected():
    cases = [
        (TRAIL_ACES, HandCategory.TRAIL, "Trail"),
        (PURE_SEQ_789, HandCategory.PURE_SEQUENCE, "Pure Sequence"),
        (SEQ_789, HandCategory.SEQUENCE, "Sequence"),
        (COLOR_A83, HandCategory.COLOR, "Color"),
        (PAIR_KINGS, HandCategory.PAIR, "Pair"),
        (HIGH_CARD_A94, HandCategory.HIGH_CARD, "High Card"),
    ]
    for cards, category, name in cases:
        rank = evaluate_hand(cards)
        assert rank.category == category, name
        assert CATEGORY_NAMES[rank.category] == name


def test_ranking_order_is_trail_down_to_high_card():
    ordered = [
        TRAIL_ACES, PURE_SEQ_789, SEQ_789, COLOR_A83, PAIR_KINGS, HIGH_CARD_A94,
    ]
    ranks = [evaluate_hand(c) for c in ordered]
    for stronger, weaker in zip(ranks, ranks[1:]):
        assert stronger > weaker


def test_trail_beats_pure_sequence():
    """§1: the worked example — a Trail outranks a straight flush."""
    assert evaluate_hand(TRAIL_TWOS) > evaluate_hand(hand((14, S), (13, S), (12, S)))


def test_trails_rank_by_card():
    assert evaluate_hand(TRAIL_ACES) > evaluate_hand(hand((13, S), (13, H), (13, D)))
    assert evaluate_hand(hand((13, S), (13, H), (13, D))) > evaluate_hand(TRAIL_TWOS)


def test_same_suit_and_consecutive_is_pure_not_plain_sequence():
    assert evaluate_hand(PURE_SEQ_789).category == HandCategory.PURE_SEQUENCE
    assert evaluate_hand(SEQ_789).category == HandCategory.SEQUENCE


def test_same_suit_but_not_consecutive_is_colour():
    assert evaluate_hand(COLOR_A83).category == HandCategory.COLOR


# ═══ §14-§17 Tie breaking ════════════════════════════════════════════════

def test_higher_pair_wins():
    """§14: pair of Kings beats pair of Queens even with a lower kicker."""
    kings = hand((13, S), (13, H), (5, C))
    queens = hand((12, S), (12, H), (14, C))
    assert evaluate_hand(kings) > evaluate_hand(queens)


def test_equal_pairs_are_split_by_the_kicker():
    """§15."""
    seven = hand((13, S), (13, H), (7, C))
    five = hand((13, D), (13, C), (5, S))
    assert evaluate_hand(seven) > evaluate_hand(five)


def test_pair_is_detected_whichever_position_it_sits_in():
    for cards in (
        hand((13, S), (13, H), (7, C)),
        hand((7, C), (13, S), (13, H)),
        hand((13, S), (7, C), (13, H)),
    ):
        rank = evaluate_hand(cards)
        assert rank.category == HandCategory.PAIR
        assert rank.tiebreakers == (13, 7)


def test_high_card_compares_downwards():
    """§16: A-K-7 beats A-K-5."""
    assert evaluate_hand(hand((14, S), (13, H), (7, C))) > evaluate_hand(
        hand((14, D), (13, C), (5, S))
    )


def test_colour_compares_downwards():
    """§17: A-9-4 of a suit beats A-8-7 of a suit."""
    assert evaluate_hand(hand((14, S), (9, S), (4, S))) > evaluate_hand(
        hand((14, H), (8, H), (7, H))
    )


def test_identical_sequences_of_different_suits_tie():
    """§18."""
    a = hand((7, S), (8, H), (9, D))
    b = hand((7, D), (8, C), (9, H))
    assert evaluate_hand(a) == evaluate_hand(b)
    assert not evaluate_hand(a) > evaluate_hand(b)


# ═══ §30 A-2-3 and A-K-Q, explicitly configurable ════════════════════════

def test_ace_runs_are_both_recognised_by_default():
    assert evaluate_hand(hand((14, S), (13, H), (12, D))).category == HandCategory.SEQUENCE
    assert evaluate_hand(hand((14, S), (2, H), (3, D))).category == HandCategory.SEQUENCE


def test_default_ranks_a23_as_the_weakest_run():
    """This platform's convention; §30 only requires that it be configurable."""
    a23 = evaluate_hand(hand((14, S), (2, H), (3, D)))
    lowest_natural = evaluate_hand(hand((4, S), (3, H), (2, D)))
    kqj = evaluate_hand(hand((13, S), (12, H), (11, D)))
    akq = evaluate_hand(hand((14, S), (13, H), (12, D)))
    assert a23.category == HandCategory.SEQUENCE
    assert akq > kqj > lowest_natural > a23


def test_a23_can_be_configured_as_the_second_strongest_run():
    rules = SequenceRules(ace_low_ranks_high=True)
    akq = evaluate_hand(hand((14, S), (13, H), (12, D)), rules)
    a23 = evaluate_hand(hand((14, S), (2, H), (3, D)), rules)
    kqj = evaluate_hand(hand((13, S), (12, H), (11, D)), rules)
    assert akq > a23 > kqj


def test_a23_can_be_disabled_entirely():
    rules = SequenceRules(ace_low_sequence=False)
    assert evaluate_hand(hand((14, S), (2, H), (3, D)), rules).category == HandCategory.HIGH_CARD
    # Same suit and it is a colour, not a pure sequence.
    assert evaluate_hand(hand((14, S), (2, S), (3, S)), rules).category == HandCategory.COLOR


def test_akq_can_be_disabled_entirely():
    rules = SequenceRules(ace_high_sequence=False)
    assert evaluate_hand(hand((14, S), (13, H), (12, D)), rules).category == HandCategory.HIGH_CARD


def test_ace_runs_are_pure_when_suited():
    assert evaluate_hand(hand((14, S), (2, S), (3, S))).category == HandCategory.PURE_SEQUENCE
    assert evaluate_hand(hand((14, H), (13, H), (12, H))).category == HandCategory.PURE_SEQUENCE


def test_k_a_2_is_not_a_run():
    """The ace bridges only at the ends, never wrapping around."""
    assert evaluate_hand(hand((13, S), (14, H), (2, D))).category == HandCategory.HIGH_CARD


def test_q_k_a_is_the_same_run_as_a_k_q():
    assert evaluate_hand(hand((12, D), (13, H), (14, S))) == evaluate_hand(
        hand((14, S), (13, H), (12, D))
    )


# ═══ §26 Card model ══════════════════════════════════════════════════════

def test_hand_must_hold_exactly_three_cards():
    with pytest.raises(ValueError):
        evaluate_hand(hand((14, S), (13, S)))
    with pytest.raises(ValueError):
        evaluate_hand(hand((14, S), (13, S), (12, S), (11, S)))


# ═══ §3-§4 Boot collection and the deal ══════════════════════════════════

def _table(players=4, **cfg):
    config = GameConfig(boot_amount=10, max_players=players, **cfg)
    h = TeenPattiHand(config=config)
    for i in range(players):
        h.add_seat(f"p{i}", f"Player {i}")
    return h


def test_boot_is_collected_from_every_player_into_the_pot():
    """§3: 4 players x Rs 10 boot -> pot of Rs 40."""
    h = _table(4)
    h.start_hand()
    assert h.pot == 40
    assert all(s.total_bet == 10 for s in h.seats)


def test_every_player_is_dealt_three_distinct_cards():
    """§4."""
    h = _table(4)
    h.start_hand()
    dealt = []
    for s in h.seats:
        assert len(s.cards) == 3
        dealt.extend((c.rank, c.suit) for c in s.cards)
    assert len(set(dealt)) == len(dealt)  # no card dealt twice


def test_a_hand_needs_at_least_two_players():
    h = _table(1)
    with pytest.raises(Exception):
        h.start_hand()


# ═══ §5 Blind vs seen ════════════════════════════════════════════════════

def test_players_start_blind_and_turn_seen_on_request():
    """§5."""
    h = _table(2)
    h.start_hand()
    assert all(not s.seen for s in h.seats)
    h.see("p0")
    assert h.seats[0].seen is True
    assert h.seats[1].seen is False


def test_seen_player_pays_double_a_blind_player():
    """§9-§10: a seen chaal costs twice the blind chaal."""
    h = _table(2)
    h.start_hand()
    first = h.current_turn
    blind_bet = h.bet(h.seats[first].id)["amount"]

    h2 = _table(2)
    h2.start_hand()
    first2 = h2.current_turn
    h2.see(h2.seats[first2].id)
    seen_bet = h2.bet(h2.seats[first2].id)["amount"]

    assert seen_bet == blind_bet * 2


def test_a_blind_player_is_forced_to_see_after_the_cap():
    h = _table(2, max_blind_rounds=2)
    h.start_hand()
    me = h.seats[h.current_turn].id
    for _ in range(2):
        h.bet(me)
        h.bet(h.seats[h.current_turn].id)  # opponent acts
    assert h.seats[[i for i, s in enumerate(h.seats) if s.id == me][0]].blind_count == 2
    h.bet(me)
    idx = [i for i, s in enumerate(h.seats) if s.id == me][0]
    assert h.seats[idx].seen is True


# ═══ §6 Turn order skips packed players ══════════════════════════════════

def test_packed_players_are_skipped_in_the_turn_order():
    """§6: P2 folds, so the order becomes P1 -> P3 -> P4 -> P1."""
    h = _table(4)
    h.start_hand()
    h.current_turn = 0

    h.bet("p0")
    assert h.current_turn == 1
    h.pack("p1")
    assert h.seats[1].status == PlayerStatus.PACKED
    assert h.current_turn == 2

    h.bet("p2")
    assert h.current_turn == 3
    h.bet("p3")
    assert h.current_turn == 0  # wraps past the packed seat


def test_a_packed_player_cannot_keep_acting():
    h = _table(3)
    h.start_hand()
    h.current_turn = 0
    h.pack("p0")
    with pytest.raises(Exception):
        h.bet("p0")


def test_last_player_standing_wins_without_a_show():
    """§11."""
    h = _table(3)
    h.start_hand()
    h.current_turn = 0
    pot_before = h.pot
    h.pack("p0")
    h.pack("p1")
    assert h.phase == Phase.FINISHED
    assert h.winner_seat == 2
    assert h.winner_seats == [2]
    assert h.pot == pot_before


# ═══ §8 Pot accumulation ═════════════════════════════════════════════════

def test_pot_grows_by_every_chaal():
    """§22."""
    h = _table(4)
    h.start_hand()
    h.current_turn = 0
    expected = h.pot
    for seat in range(4):
        amount = h.bet(f"p{seat}")["amount"]
        expected += amount
    assert h.pot == expected
    assert h.pot == sum(s.total_bet for s in h.seats)


def test_raising_doubles_the_stake():
    h = _table(2)
    h.start_hand()
    stake_before = h.current_stake
    h.bet(h.seats[h.current_turn].id, raise_=True)
    assert h.current_stake == stake_before * 2


def test_max_stake_caps_a_raise():
    h = _table(2, max_stake=15)
    h.start_hand()
    for _ in range(5):
        h.bet(h.seats[h.current_turn].id, raise_=True)
    assert h.current_stake == 15


def test_pot_limit_caps_the_pot():
    """pot_limit is honoured rather than silently ignored."""
    h = _table(2, pot_limit=100)
    h.start_hand()
    for _ in range(20):
        if h.phase != Phase.PLAYING:
            break
        h.bet(h.seats[h.current_turn].id)
    assert h.pot <= 100
    assert h.pot_limit_reached is True


# ═══ §19 Show ════════════════════════════════════════════════════════════

def test_show_requires_exactly_two_players_left():
    """§21."""
    h = _table(4)
    h.start_hand()
    h.current_turn = 0
    with pytest.raises(Exception):
        h.show("p0")


def test_show_pays_the_stronger_hand():
    h = _table(2)
    h.start_hand()
    h.seats[0].cards = hand((14, S), (14, H), (14, D))   # Trail
    h.seats[1].cards = hand((13, S), (12, S), (11, S))   # Pure sequence
    h.current_turn = 0
    result = h.show("p0")
    assert result["winner_seat"] == 0
    assert h.winner_seats == [0]
    assert h.seats[0].status == PlayerStatus.SHOW_WINNER
    assert h.seats[1].status == PlayerStatus.SHOW_LOSER


def test_show_reveals_both_hands():
    h = _table(2)
    h.start_hand()
    h.current_turn = 0
    h.show("p0")
    assert all(s.show_cards for s in h.seats)


# ═══ §18 Tie handling ════════════════════════════════════════════════════

def test_identical_hands_go_to_the_house_by_default():
    """This platform's shipped convention; §18 leaves the choice open."""
    h = _table(2)
    h.start_hand()
    h.seats[0].cards = hand((7, S), (8, H), (9, D))
    h.seats[1].cards = hand((7, D), (8, C), (9, H))
    h.current_turn = 0
    result = h.show("p0")
    assert result["split"] is False
    assert result["winner_seats"] == []
    assert h.winner_seat is None
    assert all(s.status == PlayerStatus.SHOW_LOSER for s in h.seats)


def test_a_table_may_instead_split_a_tied_pot():
    h = _table(2, tie_rule=TIE_RULE_SPLIT)
    h.start_hand()
    h.seats[0].cards = hand((7, S), (8, H), (9, D))
    h.seats[1].cards = hand((7, D), (8, C), (9, H))
    h.current_turn = 0
    result = h.show("p0")
    assert result["split"] is True
    assert sorted(result["winner_seats"]) == [0, 1]
    assert all(s.status == PlayerStatus.SHOW_WINNER for s in h.seats)


def test_house_sweep_is_off_unless_a_table_opts_in():
    """The published rules always pay the stronger hand."""
    for _ in range(40):
        h = _table(2)
        h.start_hand()
        assert h.double_loss_round is False


def test_house_sweep_fires_when_configured():
    h = _table(2, house_sweep_probability=1.0)
    h.start_hand()
    assert h.double_loss_round is True


# ═══ §20 Side show ═══════════════════════════════════════════════════════

def test_side_show_requires_the_requester_to_be_seen():
    h = _table(3)
    h.start_hand()
    h.current_turn = 1
    with pytest.raises(Exception):
        h.side_show("p1")


def test_side_show_requires_a_seen_player_before_you():
    h = _table(3)
    h.start_hand()
    h.current_turn = 1
    h.see("p1")
    # p0 has not seen their cards, so there is nobody to compare with.
    with pytest.raises(Exception):
        h.side_show("p1")


def test_accepted_side_show_eliminates_the_weaker_hand():
    h = _table(3)
    h.start_hand()
    h.see("p0")
    h.see("p1")
    h.seats[0].cards = hand((2, S), (7, H), (9, D))    # weak
    h.seats[1].cards = hand((14, S), (14, H), (14, D))  # trail
    h.current_turn = 1
    result = h.side_show("p1", accept=True)
    assert result["accepted"] is True
    assert result["loser_seat"] == 0
    assert h.seats[0].status == PlayerStatus.LOST_SIDE_SHOW


def test_declined_side_show_keeps_both_players_in():
    h = _table(3)
    h.start_hand()
    h.see("p0")
    h.see("p1")
    h.current_turn = 1
    result = h.side_show("p1", accept=False)
    assert result["accepted"] is False
    assert h.seats[0].status == PlayerStatus.ACTIVE
    assert h.seats[1].status == PlayerStatus.ACTIVE


def test_side_show_costs_a_seen_chaal():
    h = _table(3)
    h.start_hand()
    h.see("p0")
    h.see("p1")
    h.current_turn = 1
    pot_before = h.pot
    h.side_show("p1", accept=False)
    assert h.pot == pot_before + h.current_stake * 2
