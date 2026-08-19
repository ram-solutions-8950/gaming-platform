import uuid
from uuid import UUID
from typing import Optional
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from sqlalchemy.orm import Session
from ..models.withdrawal import Withdrawal, WithdrawalStatus
from ..models.wallet import Wallet
from ..models.transaction import WalletTransactionType
from ..models.fee_configuration import FeeConfiguration
from ..services.wallet_service import debit_wallet, credit_wallet
from ..utils.logging import get_logger

logger = get_logger("withdrawal")


def create_withdrawal(
    db: Session,
    user_id: UUID,
    amount: int,
    method: str,
    destination: str,
    external_reference: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> Withdrawal:
    if amount <= 0:
        raise ValueError("Withdrawal amount must be strictly positive")

    norm_method = (method or "").strip().lower()
    if norm_method not in {"upi", "bank"}:
        raise ValueError("Withdrawal method must be 'upi' or 'bank'")

    norm_dest = (destination or "").strip()
    if not norm_dest:
        raise ValueError("Destination payment details are required")

    wallet = db.query(Wallet).filter(Wallet.user_id == user_id).first()
    if not wallet:
        raise ValueError("Wallet not found for user")

    # Fetch active fee configuration
    fee_config = db.query(FeeConfiguration).first()
    fee_percent = Decimal('0.00')
    if fee_config:
        fee_percent = Decimal(str(fee_config.withdrawal_fee_percent))
    
    # Calculate fee using exact arithmetic
    amount_dec = Decimal(amount)
    fee_dec = (amount_dec * (fee_percent / Decimal('100'))).quantize(Decimal('1'), rounding=ROUND_HALF_UP)
    fee_amount = int(fee_dec)
    net_amount = amount - fee_amount
    
    if net_amount <= 0:
        raise ValueError("Withdrawal amount is too small to cover the fee")

    withdrawal_id = uuid.uuid4()

    tx_metadata = {"method": norm_method, "fee_amount": fee_amount, "net_payout": net_amount}

    # Reserve funds immediately using existing debit_wallet (uses row lock & reference uniqueness check)
    debit_wallet(
        db,
        user_id=user_id,
        amount=amount,
        tx_type=WalletTransactionType.WITHDRAWAL,
        reference_type="withdrawal",
        reference_id=str(withdrawal_id),
        metadata=tx_metadata,
    )

    withdrawal = Withdrawal(
        id=withdrawal_id,
        user_id=user_id,
        wallet_id=wallet.id,
        amount=amount,
        fee_amount=fee_amount,
        net_amount=net_amount,
        status=WithdrawalStatus.PENDING,
        method=norm_method,
        destination=norm_dest,
        external_reference=external_reference,
        metadata_=metadata,
    )
    db.add(withdrawal)
    db.commit()
    db.refresh(withdrawal)
    logger.info("Created withdrawal id=%s user=%s gross_amount=%s fee=%s net=%s method=%s", withdrawal.id, user_id, amount, fee_amount, net_amount, norm_method)
    return withdrawal


def approve_withdrawal(db: Session, withdrawal_id: UUID, admin_id: UUID) -> Withdrawal:
    withdrawal = db.query(Withdrawal).filter(Withdrawal.id == withdrawal_id).with_for_update().first()
    if not withdrawal:
        raise ValueError("Withdrawal not found")
    if withdrawal.status != WithdrawalStatus.PENDING:
        raise ValueError(f"Cannot approve withdrawal in status '{withdrawal.status.value}'")

    withdrawal.status = WithdrawalStatus.APPROVED
    withdrawal.processed_by = admin_id
    withdrawal.processed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(withdrawal)
    logger.info("Approved withdrawal id=%s by admin=%s", withdrawal_id, admin_id)
    return withdrawal


def mark_payment_processing(db: Session, withdrawal_id: UUID, admin_id: UUID) -> Withdrawal:
    withdrawal = db.query(Withdrawal).filter(Withdrawal.id == withdrawal_id).with_for_update().first()
    if not withdrawal:
        raise ValueError("Withdrawal not found")
    if withdrawal.status != WithdrawalStatus.APPROVED:
        raise ValueError(f"Cannot mark payment processing for withdrawal in status '{withdrawal.status.value}'")

    withdrawal.status = WithdrawalStatus.PROCESSING
    withdrawal.processed_by = admin_id
    withdrawal.processed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(withdrawal)
    logger.info("Marked payment processing for withdrawal id=%s by admin=%s", withdrawal_id, admin_id)
    return withdrawal


def complete_withdrawal(db: Session, withdrawal_id: UUID, admin_id: UUID) -> Withdrawal:
    withdrawal = db.query(Withdrawal).filter(Withdrawal.id == withdrawal_id).with_for_update().first()
    if not withdrawal:
        raise ValueError("Withdrawal not found")
    if withdrawal.status != WithdrawalStatus.PROCESSING:
        raise ValueError(f"Cannot complete withdrawal in status '{withdrawal.status.value}'")

    withdrawal.status = WithdrawalStatus.COMPLETED
    withdrawal.processed_by = admin_id
    withdrawal.processed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(withdrawal)
    logger.info("Completed withdrawal id=%s by admin=%s", withdrawal_id, admin_id)
    return withdrawal


def reject_withdrawal(db: Session, withdrawal_id: UUID, admin_id: UUID, reason: Optional[str] = None) -> Withdrawal:
    withdrawal = db.query(Withdrawal).filter(Withdrawal.id == withdrawal_id).with_for_update().first()
    if not withdrawal:
        raise ValueError("Withdrawal not found")
    if withdrawal.status not in (WithdrawalStatus.PENDING, WithdrawalStatus.APPROVED):
        raise ValueError(f"Cannot reject withdrawal in status '{withdrawal.status.value}'")

    withdrawal.status = WithdrawalStatus.REJECTED
    withdrawal.processed_by = admin_id
    withdrawal.processed_at = datetime.now(timezone.utc)

    if reason:
        meta = dict(withdrawal.metadata_ or {})
        meta["rejection_reason"] = reason
        withdrawal.metadata_ = meta

    # Idempotent wallet refund
    credit_wallet(
        db,
        user_id=withdrawal.user_id,
        amount=withdrawal.amount,
        tx_type=WalletTransactionType.REFUND,
        reference_type="withdrawal_refund",
        reference_id=str(withdrawal.id),
        metadata={"withdrawal_id": str(withdrawal.id), "reason": reason},
    )

    db.commit()
    db.refresh(withdrawal)
    logger.info("Rejected withdrawal id=%s by admin=%s (Refunded)", withdrawal_id, admin_id)
    return withdrawal


def fail_withdrawal(db: Session, withdrawal_id: UUID, admin_id: UUID, reason: Optional[str] = None) -> Withdrawal:
    withdrawal = db.query(Withdrawal).filter(Withdrawal.id == withdrawal_id).with_for_update().first()
    if not withdrawal:
        raise ValueError("Withdrawal not found")
    if withdrawal.status != WithdrawalStatus.PROCESSING:
        raise ValueError(f"Cannot fail withdrawal in status '{withdrawal.status.value}'")

    withdrawal.status = WithdrawalStatus.FAILED
    withdrawal.processed_by = admin_id
    withdrawal.processed_at = datetime.now(timezone.utc)

    if reason:
        meta = dict(withdrawal.metadata_ or {})
        meta["failure_reason"] = reason
        withdrawal.metadata_ = meta

    # Idempotent wallet refund
    credit_wallet(
        db,
        user_id=withdrawal.user_id,
        amount=withdrawal.amount,
        tx_type=WalletTransactionType.REFUND,
        reference_type="withdrawal_refund",
        reference_id=str(withdrawal.id),
        metadata={"withdrawal_id": str(withdrawal.id), "reason": reason},
    )

    db.commit()
    db.refresh(withdrawal)
    logger.info("Failed withdrawal id=%s by admin=%s (Refunded)", withdrawal_id, admin_id)
    return withdrawal


def get_user_withdrawals(db: Session, user_id: UUID, page: int = 1, page_size: int = 20) -> dict:
    query = db.query(Withdrawal).filter(Withdrawal.user_id == user_id)
    total = query.count()
    items = query.order_by(Withdrawal.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"total": total, "page": page, "page_size": page_size, "items": items}
