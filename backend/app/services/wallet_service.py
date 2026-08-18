from typing import Optional, List
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import select
from ..models.wallet import Wallet
from ..models.transaction import WalletTransaction, WalletTransactionType, WalletTransactionStatus
from ..utils.logging import get_logger
from ..utils.responses import error_response

logger = get_logger("wallet")


def get_balance(db: Session, user_id: UUID) -> Optional[Wallet]:
    return db.query(Wallet).filter(Wallet.user_id == user_id).first()


def _lock_wallet(db: Session, user_id: UUID) -> Wallet:
    """Acquire a row-level lock on the wallet to prevent race conditions."""
    wallet = (
        db.execute(
            select(Wallet).where(Wallet.user_id == user_id).with_for_update()
        ).scalar_one_or_none()
    )
    if not wallet:
        raise ValueError("Wallet not found")
    return wallet


def _check_duplicate_reference(db: Session, ref_type: str, ref_id: str) -> bool:
    return db.query(WalletTransaction).filter(
        WalletTransaction.reference_type == ref_type,
        WalletTransaction.reference_id == ref_id,
    ).first() is not None


def credit_wallet(
    db: Session,
    user_id: UUID,
    amount: int,
    tx_type: WalletTransactionType,
    reference_type: str,
    reference_id: str,
    metadata: Optional[dict] = None,
) -> WalletTransaction:
    if amount <= 0:
        raise ValueError("Credit amount must be positive")

    if _check_duplicate_reference(db, reference_type, reference_id):
        raise ValueError(f"Duplicate transaction reference: {reference_type}/{reference_id}")

    wallet = _lock_wallet(db, user_id)
    balance_before = wallet.balance
    wallet.balance += amount

    tx = WalletTransaction(
        user_id=user_id,
        wallet_id=wallet.id,
        type=tx_type,
        amount=amount,
        balance_before=balance_before,
        balance_after=wallet.balance,
        reference_type=reference_type,
        reference_id=reference_id,
        status=WalletTransactionStatus.COMPLETED,
        metadata_=metadata,
    )
    db.add(tx)
    db.flush()
    logger.info(f"CREDIT user={user_id} amount={amount} ref={reference_type}/{reference_id}")
    return tx


def debit_wallet(
    db: Session,
    user_id: UUID,
    amount: int,
    tx_type: WalletTransactionType,
    reference_type: str,
    reference_id: str,
    metadata: Optional[dict] = None,
) -> WalletTransaction:
    if amount <= 0:
        raise ValueError("Debit amount must be positive")

    if _check_duplicate_reference(db, reference_type, reference_id):
        raise ValueError(f"Duplicate transaction reference: {reference_type}/{reference_id}")

    wallet = _lock_wallet(db, user_id)
    if wallet.balance < amount:
        raise ValueError("Insufficient balance")

    balance_before = wallet.balance
    wallet.balance -= amount

    tx = WalletTransaction(
        user_id=user_id,
        wallet_id=wallet.id,
        type=tx_type,
        amount=amount,
        balance_before=balance_before,
        balance_after=wallet.balance,
        reference_type=reference_type,
        reference_id=reference_id,
        status=WalletTransactionStatus.COMPLETED,
        metadata_=metadata,
    )
    db.add(tx)
    db.flush()
    logger.info(f"DEBIT user={user_id} amount={amount} ref={reference_type}/{reference_id}")
    return tx


def get_transaction_history(
    db: Session,
    user_id: UUID,
    page: int = 1,
    page_size: int = 20,
    tx_type: Optional[str] = None,
    status: Optional[str] = None,
) -> dict:
    query = db.query(WalletTransaction).filter(WalletTransaction.user_id == user_id)
    if tx_type:
        query = query.filter(WalletTransaction.type == tx_type)
    if status:
        query = query.filter(WalletTransaction.status == status)
    total = query.count()
    items = query.order_by(WalletTransaction.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"total": total, "page": page, "page_size": page_size, "items": items}
