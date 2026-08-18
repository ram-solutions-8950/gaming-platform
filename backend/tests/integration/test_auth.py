import pytest

USER_PAYLOAD = {
    "name": "Test User",
    "username": "testuser123",
    "email": "testuser@example.com",
    "password": "SecurePass123!",
}


def test_register(client):
    response = client.post("/api/v1/auth/register", json=USER_PAYLOAD)
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["data"]["email"] == "testuser@example.com"
    assert "password_hash" not in data["data"]


def test_register_duplicate_email(client):
    client.post("/api/v1/auth/register", json=USER_PAYLOAD)
    response = client.post("/api/v1/auth/register", json=USER_PAYLOAD)
    data = response.json()
    assert data["success"] is False
    assert "error" in data


def test_register_duplicate_username(client):
    client.post("/api/v1/auth/register", json=USER_PAYLOAD)
    payload2 = USER_PAYLOAD.copy()
    payload2["email"] = "other@example.com"
    response = client.post("/api/v1/auth/register", json=payload2)
    data = response.json()
    assert data["success"] is False


def test_login(client):
    client.post("/api/v1/auth/register", json=USER_PAYLOAD)
    response = client.post("/api/v1/auth/login", json={"email": USER_PAYLOAD["email"], "password": USER_PAYLOAD["password"]})
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "access_token" in data["data"]
    assert "refresh_token" in data["data"]


def test_login_wrong_password(client):
    client.post("/api/v1/auth/register", json=USER_PAYLOAD)
    response = client.post("/api/v1/auth/login", json={"email": USER_PAYLOAD["email"], "password": "wrong"})
    assert response.status_code == 401


def test_token_refresh(client):
    client.post("/api/v1/auth/register", json=USER_PAYLOAD)
    login_resp = client.post("/api/v1/auth/login", json={"email": USER_PAYLOAD["email"], "password": USER_PAYLOAD["password"]})
    refresh_token = login_resp.json()["data"]["refresh_token"]
    response = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert response.status_code == 200
    assert response.json()["data"]["access_token"] is not None


def test_logout(client):
    client.post("/api/v1/auth/register", json=USER_PAYLOAD)
    login_resp = client.post("/api/v1/auth/login", json={"email": USER_PAYLOAD["email"], "password": USER_PAYLOAD["password"]})
    tokens = login_resp.json()["data"]
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    response = client.post("/api/v1/auth/logout", json={"refresh_token": tokens["refresh_token"]}, headers=headers)
    assert response.json()["success"] is True
    # Refresh token should no longer work
    resp2 = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert resp2.status_code == 401


def test_me_endpoint(client):
    client.post("/api/v1/auth/register", json=USER_PAYLOAD)
    login_resp = client.post("/api/v1/auth/login", json={"email": USER_PAYLOAD["email"], "password": USER_PAYLOAD["password"]})
    token = login_resp.json()["data"]["access_token"]
    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.json()["success"] is True
    assert response.json()["data"]["username"] == USER_PAYLOAD["username"]
