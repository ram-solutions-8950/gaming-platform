"""Sending and reading in-app notifications.

The inbox query is the heart of this module. A player's inbox is the union
of two sets:

1. broadcasts (``audience = ALL``) sent *after* that player registered, and
2. notifications they were named in (``audience = SELECTED``),

minus anything retracted (``is_active = False``), with read state attached
from ``notification_reads``.

Doing it as one SQL query rather than per-notification lookups matters: the
unread badge is polled by every connected player, so an N+1 here would be
felt across the whole platform.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, Optional
from uuid import UUID

from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models.notification import (
    Notification,
    NotificationAudience,
    NotificationCategory,
    NotificationRead,
    NotificationRecipient,
)
from ..models.user import User, UserRole, UserStatus
from ..utils.logging import get_logger

logger = get_logger("notification")

MAX_TITLE = 140
MAX_MESSAGE = 2000
#: Guards a mis-click on a "select all" control in the admin UI from turning
#: into an unbounded insert.
MAX_SELECTED_RECIPIENTS = 5000


def _visible_filter(user: User):
    """SQL predicate for "this notification belongs in this player's inbox"."""
    return or_(
        # Broadcasts, but only ones sent after the player joined -- a new
        # signup should not open the app to months of old promos.
        (Notification.audience == NotificationAudience.ALL)
        & (Notification.created_at >= user.created_at)
        if user.created_at is not None
        else (Notification.audience == NotificationAudience.ALL),
        Notification.id.in_(
            # Correlated subquery rather than a join, so a notification with
            # many recipients cannot multiply the result rows.
            NotificationRecipient.__table__.select()
            .with_only_columns(NotificationRecipient.notification_id)
            .where(NotificationRecipient.user_id == user.id)
        ),
    )


def create_notification(
    db: Session,
    *,
    title: str,
    message: str,
    category: str = "GENERAL",
    audience: str = "ALL",
    user_ids: Optional[Iterable[UUID]] = None,
    created_by: Optional[UUID] = None,
) -> Notification:
    """Create and persist a notification. Returns the saved row.

    Validation happens before any write, so a rejected send leaves nothing
    behind.
    """
    clean_title = (title or "").strip()
    clean_message = (message or "").strip()

    if not clean_title:
        raise ValueError("Notification title is required.")
    if not clean_message:
        raise ValueError("Notification message is required.")
    if len(clean_title) > MAX_TITLE:
        raise ValueError(f"Title must be {MAX_TITLE} characters or fewer.")
    if len(clean_message) > MAX_MESSAGE:
        raise ValueError(f"Message must be {MAX_MESSAGE} characters or fewer.")

    try:
        audience_enum = NotificationAudience(str(audience).strip().upper())
    except ValueError:
        raise ValueError("Audience must be either ALL or SELECTED.")

    try:
        category_enum = NotificationCategory(str(category or "GENERAL").strip().upper())
    except ValueError:
        raise ValueError("Unknown notification category.")

    recipient_ids: list[UUID] = []
    if audience_enum == NotificationAudience.SELECTED:
        # dict.fromkeys keeps the admin's ordering while removing duplicates,
        # which the unique constraint would otherwise reject outright.
        recipient_ids = list(dict.fromkeys(user_ids or []))
        if not recipient_ids:
            raise ValueError("Select at least one player, or send to everyone.")
        if len(recipient_ids) > MAX_SELECTED_RECIPIENTS:
            raise ValueError(
                f"Cannot send to more than {MAX_SELECTED_RECIPIENTS} players at once. "
                "Use 'send to everyone' instead."
            )

        found = {
            row.id
            for row in db.query(User.id).filter(User.id.in_(recipient_ids)).all()
        }
        missing = [str(uid) for uid in recipient_ids if uid not in found]
        if missing:
            raise ValueError(
                f"{len(missing)} selected player(s) no longer exist: {', '.join(missing[:3])}"
            )

    notification = Notification(
        title=clean_title,
        message=clean_message,
        category=category_enum,
        audience=audience_enum,
        created_by=created_by,
        is_active=True,
    )
    db.add(notification)
    db.flush()

    for uid in recipient_ids:
        db.add(
            NotificationRecipient(notification_id=notification.id, user_id=uid)
        )

    db.commit()
    db.refresh(notification)

    logger.info(
        "Notification %s created audience=%s recipients=%s by=%s",
        notification.id,
        audience_enum.value,
        len(recipient_ids) if recipient_ids else "all",
        created_by,
    )
    return notification


def recipient_user_ids(db: Session, notification: Notification) -> list[UUID]:
    """Who should receive this live, right now.

    For a broadcast that is every active player; the caller uses it only to
    decide which open websockets to push to, so players who are offline
    simply pick it up from their inbox on next load.
    """
    if notification.audience == NotificationAudience.SELECTED:
        return [
            row.user_id
            for row in db.query(NotificationRecipient.user_id)
            .filter(NotificationRecipient.notification_id == notification.id)
            .all()
        ]

    return [
        row.id
        for row in db.query(User.id)
        .filter(
            User.role == UserRole.USER,
            User.status == UserStatus.ACTIVE,
        )
        .all()
    ]


def list_for_user(
    db: Session,
    user: User,
    *,
    limit: int = 50,
    unread_only: bool = False,
) -> list[dict]:
    """Return a player's inbox, newest first, with read state attached."""
    query = (
        db.query(Notification, NotificationRead.read_at)
        .outerjoin(
            NotificationRead,
            (NotificationRead.notification_id == Notification.id)
            & (NotificationRead.user_id == user.id),
        )
        .filter(Notification.is_active.is_(True))
        .filter(_visible_filter(user))
    )

    if unread_only:
        query = query.filter(NotificationRead.read_at.is_(None))

    rows = query.order_by(Notification.created_at.desc()).limit(limit).all()

    return [
        {
            "id": str(n.id),
            "title": n.title,
            "message": n.message,
            "category": n.category.value if n.category else "GENERAL",
            "created_at": n.created_at.isoformat() if n.created_at else None,
            "is_read": read_at is not None,
            "read_at": read_at.isoformat() if read_at else None,
        }
        for n, read_at in rows
    ]


