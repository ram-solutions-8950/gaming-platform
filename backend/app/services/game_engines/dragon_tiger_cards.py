"""Isolated card generation for Dragon Tiger.

Swap `draw_cards` later for an auditable RNG without changing settlement logic.

Outcome probabilities are a fixed, natural consequence of drawing 2 cards without
replacement from a standard 52-card deck (13 ranks x 4 suits) via a CSPRNG
(secrets.SystemRandom) — there is no dynamic weighting or profit-based manipulation
anywhere in this module or in DragonTigerEngine.settle_round(). Given any first card,
3 of the remaining 51 cards share its rank, so:
    P(TIE)            = 3/51 ~= 5.88%
    P(DRAGON or TIGER) = 48/51 ~= 94.12%, split evenly between DRAGON and TIGER by symmetry.
"""

from __future__ import annotations

import secrets
from typing import Callable, Optional, Sequence

RANK_ORDER = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]
SUITS = ["S", "H", "D", "C"]

CardDrawer = Callable[[int, str], Sequence[str]]


def build_deck(deck_type: str = "STANDARD_52_CARD") -> list[str]:
    if deck_type != "STANDARD_52_CARD":
        raise ValueError(f"Unsupported deck type: {deck_type}")
    return [f"{rank}-{suit}" for rank in RANK_ORDER for suit in SUITS]


def parse_rank(card: str) -> str:
    rank = card.split("-")[0]
    if rank not in RANK_ORDER:
        raise ValueError(f"Invalid card rank: {card}")
    return rank


def determine_result(dragon_card: str, tiger_card: str) -> str:
    """Winner is higher rank only. Suit is ignored."""
    d_i = RANK_ORDER.index(parse_rank(dragon_card))
    t_i = RANK_ORDER.index(parse_rank(tiger_card))
    if d_i > t_i:
        return "DRAGON"
    if t_i > d_i:
        return "TIGER"
    return "TIE"


def draw_cards(
    count: int = 2,
    deck_type: str = "STANDARD_52_CARD",
    rng: Optional[secrets.SystemRandom] = None,
) -> list[str]:
    """Server-side draw. Never accept client-supplied cards in production paths."""
    if count < 1:
        raise ValueError("Must draw at least one card")
    deck = build_deck(deck_type)
    if count > len(deck):
        raise ValueError("Cannot draw more cards than the deck contains")
    randomizer = rng or secrets.SystemRandom()
    drawn: list[str] = []
    for _ in range(count):
        idx = randomizer.randrange(len(deck))
        drawn.append(deck.pop(idx))
    return drawn
