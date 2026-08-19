"""Payment service delegates to a PaymentProvider adapter."""
from typing import Optional

from ..payment.base import PaymentProvider
from ..payment.providers.razorpay import RazorpayProvider
from ..utils.logging import get_logger

logger = get_logger("payment")


class NoopPaymentProvider(PaymentProvider):
    """No-op provider used for local development/testing."""

    def create_payment(
        self,
        amount: int,
        user_id: str,
        metadata: Optional[dict] = None,
    ) -> dict:
        return {
            "provider_order_id": f"noop-{user_id}-{amount}",
            "amount": amount,
            "currency": "INR",
            "status": "PENDING",
        }

    def get_payment_status(self, provider_order_id: str) -> dict:
        return {
            "status": "PENDING",
            "provider_payment_id": provider_order_id,
            "amount": 0,
        }

    def verify_payment(
        self,
        provider_order_id: str,
        provider_payment_id: str,
        signature: str,
    ) -> bool:
        return False

    def verify_webhook(
        self,
        raw_body: bytes,
        headers: dict,
    ) -> bool:
        return False

    def process_webhook(
        self,
        raw_body: bytes,
        headers: dict,
    ) -> dict:
        return {
            "status": "REJECTED",
            "provider": "noop",
            "event_id": "noop-webhook",
            "amount": 0,
            "user_id": None,
        }

    def reconcile(self, provider_order_id: str) -> dict:
        return {
            "status": "PENDING",
            "provider_order_id": provider_order_id,
        }


def get_provider(provider_name: str) -> PaymentProvider:
    provider_key = (provider_name or "").strip().lower()

    if provider_key == "razorpay":
        logger.info("Using Razorpay payment provider.")
        return RazorpayProvider()

    if not provider_key or provider_key in {
        "noop",
        "stub",
        "placeholder",
        "mock",
        "test_provider",
        "upi",
        "default",
    }:
        logger.info("Using no-op payment provider.")
        return NoopPaymentProvider()

    raise ValueError(f"Unsupported payment provider: '{provider_name}'")