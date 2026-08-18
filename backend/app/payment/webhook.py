"""Webhook processing boundary."""
from typing import Any, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from ..models.payment import PaymentEvent
from ..models.transaction import WalletTransactionType
from ..services.payment_service import get_provider
from ..services.wallet_service import credit_wallet
from ..utils.logging import get_logger

logger = get_logger("webhook")


def handle_webhook(raw_body: bytes, headers: dict, provider_name: str, db: Optional[Session] = None) -> dict:
    """Validate and ingest payment webhooks without crediting the wallet unless a real success event is received."""
    logger.info("Webhook received from provider=%s size=%sB", provider_name, len(raw_body))
    provider = get_provider(provider_name)
    if not provider.verify_webhook(raw_body, headers):
        logger.warning("Rejected webhook for provider=%s due to verification failure", provider_name)
        return {"status": "rejected", "provider": provider_name, "reason": "invalid_signature"}

    event = provider.process_webhook(raw_body, headers)
    event_id = str(event.get("event_id") or headers.get("x-event-id") or headers.get("X-Event-Id") or "generated")
    normalized_provider = str(event.get("provider") or provider_name)
    status_value = str(event.get("status") or "RECEIVED")

    if db is not None:
        existing = db.query(PaymentEvent).filter(
            PaymentEvent.provider == normalized_provider,
            PaymentEvent.event_id == event_id,
        ).first()
        if existing:
            logger.info("Duplicate webhook event ignored for provider=%s event_id=%s", normalized_provider, event_id)
            return {"status": "duplicate", "provider": normalized_provider, "event_id": event_id}

        record = PaymentEvent(
            provider=normalized_provider,
            event_id=event_id,
            event_type=str(event.get("event_type") or "webhook"),
            status=status_value,
            payload=event,
        )
        db.add(record)

        user_id = event.get("user_id")
        amount = event.get("amount")
        if status_value.upper() == "SUCCESS" and user_id and amount is not None:
            try:
                wallet_user_id = UUID(str(user_id))
                credit_wallet(
                    db,
                    wallet_user_id,
                    int(amount),
                    WalletTransactionType.DEPOSIT,
                    reference_type="payment_webhook",
                    reference_id=f"{normalized_provider}:{event_id}",
                    metadata={"provider": normalized_provider, "event_id": event_id, "source": "webhook"},
                )
            except ValueError as exc:
                logger.warning("Unable to credit wallet for webhook provider=%s event_id=%s: %s", normalized_provider, event_id, exc)

        db.commit()

    return {"status": status_value.lower(), "provider": normalized_provider, "event_id": event_id}
