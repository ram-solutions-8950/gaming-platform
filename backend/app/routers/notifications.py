"""Player-facing notification inbox."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..dependencies.database import get_db
from ..models.user import User
from ..security.permissions import require_user
from ..services import notification_service
from ..utils.responses import error_response, success_response

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("")
def list_my_notifications(
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=100),
    unread_only: bool = Query(default=False),
):
    """The player's inbox, newest first."""
    items = notification_service.list_for_user(
        db, current_user, limit=limit, unread_only=unread_only
    )
    return success_response(
        {
            "items": items,
            "unread_count": notification_service.unread_count(db, current_user),
        }
    )


@router.get("/unread-count")
def get_unread_count(
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """Just the badge number, for polling without fetching the whole inbox."""
    return success_response(
        {"unread_count": notification_service.unread_count(db, current_user)}
    )


@router.post("/{notification_id}/read")
def mark_notification_read(
    notification_id: UUID,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    ok = notification_service.mark_read(db, current_user, notification_id)
    if not ok:
        return error_response(
            "NOTIFICATION_NOT_FOUND",
            "That notification is not in your inbox.",
            status_code=404,
        )
    return success_response(
        {"unread_count": notification_service.unread_count(db, current_user)}
    )


@router.post("/read-all")
def mark_all_notifications_read(
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    marked = notification_service.mark_all_read(db, current_user)
    return success_response(
        {
            "marked": marked,
            "unread_count": notification_service.unread_count(db, current_user),
        }
    )
