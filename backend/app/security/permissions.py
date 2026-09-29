from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from ..security.jwt import decode_access_token
from ..dependencies.database import get_db
from ..models.user import User, UserStatus, UserRole

bearer_scheme = HTTPBearer(auto_error=False)


def _get_user_from_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Authentication required")

    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is not active")
    return user


def require_user(user: User = Depends(_get_user_from_token)) -> User:
    return user


def require_admin(user: User = Depends(_get_user_from_token)) -> User:
    if user.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


def require_super_admin(user: User = Depends(_get_user_from_token)) -> User:
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super-admin access required")
    return user


def has_permission(user: User, permission: str) -> bool:
    """Check if an admin user has a specific granular permission."""
    if user.role == UserRole.SUPER_ADMIN:
        return True
    if user.role != UserRole.ADMIN:
        return False
    # If no custom permissions set, grant default admin permissions
    if user.permissions is None:
        from ..models.role import DEFAULT_ROLE_PERMISSIONS
        return permission in DEFAULT_ROLE_PERMISSIONS.get("ADMIN", [])
    return permission in user.permissions


def require_permission(permission: str):
    """Dependency that enforces a specific granular permission for admins."""
    def _dependency(user: User = Depends(require_admin)) -> User:
        if not has_permission(user, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: Requires '{permission}' access",
            )
        return user
    return _dependency
