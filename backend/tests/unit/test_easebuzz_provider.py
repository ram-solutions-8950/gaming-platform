"""Pins the Easebuzz hash construction and callback verification.

Why an oracle instead of golden strings
---------------------------------------
Easebuzz authenticates every request and every response with a SHA-512 hash
over a pipe-joined, order-sensitive field list. A field in the wrong
position still produces a perfectly well-formed hash, which the gateway then
rejects -- or, worse, which makes us reject a genuine payment callback and
leave a player who paid without a credit.

``_reference_request_hash`` / ``_reference_reverse_hash`` below are written
the way Easebuzz's own published Python SDK writes them (append each value
then a separator, in a loop), whereas the provider uses ``"|".join``. Two
structurally different implementations agreeing on random inputs is real
evidence; a single hard-coded digest would only prove the code still does
what it did when the digest was pasted in.
"""
from __future__ import annotations

import json
from hashlib import sha512
from urllib.parse import urlencode

import pytest

from app.payment.providers.easebuzz import EasebuzzProvider, _to_paise

SALT = "TESTSALT123"
KEY = "TESTKEY456"


# ---------------------------------------------------------------------------
# Independent reference implementations (shaped after Easebuzz's own SDK)
# ---------------------------------------------------------------------------

def _reference_request_hash(posted: dict, salt: str) -> str:
    sequence = (
        "key|txnid|amount|productinfo|firstname|email"
        "|udf1|udf2|udf3|udf4|udf5|udf6|udf7|udf8|udf9|udf10"
    )
    hash_string = ""
    for field in sequence.split("|"):
        hash_string += str(posted[field]) if field in posted else ""
        hash_string += "|"
    hash_string += salt
    return sha512(hash_string.encode("utf-8")).hexdigest().lower()


def _reference_reverse_hash(response: dict, salt: str) -> str:
    sequence = (
        "udf10|udf9|udf8|udf7|udf6|udf5|udf4|udf3|udf2|udf1"
        "|email|firstname|productinfo|amount|txnid|key"
    )
    hash_string = salt + "|" + str(response.get("status", ""))
    for field in sequence.split("|"):
        hash_string += "|"
        hash_string += str(response[field]) if field in response else ""
    return sha512(hash_string.encode("utf-8")).hexdigest().lower()


@pytest.fixture()
def provider() -> EasebuzzProvider:
    return EasebuzzProvider(
        merchant_key=KEY,
        salt=SALT,
        is_sandbox=True,
        surl="https://example.test/return",
        furl="https://example.test/return",
    )


def _signed_callback(extra: dict | None = None) -> dict:
    payload = {
        "key": KEY,
        "txnid": "eb0123456789abcdef",
        "amount": "250.00",
        "productinfo": "Wallet Deposit",
        "firstname": "Test Player",
        "email": "player@example.test",
        "phone": "9999999999",
        "status": "success",
        "easepayid": "EASE99887766",
        "udf1": "11111111-2222-3333-4444-555555555555",
    }
    payload.update(extra or {})
    payload["hash"] = _reference_reverse_hash(payload, SALT)
    return payload


# ---------------------------------------------------------------------------
# Request hash
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "params",
    [
        {
            "key": KEY,
            "txnid": "eb1",
            "amount": "100.00",
            "productinfo": "Wallet Deposit",
            "firstname": "A",
            "email": "a@b.test",
        },
        {
            "key": KEY,
            "txnid": "eb" + "f" * 32,
            "amount": "99999.99",
            "productinfo": "Wallet Deposit",
            "firstname": "Name With Spaces",
            "email": "long.address+tag@example.co.in",
            "udf1": "user-id-here",
        },
        # Pipe and unicode in a user-controlled field: the hash must still be
        # computed over the exact bytes that get posted.
        {
            "key": KEY,
            "txnid": "eb2",
            "amount": "1.50",
            "productinfo": "Wallet Deposit",
            "firstname": "Ram|Solutions",
            "email": "ram@example.test",
            "udf1": "ऋण",
        },
    ],
)
def test_request_hash_matches_the_reference_sequence(provider, params):
    assert provider._request_hash(params) == _reference_request_hash(params, SALT)


def test_request_hash_is_order_sensitive(provider):
    """Guards the field order itself, not just the algorithm."""
    params = {
        "key": KEY,
        "txnid": "eb1",
        "amount": "100.00",
        "productinfo": "Wallet Deposit",
        "firstname": "A",
        "email": "a@b.test",
    }
    swapped = dict(params, firstname=params["email"], email=params["firstname"])
    assert provider._request_hash(params) != provider._request_hash(swapped)


def test_request_hash_treats_missing_udfs_as_empty_not_absent(provider):
    """All ten udf slots must be present as empty fields.

    Dropping them instead of emitting empty values shortens the string and is
    the single most likely way to get a silently-rejected hash.
    """
    params = {
        "key": KEY,
        "txnid": "eb1",
        "amount": "100.00",
        "productinfo": "Wallet Deposit",
        "firstname": "A",
        "email": "a@b.test",
    }
    digest_input_pipes = 16  # 16 fields, so 16 separators before the salt
    reconstructed = "|".join(
        [
            params["key"],
            params["txnid"],
            params["amount"],
            params["productinfo"],
            params["firstname"],
            params["email"],
        ]
        + [""] * 10
    )
    assert reconstructed.count("|") == digest_input_pipes - 1
    expected = sha512((reconstructed + "|" + SALT).encode()).hexdigest().lower()
    assert provider._request_hash(params) == expected


