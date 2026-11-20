"""Easebuzz payment-collection provider.

Protocol notes
--------------
Easebuzz is a PayU-style gateway: you POST the order plus a SHA-512 hash to
``payment/initiateLink``, receive an *access key*, and send the customer to
``<pay_url>pay/<access_key>``. Every response -- the browser return POST to
``surl``/``furl``, the server-to-server webhook, and the status API -- is
authenticated by a *reverse* hash over a different field order.

The hash sequences below are taken from Easebuzz's own published Python SDK
(the ``Easebuzz`` package on PyPI, module ``Easebuzz/payment.py``), not from
a blog or from PayU's documentation. They are byte-exact and order-sensitive:
a single field out of place produces a valid-looking hash that the gateway
silently rejects, so do not "tidy" these tuples.

    request  = sha512("key|txnid|amount|productinfo|firstname|email"
                      "|udf1|...|udf10|salt")
    response = sha512("salt|status|udf10|...|udf1|email|firstname"
                      "|productinfo|amount|txnid|key")

Amount handling
---------------
Internally every amount in this codebase is an integer number of paise.
Easebuzz wants rupees with two decimals. The rupee string is computed once
and the *same string* is used both in the hash and in the posted form, which
is what the gateway recomputes against -- deriving it twice risks a float
repr like ``100.0`` vs ``100.00`` and an unexplainable hash mismatch.

Security
--------
``verify_webhook`` fails closed: a missing hash, an unparseable body or a
missing salt all return False, and the shared webhook pipeline then refuses
to credit the wallet.
"""
from __future__ import annotations

import json
from decimal import Decimal, InvalidOperation
from hashlib import sha512
from typing import Optional
from urllib.parse import parse_qsl

import httpx

from ..base import PaymentProvider
from ...utils.logging import get_logger

logger = get_logger("easebuzz")

# Field order for the request hash, before the trailing salt.
_REQUEST_HASH_SEQUENCE = (
    "key",
    "txnid",
    "amount",
    "productinfo",
    "firstname",
    "email",
    "udf1",
    "udf2",
    "udf3",
    "udf4",
    "udf5",
    "udf6",
    "udf7",
    "udf8",
    "udf9",
    "udf10",
)

# Field order for the reverse hash, after the leading "salt|status".
_REVERSE_HASH_SEQUENCE = (
    "udf10",
    "udf9",
    "udf8",
    "udf7",
    "udf6",
    "udf5",
    "udf4",
    "udf3",
    "udf2",
    "udf1",
    "email",
    "firstname",
    "productinfo",
    "amount",
    "txnid",
    "key",
)

# Easebuzz's own terminal states. Anything else is still in flight.
_SUCCESS_STATES = {"success"}
_FAILURE_STATES = {"failure", "failed", "usercancelled", "bounced"}


def _to_paise(value: object) -> Optional[int]:
    """Convert a rupee amount from Easebuzz into integer paise.

    Decimal, not float: ``float("1234.55") * 100`` is 123454.99999999999,
    which truncates to a paise short and would trip the webhook pipeline's
    amount-mismatch check.
    """
    if value is None:
        return None
    try:
        return int((Decimal(str(value).strip()) * 100).to_integral_value())
    except (InvalidOperation, ValueError, ArithmeticError):
        logger.warning("Easebuzz sent an unparseable amount: %r", value)
        return None


