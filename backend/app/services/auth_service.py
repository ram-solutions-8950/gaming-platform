from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..models.user import User, UserRole, UserStatus
from ..models.wallet import Wallet
from ..models.refresh_token import RefreshToken
from ..security.password import hash_password, verify_password
from ..security.jwt import create_access_token, create_refresh_token, hash_refresh_token
from ..services.audit_service import log_action
from ..utils.logging import get_logger

logger = get_logger("auth")


def register_user(db: Session, name: str, username: str, email: str, password: str, referral_code: Optional[str] = None) -> User:
    email_lower = email.lower()

    # Validate referral code early to reject invalid or self-referrals
    referrer = None
    if referral_code and referral_code.strip():
        clean_code = referral_code.strip().upper()
        referrer = db.query(User).filter(func.upper(User.referral_code) == clean_code).first()
        if not referrer:
            raise ValueError("Invalid referral code")
        if (
            referrer.username.lower() == username.lower()
            or referrer.email.lower() == email_lower
        ):
            raise ValueError("Self-referral is not allowed")

    if db.query(User).filter(func.lower(User.email) == email_lower).first():
        raise ValueError("Email already registered")
    if db.query(User).filter(User.username == username).first():
        raise ValueError("Username already taken")

    # Generate unique referral code for the registering user
    import secrets
    while True:
        my_ref_code = secrets.token_hex(4).upper()
        if not db.query(User).filter(User.referral_code == my_ref_code).first():
            break

    user = User(
        name=name,
        username=username,
        email=email_lower,
        password_hash=hash_password(password),
        role=UserRole.USER,
        status=UserStatus.ACTIVE,
        referral_code=my_ref_code,
    )
    db.add(user)
    db.flush()

    wallet = Wallet(user_id=user.id, balance=0)
    db.add(wallet)
    db.flush()

    # Handle referral relationship if a valid code was passed
    if referrer:
        if referrer.id == user.id or referrer.referral_code.upper() == my_ref_code:
            raise ValueError("Self-referral is not allowed")
        
        from ..models.referral import Referral, ReferralStatus
        existing_ref = db.query(Referral).filter(Referral.referred_user_id == user.id).first()
        if existing_ref:
            raise ValueError("User has already been referred")
        
        ref_rel = Referral(
            referrer_user_id=referrer.id,
            referred_user_id=user.id,
            referral_code=referrer.referral_code,
            status=ReferralStatus.REGISTERED,
            reward_amount=0,
        )
        db.add(ref_rel)
        db.flush()

    log_action(db, action="USER_REGISTER", actor_id=user.id, entity_type="user", entity_id=user.id)
    db.commit()
    db.refresh(user)
    return user


def login_user(db: Session, email: str, password: str, ip_address: Optional[str] = None) -> dict:
    email_lower = email.lower()
    user = db.query(User).filter(func.lower(User.email) == email_lower).first()

    if not user or not verify_password(password, user.password_hash):
        raise ValueError("Invalid email or password")
    if user.status != UserStatus.ACTIVE:
        raise ValueError(f"Account is {user.status.value.lower()}")

    access_token = create_access_token(str(user.id), user.role.value)
    raw_refresh, hashed_refresh, expires_at = create_refresh_token()

    rt = RefreshToken(user_id=user.id, token_hash=hashed_refresh, expires_at=expires_at)
    db.add(rt)

    user.last_login_at = datetime.now(timezone.utc)
    log_action(db, action="USER_LOGIN", actor_id=user.id, entity_type="user", entity_id=user.id, ip_address=ip_address)
    db.commit()

    return {"access_token": access_token, "refresh_token": raw_refresh, "token_type": "bearer"}


def refresh_tokens(db: Session, raw_refresh_token: str) -> dict:
    token_hash = hash_refresh_token(raw_refresh_token)
    rt = db.query(RefreshToken).filter(
        RefreshToken.token_hash == token_hash,
        RefreshToken.is_revoked == False,
    ).first()

    if not rt or rt.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise ValueError("Invalid or expired refresh token")

    user = db.query(User).filter(User.id == rt.user_id).first()
    if not user or user.status != UserStatus.ACTIVE:
        raise ValueError("User not available")

    # Revoke old token (rotation)
    rt.is_revoked = True

    access_token = create_access_token(str(user.id), user.role.value)
    raw_new, hashed_new, expires_at = create_refresh_token()
    new_rt = RefreshToken(user_id=user.id, token_hash=hashed_new, expires_at=expires_at)
    db.add(new_rt)
    db.commit()

    return {"access_token": access_token, "refresh_token": raw_new, "token_type": "bearer"}


def logout_user(db: Session, raw_refresh_token: str, actor_id) -> None:
    token_hash = hash_refresh_token(raw_refresh_token)
    rt = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    if rt:
        rt.is_revoked = True
    log_action(db, action="USER_LOGOUT", actor_id=actor_id, entity_type="user", entity_id=actor_id)
    db.commit()
