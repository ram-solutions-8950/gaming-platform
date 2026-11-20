"""Covers choosing the payout gateway independently of the deposit gateway.

The requirement these pin down: one gateway collects deposits while a
different one settles withdrawals. Deposits follow the ``is_active`` row,
payouts follow ``extra_config["payouts_enabled"]``, and neither flag
constrains the other.

Also pinned: a withdrawal already in flight is always reconciled against the
gateway it was *started* on. If an admin switches payout gateways while a
payout is pending, checking it against the new gateway would ask the wrong
provider about an id it has never seen -- and an unrecognised id must never
be read as "this payout failed", because refunding a payout that did leave
pays the player twice.
"""
from __future__ import annotations

import uuid

import pytest

from app.models.payment_gateway import PaymentGatewayConfig
from app.payment.payout_base import (
    PAYOUT_FAILED,
    PAYOUT_PENDING,
    PAYOUT_PROCESSED,
    PAYOUT_REFUNDABLE,
    PAYOUT_REVERSED,
    PAYOUT_STATUSES,
    PAYOUT_UNKNOWN,
)
from app.payment.providers.airpay_payout import AirpayPayoutProvider
from app.payment.providers.airpay_payout import map_status as airpay_status
from app.payment.providers.razorpayx_payout import map_status as razorpayx_status
from app.services.payment_service import get_provider
from app.services.payout_service import (
    get_payout_gateway_config,
    get_payout_provider,
)


def _row(name: str, *, active: bool = False, extra: dict | None = None):
    return PaymentGatewayConfig(
        id=uuid.uuid4(),
        gateway_name=name,
        display_name=name.title(),
        is_active=active,
        api_key=f"{name}_key",
        api_secret=f"{name}_secret",
        is_sandbox=True,
        extra_config=extra or {},
    )


@pytest.fixture(autouse=True)
def clean_gateways(db):
    """Gateway rows are globally unique by name, so clear them each test."""
    db.query(PaymentGatewayConfig).delete()
    db.commit()
    yield
    db.query(PaymentGatewayConfig).delete()
    db.commit()


RAZORPAY_PAYOUT_EXTRA = {
    "payouts_enabled": True,
    "payout_api_key": "rzp_payout_key",
    "payout_api_secret": "rzp_payout_secret",
    "payout_account_number": "1234567890",
}
AIRPAY_PAYOUT_EXTRA = {"payouts_enabled": True, "payout_token": "airpay-jwt-token"}


# ---------------------------------------------------------------------------
# The split itself
# ---------------------------------------------------------------------------

def test_deposits_and_payouts_can_run_on_different_gateways(db):
    """The client's arrangement: Easebuzz collects, Airpay settles."""
    db.add(_row("easebuzz", active=True))
    db.add(_row("airpay", active=False, extra=AIRPAY_PAYOUT_EXTRA))
    db.commit()

    deposit_provider = get_provider(None, db=db)
    assert type(deposit_provider).__name__ == "EasebuzzProvider"

    payout_provider = get_payout_provider(db)
    assert isinstance(payout_provider, AirpayPayoutProvider)
    assert payout_provider.name == "airpay"


def test_the_deposit_gateway_does_not_become_the_payout_gateway(db):
    """Being active for deposits must not imply settling withdrawals."""
    db.add(_row("easebuzz", active=True))
    db.commit()

    assert get_payout_gateway_config(db) is None
    assert get_payout_provider(db) is None


def test_the_payout_gateway_does_not_become_the_deposit_gateway(db):
    """Airpay is wired for payouts only; naming it for deposits must explain."""
    db.add(_row("airpay", active=True, extra=AIRPAY_PAYOUT_EXTRA))
    db.commit()

    with pytest.raises(ValueError, match="payouts only"):
        get_provider(None, db=db)


