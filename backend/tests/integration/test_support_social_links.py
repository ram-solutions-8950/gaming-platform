"""Admin-managed social links on the player support screen.

An admin types these links and they are rendered into an ``href`` served to
every player, so the interesting cases are not the happy path but the ones
where a bad value would reach the DOM. A ``javascript:`` URL stored here
would be persistent XSS against the entire player base, triggered by any
player who taps the button.

Also pinned: a channel the admin has not configured comes back empty, so the
player UI can hide it instead of showing a button that goes nowhere.
"""
from __future__ import annotations

from uuid import uuid4

import pytest

from app.models.system_settings import SystemSetting
from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.security.jwt import create_access_token
from app.services import support_service


@pytest.fixture(autouse=True)
def clean_support_config(db):
    db.query(SystemSetting).filter(SystemSetting.key == "support_config").delete()
    db.commit()
    yield
    db.query(SystemSetting).filter(SystemSetting.key == "support_config").delete()
    db.commit()


@pytest.fixture()
def admin_headers(db):
    suffix = uuid4().hex[:8]
    admin = User(
        id=uuid4(),
        name="Support Admin",
        username=f"supadmin_{suffix}",
        email=f"supadmin_{suffix}@example.com",
        password_hash="fakehash",
        role=UserRole.SUPER_ADMIN,
        status=UserStatus.ACTIVE,
    )
    db.add(admin)
    db.add(Wallet(id=uuid4(), user_id=admin.id, balance=0))
    db.commit()
    return {"Authorization": f"Bearer {create_access_token(str(admin.id), admin.role.value)}"}


@pytest.fixture()
def player_headers(db):
    suffix = uuid4().hex[:8]
    user = User(
        id=uuid4(),
        name="Support Player",
        username=f"supuser_{suffix}",
        email=f"supuser_{suffix}@example.com",
        password_hash="fakehash",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    db.add(Wallet(id=uuid4(), user_id=user.id, balance=0))
    db.commit()
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


# ---------------------------------------------------------------------------
# Round trip
# ---------------------------------------------------------------------------

def test_admin_sets_links_and_players_receive_them(client, admin_headers, player_headers):
    resp = client.put(
        "/api/v1/admin/support/config",
        json={
            "telegram_url": "https://t.me/corona888official",
            "instagram_url": "https://instagram.com/corona888",
            "facebook_url": "https://facebook.com/corona888",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text

    public = client.get("/api/v1/support/contact", headers=player_headers)
    assert public.status_code == 200
    data = public.json()["data"]
    assert data["telegram_url"] == "https://t.me/corona888official"
    assert data["instagram_url"] == "https://instagram.com/corona888"
    assert data["facebook_url"] == "https://facebook.com/corona888"


def test_unset_channels_come_back_empty(client, player_headers):
    """Empty, not missing: the UI hides a channel rather than showing a stub."""
    data = client.get("/api/v1/support/contact", headers=player_headers).json()["data"]
    assert data["telegram_url"] == ""
    assert data["instagram_url"] == ""
    assert data["facebook_url"] == ""


def test_updating_one_link_leaves_the_others_alone(client, admin_headers, player_headers):
    client.put(
        "/api/v1/admin/support/config",
        json={"telegram_url": "https://t.me/first", "instagram_url": "https://instagram.com/first"},
        headers=admin_headers,
    )
    client.put(
        "/api/v1/admin/support/config",
        json={"telegram_url": "https://t.me/second"},
        headers=admin_headers,
    )

    data = client.get("/api/v1/support/contact", headers=player_headers).json()["data"]
    assert data["telegram_url"] == "https://t.me/second"
    assert data["instagram_url"] == "https://instagram.com/first"


def test_a_link_can_be_cleared_to_hide_the_channel(client, admin_headers, player_headers):
    client.put(
        "/api/v1/admin/support/config",
        json={"telegram_url": "https://t.me/corona888"},
        headers=admin_headers,
    )
    resp = client.put(
        "/api/v1/admin/support/config",
        json={"telegram_url": ""},
        headers=admin_headers,
    )
    assert resp.status_code == 200

    data = client.get("/api/v1/support/contact", headers=player_headers).json()["data"]
    assert data["telegram_url"] == ""


# ---------------------------------------------------------------------------
# Dangerous links must never be stored
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "bad",
    [
        "javascript:alert(document.cookie)",
        "JaVaScRiPt:alert(1)",
        "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
        "vbscript:msgbox(1)",
        "file:///etc/passwd",
        "//evil.example.com",
        "t.me/channel",            # scheme-less, would resolve relative
        "https://ok.test/ javascript:alert(1)",
    ],
)
def test_a_dangerous_link_is_rejected(client, admin_headers, player_headers, bad):
    resp = client.put(
        "/api/v1/admin/support/config",
        json={"telegram_url": bad},
        headers=admin_headers,
    )
    assert resp.status_code == 400, f"{bad!r} was accepted"

    # And nothing was persisted.
    data = client.get("/api/v1/support/contact", headers=player_headers).json()["data"]
    assert data["telegram_url"] == ""


def test_a_rejected_update_does_not_partially_apply(client, admin_headers, player_headers):
    """Validation runs before the write, so a good field in the same request
    as a bad one must not be saved on its own."""
    client.put(
        "/api/v1/admin/support/config",
        json={"instagram_url": "https://instagram.com/original"},
        headers=admin_headers,
    )

    resp = client.put(
        "/api/v1/admin/support/config",
        json={
            "instagram_url": "https://instagram.com/updated",
            "telegram_url": "javascript:alert(1)",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 400

    data = client.get("/api/v1/support/contact", headers=player_headers).json()["data"]
    assert data["instagram_url"] == "https://instagram.com/original"
    assert data["telegram_url"] == ""


@pytest.mark.parametrize(
    "good",
    [
        "https://t.me/channel",
        "http://t.me/channel",
        "https://instagram.com/page?ref=app",
        "https://facebook.com/page/",
    ],
)
def test_ordinary_links_are_accepted(good):
    assert support_service.sanitize_link(good) == good


@pytest.mark.parametrize("blank", ["", "   ", None])
def test_blank_links_normalise_to_empty(blank):
    assert support_service.sanitize_link(blank) == ""


def test_whatsapp_url_is_validated_too(client, admin_headers):
    """It is rendered as a link on the same screen, so it gets the same check."""
    resp = client.put(
        "/api/v1/admin/support/config",
        json={"whatsapp_url": "javascript:alert(1)"},
        headers=admin_headers,
    )
    assert resp.status_code == 400


def test_setting_a_whatsapp_number_still_derives_its_url(client, admin_headers, player_headers):
    """The existing auto-derive behaviour must survive the new validation."""
    resp = client.put(
        "/api/v1/admin/support/config",
        json={"whatsapp_vip": "+91 90000 11111"},
        headers=admin_headers,
    )
    assert resp.status_code == 200

    data = client.get("/api/v1/support/contact", headers=player_headers).json()["data"]
    assert data["whatsapp_url"] == "https://wa.me/919000011111"
