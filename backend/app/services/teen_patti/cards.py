"""
Teen Patti Card representation and deck operations.
"""
from __future__ import annotations

import hashlib
import hmac
import random
import secrets
from dataclasses import dataclass
from typing import List


SUITS = ("S", "H", "D", "C")
SUIT_SYMBOLS = {"S": "\u2660", "H": "\u2665", "D": "\u2666", "C": "\u2663"}


def rank_label(rank: int) -> str:
    return {14: "A", 13: "K", 12: "Q", 11: "J"}.get(rank, str(rank))


@dataclass(frozen=True)
class Card:
    rank: int  # 2..14 (Ace high)
    suit: str  # 'S','H','D','C'

    @property
    def code(self) -> str:
        return f"{rank_label(self.rank)}{self.suit}"

    def __repr__(self) -> str:
        return self.code


def fresh_deck() -> List[Card]:
    return [Card(r, s) for s in SUITS for r in range(2, 15)]


def new_server_seed() -> str:
    return secrets.token_hex(32)


def server_seed_hash(server_seed: str) -> str:
    return hashlib.sha256(server_seed.encode()).hexdigest()


def derive_seed(server_seed: str, client_seed: str, nonce: int) -> int:
    msg = f"{client_seed}:{nonce}".encode()
    digest = hmac.new(server_seed.encode(), msg, hashlib.sha256).digest()
    return int.from_bytes(digest[:8], "big")


def shuffled_deck(rng: random.Random) -> List[Card]:
    d = fresh_deck()
    rng.shuffle(d)
    return d
