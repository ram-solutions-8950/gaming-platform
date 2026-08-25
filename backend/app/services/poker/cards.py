import random
from typing import List, Tuple

# Ranks: 2 to 14 (14 = Ace, 13 = King, 12 = Queen, 11 = Jack, 10 = 10, ...)
RANK_SYMBOLS = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
    10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A'
}

SYMBOL_TO_RANK = {v: k for k, v in RANK_SYMBOLS.items()}

SUITS = ['S', 'H', 'D', 'C']  # Spades, Hearts, Diamonds, Clubs
SUIT_SYMBOLS = {'S': '♠', 'H': '♥', 'D': '♦', 'C': '♣'}

class Card:
    def __init__(self, rank: int, suit: str):
        if rank < 2 or rank > 14:
            raise ValueError(f"Invalid rank: {rank}")
        if suit.upper() not in SUITS:
            raise ValueError(f"Invalid suit: {suit}")
        self.rank = rank
        self.suit = suit.upper()

    @classmethod
    def from_str(cls, card_str: str) -> 'Card':
        """Parses strings like 'AH', '10D', '2S', 'KC'."""
        card_str = card_str.strip().upper()
        suit = card_str[-1]
        rank_str = card_str[:-1]
        if rank_str not in SYMBOL_TO_RANK:
            raise ValueError(f"Invalid card string: {card_str}")
        return cls(SYMBOL_TO_RANK[rank_str], suit)

    def to_str(self) -> str:
        return f"{RANK_SYMBOLS[self.rank]}{self.suit}"

    def __repr__(self) -> str:
        return self.to_str()

    def __eq__(self, other) -> bool:
        if isinstance(other, Card):
            return self.rank == other.rank and self.suit == other.suit
        return False

    def __hash__(self) -> int:
        return hash((self.rank, self.suit))

class Deck:
    def __init__(self):
        self.cards: List[Card] = [Card(r, s) for s in SUITS for r in range(2, 15)]

    def shuffle(self) -> None:
        # Cryptographically secure random shuffle
        sys_rand = random.SystemRandom()
        sys_rand.shuffle(self.cards)

    def deal(self, n: int = 1) -> List[Card]:
        if len(self.cards) < n:
            raise ValueError("Not enough cards remaining in deck")
        dealt = self.cards[:n]
        self.cards = self.cards[n:]
        return dealt
