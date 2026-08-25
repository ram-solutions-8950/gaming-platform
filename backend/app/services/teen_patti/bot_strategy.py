"""
Teen Patti Bot Decision Trees.
"""
from __future__ import annotations

import random
from dataclasses import dataclass
from enum import Enum
from typing import Optional

from .cards import Card
from .hand_rank import HandCategory, evaluate_hand


class Action(str, Enum):
    CHAAL = "chaal"
    RAISE = "raise"
    PACK = "pack"
    SHOW = "show"
    SIDE_SHOW = "side_show"


@dataclass(frozen=True)
class Decision:
    action: Action


def decide_see(
    cards: list[Card],
    blind_count: int,
    pot: int,
    current_stake: int,
    rng: random.Random,
) -> bool:
    if blind_count >= 4:
        return True
    if blind_count == 0:
        return rng.random() < 0.25
    p_see = min(0.9, 0.25 + 0.2 * blind_count)
    return rng.random() < p_see


def decide_action(
    cards: list[Card],
    seen: bool,
    active_count: int,
    can_side_show: bool,
    can_show: bool,
    current_stake: int,
    pot: int,
    rng: random.Random,
) -> Action:
    if can_show:
        return Action.SHOW

    if not seen:
        p_raise = 0.25 if pot > 5 * current_stake else 0.15
        if rng.random() < p_raise:
            return Action.RAISE
        return Action.CHAAL

    rank = evaluate_hand(cards)
    cat = rank.category

    if cat == HandCategory.HIGH_CARD:
        high = rank.tiebreakers[0]
        if high < 11:
            return Action.PACK
        if rng.random() < 0.55:
            return Action.PACK
        if can_side_show and rng.random() < 0.4:
            return Action.SIDE_SHOW
        return Action.CHAAL

    if cat == HandCategory.PAIR:
        pair_rank = rank.tiebreakers[0]
        if can_side_show and pair_rank < 8 and rng.random() < 0.45:
            return Action.SIDE_SHOW
        p_raise = 0.2 if pair_rank < 10 else 0.45
        if rng.random() < p_raise:
            return Action.RAISE
        return Action.CHAAL

    if cat in (HandCategory.COLOR, HandCategory.SEQUENCE):
        if rng.random() < 0.6:
            return Action.RAISE
        return Action.CHAAL

    # Pure Sequence / Trail
    if rng.random() < 0.85:
        return Action.RAISE
    return Action.CHAAL


def decide_side_show_response(
    cards: list[Card],
    seen: bool,
    rng: random.Random,
) -> bool:
    if not seen:
        return True
    cat = evaluate_hand(cards).category
    if cat == HandCategory.HIGH_CARD:
        return rng.random() < 0.3
    return True
