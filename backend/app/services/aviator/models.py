"""
In-memory dataclasses for Aviator round and bet state management.
These are NOT database models — they track the live state of a running round.
"""

from __future__ import annotations
import enum
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
from uuid import UUID


class RoundPhase(str, enum.Enum):
    BETTING = "BETTING"
    FLYING = "FLYING"
    CRASHED = "CRASHED"
    SETTLED = "SETTLED"
    COOLDOWN = "COOLDOWN"


class BetStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"            # placed, flying
    CASHED_OUT = "CASHED_OUT"    # player cashed out
    LOST = "LOST"                # round crashed, not cashed out


@dataclass
class LiveBet:
    """A single in-memory bet for the current round."""
    user_id: UUID
    slot: int                     # 1 or 2
    amount: int                   # paise
    auto_cashout: Optional[float] = None  # target multiplier or None
    status: BetStatus = BetStatus.ACTIVE
    cashout_multiplier: Optional[float] = None
    payout: int = 0
    action_id: Optional[str] = None       # idempotency key
    cashed_out_at: Optional[datetime] = None


@dataclass
class LiveRound:
    """In-memory state of a single Aviator round."""
    round_id: UUID
    nonce: int
    server_seed: str
    server_seed_hash: str
    crash_point: float           # pre-determined
    phase: RoundPhase = RoundPhase.BETTING
    bets: list[LiveBet] = field(default_factory=list)
    flight_started_at: Optional[datetime] = None
    betting_started_at: Optional[datetime] = None
    crashed_at: Optional[datetime] = None
    settled_at: Optional[datetime] = None

    def current_multiplier(self, now: datetime) -> float:
        """
        Calculate current multiplier based on elapsed flight time.
        Uses exponential growth: mult = e^(t * growth_rate)
        where growth_rate is tuned so a 10× crash ≈ 23 seconds.
        """
        if self.phase != RoundPhase.FLYING or self.flight_started_at is None:
            return 1.0
        elapsed = (now - self.flight_started_at).total_seconds()
        if elapsed < 0:
            return 1.0
        import math
        # Growth rate: ln(10) / 23 ≈ 0.1  → reaches 10× at ~23s
        mult = math.exp(elapsed * 0.1)
        return min(mult, self.crash_point)

    def get_user_bets(self, user_id: UUID) -> list[LiveBet]:
        return [b for b in self.bets if b.user_id == user_id]

    def get_user_slot_bet(self, user_id: UUID, slot: int) -> Optional[LiveBet]:
        for b in self.bets:
            if b.user_id == user_id and b.slot == slot:
                return b
        return None
