import hashlib
import hmac
import json
from typing import Optional

import razorpay

from ..base import PaymentProvider
from ...config import settings


class RazorpayProvider(PaymentProvider):

    def __init__(self) -> None:
        if not settings.PAYMENT_API_KEY:
            raise ValueError("PAYMENT_API_KEY is not configured")

        if not settings.PAYMENT_SECRET:
            raise ValueError("PAYMENT_SECRET is not configured")

        self.key_id = settings.PAYMENT_API_KEY
        self.key_secret = settings.PAYMENT_SECRET

        self.client = razorpay.Client(
            auth=(self.key_id, self.key_secret)
        )

    def create_payment(
        self,
        amount: int,
        user_id: str,
        metadata: Optional[dict] = None,
    ) -> dict:

        if amount <= 0:
            raise ValueError("Payment amount must be positive")

        notes = {
            "user_id": str(user_id),
        }

        if metadata:
            notes.update({
                str(key): str(value)
                for key, value in metadata.items()
            })

        receipt = str(
            notes.get("receipt")
            or f"deposit-{user_id}-{amount}"
        )

        order = self.client.order.create({
            "amount": int(amount),
            "currency": "INR",
            "receipt": receipt,
            "notes": notes,
        })

        return {
            "provider_order_id": order["id"],
            "amount": int(order["amount"]),
            "currency": order["currency"],
            "status": order["status"],
            "key_id": self.key_id,
        }

    def get_payment_status(
        self,
        provider_order_id: str,
    ) -> dict:

        order = self.client.order.fetch(provider_order_id)
        payments = self.client.order.payments(provider_order_id)

        for payment in payments.get("items", []):
            if payment.get("status") == "captured":
                return {
                    "status": "SUCCESS",
                    "provider_payment_id": payment["id"],
                    "amount": int(payment["amount"]),
                    "currency": payment.get("currency", "INR"),
                    "provider_order_id": order["id"],
                }

        return {
            "status": str(
                order.get("status", "PENDING")
            ).upper(),
            "provider_payment_id": None,
            "amount": int(order.get("amount", 0)),
            "currency": order.get("currency", "INR"),
            "provider_order_id": order["id"],
        }

    def verify_payment(
        self,
        provider_order_id: str,
        provider_payment_id: str,
        signature: str,
    ) -> bool:

        try:
            self.client.utility.verify_payment_signature({
                "razorpay_order_id": provider_order_id,
                "razorpay_payment_id": provider_payment_id,
                "razorpay_signature": signature,
            })
            return True
        except Exception:
            return False

    def verify_webhook(
        self,
        raw_body: bytes,
        headers: dict,
    ) -> bool:

        signature = (
            headers.get("x-razorpay-signature")
            or headers.get("X-Razorpay-Signature")
        )

        webhook_secret = settings.PAYMENT_WEBHOOK_SECRET

        if not signature or not webhook_secret:
            return False

        expected_signature = hmac.new(
            webhook_secret.encode("utf-8"),
            raw_body,
            hashlib.sha256,
        ).hexdigest()

        return hmac.compare_digest(
            expected_signature,
            signature,
        )

    def process_webhook(
        self,
        raw_body: bytes,
        headers: dict,
    ) -> dict:

        payload = json.loads(
            raw_body.decode("utf-8")
        )

        event_type = payload.get(
            "event",
            "unknown",
        )

        payload_data = payload.get(
            "payload",
            {},
        )

        payment_entity = (
            payload_data
            .get("payment", {})
            .get("entity", {})
        )

        order_entity = (
            payload_data
            .get("order", {})
            .get("entity", {})
        )

        payment_id = payment_entity.get("id")

        order_id = (
            payment_entity.get("order_id")
            or order_entity.get("id")
        )

        amount = payment_entity.get("amount")

        if amount is None:
            amount = order_entity.get("amount")

        if event_type in {
            "payment.captured",
            "order.paid",
        }:
            status = "SUCCESS"
        elif event_type == "payment.failed":
            status = "FAILED"
        else:
            status = "RECEIVED"

        event_id = (
            headers.get("x-razorpay-event-id")
            or headers.get("X-Razorpay-Event-Id")
            or payload.get("id")
        )

        return {
            "provider": "razorpay",
            "event_id": str(event_id or ""),
            "event_type": event_type,
            "status": status,
            "provider_order_id": order_id,
            "provider_payment_id": payment_id,
            "amount": (
                int(amount)
                if amount is not None
                else None
            ),
            "currency": (
                payment_entity.get("currency")
                or order_entity.get("currency")
                or "INR"
            ),
            "payload": payload,
        }

    def reconcile(
        self,
        provider_order_id: str,
    ) -> dict:

        return self.get_payment_status(
            provider_order_id
        )