import pytest
from uuid import uuid4
from app.models.fee_configuration import FeeConfiguration
from app.models.user import User, UserRole, UserStatus
from app.security.password import hash_password
from app.security.jwt import create_access_token

def create_test_user(db, email: str, username: str, role: UserRole = UserRole.USER):
    user = User(
        id=uuid4(),
        name=f"Test {username}",
        username=username,
        email=email,
        password_hash=hash_password("Password123!"),
        role=role,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

def get_auth_headers(user: User):
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}

def test_get_fees_public(client, db):
    user = create_test_user(db, "u1@t.com", "u1")
    headers = get_auth_headers(user)
    response = client.get("/api/v1/fees", headers=headers)
    assert response.status_code == 200
    data = response.json()["data"]
    assert "game_entry_fee_percent" in data

def test_admin_get_fees(client, db):
    admin = create_test_user(db, "a1@t.com", "a1", UserRole.ADMIN)
    headers = get_auth_headers(admin)
    response = client.get("/api/v1/admin/fees", headers=headers)
    assert response.status_code == 200

def test_super_admin_update_fees(client, db):
    sadmin = create_test_user(db, "sa1@t.com", "sa1", UserRole.SUPER_ADMIN)
    headers = get_auth_headers(sadmin)
    payload = {
        "game_entry_fee_percent": 5.0,
        "winning_fee_percent": 2.5,
        "withdrawal_fee_percent": 2.0
    }
    response = client.patch("/api/v1/admin/fees", json=payload, headers=headers)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["withdrawal_fee_percent"] == 2.0

def test_normal_admin_cannot_update_fees(client, db):
    admin = create_test_user(db, "a2@t.com", "a2", UserRole.ADMIN)
    headers = get_auth_headers(admin)
    payload = {
        "game_entry_fee_percent": 5.0,
        "winning_fee_percent": 2.5,
        "withdrawal_fee_percent": 2.0
    }
    response = client.patch("/api/v1/admin/fees", json=payload, headers=headers)
    assert response.status_code == 403

def test_update_fees_validation(client, db):
    sadmin = create_test_user(db, "sa2@t.com", "sa2", UserRole.SUPER_ADMIN)
    headers = get_auth_headers(sadmin)
    payload = {
        "game_entry_fee_percent": -1.0,
        "winning_fee_percent": 2.5,
        "withdrawal_fee_percent": 2.0
    }
    response = client.patch("/api/v1/admin/fees", json=payload, headers=headers)
    assert response.status_code == 422