def unread_count(db: Session, user: User) -> int:
    return (
        db.query(Notification.id)
        .outerjoin(
            NotificationRead,
            (NotificationRead.notification_id == Notification.id)
            & (NotificationRead.user_id == user.id),
        )
        .filter(Notification.is_active.is_(True))
        .filter(_visible_filter(user))
        .filter(NotificationRead.read_at.is_(None))
        .count()
    )


def mark_read(db: Session, user: User, notification_id: UUID) -> bool:
    """Mark one notification read. Idempotent and safe to call twice."""
    notification = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.is_active.is_(True))
        .filter(_visible_filter(user))
        .first()
    )
    if not notification:
        # Either it does not exist or it is not addressed to this player.
        # Both are "nothing to mark", and saying which would leak whether a
        # given notification id exists.
        return False

    existing = (
        db.query(NotificationRead)
        .filter(
            NotificationRead.notification_id == notification_id,
            NotificationRead.user_id == user.id,
        )
        .first()
    )
    if existing:
        return True

    db.add(
        NotificationRead(
            notification_id=notification_id,
            user_id=user.id,
            read_at=datetime.now(timezone.utc),
        )
    )
    try:
        db.commit()
    except IntegrityError:
        # Two devices tapped at once; the unique constraint settled it.
        db.rollback()
    return True


def mark_all_read(db: Session, user: User) -> int:
    """Mark every visible unread notification as read. Returns how many."""
    unread = (
        db.query(Notification.id)
        .outerjoin(
            NotificationRead,
            (NotificationRead.notification_id == Notification.id)
            & (NotificationRead.user_id == user.id),
        )
        .filter(Notification.is_active.is_(True))
        .filter(_visible_filter(user))
        .filter(NotificationRead.read_at.is_(None))
        .all()
    )

    now = datetime.now(timezone.utc)
    for row in unread:
        db.add(
            NotificationRead(notification_id=row.id, user_id=user.id, read_at=now)
        )

    try:
        db.commit()
    except IntegrityError:
        # A concurrent read of one of these; re-count rather than fail the
        # whole batch.
        db.rollback()
        return 0
    return len(unread)


def list_sent(db: Session, *, limit: int = 50) -> list[dict]:
    """Admin view of what has been sent, with per-notification read counts."""
    notifications = (
        db.query(Notification)
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .all()
    )
    if not notifications:
        return []

    ids = [n.id for n in notifications]

    # Counted in two grouped queries rather than per row, so this list does
    # not issue a query per notification.
    read_counts = dict(
        db.query(NotificationRead.notification_id, func.count())
        .filter(NotificationRead.notification_id.in_(ids))
        .group_by(NotificationRead.notification_id)
        .all()
    )
    recipient_counts = dict(
        db.query(NotificationRecipient.notification_id, func.count())
        .filter(NotificationRecipient.notification_id.in_(ids))
        .group_by(NotificationRecipient.notification_id)
        .all()
    )

    return [
        {
            "id": str(n.id),
            "title": n.title,
            "message": n.message,
            "category": n.category.value if n.category else "GENERAL",
            "audience": n.audience.value if n.audience else "ALL",
            "is_active": n.is_active,
            "created_at": n.created_at.isoformat() if n.created_at else None,
            "created_by": str(n.created_by) if n.created_by else None,
            "author_name": (n.author.username if n.author else None),
            "recipient_count": (
                recipient_counts.get(n.id, 0)
                if n.audience == NotificationAudience.SELECTED
                else None
            ),
            "read_count": read_counts.get(n.id, 0),
        }
        for n in notifications
    ]



def retract(db: Session, notification_id: UUID) -> bool:
    """Withdraw a notification from every inbox, keeping the audit trail."""
    notification = (
        db.query(Notification).filter(Notification.id == notification_id).first()
    )
    if not notification:
        return False
    notification.is_active = False
    db.commit()
    logger.info("Notification %s retracted", notification_id)
    return True