# ---------------------------------------------------------------------------
# Callback verification
# ---------------------------------------------------------------------------

def test_verify_webhook_accepts_a_correctly_signed_form_post(provider):
    payload = _signed_callback()
    assert provider.verify_webhook(urlencode(payload).encode(), {}) is True


def test_verify_webhook_accepts_a_correctly_signed_json_post(provider):
    payload = _signed_callback()
    assert provider.verify_webhook(json.dumps(payload).encode(), {}) is True


@pytest.mark.parametrize(
    "tamper",
    [
        {"amount": "25000.00"},   # inflate the credit
        {"status": "success"},    # flip a failure to a success
        {"txnid": "ebSOMEONEELSE"},
        {"udf1": "another-user-id"},
    ],
)
def test_verify_webhook_rejects_a_tampered_field(provider, tamper):
    """The attack this guards: a forged 'paid' callback crediting a wallet."""
    payload = _signed_callback({"status": "failure"})
    payload.update(tamper)  # hash now stale
    assert provider.verify_webhook(urlencode(payload).encode(), {}) is False


@pytest.mark.parametrize(
    "raw",
    [b"", b"not a form or json", b"{}", b'{"status":"success"}'],
)
def test_verify_webhook_fails_closed_on_unusable_bodies(provider, raw):
    assert provider.verify_webhook(raw, {}) is False


def test_verify_webhook_fails_closed_without_a_salt():
    """An unconfigured gateway must never authenticate anything."""
    unconfigured = EasebuzzProvider(merchant_key=KEY, salt="")
    payload = _signed_callback()
    assert unconfigured.verify_webhook(urlencode(payload).encode(), {}) is False


# ---------------------------------------------------------------------------
# Parsing a verified callback
# ---------------------------------------------------------------------------

def test_process_webhook_maps_a_success(provider):
    event = provider.process_webhook(urlencode(_signed_callback()).encode(), {})
    assert event["status"] == "SUCCESS"
    assert event["provider"] == "easebuzz"
    assert event["provider_order_id"] == "eb0123456789abcdef"
    assert event["provider_payment_id"] == "EASE99887766"
    # 250.00 rupees must arrive as paise, matching Deposit.amount.
    assert event["amount"] == 25000
    # easepayid is unique per payment, so it is the idempotency key.
    assert event["event_id"] == "EASE99887766"


@pytest.mark.parametrize(
    ("raw_status", "expected"),
    [
        ("success", "SUCCESS"),
        ("failure", "FAILED"),
        ("usercancelled", "FAILED"),
        ("bounced", "FAILED"),
        # Anything in flight must stay PENDING. Reporting it as FAILED would
        # write a terminal event for a payment that can still succeed.
        ("pending", "PENDING"),
        ("initiated", "PENDING"),
        ("", "PENDING"),
        ("something_new_from_easebuzz", "PENDING"),
    ],
)
def test_process_webhook_status_mapping(provider, raw_status, expected):
    payload = _signed_callback({"status": raw_status})
    event = provider.process_webhook(urlencode(payload).encode(), {})
    assert event["status"] == expected


# ---------------------------------------------------------------------------
# Amount conversion
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    ("rupees", "paise"),
    [
        ("100.00", 10000),
        ("100", 10000),
        ("1.50", 150),
        ("0.01", 1),
        # float(1234.55) * 100 is 123454.99999999999, which truncates a paise
        # short and would trip the webhook amount-mismatch guard.
        ("1234.55", 123455),
        ("8765.43", 876543),
        ("99999.99", 9999999),
        (" 250.00 ", 25000),
    ],
)
def test_amount_conversion_is_exact(rupees, paise):
    assert _to_paise(rupees) == paise


@pytest.mark.parametrize("bad", [None, "", "abc", "1,234.00"])
def test_amount_conversion_returns_none_on_garbage(bad):
    """None, not 0: the pipeline must not compare a real deposit against 0."""
    assert _to_paise(bad) is None


# ---------------------------------------------------------------------------
# Configuration guards
# ---------------------------------------------------------------------------

def test_create_payment_refuses_without_credentials():
    with pytest.raises(ValueError, match="not configured"):
        EasebuzzProvider(surl="https://x.test", furl="https://x.test").create_payment(
            amount=10000, user_id="u1"
        )


def test_create_payment_refuses_without_return_urls():
    provider = EasebuzzProvider(merchant_key=KEY, salt=SALT)
    with pytest.raises(ValueError, match="return URLs"):
        provider.create_payment(amount=10000, user_id="u1")


@pytest.mark.parametrize("amount", [0, -1, -10000])
def test_create_payment_refuses_non_positive_amounts(provider, amount):
    with pytest.raises(ValueError, match="positive"):
        provider.create_payment(amount=amount, user_id="u1")


def test_sandbox_and_production_hosts_are_distinct():
    sandbox = EasebuzzProvider(merchant_key=KEY, salt=SALT, is_sandbox=True)
    live = EasebuzzProvider(merchant_key=KEY, salt=SALT, is_sandbox=False)
    assert sandbox.payment_url == "https://testpay.easebuzz.in/"
    assert live.payment_url == "https://pay.easebuzz.in/"
    assert sandbox.dashboard_url == "https://testdashboard.easebuzz.in/"
    assert live.dashboard_url == "https://dashboard.easebuzz.in/"
