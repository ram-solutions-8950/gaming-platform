def _register_and_login(client, username, email, password="Pass1234!"):
    client.post("/api/v1/auth/register", json={
        "name": "Test", "username": username, "email": email, "password": password
    })
    resp = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    return resp.json()["data"]["access_token"]


def test_user_cannot_access_admin(client):
    token = _register_and_login(client, "normaluser_authtest", "normal_authtest@test.com")
    resp = client.get("/api/v1/admin/users", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


def test_unauthenticated_access_denied(client):
    resp = client.get("/api/v1/wallet")
    assert resp.status_code == 403


def test_me_requires_auth(client):
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 403
