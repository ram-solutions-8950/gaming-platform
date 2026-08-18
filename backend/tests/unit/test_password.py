from app.security.password import hash_password, verify_password


def test_hash_and_verify():
    hashed = hash_password("SecurePass123!")
    assert verify_password("SecurePass123!", hashed) is True


def test_wrong_password():
    hashed = hash_password("SecurePass123!")
    assert verify_password("WrongPassword", hashed) is False


def test_hash_is_not_plaintext():
    hashed = hash_password("MyPassword")
    assert "MyPassword" not in hashed
