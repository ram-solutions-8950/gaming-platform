from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..dependencies.database import get_db
from ..schemas.user import UserOut, UserUpdateIn
from ..services import user_service
from ..security.permissions import require_user
from ..utils.responses import success_response, error_response
from ..models.user import User

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me")
def get_my_profile(current_user: User = Depends(require_user)):
    return success_response(UserOut.model_validate(current_user).model_dump())


@router.patch("/me")
def update_my_profile(
    data: UserUpdateIn,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    try:
        updated = user_service.update_user_profile(db, current_user, data.name, data.username)
        return success_response(UserOut.model_validate(updated).model_dump())
    except ValueError as e:
        return error_response("UPDATE_ERROR", str(e))
