"""
Teen Patti hand ranking evaluation.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum
from functools import total_ordering
from typing import List, Tuple

from .cards import Card


class HandCategory(IntEnum):
    HIGH_CARD = 0
    PAIR = 1
    COLOR = 2          # Flush
    SEQUENCE = 3       # Straight / Normal Run
    PURE_SEQUENCE = 4  # Straight Flush
    TRAIL = 5          # Trio / Set / 3 of a kind


CATEGORY_NAMES = {
    HandCategory.TRAIL: "Trail",
    HandCategory.PURE_SEQUENCE: "Pure Sequence",
    HandCategory.SEQUENCE: "Sequence",
    HandCategory.COLOR: "Color",
    HandCategory.PAIR: "Pair",
    HandCategory.HIGH_CARD: "High Card",
}


@total_ordering
@dataclass(frozen=True)
class HandRank:
    category: HandCategory
    tiebreakers: Tuple[int, ...]

    def __lt__(self, other: HandRank) -> bool:
        if self.category != other.category:
            return self.category < other.category
        return self.tiebreakers < other.tiebreakers

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, HandRank):
            return NotImplemented
        return self.category == other.category and self.tiebreakers == other.tiebreakers


@dataclass(frozen=True)
class SequenceRules:
    """Which ace sequences count, and how A-2-3 ranks against the others.

    Teen Patti variants disagree here, so nothing is hard-coded: a table
    supplies the ruleset it wants and the evaluator follows it.

    ``ace_low_ranks_high`` selects where A-2-3 sits. This platform ranks it as
    the weakest run (the default); setting it True adopts the other common
    convention, where A-2-3 is second only to A-K-Q.
    """

    ace_high_sequence: bool = True    # A-K-Q is a run
    ace_low_sequence: bool = True     # A-2-3 is a run
    ace_low_ranks_high: bool = False  # A-2-3 is the weakest run


DEFAULT_SEQUENCE_RULES = SequenceRules()

# Run strengths are held on a doubled scale so A-2-3 can be slotted between
# two adjacent natural runs (A-K-Q = 28, A-2-3 = 27, K-Q-J = 26) while every
# comparison stays plain integer arithmetic.
_SEQ_SCALE = 2
_ACE_LOW_HIGH_VALUE = 14 * _SEQ_SCALE - 1  # just below A-K-Q


def _seq_high(ranks_sorted_desc: List[int], rules: SequenceRules) -> int:
    """Strength of the run these ranks form, or 0 when they form none."""
    r = ranks_sorted_desc

    # A-2-3 — the ace plays low, so it is not consecutive by raw rank.
    if r == [14, 3, 2]:
        if not rules.ace_low_sequence:
            return 0
        return _ACE_LOW_HIGH_VALUE if rules.ace_low_ranks_high else 3 * _SEQ_SCALE

    if r[0] - r[1] == 1 and r[1] - r[2] == 1:
        # A-K-Q is the only run an ace can head.
        if r[0] == 14 and not rules.ace_high_sequence:
            return 0
        return r[0] * _SEQ_SCALE

    return 0


def evaluate_hand(
    cards: List[Card],
    rules: SequenceRules = DEFAULT_SEQUENCE_RULES,
) -> HandRank:
    if len(cards) != 3:
        raise ValueError(f"Teen Patti hand requires exactly 3 cards, got {len(cards)}")

    ranks = sorted([c.rank for c in cards], reverse=True)
    is_flush = (cards[0].suit == cards[1].suit == cards[2].suit)
    seq_hi = _seq_high(ranks, rules)

    # 1. Trail
    if ranks[0] == ranks[1] == ranks[2]:
        return HandRank(HandCategory.TRAIL, (ranks[0],))

    # 2. Pure Sequence
    if is_flush and seq_hi > 0:
        return HandRank(HandCategory.PURE_SEQUENCE, (seq_hi,))

    # 3. Sequence
    if seq_hi > 0:
        return HandRank(HandCategory.SEQUENCE, (seq_hi,))

    # 4. Color
    if is_flush:
        return HandRank(HandCategory.COLOR, tuple(ranks))

    # 5. Pair
    if ranks[0] == ranks[1]:
        return HandRank(HandCategory.PAIR, (ranks[0], ranks[2]))
    if ranks[1] == ranks[2]:
        return HandRank(HandCategory.PAIR, (ranks[1], ranks[0]))
    if ranks[0] == ranks[2]:
        return HandRank(HandCategory.PAIR, (ranks[0], ranks[1]))

    # 6. High Card
    return HandRank(HandCategory.HIGH_CARD, tuple(ranks))


def category_of(
    cards: List[Card],
    rules: SequenceRules = DEFAULT_SEQUENCE_RULES,
) -> str:
    return CATEGORY_NAMES[evaluate_hand(cards, rules).category]
