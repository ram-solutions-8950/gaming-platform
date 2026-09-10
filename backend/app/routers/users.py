import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy.orm import Session
from ..dependencies.database import get_db
from ..schemas.user import UserOut, UserUpdateIn
from ..services import user_service
from ..security.permissions import require_user
from ..utils.responses import success_response, error_response
from ..models.user import User

router = APIRouter(prefix="/users", tags=["Users"])

AVATAR_DIR = Path(__file__).resolve().parent.parent.parent / "uploads" / "avatars"
AVATAR_DIR.mkdir(parents=True, exist_ok=True)


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
        updated = user_service.update_user_profile(
            db, current_user, data.name, data.username, data.avatar_url
        )
        return success_response(UserOut.model_validate(updated).model_dump())
    except ValueError as e:
        return error_response("UPDATE_ERROR", str(e))


@router.post("/me/avatar")
async def upload_my_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        return error_response("INVALID_FILE_TYPE", "Only image files (JPEG, PNG, WebP) are allowed.")

    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        return error_response("FILE_TOO_LARGE", "Image file must be under 5MB.")

    ext = Path(file.filename or "avatar.jpg").suffix.lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        ext = ".jpg"

    filename = f"{current_user.id}_{uuid.uuid4().hex[:8]}{ext}"
    dest = AVATAR_DIR / filename
    with open(dest, "wb") as f:
        f.write(contents)

    avatar_url = f"/uploads/avatars/{filename}"
    updated = user_service.update_user_profile(db, current_user, avatar_url=avatar_url)
    return success_response(UserOut.model_validate(updated).model_dump())