def test_one_gateway_may_do_both(db):
    db.add(_row("razorpay", active=True, extra=RAZORPAY_PAYOUT_EXTRA))
    db.commit()

    assert type(get_provider(None, db=db)).__name__ == "RazorpayProvider"
    assert get_payout_provider(db).name == "razorpayx"


def test_payouts_disabled_means_no_provider(db):
    db.add(_row("airpay", extra={"payouts_enabled": False, "payout_token": "t"}))
    db.commit()
    assert get_payout_provider(db) is None


def test_enabling_payouts_on_two_gateways_is_deterministic(db):
    """Misconfiguration must not make the destination of money order-dependent."""
    db.add(_row("airpay", extra=AIRPAY_PAYOUT_EXTRA))
    db.add(_row("razorpay", extra=RAZORPAY_PAYOUT_EXTRA))
    db.commit()

    chosen = {get_payout_provider(db).name for _ in range(5)}
    assert len(chosen) == 1
    # PAYOUT_CAPABLE order decides, not row insertion order.
    assert chosen == {"razorpayx"}


# ---------------------------------------------------------------------------
# In-flight withdrawals stay with their original gateway
# ---------------------------------------------------------------------------

def test_an_in_flight_payout_is_resolved_against_its_original_gateway(db):
    """Admin switched to Airpay; a RazorpayX payout must still go to RazorpayX."""
    db.add(_row("razorpay", extra=dict(RAZORPAY_PAYOUT_EXTRA, payouts_enabled=False)))
    db.add(_row("airpay", extra=AIRPAY_PAYOUT_EXTRA))
    db.commit()

    # Reconciling an in-flight payout works even though payouts are now off
    # for that gateway.
    provider = get_payout_provider(
        db, require_enabled=False, provider_name="razorpayx"
    )
    assert provider is not None
    assert provider.name == "razorpayx"


def test_the_adapter_name_maps_back_to_its_gateway_row(db):
    """Withdrawals store "razorpayx" while the config row is "razorpay"."""
    db.add(_row("razorpay", extra=RAZORPAY_PAYOUT_EXTRA))
    db.commit()
    assert get_payout_provider(db, provider_name="razorpayx") is not None
    assert get_payout_provider(db, provider_name="razorpay") is not None


def test_an_unknown_gateway_name_resolves_to_nothing(db):
    assert get_payout_provider(db, provider_name="gateway-that-left") is None


# ---------------------------------------------------------------------------
# Incomplete credentials must refuse loudly
# ---------------------------------------------------------------------------

def test_razorpayx_payouts_enabled_without_credentials_raises(db):
    db.add(_row("razorpay", extra={"payouts_enabled": True}))
    db.commit()
    with pytest.raises(ValueError, match="incomplete"):
        get_payout_provider(db)


def test_airpay_payouts_enabled_without_a_token_raises(db):
    db.add(_row("airpay", extra={"payouts_enabled": True}))
    db.commit()
    with pytest.raises(ValueError, match="no payout API token"):
        get_payout_provider(db)


# ---------------------------------------------------------------------------
# Status normalisation
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("processed", PAYOUT_PROCESSED),
        ("queued", PAYOUT_PENDING),
        ("scheduled", PAYOUT_PENDING),
        ("processing", PAYOUT_PENDING),
        ("failed", PAYOUT_FAILED),
        ("cancelled", PAYOUT_FAILED),
        ("reversed", PAYOUT_REVERSED),
    ],
)
def test_razorpayx_status_mapping(raw, expected):
    assert razorpayx_status(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Pending", PAYOUT_PENDING),
        ("PENDING", PAYOUT_PENDING),
        ("success", PAYOUT_PROCESSED),
        ("failed", PAYOUT_FAILED),
        ("reversed", PAYOUT_REVERSED),
    ],
)
def test_airpay_status_mapping(raw, expected):
    assert airpay_status(raw) == expected