class EasebuzzProvider(PaymentProvider):
    TEST_PAYMENT_URL = "https://testpay.easebuzz.in/"
    PROD_PAYMENT_URL = "https://pay.easebuzz.in/"
    TEST_DASHBOARD_URL = "https://testdashboard.easebuzz.in/"
    PROD_DASHBOARD_URL = "https://dashboard.easebuzz.in/"

    def __init__(
        self,
        merchant_key: Optional[str] = None,
        salt: Optional[str] = None,
        is_sandbox: bool = True,
        surl: Optional[str] = None,
        furl: Optional[str] = None,
    ) -> None:
        self.merchant_key = merchant_key or ""
        self.salt = salt or ""
        self.is_sandbox = is_sandbox
        self.payment_url = self.TEST_PAYMENT_URL if is_sandbox else self.PROD_PAYMENT_URL
        self.dashboard_url = (
            self.TEST_DASHBOARD_URL if is_sandbox else self.PROD_DASHBOARD_URL
        )
        self.surl = surl or ""
        self.furl = furl or ""

    # ------------------------------------------------------------------
    # Hashing
    # ------------------------------------------------------------------

    def _request_hash(self, params: dict) -> str:
        parts = [str(params.get(field, "") or "") for field in _REQUEST_HASH_SEQUENCE]
        # Note the trailing separator: the salt follows a pipe, so the string
        # ends "...|udf10|salt" with exactly 16 pipes before the salt.
        hash_string = "|".join(parts) + "|" + self.salt
        return sha512(hash_string.encode("utf-8")).hexdigest().lower()

    def _reverse_hash(self, params: dict) -> str:
        status = str(params.get("status", "") or "")
        parts = [str(params.get(field, "") or "") for field in _REVERSE_HASH_SEQUENCE]
        hash_string = "|".join([self.salt, status] + parts)
        return sha512(hash_string.encode("utf-8")).hexdigest().lower()

    # ------------------------------------------------------------------
    # Collection
    # ------------------------------------------------------------------

    def create_payment(
        self,
        amount: int,
        user_id: str,
        metadata: Optional[dict] = None,
    ) -> dict:
        """Create an Easebuzz payment link. ``amount`` is in paise."""
        if not self.merchant_key or not self.salt:
            logger.warning("Easebuzz merchant key or salt is not configured.")
            raise ValueError(
                "Easebuzz payment credentials are not configured. Please enter "
                "your Easebuzz Merchant Key and Salt in Admin Panel > Payment "
                "Gateways."
            )

        if amount <= 0:
            raise ValueError("Payment amount must be positive")

        meta = metadata or {}

        deposit_id = meta.get("deposit_id")
        if meta.get("order_id"):
            txnid = str(meta["order_id"])
        elif deposit_id:
            # Stable across a retry of this same operation and unique per
            # attempt. Hex (not the dashed UUID form) keeps it alphanumeric,
            # which Easebuzz requires of txnid.
            txnid = f"eb{str(deposit_id).replace('-', '')}"
        else:
            import uuid as _uuid

            txnid = f"eb{_uuid.uuid4().hex}"

        surl = meta.get("surl") or self.surl
        furl = meta.get("furl") or self.furl
        if not surl or not furl:
            raise ValueError(
                "Easebuzz requires success and failure return URLs. Set them in "
                "Admin Panel > Payment Gateways."
            )

        # One canonical rupee string, reused verbatim in the hash and the form.
        amount_str = f"{(Decimal(amount) / 100):.2f}"

        name = str(meta.get("name") or "Player").strip() or "Player"
        phone_digits = "".join(ch for ch in str(meta.get("phone") or "") if ch.isdigit())

        params = {
            "key": self.merchant_key,
            "txnid": txnid,
            "amount": amount_str,
            "productinfo": "Wallet Deposit",
            "firstname": name,
            "email": meta.get("email") or "",
            "phone": phone_digits or "9999999999",
            "surl": surl,
            "furl": furl,
            # udf1 carries our user id so a support query on the Easebuzz
            # dashboard can be traced back without a database lookup. It is
            # part of both hashes, so it must be set before hashing.
            "udf1": str(user_id),
        }
        params["hash"] = self._request_hash(params)

        try:
            with httpx.Client(timeout=15.0) as client:
                resp = client.post(
                    f"{self.payment_url}payment/initiateLink",
                    data=params,
                )
        except httpx.HTTPError as exc:
            logger.error("Easebuzz HTTP connection error: %s", exc)
            raise ValueError(f"Easebuzz communication error: {exc}")

        try:
            body = resp.json()
        except ValueError:
            logger.error(
                "Easebuzz initiateLink returned non-JSON: %s %s",
                resp.status_code,
                resp.text[:500],
            )
            raise ValueError("Easebuzz returned an unreadable response.")

        # Easebuzz reports failure in the body with status 0, not via HTTP code.
        if str(body.get("status")) != "1" or not body.get("data"):
            reason = body.get("data") or body.get("error_desc") or body.get("message")
            logger.error("Easebuzz initiateLink failed: %s", reason)
            raise ValueError(f"Easebuzz order creation failed: {reason}")

        access_key = str(body["data"])

        return {
            "provider_order_id": txnid,
            "payment_url": f"{self.payment_url}pay/{access_key}",
            "access_key": access_key,
            "amount": int(amount),
            "currency": "INR",
            "status": "PENDING",
            "provider": "easebuzz",
            "environment": "sandbox" if self.is_sandbox else "production",
        }

    def get_payment_status(self, provider_order_id: str) -> dict:
        """Fetch transaction status via ``transaction/v2/retrieve``.

        v2 is used rather than v1 because its hash covers only ``key|txnid``,
        so a status check needs nothing but the order id -- v1 additionally
        requires the amount, email and phone of the original request.
        """
        unknown = {
            "status": "PENDING",
            "provider_payment_id": None,
            "amount": 0,
            "currency": "INR",
            "provider_order_id": provider_order_id,
        }

        if not self.merchant_key or not self.salt:
            return unknown

        params = {"key": self.merchant_key, "txnid": str(provider_order_id)}
        hash_string = f"{self.merchant_key}|{provider_order_id}|{self.salt}"
        params["hash"] = sha512(hash_string.encode("utf-8")).hexdigest().lower()

        try:
            with httpx.Client(timeout=15.0) as client:
                resp = client.post(
                    f"{self.dashboard_url}transaction/v2/retrieve",
                    data=params,
                )
            body = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.error("Failed to fetch Easebuzz transaction status: %s", exc)
            return unknown

        if not body.get("status"):
            logger.info(
                "Easebuzz has no record of txnid=%s: %s",
                provider_order_id,
                body.get("data") or body.get("msg"),
            )
            return unknown

        msg = body.get("msg")
        if isinstance(msg, list):
            msg = msg[0] if msg else None
        if not isinstance(msg, dict):
            return unknown

        # The status API is authenticated by the same reverse hash. A mismatch
        # means the payload is not trustworthy, so report nothing rather than
        # risk acting on a forged success.
        provided = str(msg.get("hash") or "")
        if provided and provided.lower() != self._reverse_hash(msg):
            logger.error(
                "Easebuzz status reverse-hash mismatch for txnid=%s", provider_order_id
            )
            return unknown

        raw_status = str(msg.get("status") or "").strip().lower()
        if raw_status in _SUCCESS_STATES:
            status = "SUCCESS"
        elif raw_status in _FAILURE_STATES:
            status = "FAILED"
        else:
            status = "PENDING"

        return {
            "status": status,
            "provider_payment_id": str(msg.get("easepayid") or "") or None,
            "amount": _to_paise(msg.get("amount")) or 0,
            "currency": "INR",
            "provider_order_id": str(msg.get("txnid") or provider_order_id),
        }

    def verify_payment(
        self,
        provider_order_id: str,
        provider_payment_id: str,
        signature: str,
    ) -> bool:
        """Verify by asking Easebuzz, never by trusting a client-supplied field."""
        return self.get_payment_status(provider_order_id).get("status") == "SUCCESS"

    # ------------------------------------------------------------------
    # Webhook / return callback
    # ------------------------------------------------------------------

    def _parse_body(self, raw_body: bytes) -> dict:
        """Easebuzz posts form-encoded data; some accounts are set to JSON."""
        text = raw_body.decode("utf-8", errors="replace").strip()
        if not text:
            return {}
        if text.startswith("{"):
            try:
                parsed = json.loads(text)
                return parsed if isinstance(parsed, dict) else {}
            except ValueError:
                return {}
        return dict(parse_qsl(text, keep_blank_values=True))

    def verify_webhook(self, raw_body: bytes, headers: dict) -> bool:
        """Authenticate a callback via its reverse hash. Fails closed."""
        if not self.salt:
            logger.warning("Easebuzz webhook rejected: salt is not configured.")
            return False

        payload = self._parse_body(raw_body)
        provided = str(payload.get("hash") or "").strip().lower()
        if not provided:
            logger.warning("Easebuzz webhook rejected: no hash in payload.")
            return False

        expected = self._reverse_hash(payload)
        if provided != expected:
            logger.warning(
                "Easebuzz webhook rejected: reverse-hash mismatch for txnid=%s",
                payload.get("txnid"),
            )
            return False
        return True

    def process_webhook(self, raw_body: bytes, headers: dict) -> dict:
        """Parse an already-verified callback. Never call before verify."""
        try:
            payload = self._parse_body(raw_body)
            raw_status = str(payload.get("status") or "").strip().lower()

            if raw_status in _SUCCESS_STATES:
                status = "SUCCESS"
            elif raw_status in _FAILURE_STATES:
                status = "FAILED"
            else:
                # An in-flight state must not be reported as FAILED: the
                # pipeline would record a terminal event for a payment that
                # may still succeed.
                status = "PENDING"

            easepayid = str(payload.get("easepayid") or "")
            txnid = str(payload.get("txnid") or "")

            return {
                "status": status,
                "provider": "easebuzz",
                # easepayid is Easebuzz's own payment id and is unique per
                # payment, which is what the pipeline's idempotency key needs.
                "event_id": easepayid or txnid,
                "provider_order_id": txnid or None,
                "provider_payment_id": easepayid or None,
                "amount": _to_paise(payload.get("amount")),
            }
        except Exception as exc:
            logger.error("Easebuzz webhook parsing failed: %s", exc)
            return {"status": "REJECTED", "provider": "easebuzz"}

    def reconcile(self, provider_order_id: str) -> dict:
        return self.get_payment_status(provider_order_id)
