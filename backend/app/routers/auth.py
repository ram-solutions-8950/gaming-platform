from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from ..dependencies.database import get_db
from ..schemas.auth import RegisterIn, LoginIn, RefreshIn, LogoutIn, TokenOut
from ..schemas.user import UserOut
from ..services import auth_service
from ..security.permissions import require_user
from ..utils.responses import success_response, error_response
from ..models.user import User
from ..middleware.rate_limiter import limiter

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/register")
@limiter.limit("10/minute")
def register(request: Request, data: RegisterIn, db: Session = Depends(get_db)):
    try:
        user = auth_service.register_user(db, data.name, data.username, data.email, data.password, data.referral_code)
        return success_response(UserOut.model_validate(user).model_dump(), status_code=201)
    except ValueError as e:
        return error_response("REGISTRATION_ERROR", str(e))


@router.post("/login")
@limiter.limit("20/minute")
def login(data: LoginIn, request: Request, db: Session = Depends(get_db)):
    try:
        tokens = auth_service.login_user(db, data.email, data.password, ip_address=request.client.host)
        return success_response(tokens)
    except ValueError as e:
        return error_response("LOGIN_ERROR", str(e), status_code=401)


@router.post("/refresh")
@limiter.limit("20/minute")
def refresh(request: Request, data: RefreshIn, db: Session = Depends(get_db)):
    try:
        tokens = auth_service.refresh_tokens(db, data.refresh_token)
        return success_response(tokens)
    except ValueError as e:
        return error_response("REFRESH_ERROR", str(e), status_code=401)


@router.post("/logout")
@limiter.limit("20/minute")
def logout(request: Request, data: LogoutIn, current_user: User = Depends(require_user), db: Session = Depends(get_db)):
    auth_service.logout_user(db, data.refresh_token, current_user.id)
    return success_response({"message": "Logged out successfully"})


@router.get("/me")
def me(current_user: User = Depends(require_user)):
    return success_response(UserOut.model_validate(current_user).model_dump())
