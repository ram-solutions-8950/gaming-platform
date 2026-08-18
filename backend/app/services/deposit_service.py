from uuid import UUID
from typing import Optional
from sqlalchemy.orm import Session
from ..models.deposit import Deposit, DepositStatus
from ..models.wallet import Wallet


def create_deposit(
    db: Session,
    user_id: UUID,
    amount: int,
    provider: Optional[str] = None,
    external_reference: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> Deposit:
    wallet = db.query(Wallet).filter(Wallet.user_id == user_id).first()
    if not wallet:
        raise ValueError("Wallet not found for user")
    deposit = Deposit(
        user_id=user_id,
        wallet_id=wallet.id,
        amount=amount,
        status=DepositStatus.PENDING,
        provider=provider,
        external_reference=external_reference,
        metadata_=metadata,
    )
    db.add(deposit)
    db.commit()
    db.refresh(deposit)
    return deposit
