import pytest
from decimal import Decimal
from sqlalchemy.orm import Session
from app.services.wallet_service import credit_wallet, debit_wallet, get_balance
from app.models.transaction import WalletTransactionType
from app.models.user import UserRole, UserStatus
from app.models.wallet import Wallet
from app.models.user import User
from app.security.password import hash_password


def _make_user(db, username="wallettest", email="wallet@test.com"):
    user = User(
        name="Wallet Test",
        username=username,
        email=email,
        password_hash=hash_password("pass123"),
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    db.flush()
    wallet = Wallet(user_id=user.id, balance=0)
    db.add(wallet)
    db.commit()
    db.refresh(user)
    return user


def test_wallet_created_on_register(client):
    payload = {"name": "WalletU", "username": "walletu", "email": "walletu@test.com", "password": "Pass1234!"}
    resp = client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code == 201
    login = client.post("/api/v1/auth/login", json={"email": payload["email"], "password": payload["password"]})
    token = login.json()["data"]["access_token"]
    wallet_resp = client.get("/api/v1/wallet", headers={"Authorization": f"Bearer {token}"})
    assert wallet_resp.json()["success"] is True
    assert wallet_resp.json()["data"]["balance"] == 0


def test_credit_wallet(db):
    user = _make_user(db)
    tx = credit_wallet(db, user.id, 100000, WalletTransactionType.ADJUSTMENT,
                       reference_type="test", reference_id="ref-001")
    db.commit()
    wallet = get_balance(db, user.id)
    assert wallet.balance == 100000
    assert tx.balance_after == 100000


def test_debit_wallet(db):
    user = _make_user(db, username="debituser", email="debit@test.com")
    credit_wallet(db, user.id, 50000, WalletTransactionType.ADJUSTMENT,
                  reference_type="test", reference_id="cr-debit-001")
    debit_wallet(db, user.id, 20000, WalletTransactionType.WITHDRAWAL,
                 reference_type="test", reference_id="dr-debit-001")
    db.commit()
    wallet = get_balance(db, user.id)
    assert wallet.balance == 30000


def test_prevent_negative_balance(db):
    user = _make_user(db, username="neguser", email="neg@test.com")
    import pytest
    with pytest.raises(ValueError, match="Insufficient"):
        debit_wallet(db, user.id, 100, WalletTransactionType.WITHDRAWAL,
                     reference_type="test", reference_id="neg-001")
    db.rollback()


def test_idempotency_duplicate_reference(db):
    user = _make_user(db, username="idempuser", email="idemp@test.com")
    credit_wallet(db, user.id, 50000, WalletTransactionType.ADJUSTMENT,
                  reference_type="test", reference_id="idemp-dup-001")
    import pytest
    with pytest.raises(ValueError, match="Duplicate"):
        credit_wallet(db, user.id, 50000, WalletTransactionType.ADJUSTMENT,
                      reference_type="test", reference_id="idemp-dup-001")
    db.rollback()
