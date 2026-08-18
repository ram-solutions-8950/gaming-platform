from uuid import UUID
from typing import Optional
from sqlalchemy.orm import Session
from ..models.deposit import Deposit, DepositStatus
from ..models.wallet import Wallet
from ..models.payment import PaymentConfiguration

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
        
    if amount <= 0:
        raise ValueError("Deposit amount must be strictly positive")
        
    active_config = db.query(PaymentConfiguration).filter(PaymentConfiguration.enabled == True).first()
    if not active_config:
        raise ValueError("No active payment provider available")
        
    if amount < active_config.minimum_deposit:
        raise ValueError(f"Amount is below the minimum deposit of ₹{active_config.minimum_deposit / 100:.2f}")
        
    if amount > active_config.maximum_deposit:
        raise ValueError(f"Amount exceeds the maximum deposit of ₹{active_config.maximum_deposit / 100:.2f}")

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
