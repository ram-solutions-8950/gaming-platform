import pytest
from uuid import uuid4
from fastapi.testclient import TestClient
from app.models.user import User, UserRole
from app.models.referral import Referral, ReferralSettings, ReferralStatus
from app.models.deposit import Deposit, DepositStatus
from app.models.transaction import WalletTransaction, WalletTransactionType
from app.services.auth_service import register_user
from app.services.referral_service import get_referral_settings, check_and_qualify_referral
from app.services.wallet_service import get_balance


@pytest.fixture
def admin_user(db):
    uid = uuid4().hex[:6]
    user = User(
        name="Admin User",
        username=f"admin_ref_{uid}",
        email=f"admin_ref_{uid}@example.com",
        password_hash="fakehash",
        role=UserRole.ADMIN,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_token(admin_user):
    from app.security.jwt import create_access_token
    return create_access_token(str(admin_user.id), admin_user.role.value)


@pytest.fixture
def normal_user(db):
    uid = uuid4().hex[:6]
    user = register_user(db, "Normal User", f"user_ref_{uid}", f"user_ref_{uid}@example.com", "password123")
    return user


@pytest.fixture
def normal_token(normal_user):
    from app.security.jwt import create_access_token
    return create_access_token(str(normal_user.id), normal_user.role.value)


def test_admin_view_settings(client, admin_token):
    res = client.get("/api/v1/admin/referral/settings", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    data = res.json()["data"]
    assert "reward_amount" in data
    assert "is_active" in data


def test_admin_update_settings(client, admin_token, db):
    res = client.put(
        "/api/v1/admin/referral/settings",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"reward_amount": 250.0, "is_active": True}
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["reward_amount"] == 250.0
    assert data["is_active"] is True

    # Check db
    settings = get_referral_settings(db)
    assert settings.reward_amount == 25000


def test_normal_user_cannot_update_settings(client, normal_token):
    res = client.put(
        "/api/v1/admin/referral/settings",
        headers={"Authorization": f"Bearer {normal_token}"},
        json={"reward_amount": 250.0, "is_active": True}
    )
    assert res.status_code in (401, 403)


def test_validation_bounds(client, admin_token):
    # Negative reward
    res = client.put(
        "/api/v1/admin/referral/settings",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"reward_amount": -50.0, "is_active": True}
    )
    assert res.status_code == 400

    # Zero reward
    res = client.put(
        "/api/v1/admin/referral/settings",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"reward_amount": 0, "is_active": True}
    )
    assert res.status_code == 400

    # Excessive reward
    res = client.put(
        "/api/v1/admin/referral/settings",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"reward_amount": 20000.0, "is_active": True}
    )
    assert res.status_code == 400


def test_referral_creation(db):
    referrer = register_user(db, "Referrer", "referrer_abc", "referrer@example.com", "password")
    referred = register_user(
        db, "Referred", "referred_abc", "referred@example.com", "password",
        referral_code=referrer.referral_code
    )

    # Check referral relationship
    ref = db.query(Referral).filter(Referral.referred_user_id == referred.id).first()
    assert ref is not None
    assert ref.referrer_user_id == referrer.id
    assert ref.referral_code == referrer.referral_code
    assert ref.status == ReferralStatus.REGISTERED


def test_self_referral_rejected(db):
    referrer = register_user(db, "Self Referrer", "self_ref", "self_ref@example.com", "password")
    
    with pytest.raises(ValueError, match="Self-referral is not allowed"):
        register_user(
            db, "Self Referrer 2", "self_ref_attempt", "self_ref@example.com", "password",
            referral_code=referrer.referral_code
        )


def test_invalid_referral_code_rejected(db):
    with pytest.raises(ValueError, match="Invalid referral code"):
        register_user(
            db, "Invalid Ref User", "invalid_ref_user", "invalid_ref@example.com", "password",
            referral_code="NONEXISTENT_CODE_123"
        )


def test_duplicate_referral_rejected(db):
    referrer = register_user(db, "Referrer D", "ref_d", "ref_d@example.com", "password")
    referred = register_user(
        db, "Referred D", "referred_d", "referred_d@example.com", "password",
        referral_code=referrer.referral_code
    )
    
    from sqlalchemy.exc import IntegrityError
    ref2 = Referral(
        referrer_user_id=referrer.id,
        referred_user_id=referred.id,
        referral_code=referrer.referral_code,
    )
    db.add(ref2)
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_unqualified_referral_receives_no_reward(db):
    referrer = register_user(db, "Referrer E", "ref_e", "ref_e@example.com", "password")
    referred = register_user(
        db, "Referred E", "referred_e", "referred_e@example.com", "password",
        referral_code=referrer.referral_code
    )

    # Check referrer wallet (should be 0)
    bal = get_balance(db, referrer.id)
    assert bal.balance == 0