@pytest.mark.parametrize("mapper", [razorpayx_status, airpay_status])
@pytest.mark.parametrize("raw", ["", None, "something_invented_later", "ok", "0"])
def test_unmapped_statuses_become_unknown_never_failed(mapper, raw):
    """The money-losing default.

    If an unrecognised status fell through to ``failed``, a provider adding a
    new word would make the platform refund withdrawals whose money had
    already left -- paying those players twice.
    """
    assert mapper(raw) == PAYOUT_UNKNOWN
    assert PAYOUT_UNKNOWN not in PAYOUT_REFUNDABLE


@pytest.mark.parametrize("mapper", [razorpayx_status, airpay_status])
@pytest.mark.parametrize(
    "raw",
    ["processed", "pending", "failed", "reversed", "queued", "nonsense", ""],
)
def test_mappers_only_ever_return_declared_statuses(mapper, raw):
    assert mapper(raw) in PAYOUT_STATUSES


def test_only_processed_completes_and_only_terminal_failures_refund():
    assert PAYOUT_PROCESSED not in PAYOUT_REFUNDABLE
    assert PAYOUT_PENDING not in PAYOUT_REFUNDABLE
    assert PAYOUT_REFUNDABLE == {PAYOUT_FAILED, PAYOUT_REVERSED}


# ---------------------------------------------------------------------------
# Airpay payout request building
# ---------------------------------------------------------------------------

class _Withdrawal:
    def __init__(self, method: str, destination: str, net_amount: int = 50000):
        self.id = uuid.uuid4()
        self.method = method
        self.destination = destination
        self.net_amount = net_amount


class _User:
    id = uuid.uuid4()
    name = "Test Player"
    username = "testplayer"
    email = "player@example.test"
    phone = "9876543210"


def test_airpay_refuses_a_upi_only_withdrawal_rather_than_guessing():
    """Airpay marks the bank fields required even when a UPI id is present.

    Sending a bank-less batch would be rejected or misrouted, so this must
    fail with an explanation an operator can act on.
    """
    provider = AirpayPayoutProvider(auth_token="t")
    with pytest.raises(ValueError, match="bank account"):
        provider.create_payout(_Withdrawal("upi", "player@upi"), _User())


@pytest.mark.parametrize(
    "destination",
    [
        "name:Test Player,a/c:123456789012,ifsc:HDFC000123",   # IFSC too short
        "name:Test Player,a/c:,ifsc:HDFC0001234",              # no account no.
        "",                                                     # nothing at all
    ],
)
def test_airpay_refuses_incomplete_bank_details(destination):
    provider = AirpayPayoutProvider(auth_token="t")
    with pytest.raises(ValueError, match="bank account"):
        provider.create_payout(_Withdrawal("bank", destination), _User())


def test_airpay_refuses_without_a_token():
    provider = AirpayPayoutProvider(auth_token="")
    good = "name:Test Player,a/c:123456789012,ifsc:HDFC0001234"
    with pytest.raises(ValueError, match="no API token"):
        provider.create_payout(_Withdrawal("bank", good), _User())


def test_airpay_refuses_a_non_positive_net_amount():
    provider = AirpayPayoutProvider(auth_token="t")
    good = "name:Test Player,a/c:123456789012,ifsc:HDFC0001234"
    with pytest.raises(ValueError, match="positive"):
        provider.create_payout(_Withdrawal("bank", good, net_amount=0), _User())


def test_airpay_status_check_without_a_token_is_unknown_not_failed():
    provider = AirpayPayoutProvider(auth_token="")
    assert provider.get_payout_status("anything")["status"] == PAYOUT_UNKNOWN


def test_airpay_transfer_mode_falls_back_to_a_documented_value():
    """Only IMPS and NEFT are documented; anything else must not be sent."""
    assert AirpayPayoutProvider("t", default_transfer_mode="UPI").default_transfer_mode == "IMPS"
    assert AirpayPayoutProvider("t", default_transfer_mode="neft").default_transfer_mode == "NEFT"
    assert AirpayPayoutProvider("t", default_transfer_mode="").default_transfer_mode == "IMPS"
