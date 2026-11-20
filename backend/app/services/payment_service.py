"""Payment service delegates to a PaymentProvider adapter with dynamic DB-backed gateway switching."""
from typing import Optional
from sqlalchemy.orm import Session

from ..payment.base import PaymentProvider
from ..payment.providers.razorpay import RazorpayProvider
from ..payment.providers.cashfree import CashfreeProvider
from ..payment.providers.easebuzz import EasebuzzProvider
from ..models.payment_gateway import PaymentGatewayConfig
from ..config import settings
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
        webhook_secret = None
        is_sandbox = True
        if db is not None:
            cfg = db.query(PaymentGatewayConfig).filter(PaymentGatewayConfig.gateway_name == "cashfree").first()
            if cfg:
                app_id = cfg.api_key
                secret_key = cfg.api_secret
                webhook_secret = cfg.webhook_secret
                is_sandbox = cfg.is_sandbox

        logger.info("Using Cashfree payment provider (sandbox=%s, configured=%s).", is_sandbox, bool(app_id and secret_key))
        if app_id and secret_key:
            return CashfreeProvider(app_id=app_id, secret_key=secret_key, is_sandbox=is_sandbox, webhook_secret=webhook_secret)
        return CashfreeProvider(is_sandbox=is_sandbox)

    if provider_key == "easebuzz":
        # Credentials come from the admin panel only. There is deliberately
        # no environment fallback: if an admin cleared a key to rotate it, a
        # leftover environment value would silently take over and send money
        # to the old account.
        merchant_key = None
        salt = None
        is_sandbox = True
        # Return URLs are deployment addresses rather than secrets, so they
        # have an environment default that a gateway row may override.
        surl = settings.EASEBUZZ_SURL
        furl = settings.EASEBUZZ_FURL

        if db is not None:
            cfg = db.query(PaymentGatewayConfig).filter(PaymentGatewayConfig.gateway_name == "easebuzz").first()
            if cfg:
                # Easebuzz calls these the Merchant Key and Salt; they live in
                # the same columns the other gateways use for key/secret.
                merchant_key = cfg.api_key
                salt = cfg.api_secret
                is_sandbox = cfg.is_sandbox
                extra = cfg.extra_config or {}
                surl = extra.get("surl") or surl
                furl = extra.get("furl") or furl

        logger.info(
            "Using Easebuzz payment provider (sandbox=%s, configured=%s).",
            is_sandbox,
            bool(merchant_key and salt),
        )
        return EasebuzzProvider(
            merchant_key=merchant_key,
            salt=salt,
            is_sandbox=is_sandbox,
            surl=surl,
            furl=furl,
        )

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

    # Gateways that are wired for payouts only. Naming one as the deposit
    # gateway is a configuration mistake, so say so instead of surfacing a
    # bare "unsupported provider" on every player's deposit attempt.
    if provider_key == "airpay":
        raise ValueError(
            "Airpay is configured for payouts only. Select a different gateway "
            "as the active deposit gateway in Admin Panel > Payment Gateways."
        )

    raise ValueError(f"Unsupported payment provider: '{provider_name}'")