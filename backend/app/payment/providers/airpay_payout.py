"""Airpay batch-payout provider.

Scope and confidence
--------------------
This is written against Airpay's published v4 documentation
(``docs.airpay.co.in/v4/payments/payout/create-batch-payout/`` and
``/get-status-check/``). Three things are **not** settled by those docs and
are called out at the point of use below:

1. How the ``Authorization`` JWT is obtained. The payout pages say only that
   a JWT is required; unlike the collection APIs there is no documented
   token endpoint. It is therefore taken from gateway configuration, where
   an operator pastes the token Airpay issues them.
2. Whether a UPI-only transfer is permitted. ``upi_id`` is optional while
   ``bank_account_id`` and ``bank_ifsc`` are both marked required, so a
   payout with no bank details is refused here rather than sent hopefully.
3. The full set of payout status values. Only "PENDING"/"Pending" appears in
   the documented examples, so anything unrecognised maps to ``unknown``,
   which never triggers an automatic refund.

Until Airpay confirm those, treat this as unverified against a live account:
the request shape follows the docs, but nothing here has been exercised
against a real merchant id. The deliberate design choice throughout is to
fail closed -- raise or report ``unknown`` -- because the failure mode of
guessing is either paying a player twice or refunding money that did leave.

Batching
--------
Airpay's API is batch-oriented while withdrawals are approved one at a
time, so each withdrawal is sent as a batch of exactly one transfer. That
keeps the ``PayoutProvider`` contract and makes the withdrawal id the
natural idempotency key.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional

import httpx

from ..payout_base import (
    PAYOUT_FAILED,
    PAYOUT_PENDING,
    PAYOUT_PROCESSED,
    PAYOUT_REVERSED,
    PAYOUT_UNKNOWN,
    PayoutProvider,
)
from ...utils.logging import get_logger

logger = get_logger("airpay_payout")

# Mapped from the documented example values plus the conventional wording.
# Anything absent here deliberately becomes "unknown".
_STATUS_MAP = {
    "success": PAYOUT_PROCESSED,
    "processed": PAYOUT_PROCESSED,
    "completed": PAYOUT_PROCESSED,
    "settled": PAYOUT_PROCESSED,
    "pending": PAYOUT_PENDING,
    "processing": PAYOUT_PENDING,
    "initiated": PAYOUT_PENDING,
    "queued": PAYOUT_PENDING,
    "failed": PAYOUT_FAILED,
    "rejected": PAYOUT_FAILED,
    "cancelled": PAYOUT_FAILED,
    "reversed": PAYOUT_REVERSED,
    "returned": PAYOUT_REVERSED,
}


def map_status(raw: object) -> str:
    key = str(raw or "").strip().lower()
    mapped = _STATUS_MAP.get(key)
    if mapped is None:
        logger.warning("Unrecognised Airpay payout status %r", raw)
        return PAYOUT_UNKNOWN
    return mapped


def _parse_bank_destination(destination: str) -> dict:
    """Pull account number and IFSC out of a stored destination string.

    Withdrawals store bank details in the same ``name:...,a/c:...,ifsc:...``
    shape the RazorpayX provider parses, so the two stay consistent.
    """
    parts: dict = {}
    for part in (destination or "").split(","):
        if ":" in part:
            key, value = part.split(":", 1)
            parts[key.strip().lower()] = value.strip()
    return parts


class AirpayPayoutProvider(PayoutProvider):
    name = "airpay"

    BASE_URL = "https://kraken.airpay.co.in/airpay"
    CREATE_PATH = "/api/partner/payout-batches"
    STATUS_PATH = "/api/transaction/status-check"

    def __init__(
        self,
        auth_token: str,
        merchant_id: Optional[str] = None,
        default_transfer_mode: str = "IMPS",
    ) -> None:
        self.auth_token = (auth_token or "").strip()
        self.merchant_id = (merchant_id or "").strip()
        mode = (default_transfer_mode or "IMPS").strip().upper()
        # The docs list only these two transfer modes.
        self.default_transfer_mode = mode if mode in {"IMPS", "NEFT"} else "IMPS"

    def _headers(self) -> dict:
        return {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {self.auth_token}",
        }

    def create_payout(self, withdrawal: Any, user: Any) -> dict:
        if not self.auth_token:
            raise ValueError(
                "Airpay payouts are enabled but no API token is configured. "
                "Paste the token Airpay issued you into Admin Panel > Payment "
                "Gateways > Airpay > payout token."
            )

        method = str(getattr(withdrawal, "method", "") or "").strip().lower()
        destination = str(getattr(withdrawal, "destination", "") or "").strip()
        parts = _parse_bank_destination(destination)

        account_number = (
            parts.get("a/c") or parts.get("ac") or parts.get("account number") or ""
        ).strip()
        ifsc = (parts.get("ifsc") or "").strip().upper()
        upi_id = destination if method == "upi" else (parts.get("upi") or "")

        # Airpay marks the bank fields required even when a UPI id is given,
        # so a UPI-only withdrawal cannot be sent through this API as
        # documented. Refuse clearly instead of posting a request that would
        # be rejected or, worse, routed somewhere unintended.
        if not account_number or len(ifsc) != 11:
            raise ValueError(
                "Airpay batch payouts require the beneficiary bank account "
                "number and an 11-character IFSC. This withdrawal has only "
                f"'{method or 'no'}' details, so it cannot be paid through "
                "Airpay -- settle it through a gateway that supports UPI "
                "payouts, or ask the player for bank details."
            )

        user_name = (
            getattr(user, "name", None) or getattr(user, "username", None) or "Player"
        ).strip()
        payee_name = (parts.get("name") or user_name or "Player")[:120]

        phone_digits = "".join(
            ch for ch in str(getattr(user, "phone", "") or "") if ch.isdigit()
        )

        withdrawal_hex = str(getattr(withdrawal, "id", "")).replace("-", "")
        # batch_code is capped at 25 characters by the docs; 25 hex characters
        # of a UUID is still collision-free for this purpose.
        batch_code = withdrawal_hex[:25]

        # net_amount is paise internally; Airpay's amount field is in rupees.
        net_paise = int(getattr(withdrawal, "net_amount", 0) or 0)
        if net_paise <= 0:
            raise ValueError("Withdrawal net amount must be positive to pay out.")
        amount_rupees = f"{(Decimal(net_paise) / 100):.2f}"

        payload = {
            "batch_code": batch_code,
            "batch_name": f"Withdrawal {batch_code[:12]}",
            "created_datetime": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
            "transfers": [
                {
                    "transfer_number": 1,
                    "UID": str(getattr(user, "id", ""))[:40],
                    "payee_name": payee_name,
                    "payee_mobile": phone_digits or "",
                    "payee_email": (getattr(user, "email", None) or "") or "",
                    "bank_name": (parts.get("bank") or "").strip(),
                    "account_type": (parts.get("type") or "Saving").strip(),
                    "bank_account_id": account_number,
                    "bank_ifsc": ifsc,
                    "order_id": str(getattr(withdrawal, "id", "")),
                    "currency": "INR",
                    "amount": amount_rupees,
                    "transfer_mode": self.default_transfer_mode,
                    "remarks": "Wallet withdrawal",
                }
            ],
        }
        if upi_id:
            payload["transfers"][0]["upi_id"] = upi_id

        try:
            with httpx.Client(timeout=30.0) as client:
                resp = client.post(
                    f"{self.BASE_URL}{self.CREATE_PATH}",
                    json=payload,
                    headers=self._headers(),
                )
        except httpx.HTTPError as exc:
            # A timeout is genuinely ambiguous: Airpay may have accepted the
            # batch. Surface it so an operator reconciles rather than letting
            # a retry create a second batch for the same withdrawal.
            logger.error("Airpay payout transport error for %s: %s", batch_code, exc)
            raise ValueError(
                "Could not reach Airpay to create the payout. Check on the "
                "Airpay dashboard whether batch "
                f"{batch_code} was created before retrying."
            ) from exc

        try:
            body = resp.json()
        except ValueError:
            body = {}

        if not resp.is_success or str(body.get("status", "")).lower() not in {
            "success",
            "200",
        }:
            message = (
                body.get("message")
                or body.get("error")
                or f"Airpay rejected the payout (HTTP {resp.status_code})."
            )
            logger.error("Airpay payout rejected for %s: %s", batch_code, message)
            raise ValueError(str(message))

        data = body.get("data") or {}
        transfers = data.get("transfers") or []
        first = transfers[0] if isinstance(transfers, list) and transfers else {}

        # Prefer a per-transfer id for later status checks; fall back to the
        # batch code, which is the only handle guaranteed to exist.
        payout_id = (
            str(first.get("transaction_id") or "").strip()
            or str(data.get("code") or "").strip()
            or batch_code
        )

        return {
            "payout_id": payout_id,
            "status": map_status(first.get("status") or "PENDING"),
            "utr": first.get("utr_number"),
        }

    def get_payout_status(self, payout_id: str) -> dict:
        if not self.auth_token:
            return {"status": PAYOUT_UNKNOWN, "utr": None}

        try:
            with httpx.Client(timeout=25.0) as client:
                resp = client.get(
                    f"{self.BASE_URL}{self.STATUS_PATH}/{payout_id}",
                    headers=self._headers(),
                )
            body = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.error("Could not read Airpay payout %s: %s", payout_id, exc)
            return {"status": PAYOUT_UNKNOWN, "utr": None}

        if not resp.is_success:
            logger.error(
                "Airpay status check for %s returned HTTP %s", payout_id, resp.status_code
            )
            return {"status": PAYOUT_UNKNOWN, "utr": None}

        data = body.get("data") or {}
        return {
            "status": map_status(data.get("payout_status")),
            "utr": data.get("utr_number"),
        }