def test_qualification_rewards_referrer(db):
    # Set reward setting to ₹150
    settings = get_referral_settings(db)
    settings.reward_amount = 15000
    db.commit()

    referrer = register_user(db, "Referrer F", "ref_f", "ref_f@example.com", "password")
    referred = register_user(
        db, "Referred F", "referred_f", "referred_f@example.com", "password",
        referral_code=referrer.referral_code
    )

    # Create successful deposit for referred user
    dep = Deposit(
        user_id=referred.id,
        wallet_id=referred.wallet.id,
        amount=10000,
        status=DepositStatus.SUCCESS,
    )
    db.add(dep)
    db.commit()

    # Trigger qualification
    check_and_qualify_referral(db, referred.id)
    db.commit()

    # Verify referrer's wallet got ₹150
    bal = get_balance(db, referrer.id)
    assert bal.balance == 15000

    # Verify referral status is REWARD_PAID
    ref = db.query(Referral).filter(Referral.referred_user_id == referred.id).first()
    assert ref.status == ReferralStatus.REWARD_PAID
    assert ref.reward_amount == 15000

    # Check transaction exists in history
    tx = db.query(WalletTransaction).filter(
        WalletTransaction.user_id == referrer.id,
        WalletTransaction.type == WalletTransactionType.REFERRAL_REWARD
    ).first()
    assert tx is not None
    assert tx.amount == 15000
    assert tx.reference_type == "REFERRAL_REWARD"
    assert tx.reference_id == f"referral_{referred.id}"


def test_changing_reward_configuration(db):
    # Admin sets ₹50
    settings = get_referral_settings(db)
    settings.reward_amount = 5000
    db.commit()

    referrer = register_user(db, "Referrer G1", "ref_g1", "ref_g1@example.com", "password")
    referred1 = register_user(
        db, "Referred G1", "referred_g1", "referred_g1@example.com", "password",
        referral_code=referrer.referral_code
    )

    # Simulate deposit completion
    dep1 = Deposit(user_id=referred1.id, wallet_id=referred1.wallet.id, amount=10000, status=DepositStatus.SUCCESS)
    db.add(dep1)
    db.commit()

    check_and_qualify_referral(db, referred1.id)
    db.commit()

    # Referrer got ₹50
    assert get_balance(db, referrer.id).balance == 5000

    # Admin changes to ₹250
    settings.reward_amount = 25000
    db.commit()

    referred2 = register_user(
        db, "Referred G2", "referred_g2", "referred_g2@example.com", "password",
        referral_code=referrer.referral_code
    )
    dep2 = Deposit(user_id=referred2.id, wallet_id=referred2.wallet.id, amount=10000, status=DepositStatus.SUCCESS)
    db.add(dep2)
    db.commit()

    check_and_qualify_referral(db, referred2.id)
    db.commit()

    # Referrer balance should now be 50 + 250 = ₹300 (30000 paisa)
    assert get_balance(db, referrer.id).balance == 30000

    # Historical check: referred1's reward amount remains 5000 paisa
    ref1 = db.query(Referral).filter(Referral.referred_user_id == referred1.id).first()
    ref2 = db.query(Referral).filter(Referral.referred_user_id == referred2.id).first()
    assert ref1.reward_amount == 5000
    assert ref2.reward_amount == 25000


def test_idempotent_rewards(db):
    settings = get_referral_settings(db)
    settings.reward_amount = 10000
    db.commit()

    referrer = register_user(db, "Referrer H", "ref_h", "ref_h@example.com", "password")
    referred = register_user(
        db, "Referred H", "referred_h", "referred_h@example.com", "password",
        referral_code=referrer.referral_code
    )

    dep = Deposit(user_id=referred.id, wallet_id=referred.wallet.id, amount=10000, status=DepositStatus.SUCCESS)
    db.add(dep)
    db.commit()

    # Run once
    check_and_qualify_referral(db, referred.id)
    db.commit()

    # Run again (simulate double call or concurrent call)
    check_and_qualify_referral(db, referred.id)
    db.commit()

    # Balance must be exactly 10000 paisa (₹100 default) and not doubled
    assert get_balance(db, referrer.id).balance == 10000

    # Exactly 1 wallet transaction created
    txs = db.query(WalletTransaction).filter(
        WalletTransaction.user_id == referrer.id,
        WalletTransaction.type == WalletTransactionType.REFERRAL_REWARD
    ).all()
    assert len(txs) == 1
