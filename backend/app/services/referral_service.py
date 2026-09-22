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


# Refer & Win defaults: 10% of the referred user's first deposit,
# provided that deposit is at least Rs 100.
DEFAULT_REWARD_PAISA = 10000        # Rs 100 flat (used only in FLAT mode)
DEFAULT_REWARD_TYPE = "PERCENTAGE"
DEFAULT_REWARD_PERCENTAGE = 10.00
DEFAULT_MIN_DEPOSIT_PAISA = 10000   # Rs 100


def get_referral_settings(db: Session) -> ReferralSettings:
    """Gets the singleton referral settings, creating a default one if it doesn't exist."""
    settings = db.query(ReferralSettings).first()
    if not settings:
        settings = ReferralSettings(
            reward_amount=DEFAULT_REWARD_PAISA,
            is_active=True,
            reward_type=DEFAULT_REWARD_TYPE,
            reward_percentage=DEFAULT_REWARD_PERCENTAGE,
            min_deposit_amount=DEFAULT_MIN_DEPOSIT_PAISA,
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)
        return settings

    # Backfill rows created before the percentage/min-deposit fields existed.
    changed = False
    if not settings.reward_type:
        settings.reward_type = DEFAULT_REWARD_TYPE
        changed = True
    if settings.reward_percentage is None:
        settings.reward_percentage = DEFAULT_REWARD_PERCENTAGE
        changed = True
    if settings.min_deposit_amount is None:
        settings.min_deposit_amount = DEFAULT_MIN_DEPOSIT_PAISA
        changed = True
    if changed:
        db.commit()
        db.refresh(settings)
    return settings


def serialize_referral_settings(settings: ReferralSettings) -> dict:
    """Shared JSON shape for the admin and player-facing settings payloads."""
    return {
        "reward_amount": float(settings.reward_amount or 0) / 100.0,
        "is_active": bool(settings.is_active),
        "reward_type": settings.reward_type or DEFAULT_REWARD_TYPE,
        "reward_percentage": float(
            settings.reward_percentage
            if settings.reward_percentage is not None
            else DEFAULT_REWARD_PERCENTAGE
        ),
        "min_deposit": float(
            settings.min_deposit_amount
            if settings.min_deposit_amount is not None
            else DEFAULT_MIN_DEPOSIT_PAISA
        ) / 100.0,
    }


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
        # Check minimum deposit amount
        first_deposit = db.query(Deposit).filter(
            Deposit.user_id == referred_user_id,
            Deposit.status == DepositStatus.SUCCESS
        ).order_by(Deposit.created_at.asc()).first()

        settings = get_referral_settings(db)
        min_deposit = settings.min_deposit_amount or 0
        if not first_deposit:
            logger.warning(f"Referral qualification skipped: no successful deposit for {referred_user_id}")
            return
        if first_deposit.amount < min_deposit:
            logger.info(
                f"Referral not qualified: deposit {first_deposit.amount} < min {min_deposit}"
            )
            return

        logger.info(f"Referral qualified for referred={referred_user_id} referrer={referral.referrer_user_id}")
        referral.status = ReferralStatus.QUALIFIED
        referral.qualified_at = datetime.now(timezone.utc)
        db.flush()

        # 3. Distribute reward
        deposit_amount = first_deposit.amount if first_deposit else 0
        distribute_referral_reward(db, referral, deposit_amount=deposit_amount)


def distribute_referral_reward(db: Session, referral: Referral, deposit_amount: int = 0):
    """
    Distributes the configured reward amount to the referrer.
    Supports FLAT (fixed amount) and PERCENTAGE (% of first deposit) modes.
    """
    if referral.status != ReferralStatus.QUALIFIED:
        return

    settings = get_referral_settings(db)
    if not settings.is_active:
        logger.info("Referral reward not paid: referral system is currently inactive")
        return

    # Calculate reward based on reward_type
    reward_type = (settings.reward_type or DEFAULT_REWARD_TYPE).upper()
    if reward_type == "PERCENTAGE":
        if deposit_amount <= 0:
            logger.warning(
                f"Percentage referral reward skipped: no deposit amount for referral={referral.id}"
            )
            return
        percentage = float(
            settings.reward_percentage
            if settings.reward_percentage is not None
            else DEFAULT_REWARD_PERCENTAGE
        )
        reward_amount = int(deposit_amount * percentage / 100)
        logger.info(f"Percentage reward: {percentage}% of {deposit_amount} = {reward_amount}")
    else:
        reward_amount = settings.reward_amount or 0

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
