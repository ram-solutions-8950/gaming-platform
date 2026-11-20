"""In-app notifications sent by admins to players.

Shape
-----
One ``Notification`` row holds the message once, however many people
receive it. Who receives it is decided by ``audience``:

``ALL``
    Every player. No recipient rows -- writing one row per player would
    mean tens of thousands of inserts for a single promo, and would have
    to be backfilled for anyone who signs up later.
``SELECTED``
    Only the players named in ``notification_recipients``.

Read state lives in ``notification_reads``, one row per player per
notification, created the first time that player reads it. It has to be
separate from the notification itself precisely because a broadcast is a
single row read by many people at different times -- which is why the
pre-existing admin feed could not persist "mark as read" at all.

Backlog rule
------------
A broadcast is only shown to players who already existed when it was
sent (``Notification.created_at >= User.created_at``). Without that, a
player signing up today would open the app to months of stale promos and
maintenance notices.
"""
import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from ..database import Base


class NotificationAudience(str, enum.Enum):
    ALL = "ALL"
    SELECTED = "SELECTED"


class NotificationCategory(str, enum.Enum):
    GENERAL = "GENERAL"
    PROMO = "PROMO"
    MAINTENANCE = "MAINTENANCE"
    ALERT = "ALERT"


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(140), nullable=False)
    message = Column(Text, nullable=False)
    category = Column(
        SAEnum(NotificationCategory, name="notification_category"),
        nullable=False,
        default=NotificationCategory.GENERAL,
    )
    audience = Column(
        SAEnum(NotificationAudience, name="notification_audience"),
        nullable=False,
        default=NotificationAudience.ALL,
        index=True,
    )
    # Soft delete: an admin retracting a notification must remove it from
    # every player's inbox, including those who already read it, without
    # destroying the audit trail of what was sent.
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    recipients = relationship(
        "NotificationRecipient",
        back_populates="notification",
        cascade="all, delete-orphan",
    )
    reads = relationship(
        "NotificationRead",
        back_populates="notification",
        cascade="all, delete-orphan",
    )
    author = relationship("User", foreign_keys=[created_by], lazy="joined")

    def __repr__(self):
        return f"<Notification {self.id} audience={self.audience} title={self.title!r}>"


class NotificationRecipient(Base):
    """A named recipient, for ``audience = SELECTED`` only."""

    __tablename__ = "notification_recipients"
    __table_args__ = (
        # The same player must not be added twice to one notification, or
        # their inbox would show it twice.
        UniqueConstraint("notification_id", "user_id", name="uq_notification_recipient"),
        Index("ix_notification_recipients_user", "user_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    notification_id = Column(
        UUID(as_uuid=True),
        ForeignKey("notifications.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    notification = relationship("Notification", back_populates="recipients")


class NotificationRead(Base):
    """Marks that one player has read one notification."""

    __tablename__ = "notification_reads"
    __table_args__ = (
        # Makes "mark as read" idempotent at the database level: a double
        # tap, or two devices at once, cannot create two rows.
        UniqueConstraint("notification_id", "user_id", name="uq_notification_read"),
        Index("ix_notification_reads_user", "user_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    notification_id = Column(
        UUID(as_uuid=True),
        ForeignKey("notifications.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    read_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    notification = relationship("Notification", back_populates="reads")
