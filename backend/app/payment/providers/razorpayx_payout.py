"""RazorpayX adapter onto the common ``PayoutProvider`` interface.

The existing ``RazorpayXPayoutProvider`` is kept as the HTTP client and is
unchanged; this wrapper only normalises its result shape and its status
wording, so ``withdrawal_service`` can treat every payout gateway alike.
"""
from __future__ import annotations

from typing import Any

from ..payout_base import (
    PAYOUT_FAILED,
    PAYOUT_PENDING,
    PAYOUT_PROCESSED,
    PAYOUT_REVERSED,
    PAYOUT_UNKNOWN,
    PayoutProvider,
)
from .razorpayx import RazorpayXPayoutProvider
from ...utils.logging import get_logger

logger = get_logger("razorpayx_payout")

# RazorpayX payout states, mapped onto our vocabulary.
# "queued" and "scheduled" mean accepted but not sent; "processing" means in
# flight. None of those may complete a withdrawal.
_STATUS_MAP = {
    "processed": PAYOUT_PROCESSED,
    "queued": PAYOUT_PENDING,
    "scheduled": PAYOUT_PENDING,
    "pending": PAYOUT_PENDING,
    "processing": PAYOUT_PENDING,
    "created": PAYOUT_PENDING,
    "failed": PAYOUT_FAILED,
    "cancelled": PAYOUT_FAILED,
    "rejected": PAYOUT_FAILED,
    "reversed": PAYOUT_REVERSED,
}


def map_status(raw: object) -> str:
    """Translate a RazorpayX status. Unrecognised wording becomes ``unknown``.

    Never defaults to ``failed``: a status Razorpay adds later must not cause
    an automatic refund of a payout that may well have gone out.
    """
    key = str(raw or "").strip().lower()
    mapped = _STATUS_MAP.get(key)
    if mapped is None:
        logger.warning("Unrecognised RazorpayX payout status %r", raw)
        return PAYOUT_UNKNOWN
    return mapped


class RazorpayXPayoutAdapter(PayoutProvider):
    name = "razorpayx"

    def __init__(self, key_id: str, key_secret: str, account_number: str) -> None:
        self._client = RazorpayXPayoutProvider(key_id, key_secret, account_number)

    def create_payout(self, withdrawal: Any, user: Any) -> dict:
        payout = self._client.create_payout(withdrawal, user)
        return {
            "payout_id": payout["id"],
            "status": map_status(payout.get("status", "pending")),
            "utr": payout.get("utr"),
        }

    def get_payout_status(self, payout_id: str) -> dict:
        try:
            payout = self._client.get_payout(str(payout_id))
        except ValueError as exc:
            # Transport or credential failure: not evidence of a failed payout.
            logger.error("Could not read RazorpayX payout %s: %s", payout_id, exc)
            return {"status": PAYOUT_UNKNOWN, "utr": None}
        return {
            "status": map_status(payout.get("status")),
            "utr": payout.get("utr"),
        }
