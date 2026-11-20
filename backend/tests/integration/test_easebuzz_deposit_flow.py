"""End-to-end Easebuzz deposit: signed callback in, wallet credited once.

The unit tests next door pin the hash arithmetic. These go through the real
``handle_webhook`` pipeline with real database rows, because that is where
the money actually moves and where the mistakes are expensive:

* a forged or replayed callback must credit nothing;
* an amount that disagrees with the deposit must credit nothing;
* the browser return and the server-to-server webhook both fire for the same
  payment, and between them must credit exactly once.
"""
from __future__ import annotations

from hashlib import sha512
from urllib.parse import urlencode
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.models.deposit import Deposit, DepositStatus
from app.models.payment import PaymentEvent
from app.models.payment_gateway import PaymentGatewayConfig
from app.models.transaction import WalletTransaction
from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.payment.webhook import handle_webhook

SALT = "eb_test_salt"
KEY = "eb_test_key"
START_BALANCE = 1_000_000  # Rs 10,000 in paise


@pytest.fixture(autouse=True)
def clean_gateways(db: Session):
    """gateway_name is globally unique, so the row cannot leak between tests."""
    db.query(PaymentGatewayConfig).filter(
        PaymentGatewayConfig.gateway_name == "easebuzz"
    ).delete()
    db.commit()
    yield
    db.query(PaymentGatewayConfig).filter(
        PaymentGatewayConfig.gateway_name == "easebuzz"
    ).delete()
    db.commit()


