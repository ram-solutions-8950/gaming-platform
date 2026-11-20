"""Abstract payout (disbursal) provider interface.

Collections and payouts are deliberately separate abstractions here.
``PaymentProvider`` moves money *in* from a player and is selected by the
``is_active`` gateway row; ``PayoutProvider`` moves money *out* to a player
and is selected independently by ``extra_config["payouts_enabled"]``. That
split is what lets one gateway take deposits while a different one settles
withdrawals -- a normal arrangement in India, because collection and
disbursal are separately onboarded products.

Status vocabulary
-----------------
Every provider must normalise its own wording to exactly one of:

``processed``
    Money has left the account and reached the beneficiary. Terminal, and
    the only value that may complete a withdrawal.
``pending``
    Accepted by the provider, still in flight. Not terminal: never complete
    or refund a withdrawal on this.
``failed``
    The provider will not send the money. Terminal; the withdrawal may be
    refunded to the player's wallet.
``reversed``
    Money left and came back (bad beneficiary, bank rejection). Terminal;
    treated like ``failed`` for refund purposes.
``unknown``
    The provider could not be asked, or answered with something unmapped.
    Must be treated as "not settled" and never as a failure, since
    refunding a payout that actually went out pays the player twice.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

PAYOUT_PROCESSED = "processed"
PAYOUT_PENDING = "pending"
PAYOUT_FAILED = "failed"
PAYOUT_REVERSED = "reversed"
PAYOUT_UNKNOWN = "unknown"

#: Terminal states in which no money is with the beneficiary.
PAYOUT_REFUNDABLE = frozenset({PAYOUT_FAILED, PAYOUT_REVERSED})

#: Every value a provider is allowed to return.
PAYOUT_STATUSES = frozenset(
    {
        PAYOUT_PROCESSED,
        PAYOUT_PENDING,
        PAYOUT_FAILED,
        PAYOUT_REVERSED,
        PAYOUT_UNKNOWN,
    }
)


class PayoutProvider(ABC):
    """Sends an approved withdrawal to a player's bank account or UPI ID."""

    #: Short identifier persisted on the withdrawal, e.g. ``"razorpayx"``.
    name: str = "payout"

    @abstractmethod
    def create_payout(self, withdrawal: Any, user: Any) -> dict:
        """Instruct the provider to pay ``withdrawal.net_amount`` (in paise).

        Must be idempotent on ``withdrawal.id`` wherever the provider
        supports it, so a retry after a timeout cannot pay twice.

        Returns a dict with:
          ``payout_id`` - the provider's own id, required for later lookups.
          ``status``    - one of the module-level status constants.
          ``utr``       - bank reference if already known, else None.
        """
        ...

    @abstractmethod
    def get_payout_status(self, payout_id: str) -> dict:
        """Ask the provider where a payout stands.

        Returns a dict with ``status`` (a module-level constant) and ``utr``.
        Implementations must return ``unknown`` rather than raising when the
        provider is merely unreachable: the caller distinguishes "not settled
        yet" from "definitely failed", and a transport error is neither.
        """
        ...
