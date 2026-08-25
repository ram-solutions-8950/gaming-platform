from datetime import datetime, timezone
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..models.referral import Referral, ReferralSettings, ReferralStatus
from ..models.user import User
from ..models.deposit import Deposit, DepositStatus
from ..models.transaction import WalletTransactionType
from ..services.wallet_service import credit_wallet
from ..utils.logging import get_logger

logger = get_logger("referral")


def get_referral_settings(db: Session) -> ReferralSettings:
    """Gets the singleton referral settings, creating a default one if it doesn't exist."""
    settings = db.query(ReferralSettings).first()
    if not settings:
        settings = ReferralSettings(reward_amount=10000, is_active=True) # default ₹100
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def check_and_qualify_referral(db: Session, referred_user_id: UUID):
    """
    Checks if the referred user has a pending referral.
    Called when a user performs a qualifying action (successful first deposit).
    """
    # 1. Lock the referral record to prevent race conditions during state transition
    referral = db.query(Referral).filter(
        Referral.referred_user_id == referred_user_id
    ).with_for_update().first()

    if not referral:
        return  # No referrer for this user

    if referral.status != ReferralStatus.REGISTERED:
        return  # Already qualified or rewarded

    # 2. Check if this is the first successful deposit for the referred user
    successful_deposits = db.query(Deposit).filter(
        Deposit.user_id == referred_user_id,
        Deposit.status == DepositStatus.SUCCESS
    ).count()

    # The current deposit is already in SUCCESS status, so count must be 1 to qualify
    if successful_deposits == 1:
        logger.info(f"Referral qualified for referred={referred_user_id} referrer={referral.referrer_user_id}")
        referral.status = ReferralStatus.QUALIFIED
        referral.qualified_at = datetime.now(timezone.utc)
        db.flush()

        # 3. Distribute reward
        distribute_referral_reward(db, referral)


def distribute_referral_reward(db: Session, referral: Referral):
    """
    Distributes the configured reward amount to the referrer.
    """
    if referral.status != ReferralStatus.QUALIFIED:
        return

    settings = get_referral_settings(db)
    if not settings.is_active:
        logger.info("Referral reward not paid: referral system is currently inactive")
        return

    reward_amount = settings.reward_amount
    if reward_amount <= 0:
        logger.warning(f"Referral reward amount must be positive. Got: {reward_amount}")
        return

    # Use ledger-level idempotency to prevent duplicate reward payment
    reference_type = "REFERRAL_REWARD"
    reference_id = f"referral_{referral.referred_user_id}"

    try:
        tx = credit_wallet(
            db=db,
            user_id=referral.referrer_user_id,
            amount=reward_amount,
            tx_type=WalletTransactionType.REFERRAL_REWARD,
            reference_type=reference_type,
            reference_id=reference_id,
            metadata={
                "referral_id": str(referral.id),
                "referred_user_id": str(referral.referred_user_id),
            }
        )

        referral.status = ReferralStatus.REWARD_PAID
        referral.reward_amount = reward_amount
        referral.reward_transaction_id = tx.id
        db.flush()
        logger.info(f"Referral reward of ₹{reward_amount/100:.2f} credited to referrer={referral.referrer_user_id}")
    except ValueError as e:
        if "Duplicate transaction reference" in str(e):
            logger.warning(f"Duplicate reward attempt ignored for referral={referral.id}")
            # If the transaction already exists, align the status just in case
            referral.status = ReferralStatus.REWARD_PAID
            db.flush()
        else:
            raise
