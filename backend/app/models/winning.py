"""Models for Winning and RTP Controls (Global & Personal)."""
import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from ..database import Base


class WinMode(str, enum.Enum):
    DEFAULT = "DEFAULT"
    FORCED_WIN = "FORCED_WIN"
    FORCED_LOSS = "FORCED_LOSS"
    BOOSTED = "BOOSTED"
    REDUCED = "REDUCED"


class UserWinningControl(Base):
    """Personal winning rate / outcome control for specific users."""
    __tablename__ = "user_winning_controls"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    mode = Column(String(50), nullable=False, default=WinMode.DEFAULT.value)
    win_rate_percent = Column(Integer, nullable=True, default=50)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user = relationship("User", backref="winning_control")

    def __repr__(self):
        return f"<UserWinningControl user_id={self.user_id} mode={self.mode} win_rate={self.win_rate_percent}>"