@pytest.fixture()
def player(db: Session):
    suffix = uuid4().hex[:8]
    user = User(
        id=uuid4(),
        name="Easebuzz Player",
        username=f"eb_{suffix}",
        email=f"eb_{suffix}@example.com",
        password_hash="fakehash",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    wallet = Wallet(id=uuid4(), user_id=user.id, balance=START_BALANCE)
    db.add(wallet)
    db.add(
        PaymentGatewayConfig(
            gateway_name="easebuzz",
            display_name="Easebuzz Payment Gateway",
            is_active=True,
            api_key=KEY,
            api_secret=SALT,
            is_sandbox=True,
            extra_config={
                "surl": "https://example.test/return",
                "furl": "https://example.test/return",
            },
        )
    )
    db.commit()
    return user, wallet


def _deposit(db, user, wallet, paise: int, txnid: str) -> Deposit:
    deposit = Deposit(
        id=uuid4(),
        user_id=user.id,
        wallet_id=wallet.id,
        amount=paise,
        status=DepositStatus.PENDING,
        provider="easebuzz",
        provider_order_id=txnid,
        external_reference=f"dep_{uuid4().hex}",
    )
    db.add(deposit)
    db.commit()
    return deposit


def _callback(txnid: str, rupees: str, *, status: str = "success", easepayid: str | None = None) -> bytes:
    """Build a genuinely-signed Easebuzz callback body."""
    payload = {
        "key": KEY,
        "txnid": txnid,
        "amount": rupees,
        "productinfo": "Wallet Deposit",
        "firstname": "Easebuzz Player",
        "email": "player@example.test",
        "phone": "9999999999",
        "status": status,
        "easepayid": easepayid or f"EASE{uuid4().hex[:12].upper()}",
    }
    sequence = (
        "udf10|udf9|udf8|udf7|udf6|udf5|udf4|udf3|udf2|udf1"
        "|email|firstname|productinfo|amount|txnid|key"
    )
    hash_string = SALT + "|" + status
    for field in sequence.split("|"):
        hash_string += "|" + (str(payload[field]) if field in payload else "")
    payload["hash"] = sha512(hash_string.encode()).hexdigest().lower()
    return urlencode(payload).encode()


def _credited(db, user_id) -> int:
    db.expire_all()
    return db.query(Wallet).filter(Wallet.user_id == user_id).one().balance


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

def test_a_signed_success_callback_credits_the_wallet_once(db, player):
    user, wallet = player
    txnid = f"eb{uuid4().hex}"
    deposit = _deposit(db, user, wallet, 125_000, txnid)

    result = handle_webhook(_callback(txnid, "1250.00"), {}, "easebuzz", db=db)

    assert result["status"] == "success", result
    db.refresh(deposit)
    assert deposit.status == DepositStatus.SUCCESS
    assert _credited(db, user.id) == START_BALANCE + 125_000


def test_the_browser_return_and_the_webhook_together_credit_once(db, player):
    """Both fire for every payment; the second must be a no-op.

    This is the double-credit scenario: Easebuzz POSTs the result to surl in
    the player's browser *and* delivers the same event to the webhook.
    """
    user, wallet = player
    txnid = f"eb{uuid4().hex}"
    _deposit(db, user, wallet, 50_000, txnid)

    # The identical event id (easepayid) is what makes them one payment.
    body = _callback(txnid, "500.00", easepayid="EASEDUPLICATE01")

    first = handle_webhook(body, {}, "easebuzz", db=db)
    second = handle_webhook(body, {}, "easebuzz", db=db)

    assert first["status"] == "success"
    assert second["status"] == "duplicate"
    # The duplicate must report where the deposit landed, so the browser
    # return can show the player the truth rather than guessing.
    assert second["deposit_status"] == "SUCCESS"

    assert _credited(db, user.id) == START_BALANCE + 50_000
    deposit_credits = (
        db.query(WalletTransaction)
        .filter(
            WalletTransaction.user_id == user.id,
            WalletTransaction.reference_type == "payment_verification",
        )
        .count()
    )
    assert deposit_credits == 1


# ---------------------------------------------------------------------------
# Rejection paths -- none of these may move money
# ---------------------------------------------------------------------------

def test_a_forged_callback_credits_nothing(db, player):
    """An attacker posting a 'paid' callback for a real pending deposit."""
    user, wallet = player
    txnid = f"eb{uuid4().hex}"
    deposit = _deposit(db, user, wallet, 100_000, txnid)

    forged = urlencode(
        {
            "key": KEY,
            "txnid": txnid,
            "amount": "1000.00",
            "productinfo": "Wallet Deposit",
            "firstname": "Easebuzz Player",
            "email": "player@example.test",
            "status": "success",
            "easepayid": "EASEFORGED",
            "hash": "0" * 128,
        }
    ).encode()

    result = handle_webhook(forged, {}, "easebuzz", db=db)

    assert result["status"] == "rejected"
    assert result["reason"] == "invalid_signature"
    db.refresh(deposit)
    assert deposit.status == DepositStatus.PENDING
    assert _credited(db, user.id) == START_BALANCE


def test_a_tampered_amount_credits_nothing(db, player):
    """Re-signing is impossible without the salt, so this must fail the hash."""
    user, wallet = player
    txnid = f"eb{uuid4().hex}"
    _deposit(db, user, wallet, 10_000, txnid)

    body = _callback(txnid, "100.00").decode()
    tampered = body.replace("amount=100.00", "amount=99999.00").encode()

    result = handle_webhook(tampered, {}, "easebuzz", db=db)

    assert result["status"] == "rejected"
    assert _credited(db, user.id) == START_BALANCE


def test_a_correctly_signed_callback_for_the_wrong_amount_is_refused(db, player):
    """Signed by Easebuzz but disagreeing with our own record of the deposit.

    The signature is valid, so only the pipeline's amount check stands
    between a ledger mismatch and the wallet.
    """
    user, wallet = player
    txnid = f"eb{uuid4().hex}"
    _deposit(db, user, wallet, 10_000, txnid)  # we recorded Rs 100

    with pytest.raises(ValueError, match="amount does not match"):
        handle_webhook(_callback(txnid, "5000.00"), {}, "easebuzz", db=db)

    assert _credited(db, user.id) == START_BALANCE


def test_a_failed_payment_credits_nothing(db, player):
    user, wallet = player
    txnid = f"eb{uuid4().hex}"
    deposit = _deposit(db, user, wallet, 25_000, txnid)

    result = handle_webhook(
        _callback(txnid, "250.00", status="failure"), {}, "easebuzz", db=db
    )

    assert result["status"] == "failed"
    db.refresh(deposit)
    assert deposit.status == DepositStatus.PENDING
    assert _credited(db, user.id) == START_BALANCE


def test_an_in_flight_status_is_not_recorded_as_a_failure(db, player):
    """A pending callback must leave the deposit claimable by a later success."""
    user, wallet = player
    txnid = f"eb{uuid4().hex}"
    deposit = _deposit(db, user, wallet, 25_000, txnid)

    pending = handle_webhook(
        _callback(txnid, "250.00", status="pending", easepayid="EASEPEND1"),
        {},
        "easebuzz",
        db=db,
    )
    assert pending["status"] == "pending"
    db.refresh(deposit)
    assert deposit.status == DepositStatus.PENDING

    # The real success arrives afterwards and must still credit.
    success = handle_webhook(
        _callback(txnid, "250.00", status="success", easepayid="EASEPEND2"),
        {},
        "easebuzz",
        db=db,
    )
    assert success["status"] == "success"
    assert _credited(db, user.id) == START_BALANCE + 25_000


def test_a_callback_for_an_unknown_deposit_credits_nothing(db, player):
    user, _ = player
    result = handle_webhook(
        _callback(f"eb{uuid4().hex}", "750.00"), {}, "easebuzz", db=db
    )

    assert result["status"] == "received"
    assert result["reason"] == "deposit_not_found"
    assert _credited(db, user.id) == START_BALANCE


def test_an_unconfigured_gateway_authenticates_nothing(db, player):
    """With no salt stored, every callback must be rejected rather than trusted."""
    user, wallet = player
    db.query(PaymentGatewayConfig).filter(
        PaymentGatewayConfig.gateway_name == "easebuzz"
    ).update({"api_secret": ""})
    db.commit()

    txnid = f"eb{uuid4().hex}"
    _deposit(db, user, wallet, 10_000, txnid)

    result = handle_webhook(_callback(txnid, "100.00"), {}, "easebuzz", db=db)

    assert result["status"] == "rejected"
    assert _credited(db, user.id) == START_BALANCE


def test_every_rejection_is_recorded_without_a_payment_event(db, player):
    """A rejected callback must not leave an event row implying it was seen."""
    user, wallet = player
    txnid = f"eb{uuid4().hex}"
    _deposit(db, user, wallet, 10_000, txnid)
    before = db.query(PaymentEvent).count()

    handle_webhook(b"hash=deadbeef&status=success", {}, "easebuzz", db=db)

    assert db.query(PaymentEvent).count() == before
    assert _credited(db, user.id) == START_BALANCE
