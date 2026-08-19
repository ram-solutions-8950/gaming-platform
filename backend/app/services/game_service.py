"""
Game service — core business logic for the Colour Prediction Game.

All financial calculations use exact Decimal arithmetic, converting to paisa
at the end with deterministic ROUND_HALF_UP.
"""

import uuid
import secrets
from uuid import UUID
from typing import Optional, Tuple
from datetime import datetime, timezone, timedelta
from decimal import Decimal, ROUND_HALF_UP
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from ..models.game import (
    GameRound, GameRoundStatus, GameColor, GamePrediction, GameBetStatus, GameBet,
)
from ..models.fee_configuration import FeeConfiguration
from ..models.transaction import WalletTransactionType
from ..services.wallet_service import debit_wallet, credit_wallet
from ..utils.logging import get_logger

logger = get_logger("game")

ROUND_DURATION_SECONDS = 60
BETTING_WINDOW_SECONDS = 50

# ── Colour-prediction payout rules ──────────────────────────────────
# Each number 0-9 maps to one or more colors. Payouts are based on stake.
NUMBER_COLORS = {
    "0": [GameColor.RED, GameColor.VIOLET],
    "1": [GameColor.GREEN],
    "2": [GameColor.RED],
    "3": [GameColor.GREEN],
    "4": [GameColor.RED],
    "5": [GameColor.GREEN, GameColor.VIOLET],
    "6": [GameColor.RED],
    "7": [GameColor.GREEN],
    "8": [GameColor.RED],
    "9": [GameColor.GREEN],
}

# Multipliers applied to STAKE (not gross bet)
COLOR_MULTIPLIER = Decimal("2")       # RED or GREEN
VIOLET_MULTIPLIER = Decimal("4.5")    # VIOLET
NUMBER_MULTIPLIER = Decimal("9")      # exact number 0-9


def _get_fee_config(db: Session) -> Tuple[Decimal, Decimal]:
    """Return (entry_fee_percent, winning_fee_percent) from the singleton config."""
    cfg = db.query(FeeConfiguration).first()
    if not cfg:
        return Decimal("0"), Decimal("0")
    return Decimal(str(cfg.game_entry_fee_percent)), Decimal(str(cfg.winning_fee_percent))


def _calc_entry_fee(amount: int, pct: Decimal) -> Tuple[int, int]:
    """Calculate entry fee and stake from gross amount.

    Returns (entry_fee_paisa, stake_paisa).
    """
    amt = Decimal(amount)
    fee = (amt * (pct / Decimal("100"))).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    fee_int = int(fee)
    return fee_int, amount - fee_int


