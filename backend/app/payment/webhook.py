"""Webhook processing boundary."""

from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from ..models.deposit import Deposit, DepositStatus
from ..models.payment import PaymentEvent
from ..models.transaction import WalletTransactionType
from ..services.payment_service import get_provider
from ..services.wallet_service import credit_wallet
from ..utils.logging import get_logger

logger = get_logger("webhook")


def handle_webhook(
    raw_body: bytes,
    headers: dict,
    provider_name: str,
    db: Optional[Session] = None,
) -> dict:
    """
    Verify, process and persist a payment-provider webhook.

    Important:
    - Invalid signatures are rejected.
    - Webhook events are idempotent.
    - Deposit is locked before financial state changes.
    - Wallet is credited only once.
    - Webhook and checkout verification use the same
      payment_verification transaction reference.
    """

    logger.info(
        "Webhook received from provider=%s size=%sB",
        provider_name,
        len(raw_body),
    )

    provider = get_provider(provider_name)

    # 1. Verify provider signature BEFORE parsing/processing.
    if not provider.verify_webhook(raw_body, headers):
        logger.warning(
            "Rejected webhook for provider=%s due to verification failure",
            provider_name,
        )
        return {
            "status": "rejected",
            "provider": provider_name,
            "reason": "invalid_signature",
        }

    # 2. Parse the verified webhook.
    event = provider.process_webhook(raw_body, headers)

    event_id = str(
        event.get("event_id")
        or headers.get("x-event-id")
        or headers.get("X-Event-Id")
        or ""
    )

    if not event_id:
        return {
            "status": "rejected",
            "provider": provider_name,
            "reason": "missing_event_id",
        }

    normalized_provider = str(
        event.get("provider") or provider_name
    ).strip().lower()

    status_value = str(
        event.get("status") or "RECEIVED"
    ).upper()

    provider_order_id = event.get("provider_order_id")
    provider_payment_id = event.get("provider_payment_id")
    amount = event.get("amount")

    if db is None:
        return {
            "status": status_value.lower(),
            "provider": normalized_provider,
            "event_id": event_id,
        }

    # 3. Idempotency: same provider event must never be processed twice.
    existing = (
        db.query(PaymentEvent)
        .filter(
            PaymentEvent.provider == normalized_provider,
            PaymentEvent.event_id == event_id,
        )
        .first()
    )

    if existing:
        logger.info(
            "Duplicate webhook ignored provider=%s event_id=%s",
            normalized_provider,
            event_id,
        )

        return {
            "status": "duplicate",
            "provider": normalized_provider,
            "event_id": event_id,
        }

    # 4. Record the event.
    record = PaymentEvent(
        provider=normalized_provider,
        event_id=event_id,
        event_type=str(
            event.get("event_type") or "webhook"
        ),
        status=status_value,
        payload=event,
    )

    db.add(record)

    # Only successful payment events can affect the wallet.
    if status_value != "SUCCESS":
        db.commit()

        return {
            "status": status_value.lower(),
            "provider": normalized_provider,
            "event_id": event_id,
        }

    # 5. Successful webhook must contain an order ID.
    if not provider_order_id:
        db.commit()

        logger.warning(
            "Successful webhook has no provider_order_id "
            "provider=%s event_id=%s",
            normalized_provider,
            event_id,
        )

        return {
            "status": "received",
            "provider": normalized_provider,
            "event_id": event_id,
            "reason": "missing_provider_order_id",
        }

    # 6. Find and LOCK the deposit using Razorpay's order ID.
    deposit = (
        db.query(Deposit)
        .filter(
            Deposit.provider == normalized_provider,
            Deposit.provider_order_id == str(provider_order_id),
        )
        .with_for_update()
        .first()
    )

    if not deposit:
        db.commit()

        logger.warning(
            "No deposit found for webhook order=%s event_id=%s",
            provider_order_id,
            event_id,
        )

        return {
            "status": "received",
            "provider": normalized_provider,
            "event_id": event_id,
            "reason": "deposit_not_found",
        }

    # 7. Verify the webhook amount against our database.
    if amount is None:
        db.rollback()
        raise ValueError(
            "Successful webhook does not contain payment amount"
        )

    if int(amount) != int(deposit.amount):
        db.rollback()

        logger.error(
            "Webhook amount mismatch deposit=%s expected=%s received=%s",
            deposit.id,
            deposit.amount,
            amount,
        )

        raise ValueError(
            "Webhook payment amount does not match deposit"
        )

    # 8. If checkout verification already completed it,
    #    DO NOT credit the wallet again.
    if deposit.status == DepositStatus.SUCCESS:
        logger.info(
            "Webhook received for already successful deposit=%s",
            deposit.id,
        )

        db.commit()

        return {
            "status": "already_processed",
            "provider": normalized_provider,
            "event_id": event_id,
            "deposit_id": str(deposit.id),
        }

    if deposit.status in {
        DepositStatus.FAILED,
        DepositStatus.CANCELLED,
    }:
        db.commit()

        return {
            "status": "ignored",
            "provider": normalized_provider,
            "event_id": event_id,
            "deposit_id": str(deposit.id),
            "reason": f"deposit_{deposit.status.value.lower()}",
        }

    # 9. Mark the deposit successful.
    deposit.status = DepositStatus.SUCCESS

    if provider_payment_id:
        deposit.provider_payment_id = str(
            provider_payment_id
        )

    from datetime import datetime, timezone

    deposit.completed_at = datetime.now(timezone.utc)

    # 10. CRITICAL:
    # Use EXACTLY the same reference as checkout verification.
    #
    # Checkout:
    #   payment_verification / razorpay:{deposit.id}
    #
    # Webhook:
    #   payment_verification / razorpay:{deposit.id}
    #
    # The DB unique constraint prevents a second credit.
    reference_type = "payment_verification"
    reference_id = f"razorpay:{deposit.id}"

    try:
        credit_wallet(
            db=db,
            user_id=deposit.user_id,
            amount=int(deposit.amount),
            tx_type=WalletTransactionType.DEPOSIT,
            reference_type=reference_type,
            reference_id=reference_id,
            metadata={
                "provider": normalized_provider,
                "deposit_id": str(deposit.id),
                "provider_order_id": str(
                    deposit.provider_order_id
                ),
                "provider_payment_id": (
                    str(provider_payment_id)
                    if provider_payment_id
                    else None
                ),
                "source": "webhook",
                "event_id": event_id,
            },
        )

    except ValueError as exc:
        # Checkout verification may have already created
        # the transaction between webhook delivery and now.
        if "Duplicate transaction reference" in str(exc):
            logger.info(
                "Wallet transaction already exists for deposit=%s",
                deposit.id,
            )

            db.commit()
            db.refresh(deposit)

            return {
                "status": "already_processed",
                "provider": normalized_provider,
                "event_id": event_id,
                "deposit_id": str(deposit.id),
            }

        db.rollback()
        raise

    from ..services.referral_service import check_and_qualify_referral
    check_and_qualify_referral(db, deposit.user_id)

    db.commit()
    db.refresh(deposit)

    logger.info(
        "Webhook successfully credited deposit=%s amount=%s",
        deposit.id,
        deposit.amount,
    )

    return {
        "status": "success",
        "provider": normalized_provider,
        "event_id": event_id,
        "deposit_id": str(deposit.id),
    }