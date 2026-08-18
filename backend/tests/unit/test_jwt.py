from app.security.jwt import create_access_token, decode_access_token, create_refresh_token, hash_refresh_token


def test_access_token_roundtrip():
    token = create_access_token("user-123", "USER")
    payload = decode_access_token(token)
    assert payload is not None
    assert payload["sub"] == "user-123"
    assert payload["role"] == "USER"


def test_invalid_token():
    assert decode_access_token("not.a.token") is None


def test_refresh_token_hash():
    raw, hashed, expires = create_refresh_token()
    assert len(raw) > 20
    assert hashed == hash_refresh_token(raw)
    assert hashed != raw
