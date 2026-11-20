"""Admin-panel rules for configuring the deposit and payout gateways.

These guard the configuration mistakes that would take payments down or
send money to the wrong place:

* making a payout-only gateway the deposit gateway (every deposit fails);
* making an uncredentialled gateway the deposit gateway (same);
* enabling payouts on two gateways at once (withdrawals go to whichever
  wins a tie-break);
* enabling payouts with incomplete credentials (fails at the moment an
  admin presses "pay", on a real player's withdrawal).
"""
from __future__ import annotations

from uuid import uuid4

import pytest

from app.models.payment_gateway import PaymentGatewayConfig
from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.security.jwt import create_access_token


@pytest.fixture(autouse=True)
def clean_gateways(db):
    db.query(PaymentGatewayConfig).delete()
    db.commit()
    yield
    db.query(PaymentGatewayConfig).delete()
    db.commit()


@pytest.fixture()
def admin_headers(db):
    suffix = uuid4().hex[:8]
    admin = User(
        id=uuid4(),
        name="Gateway Admin",
        username=f"gwadmin_{suffix}",
        email=f"gwadmin_{suffix}@example.com",
        password_hash="fakehash",
        role=UserRole.SUPER_ADMIN,
        status=UserStatus.ACTIVE,
    )
    db.add(admin)
    db.add(Wallet(id=uuid4(), user_id=admin.id, balance=0))
    db.commit()
    token = create_access_token(str(admin.id), admin.role.value)
    return {"Authorization": f"Bearer {token}"}


def _put(client, headers, gateway, body):
    return client.put(f"/api/v1/admin/payment-gateways/{gateway}", json=body, headers=headers)


# ---------------------------------------------------------------------------
# Listing
# ---------------------------------------------------------------------------

def test_listing_seeds_every_supported_gateway(client, admin_headers):
    resp = client.get("/api/v1/admin/payment-gateways", headers=admin_headers)
    assert resp.status_code == 200
    names = {row["gateway_name"] for row in resp.json()["data"]}
    assert {"cashfree", "razorpay", "easebuzz", "airpay"} <= names


def test_listing_reports_what_each_gateway_can_do(client, admin_headers):
    resp = client.get("/api/v1/admin/payment-gateways", headers=admin_headers)
    rows = {row["gateway_name"]: row for row in resp.json()["data"]}

    assert rows["easebuzz"]["supports_deposits"] is True
    assert rows["easebuzz"]["supports_payouts"] is False
    # Airpay is wired here for payouts only.
    assert rows["airpay"]["supports_deposits"] is False
    assert rows["airpay"]["supports_payouts"] is True
    assert rows["razorpay"]["supports_deposits"] is True
    assert rows["razorpay"]["supports_payouts"] is True


def test_backfilling_a_new_gateway_does_not_change_the_active_one(client, admin_headers, db):
    """Adding support for a gateway must not move live traffic.

    The listing endpoint creates rows for gateways that have none yet. On an
    install that is already taking deposits through Cashfree, that backfill
    must leave Cashfree active -- otherwise deploying a new gateway would
    silently repoint every player's deposit at an uncredentialled one.
    """
    db.add(
        PaymentGatewayConfig(
            gateway_name="cashfree",
            display_name="Cashfree Payments",
            is_active=True,
            api_key="cf_key",
            api_secret="cf_secret",
            is_sandbox=True,
        )
    )
    db.commit()

    resp = client.get("/api/v1/admin/payment-gateways", headers=admin_headers)
    assert resp.status_code == 200
    # The new gateways were in fact created by this call.
    names = {row["gateway_name"] for row in resp.json()["data"]}
    assert {"easebuzz", "airpay"} <= names

    db.expire_all()
    active = [
        row.gateway_name
        for row in db.query(PaymentGatewayConfig)
        .filter(PaymentGatewayConfig.is_active.is_(True))
        .all()
    ]
    assert active == ["cashfree"]


def test_at_most_one_gateway_is_ever_active(client, admin_headers, db):
    client.get("/api/v1/admin/payment-gateways", headers=admin_headers)
    db.expire_all()
    active = (
        db.query(PaymentGatewayConfig)
        .filter(PaymentGatewayConfig.is_active.is_(True))
        .count()
    )
    assert active <= 1


# ---------------------------------------------------------------------------
# Activating the deposit gateway
# ---------------------------------------------------------------------------

def test_a_payout_only_gateway_cannot_be_activated_for_deposits(client, admin_headers, db):
    db.add(
        PaymentGatewayConfig(
            gateway_name="airpay",
            display_name="Airpay Payouts",
            is_active=False,
            api_key="k",
            api_secret="s",
            is_sandbox=True,
        )
    )
    db.commit()

    resp = client.post("/api/v1/admin/payment-gateways/airpay/activate", headers=admin_headers)
    assert resp.status_code == 400
    assert "cannot accept deposits" in resp.text


def test_an_uncredentialled_gateway_cannot_be_activated(client, admin_headers, db):
    db.add(
        PaymentGatewayConfig(
            gateway_name="easebuzz",
            display_name="Easebuzz Payment Gateway",
            is_active=False,
            api_key="",
            api_secret="",
            is_sandbox=True,
        )
    )
    db.commit()

    resp = client.post("/api/v1/admin/payment-gateways/easebuzz/activate", headers=admin_headers)
    assert resp.status_code == 400
    assert "credentials" in resp.text.lower()


