"""Admin-sent in-app notifications: broadcast, targeted, and read state.

What matters here is who can see what. A targeted notification reaching the
wrong player is a privacy failure, and read state that silently fails to
persist is exactly the bug the previous admin-only feed had, so both get
explicit coverage.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.models.notification import (
    Notification,
    NotificationAudience,
    NotificationRead,
    NotificationRecipient,
)
from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.security.jwt import create_access_token
from app.services import notification_service


def _make_user(db, role=UserRole.USER, created_at=None) -> User:
    suffix = uuid4().hex[:8]
    user = User(
        id=uuid4(),
        name=f"Player {suffix}",
        username=f"notif_{suffix}",
        email=f"notif_{suffix}@example.com",
        password_hash="fakehash",
        role=role,
        status=UserStatus.ACTIVE,
    )
    if created_at is not None:
        user.created_at = created_at
    db.add(user)
    db.add(Wallet(id=uuid4(), user_id=user.id, balance=0))
    db.commit()
    db.refresh(user)
    return user


def _headers(user: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


@pytest.fixture(autouse=True)
def clean_notifications(db):
    db.query(NotificationRead).delete()
    db.query(NotificationRecipient).delete()
    db.query(Notification).delete()
    db.commit()
    yield
    db.query(NotificationRead).delete()
    db.query(NotificationRecipient).delete()
    db.query(Notification).delete()
    db.commit()


@pytest.fixture()
def ws_uses_test_database(monkeypatch, db):
    """Point the websocket's own session factory at the test database.

    The socket authenticates on a session it opens itself (it has no request
    to take a dependency from), and the app's SessionLocal is bound to the
    dev database. Without this the token would be valid but the player would
    not be found, and the socket would close as unauthenticated.
    """
    from sqlalchemy.orm import sessionmaker

    from app.websocket import notifications_ws

    monkeypatch.setattr(
        notifications_ws,
        "SessionLocal",
        sessionmaker(autocommit=False, autoflush=False, bind=db.get_bind()),
    )


@pytest.fixture()
def admin(db):
    return _make_user(db, role=UserRole.SUPER_ADMIN)


@pytest.fixture()
def player(db):
    # Registered well in the past, so broadcasts sent "now" are visible.
    return _make_user(db, created_at=datetime.now(timezone.utc) - timedelta(days=30))


# ---------------------------------------------------------------------------
# Broadcast
# ---------------------------------------------------------------------------

def test_broadcast_reaches_every_player(client, db, admin, player):
    other = _make_user(db, created_at=datetime.now(timezone.utc) - timedelta(days=5))

    resp = client.post(
        "/api/v1/admin/notifications/send",
        json={"title": "Server maintenance", "message": "Back at 3am.", "audience": "ALL",
              "category": "MAINTENANCE"},
        headers=_headers(admin),
    )
    assert resp.status_code == 201, resp.text

    for p in (player, other):
        inbox = client.get("/api/v1/notifications", headers=_headers(p)).json()["data"]
        assert inbox["unread_count"] == 1
        assert inbox["items"][0]["title"] == "Server maintenance"
        assert inbox["items"][0]["category"] == "MAINTENANCE"
        assert inbox["items"][0]["is_read"] is False


def test_a_broadcast_is_stored_once_however_many_players_exist(client, db, admin, player):
    """One row, not one per player -- the whole point of the audience flag."""
    _make_user(db, created_at=datetime.now(timezone.utc) - timedelta(days=5))
    _make_user(db, created_at=datetime.now(timezone.utc) - timedelta(days=5))

    client.post(
        "/api/v1/admin/notifications/send",
        json={"title": "Promo", "message": "Bonus weekend.", "audience": "ALL"},
        headers=_headers(admin),
    )

    assert db.query(Notification).count() == 1
    assert db.query(NotificationRecipient).count() == 0


def test_a_player_does_not_see_broadcasts_sent_before_they_joined(client, db, admin):
    """A new signup must not open the app to a backlog of old promos."""
    client.post(
        "/api/v1/admin/notifications/send",
        json={"title": "Old promo", "message": "Last month.", "audience": "ALL"},
        headers=_headers(admin),
    )

    newcomer = _make_user(db, created_at=datetime.now(timezone.utc) + timedelta(minutes=1))
    inbox = client.get("/api/v1/notifications", headers=_headers(newcomer)).json()["data"]
    assert inbox["items"] == []
    assert inbox["unread_count"] == 0


# ---------------------------------------------------------------------------
# Targeted
# ---------------------------------------------------------------------------

def test_targeted_notification_reaches_only_the_selected_players(client, db, admin, player):
    chosen = _make_user(db, created_at=datetime.now(timezone.utc) - timedelta(days=5))

    resp = client.post(
        "/api/v1/admin/notifications/send",
        json={
            "title": "Your withdrawal",
            "message": "Processed.",
            "audience": "SELECTED",
            "user_ids": [str(chosen.id)],
        },
        headers=_headers(admin),
    )
    assert resp.status_code == 201
    assert resp.json()["data"]["recipients"] == 1

    got = client.get("/api/v1/notifications", headers=_headers(chosen)).json()["data"]
    assert len(got["items"]) == 1

    # The privacy case: nobody else may see a message addressed to someone else.
    not_got = client.get("/api/v1/notifications", headers=_headers(player)).json()["data"]
    assert not_got["items"] == []
    assert not_got["unread_count"] == 0


def test_several_players_can_be_selected_at_once(client, db, admin):
    a = _make_user(db, created_at=datetime.now(timezone.utc) - timedelta(days=5))
    b = _make_user(db, created_at=datetime.now(timezone.utc) - timedelta(days=5))
    c = _make_user(db, created_at=datetime.now(timezone.utc) - timedelta(days=5))

    resp = client.post(
        "/api/v1/admin/notifications/send",
        json={
            "title": "VIP offer",
            "message": "For you.",
            "audience": "SELECTED",
            "user_ids": [str(a.id), str(b.id)],
        },
        headers=_headers(admin),
    )
    assert resp.json()["data"]["recipients"] == 2

    assert len(client.get("/api/v1/notifications", headers=_headers(a)).json()["data"]["items"]) == 1
    assert len(client.get("/api/v1/notifications", headers=_headers(b)).json()["data"]["items"]) == 1
    assert client.get("/api/v1/notifications", headers=_headers(c)).json()["data"]["items"] == []


def test_duplicate_selections_do_not_double_up_an_inbox(client, db, admin):
    a = _make_user(db, created_at=datetime.now(timezone.utc) - timedelta(days=5))

    resp = client.post(
        "/api/v1/admin/notifications/send",
        json={
            "title": "Once",
            "message": "Only once.",
            "audience": "SELECTED",
            "user_ids": [str(a.id), str(a.id), str(a.id)],
        },
        headers=_headers(admin),
    )
    assert resp.status_code == 201
    assert resp.json()["data"]["recipients"] == 1
    assert len(client.get("/api/v1/notifications", headers=_headers(a)).json()["data"]["items"]) == 1


def test_selected_with_no_recipients_is_refused(client, admin):
    resp = client.post(
        "/api/v1/admin/notifications/send",
        json={"title": "Nobody", "message": "x", "audience": "SELECTED", "user_ids": []},
        headers=_headers(admin),
    )
    assert resp.status_code == 400
    assert "at least one player" in resp.text


def test_an_unknown_recipient_is_refused_and_nothing_is_saved(client, db, admin):
    resp = client.post(
        "/api/v1/admin/notifications/send",
        json={
            "title": "Ghost",
            "message": "x",
            "audience": "SELECTED",
            "user_ids": [str(uuid4())],
        },
        headers=_headers(admin),
    )
    assert resp.status_code == 400
    assert db.query(Notification).count() == 0


# ---------------------------------------------------------------------------
# Read state -- the bug the old admin feed had
# ---------------------------------------------------------------------------

def test_marking_read_persists_across_requests(client, admin, player):
    client.post(
        "/api/v1/admin/notifications/send",
        json={"title": "Read me", "message": "x", "audience": "ALL"},
        headers=_headers(admin),
    )
    item_id = client.get("/api/v1/notifications", headers=_headers(player)).json()["data"]["items"][0]["id"]

    resp = client.post(f"/api/v1/notifications/{item_id}/read", headers=_headers(player))
    assert resp.status_code == 200
    assert resp.json()["data"]["unread_count"] == 0

    # Re-fetch: the previous implementation lost this on refresh.
    again = client.get("/api/v1/notifications", headers=_headers(player)).json()["data"]
    assert again["unread_count"] == 0
    assert again["items"][0]["is_read"] is True


def test_marking_read_twice_is_idempotent(client, db, admin, player):
    client.post(
        "/api/v1/admin/notifications/send",
        json={"title": "Twice", "message": "x", "audience": "ALL"},
        headers=_headers(admin),
    )
    item_id = client.get("/api/v1/notifications", headers=_headers(player)).json()["data"]["items"][0]["id"]

    client.post(f"/api/v1/notifications/{item_id}/read", headers=_headers(player))
    client.post(f"/api/v1/notifications/{item_id}/read", headers=_headers(player))

    assert db.query(NotificationRead).count() == 1


def test_read_state_is_per_player(client, db, admin, player):
    other = _make_user(db, created_at=datetime.now(timezone.utc) - timedelta(days=5))
    client.post(
        "/api/v1/admin/notifications/send",
        json={"title": "Shared", "message": "x", "audience": "ALL"},
        headers=_headers(admin),
    )
    item_id = client.get("/api/v1/notifications", headers=_headers(player)).json()["data"]["items"][0]["id"]
    client.post(f"/api/v1/notifications/{item_id}/read", headers=_headers(player))

    # One player reading a broadcast must not mark it read for everyone.
    assert client.get("/api/v1/notifications", headers=_headers(other)).json()["data"]["unread_count"] == 1


def test_a_player_cannot_mark_someone_elses_notification_read(client, db, admin, player):
    chosen = _make_user(db, created_at=datetime.now(timezone.utc) - timedelta(days=5))
    client.post(
        "/api/v1/admin/notifications/send",
        json={"title": "Private", "message": "x", "audience": "SELECTED", "user_ids": [str(chosen.id)]},
        headers=_headers(admin),
    )
    item_id = client.get("/api/v1/notifications", headers=_headers(chosen)).json()["data"]["items"][0]["id"]

    resp = client.post(f"/api/v1/notifications/{item_id}/read", headers=_headers(player))
    assert resp.status_code == 404
    assert db.query(NotificationRead).count() == 0


def test_mark_all_read_clears_the_badge(client, admin, player):
    for i in range(3):
        client.post(
            "/api/v1/admin/notifications/send",
            json={"title": f"N{i}", "message": "x", "audience": "ALL"},
            headers=_headers(admin),
        )
    assert client.get("/api/v1/notifications/unread-count", headers=_headers(player)).json()["data"]["unread_count"] == 3

    resp = client.post("/api/v1/notifications/read-all", headers=_headers(player))
    assert resp.json()["data"]["marked"] == 3
    assert client.get("/api/v1/notifications/unread-count", headers=_headers(player)).json()["data"]["unread_count"] == 0


def test_unread_only_filter(client, admin, player):
    for i in range(2):
        client.post(
            "/api/v1/admin/notifications/send",
            json={"title": f"N{i}", "message": "x", "audience": "ALL"},
            headers=_headers(admin),
        )
    items = client.get("/api/v1/notifications", headers=_headers(player)).json()["data"]["items"]
    client.post(f"/api/v1/notifications/{items[0]['id']}/read", headers=_headers(player))

    unread = client.get(
        "/api/v1/notifications?unread_only=true", headers=_headers(player)
    ).json()["data"]["items"]
    assert len(unread) == 1
    assert unread[0]["id"] == items[1]["id"]


# ---------------------------------------------------------------------------
# Retraction, validation, authorisation
# ---------------------------------------------------------------------------

def test_retracting_removes_it_from_every_inbox(client, admin, player):
    client.post(
        "/api/v1/admin/notifications/send",
        json={"title": "Oops", "message": "wrong", "audience": "ALL"},
        headers=_headers(admin),
    )
    sent = client.get("/api/v1/admin/notifications/sent", headers=_headers(admin)).json()["data"]["items"]
    nid = sent[0]["id"]

    resp = client.delete(f"/api/v1/admin/notifications/sent/{nid}", headers=_headers(admin))
    assert resp.status_code == 200

    inbox = client.get("/api/v1/notifications", headers=_headers(player)).json()["data"]
    assert inbox["items"] == []
    assert inbox["unread_count"] == 0


def test_retraction_hides_it_even_from_players_who_already_read_it(client, admin, player):
    client.post(
        "/api/v1/admin/notifications/send",
        json={"title": "Seen", "message": "x", "audience": "ALL"},
        headers=_headers(admin),
    )
    item_id = client.get("/api/v1/notifications", headers=_headers(player)).json()["data"]["items"][0]["id"]
    client.post(f"/api/v1/notifications/{item_id}/read", headers=_headers(player))

    client.delete(f"/api/v1/admin/notifications/sent/{item_id}", headers=_headers(admin))
    assert client.get("/api/v1/notifications", headers=_headers(player)).json()["data"]["items"] == []


@pytest.mark.parametrize(
    ("payload", "fragment"),
    [
        ({"title": "", "message": "x"}, "title is required"),
        ({"title": "   ", "message": "x"}, "title is required"),
        ({"title": "t", "message": ""}, "message is required"),
        ({"title": "t" * 141, "message": "x"}, "140 characters"),
        ({"title": "t", "message": "m" * 2001}, "2000 characters"),
        ({"title": "t", "message": "m", "audience": "EVERYONE"}, "ALL or SELECTED"),
        ({"title": "t", "message": "m", "category": "NONSENSE"}, "Unknown notification category"),
    ],
)
def test_invalid_sends_are_refused(client, db, admin, payload, fragment):
    resp = client.post("/api/v1/admin/notifications/send", json=payload, headers=_headers(admin))
    assert resp.status_code == 400, resp.text
    assert fragment in resp.text
    assert db.query(Notification).count() == 0


def test_a_player_cannot_send_notifications(client, player):
    resp = client.post(
        "/api/v1/admin/notifications/send",
        json={"title": "Hacked", "message": "x", "audience": "ALL"},
        headers=_headers(player),
    )
    assert resp.status_code in (401, 403)


def test_the_inbox_requires_authentication(client):
    assert client.get("/api/v1/notifications").status_code in (401, 403)


def test_sent_list_reports_read_counts(client, db, admin, player):
    other = _make_user(db, created_at=datetime.now(timezone.utc) - timedelta(days=5))
    client.post(
        "/api/v1/admin/notifications/send",
        json={"title": "Counted", "message": "x", "audience": "ALL"},
        headers=_headers(admin),
    )
    item_id = client.get("/api/v1/notifications", headers=_headers(player)).json()["data"]["items"][0]["id"]
    client.post(f"/api/v1/notifications/{item_id}/read", headers=_headers(player))

    sent = client.get("/api/v1/admin/notifications/sent", headers=_headers(admin)).json()["data"]["items"]
    assert sent[0]["read_count"] == 1
    assert sent[0]["audience"] == "ALL"
    assert other is not None


def test_newest_notifications_come_first(client, admin, player):
    for i in range(3):
        client.post(
            "/api/v1/admin/notifications/send",
            json={"title": f"N{i}", "message": "x", "audience": "ALL"},
            headers=_headers(admin),
        )
    titles = [i["title"] for i in client.get("/api/v1/notifications", headers=_headers(player)).json()["data"]["items"]]
    assert titles == ["N2", "N1", "N0"]


def test_service_rejects_an_oversized_recipient_list(db, admin):
    with pytest.raises(ValueError, match="more than"):
        notification_service.create_notification(
            db,
            title="Too many",
            message="x",
            audience="SELECTED",
            user_ids=[uuid4() for _ in range(notification_service.MAX_SELECTED_RECIPIENTS + 1)],
            created_by=admin.id,
        )


def test_broadcast_recipients_exclude_admins_and_inactive_players(db, admin, player):
    """Live push targets real, active players only."""
    blocked = _make_user(db)
    blocked.status = UserStatus.SUSPENDED
    db.commit()

    notification = notification_service.create_notification(
        db, title="t", message="m", audience="ALL", created_by=admin.id
    )
    targets = notification_service.recipient_user_ids(db, notification)

    assert player.id in targets
    assert admin.id not in targets
    assert blocked.id not in targets


def test_targeted_recipients_are_exactly_the_selected_players(db, admin):
    a = _make_user(db)
    b = _make_user(db)
    notification = notification_service.create_notification(
        db, title="t", message="m", audience="SELECTED", user_ids=[a.id], created_by=admin.id
    )
    targets = notification_service.recipient_user_ids(db, notification)
    assert targets == [a.id]
    assert b.id not in targets


def test_notification_audience_enum_round_trips(db, admin):
    n = notification_service.create_notification(
        db, title="t", message="m", audience="selected", user_ids=[admin.id], created_by=admin.id
    )
    assert n.audience == NotificationAudience.SELECTED


# ---------------------------------------------------------------------------
# Live delivery over the websocket
# ---------------------------------------------------------------------------

def test_the_socket_rejects_a_bad_token(client):
    """An unauthenticated socket must never receive another player's mail."""
    import pytest as _pytest

    with _pytest.raises(Exception):
        with client.websocket_connect("/api/v1/ws/user/notifications?token=garbage"):
            pass


