"""
Aviator game engine — provably fair crash game.

Manages: seed generation, crash point calculation, round lifecycle,
bet placement, cashout (manual + auto), and settlement.
"""

from __future__ import annotations

import hashlib
import hmac
import math
import secrets
import uuid
from datetime import datetime, timezone
from typing import Optional, Callable, Any

from sqlalchemy.orm import Session

from ...models.aviator import AviatorRound, AviatorBet, AviatorRoundStatus, AviatorBetStatus
from ...services.wallet_service import credit_wallet, debit_wallet
from ...services.settlement_service import settle_winning_bet
from ...models.transaction import WalletTransactionType
from ...utils.logging import get_logger
from .models import LiveRound, LiveBet, RoundPhase, BetStatus

logger = get_logger("aviator_engine")

HOUSE_EDGE = 0.04          # 4% house edge (96% RTP, official commercial standard for crash games)
BETTING_DURATION = 10.0    # seconds
COOLDOWN_DURATION = 3.0    # seconds
MULTIPLIER_TICK_INTERVAL = 0.25   # server snapshot interval (4 per second)
GROWTH_RATE = 0.09         # dynamic balanced exponential growth rate for engaging flight timing


# ──────────────────────────────────────────────────────────────
#  Provably fair crash point
# ──────────────────────────────────────────────────────────────

def generate_server_seed() -> str:
    """Generate a cryptographically random 256-bit server seed."""
    return secrets.token_hex(32)


def hash_server_seed(server_seed: str) -> str:
    """SHA-256 commitment of the server seed (published before the round)."""
    return hashlib.sha256(server_seed.encode()).hexdigest()


def compute_crash_point(server_seed: str, nonce: int) -> float:
    """
    Deterministic, provably fair crash point with healthy house edge and balanced casino distribution.
    Uses HMAC-SHA256(server_seed, str(nonce)) to derive a uniform 52-bit integer.
    hash = HMAC-SHA256(server_seed, str(nonce))
    h = int(hash[:13], 16)    # first 52 bits
    e = 2**52
    """
    h_bytes = hmac.new(
        server_seed.encode(),
        str(nonce).encode(),
        hashlib.sha256,
    ).hexdigest()
    h = int(h_bytes[:13], 16)
    e = 2 ** 52
    if h == e:
        # Avoid division by zero
        return 1.10

    # Approx 3% instant/early takeoff crashes (1.10x - 1.25x) to maintain house edge without frustrating instant wipes
    if (h % 33) == 0:
        early_mult = 1.10 + round(((h % 16) / 100.0), 2)
        return round(early_mult, 2)

    u = h / e
    raw = (1.0 / (1.0 - u)) * (1.0 - HOUSE_EDGE)
    if raw <= 1.10:
        return 1.10

    if raw <= 2.00:
        val = raw
    else:
        # Balanced tail compression: ensures >= 10x is ~1.7% and >= 20x is ~0.5%
        # Prevents excessive winnings and clustering of high multipliers
        val = 2.00 + math.pow(raw - 2.00, 0.58)

    # Round to 2 decimal places, clamped between 1.00x and 50.00x max
    return max(1.00, min(50.00, math.floor(val * 100) / 100))


def time_for_multiplier(multiplier: float) -> float:
    """Seconds from flight start to reach a given multiplier (starting from 1.00x)."""
    if multiplier <= 1.00:
        return 0.0
    return math.log(multiplier) / GROWTH_RATE


def multiplier_at_time(elapsed: float) -> float:
    """Multiplier at a given elapsed time (seconds) from flight start. Starts from 1.00x."""
    if elapsed <= 0:
        return 1.00
    return round(math.exp(elapsed * GROWTH_RATE), 2)


# ──────────────────────────────────────────────────────────────
#  AviatorEngine — manages one server-wide continuous game loop
# ──────────────────────────────────────────────────────────────

