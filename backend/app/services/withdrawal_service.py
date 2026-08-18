from uuid import UUID
from typing import Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from ..models.withdrawal import Withdrawal, WithdrawalStatus
from ..models.wallet import Wallet


def create_withdrawal(
    db: Session,
    user_id: UUID,
    amount: int,
    method: Optional[str] = None,
    destination: Optional[str] = None,
    external_reference: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> Withdrawal:
    wallet = db.query(Wallet).filter(Wallet.user_id == user_id).first()
    if not wallet:
        raise ValueError("Wallet not found for user")
    if wallet.balance < amount:
        raise ValueError("Insufficient balance")
    withdrawal = Withdrawal(
        user_id=user_id,
        wallet_id=wallet.id,
        amount=amount,
        status=WithdrawalStatus.PENDING,
        method=method,
        destination=destination,
        external_reference=external_reference,
        metadata_=metadata,
    )
    db.add(withdrawal)
    db.commit()
    db.refresh(withdrawal)
    return withdrawal
