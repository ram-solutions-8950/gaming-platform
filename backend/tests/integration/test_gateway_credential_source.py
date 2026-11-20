"""The admin panel is the only source of gateway credentials.

Credentials are entered in Admin Panel > Payment Gateways and stored in
``payment_gateway_configs``. There is deliberately no environment fallback
for them, and these tests keep it that way, because the failure mode of
having one is subtle and expensive: an admin clears a key in the panel to
rotate it, a leftover variable from an old deployment quietly takes over,
and deposits keep "working" -- into the previous merchant account.

So the property under test is a negative one. With no credentials in the
database, a gateway must be *unconfigured* and say so, no matter what the
environment holds.
"""
from __future__ import annotations

import uuid

import pytest

from app.models.payment_gateway import PaymentGatewayConfig
from app.payment.providers.easebuzz import EasebuzzProvider
from app.services.payment_service import get_provider
from app.services.payout_service import get_payout_provider


@pytest.fixture(autouse=True)
def clean_gateways(db):
    db.query(PaymentGatewayConfig).delete()
    db.commit()
    yield
    db.query(PaymentGatewayConfig).delete()
    db.commit()


def _easebuzz_row(**kwargs) -> PaymentGatewayConfig:
    defaults = dict(
        id=uuid.uuid4(),
        gateway_name="easebuzz",
        display_name="Easebuzz Payment Gateway",
        is_active=True,
        api_key="panel_key",
        api_secret="panel_salt",
        is_sandbox=True,
    )
    defaults.update(kwargs)
    return PaymentGatewayConfig(**defaults)


# ---------------------------------------------------------------------------
# Credentials come from the panel
# ---------------------------------------------------------------------------

def test_credentials_are_read_from_the_admin_panel_row(db):
    db.add(_easebuzz_row(api_key="panel_key", api_secret="panel_salt", is_sandbox=False))
    db.commit()

    provider = get_provider("easebuzz", db=db)

    assert isinstance(provider, EasebuzzProvider)
    assert provider.merchant_key == "panel_key"
    assert provider.salt == "panel_salt"
    # The row's own sandbox flag decides which host is used.
    assert provider.payment_url == "https://pay.easebuzz.in/"


def test_the_sandbox_flag_is_taken_from_the_same_row_as_the_keys(db):
    """Keys and the live/test flag must never come from different places."""
    db.add(_easebuzz_row(is_sandbox=True))
    db.commit()
    assert get_provider("easebuzz", db=db).payment_url == "https://testpay.easebuzz.in/"


@pytest.mark.parametrize(
    ("api_key", "api_secret"),
    [
        ("", ""),            # nothing entered yet
        ("panel_key", ""),   # salt missing
        ("", "panel_salt"),  # key missing
    ],
)
def test_a_half_configured_gateway_refuses_to_take_a_payment(db, api_key, api_secret):
    """Half-entered credentials must fail loudly, not post a broken request."""
    db.add(_easebuzz_row(api_key=api_key, api_secret=api_secret))
    db.commit()

    provider = get_provider("easebuzz", db=db)
    with pytest.raises(ValueError, match="Admin Panel"):
        provider.create_payment(amount=10_000, user_id=str(uuid.uuid4()))


def test_an_unconfigured_gateway_points_the_operator_at_the_panel(db):
    """With no row at all, the error must name where to fix it."""
    provider = get_provider("easebuzz", db=db)
    with pytest.raises(ValueError, match="Easebuzz Merchant Key and Salt"):
        provider.create_payment(amount=10_000, user_id=str(uuid.uuid4()))


def test_rotating_a_key_in_the_panel_takes_effect_immediately(db):
    """No redeploy, and nothing cached from a previous resolution."""
    row = _easebuzz_row(api_key="old_key", api_secret="old_salt")
    db.add(row)
    db.commit()
    assert get_provider("easebuzz", db=db).merchant_key == "old_key"

    row.api_key = "new_key"
    row.api_secret = "new_salt"
    db.commit()

    provider = get_provider("easebuzz", db=db)
    assert provider.merchant_key == "new_key"
    assert provider.salt == "new_salt"


def test_clearing_a_key_in_the_panel_disables_the_gateway(db):
    """The rotation trap: clearing a key must stop deposits, not fall back.

    If anything stood in for a cleared credential, deposits would keep
    succeeding into whichever account that fallback pointed at.
    """
    row = _easebuzz_row(api_key="panel_key", api_secret="panel_salt")
    db.add(row)
    db.commit()

    row.api_key = ""
    row.api_secret = ""
    db.commit()

    provider = get_provider("easebuzz", db=db)
    assert not provider.merchant_key
    with pytest.raises(ValueError, match="not configured"):
        provider.create_payment(amount=10_000, user_id=str(uuid.uuid4()))


# ---------------------------------------------------------------------------
# Return URLs: deployment addresses, not secrets
# ---------------------------------------------------------------------------

def test_return_urls_default_from_settings_when_the_row_has_none(db):
    """Easebuzz rejects a request without surl/furl, so a default is needed."""
    db.add(_easebuzz_row(extra_config={}))
    db.commit()

    provider = get_provider("easebuzz", db=db)
    assert provider.surl.endswith("/api/v1/payments/easebuzz/return")
    assert provider.furl.endswith("/api/v1/payments/easebuzz/return")


def test_the_panel_can_override_the_return_urls(db):
    db.add(
        _easebuzz_row(
            extra_config={"surl": "https://row.test/s", "furl": "https://row.test/f"}
        )
    )
    db.commit()

    provider = get_provider("easebuzz", db=db)
    assert provider.surl == "https://row.test/s"
    assert provider.furl == "https://row.test/f"


# ---------------------------------------------------------------------------
# Payouts likewise
# ---------------------------------------------------------------------------

def test_payouts_are_off_until_enabled_in_the_panel(db):
    """No designated payout gateway means settle by hand -- not an error."""
    assert get_payout_provider(db) is None


def test_payouts_come_from_the_panel_row(db):
    db.add(
        PaymentGatewayConfig(
            id=uuid.uuid4(),
            gateway_name="airpay",
            display_name="Airpay Payouts",
            is_active=False,
            api_key="",
            api_secret="",
            is_sandbox=True,
            extra_config={"payouts_enabled": True, "payout_token": "panel-jwt"},
        )
    )
    db.commit()

    provider = get_payout_provider(db)
    assert provider is not None
    assert provider.name == "airpay"
    assert provider.auth_token == "panel-jwt"


def test_a_gateway_with_credentials_but_payouts_off_is_not_used(db):
    """Only the payouts_enabled flag designates the payout gateway."""
    db.add(
        PaymentGatewayConfig(
            id=uuid.uuid4(),
            gateway_name="airpay",
            display_name="Airpay Payouts",
            is_active=False,
            api_key="",
            api_secret="",
            is_sandbox=True,
            extra_config={"payouts_enabled": False, "payout_token": "panel-jwt"},
        )
    )
    db.commit()
    assert get_payout_provider(db) is None