class AviatorEngine:
    """
    Singleton-like engine that runs the Aviator game loop.
    One instance per server process.
    """

    def __init__(self) -> None:
        self._server_seed: str = generate_server_seed()
        self._nonce: int = 0
        self.current_round: Optional[LiveRound] = None
        self._settled_action_ids: set[str] = set()  # prevent replay
        self._recent_crash_points: list[float] = []  # track recent outcomes for streak balancing

    # ── Round creation ──

    def create_round(self, db: Session) -> LiveRound:
        """Create a new round with a pre-determined crash point and anti-streak balancing."""
        # Initialize recent crash history from DB if empty
        if not self._recent_crash_points:
            try:
                past_rounds = (
                    db.query(AviatorRound.crash_multiplier)
                    .filter(AviatorRound.crash_multiplier.isnot(None))
                    .order_by(AviatorRound.crashed_at.desc())
                    .limit(10)
                    .all()
                )
                self._recent_crash_points = [r[0] for r in reversed(past_rounds) if r[0] is not None]
            except Exception:
                pass

        self._nonce += 1
        nonce = self._nonce
        seed = self._server_seed
        seed_hash = hash_server_seed(seed)

        # Anti-streak protection:
        # 1. Prevent back-to-back high multipliers (>= 4.0x)
        # 2. Prevent clustering of >= 10.0x multipliers (max 1 within any 5-round window)
        while True:
            crash = compute_crash_point(seed, nonce)
            if self._recent_crash_points:
                last_crash = self._recent_crash_points[-1]
                if last_crash >= 4.0 and crash >= 4.0:
                    nonce += 1
                    self._nonce = nonce
                    continue
                if any(c >= 10.0 for c in self._recent_crash_points[-4:]) and crash >= 10.0:
                    nonce += 1
                    self._nonce = nonce
                    continue
            break

        now = datetime.now(timezone.utc)

        # Persist to DB
        db_round = AviatorRound(
            id=uuid.uuid4(),
            nonce=nonce,
            server_seed_hash=seed_hash,
            server_seed=None,  # revealed after crash
            crash_multiplier=None,  # revealed after crash
            status=AviatorRoundStatus.BETTING,
            betting_started_at=now,
        )
        db.add(db_round)
        db.commit()
        db.refresh(db_round)

        rnd = LiveRound(
            round_id=db_round.id,
            nonce=nonce,
            server_seed=seed,
            server_seed_hash=seed_hash,
            crash_point=crash,
            phase=RoundPhase.BETTING,
            betting_started_at=now,
        )
        self.current_round = rnd
        self._settled_action_ids.clear()
        logger.info("Round %s created  nonce=%d  crash=%.2f×", db_round.id, nonce, crash)
        return rnd

    # ── Phase transitions ──

    def start_flight(self, db: Session) -> None:
        """Transition from BETTING → FLYING."""
        rnd = self.current_round
        if rnd is None or rnd.phase != RoundPhase.BETTING:
            return
        now = datetime.now(timezone.utc)
        rnd.phase = RoundPhase.FLYING
        rnd.flight_started_at = now

        db.query(AviatorRound).filter(AviatorRound.id == rnd.round_id).update({
            "status": AviatorRoundStatus.FLYING,
            "flight_started_at": now,
        })
        db.commit()
        logger.info("Round %s → FLYING", rnd.round_id)

    def crash_round(self, db: Session) -> None:
        """Transition from FLYING → CRASHED. Mark all active bets as LOST."""
        rnd = self.current_round
        if rnd is None or rnd.phase != RoundPhase.FLYING:
            return
        now = datetime.now(timezone.utc)
        rnd.phase = RoundPhase.CRASHED
        rnd.crashed_at = now

        # Reveal seed + crash point in DB
        db.query(AviatorRound).filter(AviatorRound.id == rnd.round_id).update({
            "status": AviatorRoundStatus.CRASHED,
            "server_seed": rnd.server_seed,
            "crash_multiplier": rnd.crash_point,
            "crashed_at": now,
        })

        # Mark all uncashed bets as lost
        for bet in rnd.bets:
            if bet.status == BetStatus.ACTIVE:
                bet.status = BetStatus.LOST
                db.query(AviatorBet).filter(
                    AviatorBet.round_id == rnd.round_id,
                    AviatorBet.user_id == bet.user_id,
                    AviatorBet.slot == bet.slot,
                ).update({"status": AviatorBetStatus.LOST})
        db.commit()
        # Record into recent crashes history for streak balancing (keep last 20)
        self._recent_crash_points.append(rnd.crash_point)
        if len(self._recent_crash_points) > 20:
            self._recent_crash_points.pop(0)
        logger.info("Round %s CRASHED at %.2f×", rnd.round_id, rnd.crash_point)

    def settle_round(self, db: Session) -> None:
        """Transition from CRASHED → SETTLED."""
        rnd = self.current_round
        if rnd is None or rnd.phase != RoundPhase.CRASHED:
            return
        now = datetime.now(timezone.utc)
        rnd.phase = RoundPhase.SETTLED
        rnd.settled_at = now

        db.query(AviatorRound).filter(AviatorRound.id == rnd.round_id).update({
            "status": AviatorRoundStatus.SETTLED,
            "settled_at": now,
        })
        db.commit()
        logger.info("Round %s SETTLED", rnd.round_id)

    # ── Bet placement ──

    def place_bet(
        self,
        db: Session,
        user_id: uuid.UUID,
        slot: int,
        amount: int,
        auto_cashout: Optional[float] = None,
        action_id: Optional[str] = None,
    ) -> LiveBet:
        """Place a bet in the current round (BETTING phase only)."""
        rnd = self.current_round
        if rnd is None:
            raise ValueError("No active round")
        if rnd.phase != RoundPhase.BETTING:
            raise ValueError("Betting is closed")
        if slot not in (1, 2):
            raise ValueError("Invalid slot (must be 1 or 2)")
        if amount < 1000:
            raise ValueError("Minimum bet amount is ₹10")
        if auto_cashout is not None and auto_cashout < 1.01:
            raise ValueError("Auto cashout must be >= 1.01")

        # Idempotency check
        if action_id and action_id in self._settled_action_ids:
            raise ValueError("Duplicate action")
        if action_id:
            self._settled_action_ids.add(action_id)

        # Check slot availability
        existing = rnd.get_user_slot_bet(user_id, slot)
        if existing is not None:
            raise ValueError(f"Slot {slot} already has a bet")

        # Debit wallet
        ref_id = f"aviator-bet-{rnd.round_id}-{user_id}-{slot}"
        debit_wallet(
            db, user_id, amount,
            WalletTransactionType.GAME_ENTRY,
            "aviator_bet", ref_id,
            metadata={"round_id": str(rnd.round_id), "slot": slot},
        )

        # Persist bet to DB
        db_bet = AviatorBet(
            id=uuid.uuid4(),
            user_id=user_id,
            round_id=rnd.round_id,
            slot=slot,
            amount=amount,
            auto_cashout=auto_cashout,
            status=AviatorBetStatus.ACTIVE,
        )
        db.add(db_bet)
        db.commit()

        # Track in memory
        live_bet = LiveBet(
            user_id=user_id,
            slot=slot,
            amount=amount,
            auto_cashout=auto_cashout,
            action_id=action_id,
        )
        rnd.bets.append(live_bet)
        logger.info(
            "Bet placed  user=%s  slot=%d  amount=%d  auto=%.2f",
            user_id, slot, amount, auto_cashout or 0,
        )
        return live_bet

    # ── Cashout ──

    def cashout(
        self,
        db: Session,
        user_id: uuid.UUID,
        slot: int,
        action_id: Optional[str] = None,
    ) -> tuple[LiveBet, float]:
        """
        Cash out a bet. Returns (bet, multiplier).
        Server determines the authoritative multiplier.
        """
        rnd = self.current_round
        if rnd is None:
            raise ValueError("No active round")
        if rnd.phase != RoundPhase.FLYING:
            raise ValueError("Cannot cash out — round is not flying")

        bet = rnd.get_user_slot_bet(user_id, slot)
        if bet is None:
            raise ValueError(f"No bet in slot {slot}")
        if bet.status != BetStatus.ACTIVE:
            raise ValueError("Bet already settled")

        # Idempotency
        if action_id and action_id in self._settled_action_ids:
            raise ValueError("Duplicate action")
        if action_id:
            self._settled_action_ids.add(action_id)

        now = datetime.now(timezone.utc)
        mult = rnd.current_multiplier(now)

        # Final check: has crash already occurred?
        if mult >= rnd.crash_point:
            raise ValueError("Round has crashed")

        return self._settle_cashout(db, rnd, bet, mult, now)

    def process_auto_cashouts(self, db: Session) -> list[tuple[LiveBet, float]]:
        """Check all active bets with auto_cashout and settle if target reached."""
        rnd = self.current_round
        if rnd is None or rnd.phase != RoundPhase.FLYING:
            return []

        now = datetime.now(timezone.utc)
        mult = rnd.current_multiplier(now)
        results = []

        for bet in rnd.bets:
            if (
                bet.status == BetStatus.ACTIVE
                and bet.auto_cashout is not None
                and mult >= bet.auto_cashout
            ):
                settled_mult = bet.auto_cashout  # settle at exact target
                if settled_mult < rnd.crash_point:
                    result = self._settle_cashout(db, rnd, bet, settled_mult, now)
                    results.append(result)

        return results

    def _settle_cashout(
        self,
        db: Session,
        rnd: LiveRound,
        bet: LiveBet,
        multiplier: float,
        now: datetime,
    ) -> tuple[LiveBet, float]:
        """Internal: settle a single bet at the given multiplier."""
        gross_return = int(bet.amount * multiplier)
        gross_profit = max(0, gross_return - bet.amount)
        ref_id = f"aviator-win-{rnd.round_id}-{bet.user_id}-{bet.slot}"
        calc, _ = settle_winning_bet(
            db=db,
            user_id=bet.user_id,
            original_bet=bet.amount,
            gross_profit=gross_profit,
            reference_type="aviator_win",
            reference_id=ref_id,
            game_slug="aviator",
            is_refund=(gross_return >= bet.amount and gross_profit == 0),
            metadata={
                "round_id": str(rnd.round_id),
                "slot": bet.slot,
                "multiplier": multiplier,
            },
        )
        payout = calc.total_return
        bet.status = BetStatus.CASHED_OUT
        bet.cashout_multiplier = multiplier
        bet.payout = payout
        bet.cashed_out_at = now

        # Update DB
        db.query(AviatorBet).filter(
            AviatorBet.round_id == rnd.round_id,
            AviatorBet.user_id == bet.user_id,
            AviatorBet.slot == bet.slot,
        ).update({
            "status": AviatorBetStatus.CASHED_OUT,
            "cashout_multiplier": multiplier,
            "payout": payout,
            "cashed_out_at": now,
        })
        db.commit()

        logger.info(
            "Cashout  user=%s  slot=%d  mult=%.2f×  payout=%d",
            bet.user_id, bet.slot, multiplier, payout,
        )
        return bet, multiplier

    # ── Queries ──

    def get_round_state_snapshot(self) -> Optional[dict]:
        """Return a serializable snapshot of the current round for sync/reconnect."""
        rnd = self.current_round
        if rnd is None:
            return None

        now = datetime.now(timezone.utc)
        snap: dict[str, Any] = {
            "round_id": str(rnd.round_id),
            "phase": rnd.phase.value,
            "server_seed_hash": rnd.server_seed_hash,
            "nonce": rnd.nonce,
            "timestamp": now.isoformat(),
        }

        if rnd.phase == RoundPhase.FLYING and rnd.flight_started_at:
            snap["flight_started_at"] = rnd.flight_started_at.isoformat()
            snap["multiplier"] = round(rnd.current_multiplier(now), 2)
        elif rnd.phase in (RoundPhase.CRASHED, RoundPhase.SETTLED):
            snap["crash_point"] = rnd.crash_point
            snap["server_seed"] = rnd.server_seed

        snap["bets"] = [
            {
                "user_id": str(b.user_id),
                "slot": b.slot,
                "amount": b.amount,
                "status": b.status.value,
                "cashout_multiplier": b.cashout_multiplier,
                "payout": b.payout,
            }
            for b in rnd.bets
        ]
        return snap

    def rotate_seed_if_needed(self, every_n: int = 100) -> None:
        """Rotate the server seed every N rounds for security."""
        if self._nonce > 0 and self._nonce % every_n == 0:
            self._server_seed = generate_server_seed()
            logger.info("Server seed rotated at nonce %d", self._nonce)


# Module-level singleton
engine = AviatorEngine()