def test_a_configured_gateway_activates_and_deactivates_the_others(client, admin_headers, db):
    db.add_all(
        [
            PaymentGatewayConfig(
                gateway_name="easebuzz",
                display_name="Easebuzz Payment Gateway",
                is_active=False,
                api_key="eb_key",
                api_secret="eb_salt",
                is_sandbox=True,
            ),
            PaymentGatewayConfig(
                gateway_name="cashfree",
                display_name="Cashfree Payments",
                is_active=True,
                api_key="cf_key",
                api_secret="cf_secret",
                is_sandbox=True,
            ),
        ]
    )
    db.commit()

    resp = client.post("/api/v1/admin/payment-gateways/easebuzz/activate", headers=admin_headers)
    assert resp.status_code == 200

    db.expire_all()
    active = (
        db.query(PaymentGatewayConfig)
        .filter(PaymentGatewayConfig.is_active.is_(True))
        .all()
    )
    assert [row.gateway_name for row in active] == ["easebuzz"]


def test_an_unknown_gateway_is_refused(client, admin_headers):
    resp = client.post("/api/v1/admin/payment-gateways/stripe/activate", headers=admin_headers)
    assert resp.status_code == 400
    assert "not a supported" in resp.text


# ---------------------------------------------------------------------------
# Payout configuration
# ---------------------------------------------------------------------------

def test_payouts_cannot_be_configured_on_a_collect_only_gateway(client, admin_headers):
    resp = _put(client, admin_headers, "easebuzz", {"payout_token": "tok"})
    assert resp.status_code == 400
    assert "cannot settle withdrawals" in resp.text


def test_airpay_payouts_need_a_token_before_being_enabled(client, admin_headers):
    resp = _put(client, admin_headers, "airpay", {"payouts_enabled": True})
    assert resp.status_code == 400
    assert "Airpay payout API token" in resp.text


def test_razorpayx_payouts_need_the_full_credential_triple(client, admin_headers):
    resp = _put(
        client,
        admin_headers,
        "razorpay",
        {"payouts_enabled": True, "payout_api_key": "k"},
    )
    assert resp.status_code == 400
    assert "source account number" in resp.text


def test_airpay_payouts_enable_with_a_token(client, admin_headers, db):
    resp = _put(
        client,
        admin_headers,
        "airpay",
        {"payout_token": "airpay-jwt", "payouts_enabled": True},
    )
    assert resp.status_code == 200

    db.expire_all()
    row = (
        db.query(PaymentGatewayConfig)
        .filter(PaymentGatewayConfig.gateway_name == "airpay")
        .one()
    )
    assert row.extra_config["payouts_enabled"] is True
    assert row.extra_config["payout_token"] == "airpay-jwt"


def test_enabling_payouts_disables_them_everywhere_else(client, admin_headers, db):
    """Two payout gateways at once would make the destination a tie-break."""
    _put(
        client,
        admin_headers,
        "razorpay",
        {
            "payout_api_key": "k",
            "payout_api_secret": "s",
            "payout_account_number": "123456",
            "payouts_enabled": True,
        },
    )
    resp = _put(
        client,
        admin_headers,
        "airpay",
        {"payout_token": "airpay-jwt", "payouts_enabled": True},
    )
    assert resp.status_code == 200

    db.expire_all()
    enabled = [
        row.gateway_name
        for row in db.query(PaymentGatewayConfig).all()
        if (row.extra_config or {}).get("payouts_enabled")
    ]
    assert enabled == ["airpay"]


def test_switching_the_deposit_gateway_leaves_payouts_alone(client, admin_headers, db):
    """The whole point of the split: the two settings are independent."""
    _put(
        client,
        admin_headers,
        "airpay",
        {"payout_token": "airpay-jwt", "payouts_enabled": True},
    )
    _put(client, admin_headers, "easebuzz", {"api_key": "eb_key", "api_secret": "eb_salt"})

    resp = client.post("/api/v1/admin/payment-gateways/easebuzz/activate", headers=admin_headers)
    assert resp.status_code == 200

    db.expire_all()
    airpay = (
        db.query(PaymentGatewayConfig)
        .filter(PaymentGatewayConfig.gateway_name == "airpay")
        .one()
    )
    assert (airpay.extra_config or {}).get("payouts_enabled") is True
    assert airpay.is_active is False


# ---------------------------------------------------------------------------
# Easebuzz return URLs
# ---------------------------------------------------------------------------

def test_easebuzz_return_urls_are_stored(client, admin_headers, db):
    resp = _put(
        client,
        admin_headers,
        "easebuzz",
        {"surl": "https://polandexim.com/x", "furl": "https://polandexim.com/y"},
    )
    assert resp.status_code == 200

    db.expire_all()
    row = (
        db.query(PaymentGatewayConfig)
        .filter(PaymentGatewayConfig.gateway_name == "easebuzz")
        .one()
    )
    assert row.extra_config["surl"] == "https://polandexim.com/x"
    assert row.extra_config["furl"] == "https://polandexim.com/y"


def test_return_urls_are_rejected_on_other_gateways(client, admin_headers):
    resp = _put(client, admin_headers, "cashfree", {"surl": "https://x.test"})
    assert resp.status_code == 400
    assert "only apply to the Easebuzz" in resp.text
