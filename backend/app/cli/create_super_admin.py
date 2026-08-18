import argparse
import getpass
import os
import sys

from sqlalchemy import func

from app.config import settings
from app.database import SessionLocal
from app.models.user import User, UserRole, UserStatus
from app.models.wallet import Wallet
from app.security.password import hash_password

ALLOWED_ENVIRONMENTS = {"development", "dev", "local", "test"}


def _resolve_arg_or_env(arg_value: str | None, env_name: str) -> str | None:
    if arg_value and arg_value.strip():
        return arg_value.strip()
    env_value = os.getenv(env_name, "").strip()
    return env_value or None


def _read_password(args: argparse.Namespace) -> str:
    if args.password and args.password.strip():
        return args.password.strip()

    env_password = os.getenv("DEV_SUPERADMIN_PASSWORD", "").strip()
    if env_password:
        return env_password

    if args.password_stdin:
        return sys.stdin.readline().strip()

    return getpass.getpass("Enter SUPER_ADMIN password: ").strip()


def _validate_inputs(email: str | None, username: str | None, password: str | None) -> None:
    if not email:
        raise SystemExit("Missing email. Use --email or DEV_SUPERADMIN_EMAIL.")
    if not username:
        raise SystemExit("Missing username. Use --username or DEV_SUPERADMIN_USERNAME.")
    if not password:
        raise SystemExit("Missing password. Use --password, DEV_SUPERADMIN_PASSWORD, --password-stdin, or prompt input.")
    if len(password) < 8:
        raise SystemExit("Password must be at least 8 characters.")


def _ensure_dev_environment() -> None:
    env = (settings.ENVIRONMENT or "").strip().lower()
    if env not in ALLOWED_ENVIRONMENTS:
        raise SystemExit(
            "Refusing to run outside development/test environments. "
            f"Current ENVIRONMENT='{settings.ENVIRONMENT}'."
        )


def _create_or_reset_super_admin(email: str, username: str, name: str, password: str, reset_existing: bool) -> int:
    db = SessionLocal()
    try:
        email_lower = email.lower()

        existing_by_email = db.query(User).filter(func.lower(User.email) == email_lower).first()
        existing_by_username = db.query(User).filter(User.username == username).first()

        if existing_by_email and existing_by_username and existing_by_email.id != existing_by_username.id:
            raise SystemExit("Conflict: email and username belong to different users.")

        existing_user = existing_by_email or existing_by_username

        if existing_user and not reset_existing:
            print("User already exists. Re-run with --reset-existing to rotate password and enforce SUPER_ADMIN role.")
            print(f"Existing user id: {existing_user.id}")
            return 2

        password_hash = hash_password(password)

        if existing_user:
            existing_user.email = email_lower
            existing_user.username = username
            existing_user.name = name
            existing_user.password_hash = password_hash
            existing_user.role = UserRole.SUPER_ADMIN
            existing_user.status = UserStatus.ACTIVE
            action = "updated"
            user = existing_user
        else:
            user = User(
                name=name,
                username=username,
                email=email_lower,
                password_hash=password_hash,
                role=UserRole.SUPER_ADMIN,
                status=UserStatus.ACTIVE,
            )
            db.add(user)
            db.flush()
            action = "created"

        wallet = db.query(Wallet).filter(Wallet.user_id == user.id).first()
        if not wallet:
            db.add(Wallet(user_id=user.id, balance=0))

        db.commit()
        db.refresh(user)

        print(f"SUPER_ADMIN {action} successfully.")
        print(f"user_id={user.id}")
        print(f"username={user.username}")
        print(f"email={user.email}")
        print(f"role={user.role.value}")
        return 0
    except SystemExit:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise SystemExit(f"Failed to create/reset SUPER_ADMIN: {exc}") from exc
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Create or reset a development SUPER_ADMIN account.")
    parser.add_argument("--email", help="SUPER_ADMIN email (or DEV_SUPERADMIN_EMAIL)")
    parser.add_argument("--username", help="SUPER_ADMIN username (or DEV_SUPERADMIN_USERNAME)")
    parser.add_argument("--name", default=None, help="Display name (or DEV_SUPERADMIN_NAME)")
    parser.add_argument("--password", help="Password (or DEV_SUPERADMIN_PASSWORD)")
    parser.add_argument("--password-stdin", action="store_true", help="Read password from stdin")
    parser.add_argument("--reset-existing", action="store_true", help="Reset password and role if the user already exists")
    args = parser.parse_args()

    _ensure_dev_environment()

    email = _resolve_arg_or_env(args.email, "DEV_SUPERADMIN_EMAIL")
    username = _resolve_arg_or_env(args.username, "DEV_SUPERADMIN_USERNAME")
    name = _resolve_arg_or_env(args.name, "DEV_SUPERADMIN_NAME") or "Development Super Admin"
    password = _read_password(args)

    _validate_inputs(email, username, password)
    return _create_or_reset_super_admin(email=email, username=username, name=name, password=password, reset_existing=args.reset_existing)


if __name__ == "__main__":
    raise SystemExit(main())
