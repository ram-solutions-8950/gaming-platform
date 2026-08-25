from typing import List, Tuple, Dict
from itertools import combinations
from .cards import Card
from .hand_rank import HandCategory, HAND_CATEGORY_NAMES

class EvaluatedHand:
    def __init__(self, category: HandCategory, score_tuple: Tuple, best_five: List[Card], description: str):
        self.category = category
        self.score_tuple = score_tuple  # Compare hands with > or <
        self.best_five = best_five
        self.description = description

    def __lt__(self, other: 'EvaluatedHand') -> bool:
        return self.score_tuple < other.score_tuple

    def __eq__(self, other: 'EvaluatedHand') -> bool:
        return self.score_tuple == other.score_tuple

    def __gt__(self, other: 'EvaluatedHand') -> bool:
        return self.score_tuple > other.score_tuple

    def __ge__(self, other: 'EvaluatedHand') -> bool:
        return self.score_tuple >= other.score_tuple

    def __le__(self, other: 'EvaluatedHand') -> bool:
        return self.score_tuple <= other.score_tuple

    def to_dict(self):
        return {
            "category": self.category.name,
            "category_value": int(self.category),
            "description": self.description,
            "best_five": [c.to_str() for c in self.best_five],
        }

def evaluate_5card_hand(cards: List[Card]) -> EvaluatedHand:
    """Evaluates exactly 5 cards."""
    if len(cards) != 5:
        raise ValueError("evaluate_5card_hand expects exactly 5 cards")

    # Sort descending by rank
    sorted_cards = sorted(cards, key=lambda c: c.rank, reverse=True)
    ranks = [c.rank for c in sorted_cards]
    suits = [c.suit for c in sorted_cards]

    is_flush = len(set(suits)) == 1

    # Check for straight
    is_straight = False
    straight_high = 0

    # Normal straight check (e.g., 14,13,12,11,10 or 8,7,6,5,4)
    if ranks == list(range(ranks[0], ranks[0] - 5, -1)):
        is_straight = True
        straight_high = ranks[0]
    # Ace-low wheel straight check (A, 5, 4, 3, 2)
    elif ranks == [14, 5, 4, 3, 2]:
        is_straight = True
        straight_high = 5

    # Rank frequency map
    freq: Dict[int, int] = {}
    for r in ranks:
        freq[r] = freq.get(r, 0) + 1

    # Group by frequency descending, then by rank descending
    # Example: [4, 4, 4, 9, 9] -> groups: (3, 4), (2, 9)
    by_freq = sorted(freq.items(), key=lambda item: (item[1], item[0]), reverse=True)

    if is_flush and is_straight:
        if straight_high == 14:
            return EvaluatedHand(
                HandCategory.ROYAL_FLUSH,
                (int(HandCategory.ROYAL_FLUSH), 14),
                sorted_cards,
                "Royal Flush"
            )
        return EvaluatedHand(
            HandCategory.STRAIGHT_FLUSH,
            (int(HandCategory.STRAIGHT_FLUSH), straight_high),
            sorted_cards,
            f"Straight Flush, {straight_high} High"
        )

    if by_freq[0][1] == 4:
        four_rank = by_freq[0][0]
        kicker = by_freq[1][0]
        return EvaluatedHand(
            HandCategory.FOUR_OF_A_KIND,
            (int(HandCategory.FOUR_OF_A_KIND), four_rank, kicker),
            sorted_cards,
            f"Four of a Kind, {four_rank}s"
        )

    if by_freq[0][1] == 3 and by_freq[1][1] == 2:
        three_rank = by_freq[0][0]
        pair_rank = by_freq[1][0]
        return EvaluatedHand(
            HandCategory.FULL_HOUSE,
            (int(HandCategory.FULL_HOUSE), three_rank, pair_rank),
            sorted_cards,
            f"Full House, {three_rank}s full of {pair_rank}s"
        )

    if is_flush:
        return EvaluatedHand(
            HandCategory.FLUSH,
            (int(HandCategory.FLUSH), *ranks),
            sorted_cards,
            f"Flush, {ranks[0]} High"
        )

    if is_straight:
        return EvaluatedHand(
            HandCategory.STRAIGHT,
            (int(HandCategory.STRAIGHT), straight_high),
            sorted_cards,
            f"Straight, {straight_high} High"
        )

    if by_freq[0][1] == 3:
        three_rank = by_freq[0][0]
        kickers = [r for r in ranks if r != three_rank]
        return EvaluatedHand(
            HandCategory.THREE_OF_A_KIND,
            (int(HandCategory.THREE_OF_A_KIND), three_rank, *kickers),
            sorted_cards,
            f"Three of a Kind, {three_rank}s"
        )

    if by_freq[0][1] == 2 and by_freq[1][1] == 2:
        high_pair = max(by_freq[0][0], by_freq[1][0])
        low_pair = min(by_freq[0][0], by_freq[1][0])
        kicker = by_freq[2][0]
        return EvaluatedHand(
            HandCategory.TWO_PAIR,
            (int(HandCategory.TWO_PAIR), high_pair, low_pair, kicker),
            sorted_cards,
            f"Two Pair, {high_pair}s and {low_pair}s"
        )

    if by_freq[0][1] == 2:
        pair_rank = by_freq[0][0]
        kickers = [r for r in ranks if r != pair_rank]
        return EvaluatedHand(
            HandCategory.ONE_PAIR,
            (int(HandCategory.ONE_PAIR), pair_rank, *kickers),
            sorted_cards,
            f"One Pair of {pair_rank}s"
        )

    return EvaluatedHand(
        HandCategory.HIGH_CARD,
        (int(HandCategory.HIGH_CARD), *ranks),
        sorted_cards,
        f"High Card, {ranks[0]}"
    )

def evaluate_best_hand(cards: List[Card]) -> EvaluatedHand:
    """Evaluates the best 5-card hand from 5, 6, or 7 cards."""
    if len(cards) < 5:
        raise ValueError(f"Need at least 5 cards to evaluate hand, got {len(cards)}")

    best: EvaluatedHand = None
    for combo in combinations(cards, 5):
        hand = evaluate_5card_hand(list(combo))
        if best is None or hand > best:
            best = hand
    return best
