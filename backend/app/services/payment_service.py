"""Payment service delegates to a PaymentProvider adapter with dynamic DB-backed gateway switching."""
from typing import Optional
from sqlalchemy.orm import Session

from ..payment.base import PaymentProvider
from ..payment.providers.razorpay import RazorpayProvider
from ..payment.providers.cashfree import CashfreeProvider
from ..models.payment_gateway import PaymentGatewayConfig
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
            "provider": "noop",
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


def get_active_gateway_config(db: Session) -> Optional[PaymentGatewayConfig]:
    """Fetch the currently active dynamic payment gateway config from DB."""
    return db.query(PaymentGatewayConfig).filter(PaymentGatewayConfig.is_active.is_(True)).first()


def get_provider(
    provider_name: Optional[str] = None,
    db: Optional[Session] = None,
) -> PaymentProvider:
    """Resolve payment provider either by explicit name or from the active DB gateway configuration."""
    provider_key = (provider_name or "").strip().lower()

    # If provider is not explicitly requested, or is "auto" / "gateway", look up active in DB
    if db is not None and (not provider_key or provider_key in ("auto", "gateway", "active")):
        active_cfg = get_active_gateway_config(db)
        if active_cfg:
            provider_key = active_cfg.gateway_name.strip().lower()

    if provider_key == "cashfree":
        app_id = None
        secret_key = None
        is_sandbox = True
        if db is not None:
            cfg = db.query(PaymentGatewayConfig).filter(PaymentGatewayConfig.gateway_name == "cashfree").first()
            if cfg:
                app_id = cfg.api_key
                secret_key = cfg.api_secret
                is_sandbox = cfg.is_sandbox

        logger.info("Using Cashfree payment provider (sandbox=%s, configured=%s).", is_sandbox, bool(app_id and secret_key))
        if app_id and secret_key:
            return CashfreeProvider(app_id=app_id, secret_key=secret_key, is_sandbox=is_sandbox)
        return CashfreeProvider(is_sandbox=is_sandbox)

    if provider_key == "razorpay":
        key_id = None
        key_secret = None
        if db is not None:
            cfg = db.query(PaymentGatewayConfig).filter(PaymentGatewayConfig.gateway_name == "razorpay").first()
            if cfg and cfg.api_key and cfg.api_secret:
                key_id = cfg.api_key
                key_secret = cfg.api_secret

        logger.info("Using Razorpay payment provider (configured=%s).", bool(key_id and key_secret))
        try:
            return RazorpayProvider(key_id=key_id, key_secret=key_secret)
        except ValueError as err:
            logger.warning("Razorpay configuration missing, falling back to stub: %s", err)
            return NoopPaymentProvider()

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