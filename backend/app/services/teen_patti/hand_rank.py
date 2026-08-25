"""
Teen Patti hand ranking evaluation.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum
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


def _seq_high(ranks_sorted_desc: List[int]) -> int:
    r = ranks_sorted_desc
    if r == [14, 3, 2]:
        return 3
    if r[0] - r[1] == 1 and r[1] - r[2] == 1:
        return r[0]
    return 0


def evaluate_hand(cards: List[Card]) -> HandRank:
    if len(cards) != 3:
        raise ValueError(f"Teen Patti hand requires exactly 3 cards, got {len(cards)}")

    ranks = sorted([c.rank for c in cards], reverse=True)
    is_flush = (cards[0].suit == cards[1].suit == cards[2].suit)
    seq_hi = _seq_high(ranks)

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


def category_of(cards: List[Card]) -> str:
    return CATEGORY_NAMES[evaluate_hand(cards).category]
