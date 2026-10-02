from uuid import UUID
from typing import Optional

from sqlalchemy.orm import Session

from ..models.deposit import Deposit, DepositStatus
from ..models.wallet import Wallet
from ..models.payment import PaymentConfiguration
from ..models.transaction import WalletTransactionType
from ..services.payment_service import get_provider
from ..services.wallet_service import credit_wallet


def create_deposit(
    db: Session,
    user_id: UUID,
    amount: int,
    provider: Optional[str] = None,
    external_reference: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> Deposit:
    wallet = (
        db.query(Wallet)
        .filter(Wallet.user_id == user_id)
        .first()
    )

    if not wallet:
        raise ValueError("Wallet not found for user")

    if amount <= 0:
        raise ValueError(
            "Deposit amount must be strictly positive"
        )

    active_config = (
        db.query(PaymentConfiguration)
        .filter(PaymentConfiguration.enabled.is_(True))
        .first()
    )

    if not active_config:
        raise ValueError(
            "No active payment provider available"
        )

    if amount < active_config.minimum_deposit:
        raise ValueError(
            f"Amount is below the minimum deposit of "
            f"₹{active_config.minimum_deposit / 100:.2f}"
        )

    if amount > active_config.maximum_deposit:
        raise ValueError(
            f"Amount exceeds the maximum deposit of "
            f"₹{active_config.maximum_deposit / 100:.2f}"
        )

    provider_name = (
        provider
        or active_config.provider
        or "razorpay"
    ).strip().lower()

    deposit = Deposit(
        user_id=user_id,
        wallet_id=wallet.id,
        amount=amount,
        status=DepositStatus.PENDING,
        provider=provider_name,
        external_reference=external_reference,
        metadata_=metadata,
    )

    db.add(deposit)
    db.flush()

    payment_provider = get_provider(provider_name, db=db)

    provider_result = payment_provider.create_payment(
        amount=amount,
        user_id=str(user_id),
        metadata={
            **(metadata or {}),
            "deposit_id": str(deposit.id),
            "receipt": f"deposit-{deposit.id}",
        },
    )

    deposit.provider_order_id = provider_result[
        "provider_order_id"
    ]

    deposit.metadata_ = {
        **(metadata or {}),
        "currency": provider_result.get(
            "currency",
            "INR",
        ),
        "payment_session_id": provider_result.get("payment_session_id"),
        "environment": provider_result.get("environment"),
        "provider": provider_result.get("provider", provider_name),
    }

    db.commit()
    db.refresh(deposit)

    return deposit


def verify_deposit_payment(
    db: Session,
    user_id: UUID,
    deposit_id: UUID,
    provider_order_id: str,
    provider_payment_id: str,
    signature: str,
) -> Deposit:
    """
    Verify a Razorpay Checkout payment and credit the wallet
    exactly once.

    The client-provided values are never trusted by themselves.
    The order must match the server-side Deposit record.
    """

    deposit = (
        db.query(Deposit)
        .filter(
            Deposit.id == deposit_id,
            Deposit.user_id == user_id,
        )
        .with_for_update()
        .first()
    )

    if not deposit:
        raise ValueError("Deposit not found")

    if deposit.provider not in ("razorpay", "cashfree"):
        raise ValueError(
            f"Unsupported provider for online verification: {deposit.provider}"
        )

    if not deposit.provider_order_id:
        raise ValueError(
            f"Deposit has no {deposit.provider} order ID"
        )

    # Never trust an order ID supplied by the browser.
    if provider_order_id and str(provider_order_id) != str(
        deposit.provider_order_id
    ):
        raise ValueError(
            f"{deposit.provider.capitalize()} order ID does not match deposit"
        )

    # Already completed.
    if deposit.status == DepositStatus.SUCCESS:
        db.commit()
        return deposit

    if deposit.status in {
        DepositStatus.FAILED,
        DepositStatus.CANCELLED,
    }:
        db.rollback()
        raise ValueError(
            f"Cannot verify deposit in "
            f"{deposit.status.value} state"
        )

    provider = get_provider(deposit.provider, db=db)

    if deposit.provider == "razorpay":
        # Verify Razorpay checkout signature.
        if not provider.verify_payment(
            provider_order_id=str(
                deposit.provider_order_id
            ),
            provider_payment_id=str(
                provider_payment_id
            ),
            signature=str(signature),
        ):
            db.rollback()
            raise ValueError(
                "Invalid Razorpay payment signature"
            )

    # Query provider's server-side API (both Razorpay and Cashfree implement get_payment_status)
    provider_status = provider.get_payment_status(
        str(deposit.provider_order_id)
    )

    if provider_status.get("status") != "SUCCESS":
        db.rollback()
        raise ValueError(
            f"{deposit.provider.capitalize()} payment has not been captured (status: {provider_status.get('status')})"
        )

    provider_amount = int(
        provider_status.get("amount", 0)
    )

    # Amount must match the original Deposit if returned.
    if provider_amount > 0 and provider_amount != int(deposit.amount):
        db.rollback()
        raise ValueError(
            f"{deposit.provider.capitalize()} payment amount does not match deposit"
        )

    actual_payment_id = (
        provider_status.get(
            "provider_payment_id"
        )
        or provider_payment_id
        or str(deposit.provider_order_id)
    )

    deposit.status = DepositStatus.SUCCESS
    deposit.provider_payment_id = str(
        actual_payment_id
    )

    from datetime import datetime, timezone

    deposit.completed_at = datetime.now(
        timezone.utc
    )

    reference_type = "payment_verification"
    reference_id = (
        f"{deposit.provider}:{deposit.id}"
    )

    try:
        credit_wallet(
            db=db,
            user_id=deposit.user_id,
            amount=int(deposit.amount),
            tx_type=WalletTransactionType.DEPOSIT,
            reference_type=reference_type,
            reference_id=reference_id,
            metadata={
                "provider": deposit.provider,
                "deposit_id": str(deposit.id),
                "provider_order_id": str(
                    deposit.provider_order_id
                ),
                "provider_payment_id": str(
                    actual_payment_id
                ),
                "source": "checkout_verification",
            },
        )

        from .referral_service import check_and_qualify_referral
        check_and_qualify_referral(db, deposit.user_id)

        from .wager_service import create_wager_requirement
        create_wager_requirement(db, deposit.user_id, int(deposit.amount), deposit_id=deposit.id)

    except ValueError as exc:
        if "Duplicate transaction reference" in str(exc):
            db.commit()
            db.refresh(deposit)
            return deposit

        db.rollback()
        raise

    db.commit()
    db.refresh(deposit)

    return deposit