def test_the_socket_rejects_a_missing_token(client):
    import pytest as _pytest

    with _pytest.raises(Exception):
        with client.websocket_connect("/api/v1/ws/user/notifications"):
            pass


def test_a_sent_notification_arrives_live_on_the_socket(
    client, admin, player, ws_uses_test_database
):
    """The 'popup while the app is open' half of the feature."""
    token = create_access_token(str(player.id), player.role.value)

    with client.websocket_connect(
        f"/api/v1/ws/user/notifications?token={token}"
    ) as ws:
        client.post(
            "/api/v1/admin/notifications/send",
            json={"title": "Live promo", "message": "Right now.", "audience": "ALL",
                  "category": "PROMO"},
            headers=_headers(admin),
        )
        frame = ws.receive_json()

    assert frame["type"] == "notification"
    assert frame["notification"]["title"] == "Live promo"
    assert frame["notification"]["category"] == "PROMO"
    assert frame["notification"]["is_read"] is False


def test_a_targeted_notification_is_not_pushed_to_other_players(
    client, db, admin, player, ws_uses_test_database
):
    """The live channel must respect targeting just as the inbox does.

    Asserted without waiting for a message that should never come: a
    targeted notification goes to someone else, then a broadcast goes to
    everyone. If the first frame this socket receives is the broadcast, the
    targeted one was never delivered here.
    """
    chosen = _make_user(db)
    token = create_access_token(str(player.id), player.role.value)

    with client.websocket_connect(
        f"/api/v1/ws/user/notifications?token={token}"
    ) as ws:
        client.post(
            "/api/v1/admin/notifications/send",
            json={
                "title": "Private",
                "message": "Just for you.",
                "audience": "SELECTED",
                "user_ids": [str(chosen.id)],
            },
            headers=_headers(admin),
        )
        client.post(
            "/api/v1/admin/notifications/send",
            json={"title": "Public", "message": "For all.", "audience": "ALL"},
            headers=_headers(admin),
        )

        frame = ws.receive_json()

    assert frame["notification"]["title"] == "Public", (
        "this socket received a notification addressed to another player"
    )
