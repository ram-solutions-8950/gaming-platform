"""Centralized Game Settlement & Winning Fee Service.

Reads authoritative Admin Fee Configuration (FeeConfiguration.winning_fee_percent)
from the database and applies it consistently across ALL games.

Formula:
    gross_profit = winning_profit (profit won above the original bet)
    winning_fee = round(gross_profit * winning_fee_percent / 100)
    net_profit = gross_profit - winning_fee
    total_return = original_bet + net_profit

Rules:
    - Losing bet: gross_profit <= 0 -> 0 fee, 0 total return.
    - Tie / Refund: return == original_bet, profit == 0 -> 0 fee, return == original_bet.
    - Winning bet: fee is deducted ONLY from gross profit, never from original stake.
    - Idempotent wallet crediting with complete audit ledger metadata.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from ..models.fee_configuration import FeeConfiguration
from ..models.transaction import WalletTransaction, WalletTransactionType
from ..services.wallet_service import credit_wallet

logger = logging.getLogger(__name__)


@dataclass
class SettlementCalculation:
    original_bet: int            # Original stake amount in paise
    gross_profit: int            # Winning profit before fee in paise
    winning_fee_percent: Decimal # Configured winning fee percentage
    winning_fee: int             # Calculated winning fee in paise
    net_profit: int              # Net profit after winning fee in paise
    total_return: int            # Total amount to credit to wallet (original_bet + net_profit)


def get_admin_winning_fee_percent(db: Session, game_slug: str | None = None) -> Decimal:
    """Read the authoritative winning fee percent from FeeConfiguration singleton in the DB.
    Checks per-game overrides first, then falls back to global winning_fee_percent."""
    cfg = db.query(FeeConfiguration).first()
    if not cfg:
        return Decimal("0.00")
    # Check per-game commission override
    if game_slug and cfg.game_commission_overrides:
        overrides = cfg.game_commission_overrides
        if isinstance(overrides, dict):
            target = game_slug.strip().lower().replace("_", "-")
            for k, v in overrides.items():
                if str(k).strip().lower().replace("_", "-") == target:
                    return Decimal(str(v))
    if cfg.winning_fee_percent is None:
        return Decimal("0.00")
    return Decimal(str(cfg.winning_fee_percent))


def calculate_winning_settlement(
    db: Session,
    original_bet: int,
    gross_profit: int,
    is_refund: bool = False,
    fee_percent_override: Optional[Decimal] = None,
    game_slug: Optional[str] = None,
) -> SettlementCalculation:
    """Calculate winning fee, net profit, and total return.

    Args:
        db: Database session to query current Admin FeeConfiguration.
        original_bet: The original bet/stake in paise.
        gross_profit: The profit won above original_bet in paise.
        is_refund: True if this is a refund / push returning the original stake with 0 profit.
        fee_percent_override: Optional override (e.g. for testing or explicit game config).
        game_slug: Optional game identifier to look up per-game commission overrides.

    Returns:
        SettlementCalculation dataclass.
    """
    if gross_profit <= 0:
        # Loss (total_return = 0) or refund (total_return = original_bet)
        return SettlementCalculation(
            original_bet=original_bet,
            gross_profit=0,
            winning_fee_percent=Decimal("0.00"),
            winning_fee=0,
            net_profit=0,
            total_return=original_bet if is_refund else 0,
        )

    pct = fee_percent_override if fee_percent_override is not None else get_admin_winning_fee_percent(db, game_slug=game_slug)

    if pct <= Decimal("0"):
        fee = 0
    else:
        fee_dec = (Decimal(gross_profit) * (pct / Decimal("100"))).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        fee = int(fee_dec)

    net_profit = max(0, gross_profit - fee)
    total_return = original_bet + net_profit

    return SettlementCalculation(
        original_bet=original_bet,
        gross_profit=gross_profit,
        winning_fee_percent=pct,
        winning_fee=fee,
        net_profit=net_profit,
        total_return=total_return,
    )


def settle_winning_bet(
    db: Session,
    user_id: UUID,
    original_bet: int,
    gross_profit: int,
    reference_type: str,
    reference_id: str,
    game_slug: str,
    is_refund: bool = False,
    metadata: Optional[dict] = None,
    fee_percent_override: Optional[Decimal] = None,
) -> tuple[SettlementCalculation, Optional[WalletTransaction]]:
    """Centralized settlement function: calculates net winning and credits wallet atomically.

    Guarantees:
        - Exactly one wallet transaction is generated.
        - Original bet is returned PLUS net winning profit.
        - Fee is accounted for in total_return, never double-deducted.
        - Transaction metadata records complete settlement ledger details.
    """
    calc = calculate_winning_settlement(
        db=db,
        original_bet=original_bet,
        gross_profit=gross_profit,
        is_refund=is_refund,
        fee_percent_override=fee_percent_override,
        game_slug=game_slug,
    )

    tx = None
    if calc.total_return > 0:
        ledger_metadata = {
            "game": game_slug,
            "original_bet": calc.original_bet,
            "gross_profit": calc.gross_profit,
            "winning_fee": calc.winning_fee,
            "winning_fee_percent": float(calc.winning_fee_percent),
            "net_profit": calc.net_profit,
            "total_return": calc.total_return,
            **(metadata or {}),
        }
        try:
            tx = credit_wallet(
                db=db,
                user_id=user_id,
                amount=calc.total_return,
                tx_type=WalletTransactionType.GAME_WIN,
                reference_type=reference_type,
                reference_id=reference_id,
                metadata=ledger_metadata,
            )
        except ValueError as exc:
            if "Duplicate transaction reference" in str(exc):
                logger.warning(
                    "Duplicate winning settlement ignored: %s/%s", reference_type, reference_id
                )
            else:
                raise

    # A refund/push returns the stake untouched, so it is not real play-through.
    # The stake was counted at GAME_ENTRY debit time, so undo it here.
    if is_refund and original_bet > 0:
        try:
            from .wager_service import reverse_wager
            reverse_wager(db, user_id, original_bet, game_slug or "unknown")
        except Exception as wager_exc:
            logger.warning("Failed to reverse wager: %s", wager_exc)

    return calc, tx
