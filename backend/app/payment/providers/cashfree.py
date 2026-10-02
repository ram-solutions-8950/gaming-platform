import base64
import hashlib
import hmac
import json
from typing import Optional
import httpx

from ..base import PaymentProvider
from ...utils.logging import get_logger

logger = get_logger("cashfree")


class CashfreeProvider(PaymentProvider):
    SANDBOX_BASE_URL = "https://sandbox.cashfree.com/pg"
    PROD_BASE_URL = "https://api.cashfree.com/pg"

    def __init__(
        self,
        app_id: Optional[str] = None,
        secret_key: Optional[str] = None,
        is_sandbox: bool = True,
    ) -> None:
        self.app_id = app_id or ""
        self.secret_key = secret_key or ""
        self.is_sandbox = is_sandbox
        self.base_url = self.SANDBOX_BASE_URL if is_sandbox else self.PROD_BASE_URL

    def _headers(self) -> dict:
        return {
            "x-client-id": self.app_id,
            "x-client-secret": self.secret_key,
            "x-api-version": "2023-08-01",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def create_payment(
        self,
        amount: int,
        user_id: str,
        metadata: Optional[dict] = None,
    ) -> dict:
        """Create a Cashfree payment order. amount is in paise."""
        if amount <= 0:
            raise ValueError("Payment amount must be positive")

        order_amount = round(amount / 100.0, 2)
        meta = metadata or {}
        order_id = meta.get("order_id") or f"cf_{user_id[:8]}_{int(amount)}_{int(httpx.__name__.__hash__() % 100000)}"
        customer_phone = meta.get("phone") or "9999999999"
        customer_email = meta.get("email") or f"user_{user_id[:8]}@corona888.tech"

        payload = {
            "order_id": order_id,
            "order_amount": order_amount,
            "order_currency": "INR",
            "customer_details": {
                "customer_id": str(user_id),
                "customer_email": customer_email,
                "customer_phone": customer_phone,
            },
            "order_meta": {
                "return_url": meta.get("return_url", "https://corona888.tech/wallet?status={order_status}&order_id={order_id}"),
                "notify_url": meta.get("notify_url", "https://api.corona888.tech/api/v1/payments/webhook/cashfree"),
            },
            "order_note": f"Wallet Deposit User {user_id}",
        }

        try:
            with httpx.Client(timeout=15.0) as client:
                resp = client.post(
                    f"{self.base_url}/orders",
                    json=payload,
                    headers=self._headers(),
                )
                if resp.status_code not in (200, 201):
                    logger.error("Cashfree create order error: %s %s", resp.status_code, resp.text)
                    raise ValueError(f"Cashfree order creation failed: {resp.text}")

                data = resp.json()
                return {
                    "provider_order_id": data.get("order_id", order_id),
                    "payment_session_id": data.get("payment_session_id"),
                    "amount": int(amount),
                    "currency": "INR",
                    "status": "PENDING" if data.get("order_status") == "ACTIVE" else data.get("order_status", "PENDING"),
                    "provider": "cashfree",
                    "environment": "sandbox" if self.is_sandbox else "production",
                }
        except httpx.HTTPError as exc:
            logger.error("Cashfree HTTP connection error: %s", exc)
            raise ValueError(f"Cashfree communication error: {exc}")

    def get_payment_status(self, provider_order_id: str) -> dict:
        """Fetch Cashfree order status."""
        try:
            with httpx.Client(timeout=15.0) as client:
                resp = client.get(
                    f"{self.base_url}/orders/{provider_order_id}",
                    headers=self._headers(),
                )
                if resp.status_code != 200:
                    logger.error("Cashfree fetch order error: %s %s", resp.status_code, resp.text)
                    return {
                        "status": "PENDING",
                        "provider_payment_id": None,
                        "amount": 0,
                        "currency": "INR",
                        "provider_order_id": provider_order_id,
                    }

                data = resp.json()
                cf_status = data.get("order_status", "PENDING")
                status = "SUCCESS" if cf_status == "PAID" else ("FAILED" if cf_status in ("EXPIRED", "TERMINATED") else "PENDING")
                order_amount = int(float(data.get("order_amount", 0)) * 100)

                return {
                    "status": status,
                    "provider_payment_id": data.get("cf_order_id"),
                    "amount": order_amount,
                    "currency": "INR",
                    "provider_order_id": data.get("order_id", provider_order_id),
                }
        except Exception as exc:
            logger.error("Failed to fetch Cashfree order status: %s", exc)
            return {
                "status": "PENDING",
                "provider_payment_id": None,
                "amount": 0,
                "currency": "INR",
                "provider_order_id": provider_order_id,
            }

    def verify_payment(
        self,
        provider_order_id: str,
        provider_payment_id: str,
        signature: str,
    ) -> bool:
        """Verify payment by querying status from Cashfree servers."""
        status_info = self.get_payment_status(provider_order_id)
        return status_info.get("status") == "SUCCESS"

    def verify_webhook(self, raw_body: bytes, headers: dict) -> bool:
        """Verify Cashfree webhook HMAC-SHA256 signature."""
        sig = headers.get("x-webhook-signature") or headers.get("X-Webhook-Signature")
        timestamp = headers.get("x-webhook-timestamp") or headers.get("X-Webhook-Timestamp")
        if not sig or not timestamp or not self.secret_key:
            return False

        message = timestamp.encode("utf-8") + raw_body
        expected = base64.b64encode(
            hmac.new(self.secret_key.encode("utf-8"), message, hashlib.sha256).digest()
        ).decode("utf-8")
        return hmac.compare_digest(sig, expected)

    def process_webhook(self, raw_body: bytes, headers: dict) -> dict:
        try:
            data = json.loads(raw_body.decode("utf-8"))
            order_data = data.get("data", {}).get("order", {})
            payment_data = data.get("data", {}).get("payment", {})
            payment_status = payment_data.get("payment_status") or order_data.get("order_status")

            return {
                "status": "SUCCESS" if payment_status == "SUCCESS" else "FAILED",
                "provider": "cashfree",
                "event_id": str(data.get("event_time", "")),
                "provider_order_id": order_data.get("order_id"),
                "provider_payment_id": str(payment_data.get("cf_payment_id", "")),
                "amount": int(float(order_data.get("order_amount", 0)) * 100),
            }
        except Exception as exc:
            logger.error("Cashfree webhook parsing failed: %s", exc)
            return {"status": "REJECTED", "provider": "cashfree"}

    def reconcile(self, provider_order_id: str) -> dict:
        return self.get_payment_status(provider_order_id)
