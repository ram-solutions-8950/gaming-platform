"""Integration tests for enhanced Admin Panel features:
1. Fast Dashboard Overview Stats
2. RBAC & Team Management
3. Wager Requirement Controls & Waiving
4. Winning & RTP Controls (Global & Personal)
"""

import pytest
from uuid import uuid4
from datetime import datetime, timezone

from sqlalchemy.orm import Session
from app.models.user import User, UserRole, UserStatus
from app.models.deposit import Deposit, DepositStatus
from app.models.withdrawal import Withdrawal, WithdrawalStatus
from app.models.wallet import Wallet
from app.models.game_catalog import Game, GameStatus
from app.models.wager import WagerRequirement
from app.models.winning import UserWinningControl, WinMode
from app.security.jwt import create_access_token


@pytest.fixture
def super_admin_setup(client, db: Session):
    admin = User(
        id=uuid4(),
        name="Super Admin QA",
        username=f"superadmin_{str(uuid4())[:8]}",
        email=f"superadmin_{str(uuid4())[:8]}@example.com",
        password_hash="fakehash",
        role=UserRole.SUPER_ADMIN,
        status=UserStatus.ACTIVE,
    )
    db.add(admin)
    db.commit()
    token = create_access_token(str(admin.id), admin.role.value)
    headers = {"Authorization": f"Bearer {token}"}
    return client, headers, admin


