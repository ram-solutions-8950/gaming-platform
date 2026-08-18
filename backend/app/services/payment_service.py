"""Payment service delegates to a PaymentProvider adapter."""
from typing import Any, Optional
from ..payment.base import PaymentProvider
from ..utils.logging import get_logger

logger = get_logger("payment")


class NoopPaymentProvider(PaymentProvider):
    """No-op provider used until a real gateway is connected. It never fakes a successful payment."""

    def create_payment(self, amount: int, user_id: str, metadata: Optional[dict] = None) -> dict:
        return {"provider_order_id": f"noop-{user_id}-{amount}", "amount": amount, "currency": "INR", "status": "PENDING"}

    def get_payment_status(self, provider_order_id: str) -> dict:
        return {"status": "PENDING", "provider_payment_id": provider_order_id, "amount": 0}

    def verify_payment(self, provider_order_id: str, provider_payment_id: str, signature: str) -> bool:
        return False

    def verify_webhook(self, raw_body: bytes, headers: dict) -> bool:
        return False

    def process_webhook(self, raw_body: bytes, headers: dict) -> dict:
        return {"status": "REJECTED", "provider": "noop", "event_id": "noop-webhook", "amount": 0, "user_id": None}

    def reconcile(self, provider_order_id: str) -> dict:
        return {"status": "PENDING", "provider_order_id": provider_order_id}


def get_provider(provider_name: str) -> PaymentProvider:
    provider_key = (provider_name or "").strip().lower()
    if not provider_key or provider_key in {"noop", "stub", "placeholder", "mock"}:
        logger.info("Using no-op payment provider; real provider integration is deferred until Phase 3.")
        return NoopPaymentProvider()
    # Real provider adapters will be added in a later phase.
    logger.warning("Unknown provider name '%s'; falling back to no-op payment provider.", provider_name)
    return NoopPaymentProvider()
