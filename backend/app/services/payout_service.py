"""Resolve which gateway settles withdrawals.

Deposits and payouts are chosen by two different flags, which is what lets
them run on different gateways:

* **Deposits** use the gateway row with ``is_active = true``
  (see ``payment_service.get_provider``).
* **Payouts** use the gateway row whose ``extra_config`` has
  ``payouts_enabled = true``.

Neither flag constrains the other, so Easebuzz can take deposits while
Airpay (or RazorpayX) settles withdrawals, or one gateway can do both.

Payout credentials live in ``extra_config`` rather than the row's own
``api_key``/``api_secret`` columns, because a gateway's collection and
disbursal products are issued separate credentials.

All of it is entered in Admin Panel > Payment Gateways. There is no
environment fallback for credentials by design: a leftover variable must
never be able to override, or silently stand in for, what an admin set.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from ..models.payment_gateway import PaymentGatewayConfig
from ..payment.payout_base import PayoutProvider
from ..payment.providers.airpay_payout import AirpayPayoutProvider
from ..payment.providers.razorpayx_payout import RazorpayXPayoutAdapter
from ..utils.logging import get_logger

logger = get_logger("payout")

#: Gateways that can send money out, mapped to the config row that holds
#: their payout credentials. A gateway absent here cannot settle payouts.
PAYOUT_CAPABLE = ("razorpay", "airpay")


def get_payout_gateway_config(db: Session) -> Optional[PaymentGatewayConfig]:
    """Return the gateway row designated for payouts, if any.

    Rows are considered in ``PAYOUT_CAPABLE`` order so that enabling payouts
    on two gateways at once is deterministic rather than dependent on row
    insertion order.
    """
    rows = (
        db.query(PaymentGatewayConfig)
        .filter(PaymentGatewayConfig.gateway_name.in_(PAYOUT_CAPABLE))
        .all()
    )
    by_name = {str(row.gateway_name).strip().lower(): row for row in rows}

    enabled = [
        by_name[name]
        for name in PAYOUT_CAPABLE
        if name in by_name and (by_name[name].extra_config or {}).get("payouts_enabled")
    ]

    if len(enabled) > 1:
        logger.warning(
            "Payouts are enabled on more than one gateway (%s); using %s.",
            ", ".join(str(row.gateway_name) for row in enabled),
            enabled[0].gateway_name,
        )

    return enabled[0] if enabled else None


def build_payout_provider(config: PaymentGatewayConfig) -> PayoutProvider:
    """Construct the payout client for a gateway row.

    Raises ``ValueError`` when payouts are switched on but the credentials
    are incomplete -- better a clear refusal at the point an admin presses
    "pay" than a half-configured request to the bank.
    """
    name = str(config.gateway_name).strip().lower()
    extra = config.extra_config or {}

    if name == "razorpay":
        key_id = str(extra.get("payout_api_key") or "").strip()
        key_secret = str(extra.get("payout_api_secret") or "").strip()
        account_number = str(extra.get("payout_account_number") or "").strip()
        if not (key_id and key_secret and account_number):
            raise ValueError(
                "RazorpayX payouts are enabled but the payout credentials are incomplete."
            )
        return RazorpayXPayoutAdapter(key_id, key_secret, account_number)

    if name == "airpay":
        token = str(
            extra.get("payout_token") or extra.get("payout_api_secret") or ""
        ).strip()
        if not token:
            raise ValueError(
                "Airpay payouts are enabled but no payout API token is configured."
            )
        return AirpayPayoutProvider(
            auth_token=token,
            merchant_id=str(extra.get("merchant_id") or config.api_key or "").strip(),
            default_transfer_mode=str(extra.get("transfer_mode") or "IMPS"),
        )

    raise ValueError(f"Gateway '{name}' does not support payouts.")


def get_payout_provider(
    db: Session,
    require_enabled: bool = True,
    provider_name: Optional[str] = None,
) -> Optional[PayoutProvider]:
    """Resolve the active payout provider.

    ``provider_name`` pins the lookup to the gateway a withdrawal was
    *started* on. That matters for a withdrawal already in flight: if an
    admin switches payout gateways midway, settlement must still be checked
    against the provider that actually holds the payout, not the new one.

    ``require_enabled=False`` allows that same lookup after payouts have
    been switched off, so an in-flight payout can still be reconciled.
    """
    if provider_name:
        wanted = str(provider_name).strip().lower()
        # The withdrawal records the adapter name ("razorpayx"), which is not
        # always the gateway row name ("razorpay").
        row_name = "razorpay" if wanted in {"razorpayx", "razorpay"} else wanted
        config = (
            db.query(PaymentGatewayConfig)
            .filter(PaymentGatewayConfig.gateway_name == row_name)
            .first()
        )
        if not config:
            return None
        if require_enabled and not (config.extra_config or {}).get("payouts_enabled"):
            return None
        return build_payout_provider(config)

    config = get_payout_gateway_config(db)
    if not config:
        # No gateway designated for payouts: withdrawals are settled by hand
        # from the admin panel. That is a safe default, so this is not an error.
        return None
    return build_payout_provider(config)