@pytest.fixture
def sample_player(db: Session):
    user = User(
        id=uuid4(),
        name="Test Player",
        username=f"player_{str(uuid4())[:8]}",
        email=f"player_{str(uuid4())[:8]}@example.com",
        password_hash="fakehash",
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    db.flush()
    wallet = Wallet(user_id=user.id, balance=50000)
    db.add(wallet)
    db.commit()
    return user


def test_dashboard_stats_endpoint(super_admin_setup, sample_player, db: Session):
    client, headers, admin = super_admin_setup

    res = client.get("/api/v1/admin/dashboard/stats", headers=headers)
    assert res.status_code == 200
    data = res.json()["data"]

    assert "total_players" in data
    assert "total_admin_users" in data
    assert "total_deposits_inr" in data
    assert "total_withdrawals_inr" in data
    assert "pending_withdrawals" in data
    assert "total_revenue_inr" in data
    assert "games_overview" in data
    assert "live_players" in data
    assert "recent_transactions" in data
    assert "withdrawal_requests" in data
    assert "device_distribution" in data
    assert data["total_admin_users"] >= 1


def test_team_management_rbac(super_admin_setup, db: Session):
    client, headers, admin = super_admin_setup

    # 1. Get Me
    res_me = client.get("/api/v1/admin/me", headers=headers)
    assert res_me.status_code == 200
    assert res_me.json()["data"]["role"] == "SUPER_ADMIN"

    # 2. Get Permissions and Roles Catalog
    res_perms = client.get("/api/v1/admin/team/permissions", headers=headers)
    assert res_perms.status_code == 200
    assert "dashboard" in res_perms.json()["data"]
    assert "winning_control" in res_perms.json()["data"]

    res_roles = client.get("/api/v1/admin/team/roles", headers=headers)
    assert res_roles.status_code == 200
    assert "OPERATIONS_MANAGER" in res_roles.json()["data"]

    # 3. Create a new Team Member
    new_uname = f"staff_{str(uuid4())[:8]}"
    create_payload = {
        "name": "Operations Staff",
        "username": new_uname,
        "email": f"{new_uname}@example.com",
        "password": "Password123!",
        "team_role": "Operations Manager",
        "permissions": ["dashboard", "games", "winning_control"],
    }
    res_create = client.post("/api/v1/admin/team", json=create_payload, headers=headers)
    assert res_create.status_code == 200
    created_id = res_create.json()["data"]["id"]
    assert res_create.json()["data"]["permissions"] == ["dashboard", "games", "winning_control"]

    # 4. List Team
    res_list = client.get("/api/v1/admin/team", headers=headers)
    assert res_list.status_code == 200
    members = res_list.json()["data"]
    assert any(m["username"] == new_uname for m in members)

    # 5. Update Team Member
    update_payload = {
        "team_role": "Senior Operations Lead",
        "permissions": ["dashboard", "games", "winning_control", "analytics"],
    }
    res_update = client.patch(f"/api/v1/admin/team/{created_id}", json=update_payload, headers=headers)
    assert res_update.status_code == 200
    assert res_update.json()["data"]["team_role"] == "Senior Operations Lead"
    assert "analytics" in res_update.json()["data"]["permissions"]

    # 6. Delete (Disable) Team Member
    res_del = client.delete(f"/api/v1/admin/team/{created_id}", headers=headers)
    assert res_del.status_code == 200


def test_wager_requirements_management(super_admin_setup, sample_player, db: Session):
    client, headers, admin = super_admin_setup

    # 1. Create a custom wager requirement
    create_payload = {
        "user_id": str(sample_player.id),
        "required_amount_inr": 250.0,
    }
    res_create = client.post("/api/v1/admin/wagers", json=create_payload, headers=headers)
    assert res_create.status_code == 200
    wager_id = res_create.json()["data"]["id"]

    # 2. List wagers
    res_list = client.get(f"/api/v1/admin/wagers?user_id={sample_player.id}", headers=headers)
    assert res_list.status_code == 200
    items = res_list.json()["data"]["items"]
    assert len(items) >= 1
    target_wager = next(w for w in items if w["id"] == wager_id)
    assert target_wager["required_amount_inr"] == 250.0
    assert target_wager["is_fulfilled"] is False

    # 3. Fulfill wager
    res_fulfill = client.post(f"/api/v1/admin/wagers/{wager_id}/fulfill", headers=headers)
    assert res_fulfill.status_code == 200

    # 4. Verify fulfilled
    res_list_after = client.get(f"/api/v1/admin/wagers?user_id={sample_player.id}", headers=headers)
    target_after = next(w for w in res_list_after.json()["data"]["items"] if w["id"] == wager_id)
    assert target_after["is_fulfilled"] is True


def test_winning_controls_global_and_personal(super_admin_setup, sample_player, db: Session):
    client, headers, admin = super_admin_setup
    # Ensure at least one game exists in the test DB
    game = db.query(Game).filter(Game.slug == "dragon-tiger").first()
    if not game:
        game = Game(
            id=uuid4(),
            name="Dragon Tiger",
            slug="dragon-tiger",
            game_type="CARD",
            status=GameStatus.ACTIVE,
            min_bet=1000,
            max_bet=200000,
            config={"winning_settings": {"mode": "HOUSE_EDGE", "rtp_percent": 95, "house_edge_percent": 5}},
        )
        db.add(game)
        db.commit()

    # 1. Global Winning Controls
    res_globals = client.get("/api/v1/admin/winning-controls/global", headers=headers)
    assert res_globals.status_code == 200
    games = res_globals.json()["data"]
    assert len(games) > 0
    first_slug = games[0]["slug"]

    # Update global config for first game
    update_global_payload = {
        "mode": "HOUSE_EDGE",
        "rtp_percent": 92,
    }
    res_update_global = client.put(
        f"/api/v1/admin/winning-controls/global/{first_slug}", json=update_global_payload, headers=headers
    )
    assert res_update_global.status_code == 200
    assert res_update_global.json()["data"]["rtp_percent"] == 92
    assert res_update_global.json()["data"]["house_edge_percent"] == 8

    # 2. Personal Winning Control for Player
    personal_payload = {
        "user_id": str(sample_player.id),
        "mode": "BOOSTED",
        "win_rate_percent": 85,
        "note": "VIP Promotional Luck Override",
    }
    res_set_personal = client.post("/api/v1/admin/winning-controls/personal", json=personal_payload, headers=headers)
    assert res_set_personal.status_code == 200
    assert res_set_personal.json()["data"]["mode"] == "BOOSTED"
    assert res_set_personal.json()["data"]["win_rate_percent"] == 85

    # List personal controls
    res_list_personal = client.get("/api/v1/admin/winning-controls/personal", headers=headers)
    assert res_list_personal.status_code == 200
    overrides = res_list_personal.json()["data"]["items"]
    assert any(o["user_id"] == str(sample_player.id) for o in overrides)

    # Delete personal control (revert default)
    res_del_personal = client.delete(f"/api/v1/admin/winning-controls/personal/{sample_player.id}", headers=headers)
    assert res_del_personal.status_code == 200

    # Verify deleted
    res_list_after = client.get("/api/v1/admin/winning-controls/personal", headers=headers)
    overrides_after = res_list_after.json()["data"]["items"]
    assert not any(o["user_id"] == str(sample_player.id) for o in overrides_after)