def _calc_winning(stake: int, prediction: GamePrediction, result_color: GameColor, result_number: str) -> int:
    """Compute gross winning for a single bet (before winning fee).

    Returns 0 if the bet lost.
    """
    stake_dec = Decimal(stake)

    # Number prediction (0-9)
    if prediction.value in [str(n) for n in range(10)]:
        if prediction.value == result_number:
            return int((stake_dec * NUMBER_MULTIPLIER).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        return 0

    # Color prediction
    result_colors = NUMBER_COLORS.get(result_number, [])
    if prediction.value == GameColor.VIOLET.value:
        if GameColor.VIOLET in result_colors:
            return int((stake_dec * VIOLET_MULTIPLIER).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        return 0

    # RED or GREEN
    if prediction.value == result_color.value:
        # If this number also has VIOLET, halve the color payout
        if GameColor.VIOLET in result_colors:
            multi = COLOR_MULTIPLIER / Decimal("2")  # 1x stake return
            return int((stake_dec * multi).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        return int((stake_dec * COLOR_MULTIPLIER).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    return 0


def _calc_winning_fee(gross_win: int, pct: Decimal) -> Tuple[int, int]:
    """Return (winning_fee_paisa, net_win_paisa)."""
    if gross_win <= 0:
        return 0, 0
    gw = Decimal(gross_win)
    fee = (gw * (pct / Decimal("100"))).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    fee_int = int(fee)
    return fee_int, gross_win - fee_int


# ── Public API ──────────────────────────────────────────────────────

def create_round(db: Session) -> GameRound:
    """Create a new round with BETTING status."""
    now = datetime.now(timezone.utc)
    game_round = GameRound(
        status=GameRoundStatus.BETTING,
        started_at=now,
        betting_closes_at=now + timedelta(seconds=BETTING_WINDOW_SECONDS),
    )
    db.add(game_round)
    db.commit()
    db.refresh(game_round)
    logger.info("Created round id=%s starts_at=%s", game_round.id, game_round.started_at)
    return game_round


def get_current_round(db: Session) -> Optional[GameRound]:
    """Return the most recent non-COMPLETED round, or the latest completed one as fallback."""
    game_round = (
        db.query(GameRound)
        .filter(GameRound.status.in_([GameRoundStatus.BETTING, GameRoundStatus.CALCULATING]))
        .order_by(GameRound.started_at.desc())
        .first()
    )
    return game_round


def get_round_history(db: Session, limit: int = 20) -> list:
    return (
        db.query(GameRound)
        .filter(GameRound.status == GameRoundStatus.COMPLETED)
        .order_by(GameRound.ended_at.desc())
        .limit(limit)
        .all()
    )


def place_bet(
    db: Session,
    user_id: UUID,
    round_id: UUID,
    prediction_str: str,
    amount: int,
) -> GameBet:
    """Atomically validate, calculate fees, debit wallet, and insert the bet.

    On any failure, the transaction rolls back — no wallet debit and no bet row remain.
    """
    if amount <= 0:
        raise ValueError("Bet amount must be positive")

    # Validate prediction
    try:
        prediction = GamePrediction(prediction_str)
    except ValueError:
        raise ValueError(f"Invalid prediction: {prediction_str}")

    # Lock the round to verify it is still in BETTING status
    game_round = (
        db.execute(
            select(GameRound).where(GameRound.id == round_id).with_for_update()
        ).scalar_one_or_none()
    )
    if not game_round:
        raise ValueError("Round not found")
    if game_round.status != GameRoundStatus.BETTING:
        raise ValueError("Betting is closed for this round")

    # Extra time check — authoritative server time
    now = datetime.now(timezone.utc)
    if now >= game_round.betting_closes_at:
        raise ValueError("Betting window has expired")

    # Fetch fee configuration (snapshot at bet time)
    entry_fee_pct, _ = _get_fee_config(db)
    entry_fee, stake = _calc_entry_fee(amount, entry_fee_pct)

    if stake <= 0:
        raise ValueError("Bet amount is too small to cover the entry fee")

    bet_id = uuid.uuid4()

    # Debit wallet (uses row lock + duplicate reference protection)
    debit_wallet(
        db,
        user_id=user_id,
        amount=amount,
        tx_type=WalletTransactionType.GAME_ENTRY,
        reference_type="game_bet",
        reference_id=str(bet_id),
        metadata={"round_id": str(round_id), "prediction": prediction_str, "entry_fee": entry_fee, "stake": stake},
    )

    bet = GameBet(
        id=bet_id,
        user_id=user_id,
        round_id=round_id,
        prediction=prediction,
        amount=amount,
        entry_fee_amount=entry_fee,
        stake_amount=stake,
        status=GameBetStatus.PENDING,
    )
    db.add(bet)
    db.commit()
    db.refresh(bet)
    logger.info("Bet placed id=%s user=%s round=%s prediction=%s amount=%s fee=%s stake=%s",
                bet.id, user_id, round_id, prediction_str, amount, entry_fee, stake)
    return bet


def settle_round(db: Session, round_id: UUID) -> GameRound:
    """Idempotently settle a round: generate result, calculate payouts, credit winners.

    If the round is already COMPLETED, return it without doing anything.
    """
    # Lock the round row
    game_round = (
        db.execute(
            select(GameRound).where(GameRound.id == round_id).with_for_update()
        ).scalar_one_or_none()
    )
    if not game_round:
        raise ValueError("Round not found")

    # Idempotent: already settled
    if game_round.status == GameRoundStatus.COMPLETED:
        logger.info("Round %s already settled — skipping", round_id)
        return game_round

    if game_round.status not in (GameRoundStatus.BETTING, GameRoundStatus.CALCULATING):
        raise ValueError(f"Cannot settle round in status {game_round.status.value}")

    # ── Generate result using cryptographically secure RNG ──
    result_number = str(secrets.randbelow(10))  # "0" to "9"
    result_colors = NUMBER_COLORS[result_number]
    # Primary color is RED or GREEN (the non-VIOLET one, or the first one)
    primary_color = next((c for c in result_colors if c != GameColor.VIOLET), result_colors[0])

    game_round.result_color = primary_color
    game_round.result_number = result_number
    game_round.status = GameRoundStatus.COMPLETED
    game_round.ended_at = datetime.now(timezone.utc)

    # ── Fetch fee config (snapshot) ──
    _, winning_fee_pct = _get_fee_config(db)

    # ── Settle bets ──
    bets = (
        db.query(GameBet)
        .filter(GameBet.round_id == round_id, GameBet.status == GameBetStatus.PENDING)
        .all()
    )

    for bet in bets:
        gross_win = _calc_winning(bet.stake_amount, bet.prediction, primary_color, result_number)
        if gross_win > 0:
            w_fee, net_win = _calc_winning_fee(gross_win, winning_fee_pct)
            bet.gross_win_amount = gross_win
            bet.winning_fee_amount = w_fee
            bet.net_win_amount = net_win
            bet.status = GameBetStatus.WON
            bet.settled_at = game_round.ended_at

            # Credit the winner — idempotent via reference uniqueness
            credit_wallet(
                db,
                user_id=bet.user_id,
                amount=net_win,
                tx_type=WalletTransactionType.GAME_WIN,
                reference_type="game_win",
                reference_id=str(bet.id),
                metadata={
                    "round_id": str(round_id),
                    "gross_win": gross_win,
                    "winning_fee": w_fee,
                    "net_win": net_win,
                },
            )
        else:
            bet.gross_win_amount = 0
            bet.winning_fee_amount = 0
            bet.net_win_amount = 0
            bet.status = GameBetStatus.LOST
            bet.settled_at = game_round.ended_at

    db.commit()
    db.refresh(game_round)
    logger.info("Settled round id=%s result_color=%s result_number=%s bets=%d",
                round_id, primary_color.value, result_number, len(bets))
    return game_round


def lock_round_for_calculation(db: Session, round_id: UUID) -> GameRound:
    """Transition a BETTING round to CALCULATING status."""
    game_round = (
        db.execute(
            select(GameRound).where(GameRound.id == round_id).with_for_update()
        ).scalar_one_or_none()
    )
    if not game_round:
        raise ValueError("Round not found")
    if game_round.status != GameRoundStatus.BETTING:
        return game_round  # Already transitioned, idempotent
    game_round.status = GameRoundStatus.CALCULATING
    db.commit()
    db.refresh(game_round)
    logger.info("Round %s transitioned to CALCULATING", round_id)
    return game_round


def get_user_bets(db: Session, user_id: UUID, page: int = 1, page_size: int = 20) -> dict:
    query = db.query(GameBet).filter(GameBet.user_id == user_id)
    total = query.count()
    items = query.order_by(GameBet.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"total": total, "page": page, "page_size": page_size, "items": items}


def get_round_bets_summary(db: Session, round_id: UUID) -> dict:
    """Aggregate statistics for a round — used by admin."""
    total_bets = db.query(func.count(GameBet.id)).filter(GameBet.round_id == round_id).scalar() or 0
    total_amount = db.query(func.coalesce(func.sum(GameBet.amount), 0)).filter(GameBet.round_id == round_id).scalar()
    return {"total_bets": total_bets, "total_amount": total_amount}


def get_admin_rounds(db: Session, page: int = 1, page_size: int = 20) -> dict:
    query = db.query(GameRound)
    total = query.count()
    items = query.order_by(GameRound.started_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"total": total, "page": page, "page_size": page_size, "items": items}


def get_admin_bets(db: Session, round_id: Optional[UUID] = None, page: int = 1, page_size: int = 20) -> dict:
    query = db.query(GameBet)
    if round_id:
        query = query.filter(GameBet.round_id == round_id)
    total = query.count()
    items = query.order_by(GameBet.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"total": total, "page": page, "page_size": page_size, "items": items}
