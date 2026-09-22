"""Wager Requirement Model — tracks deposit wagering (play-through) requirements."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, BigInteger, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from ..database import Base


class WagerRequirement(Base):
    """One row per credited deposit.

    A user must wager (play through) the full deposited amount before the
    balance can be withdrawn. ``completed_amount`` accumulates every
    GAME_ENTRY debit until it reaches ``required_amount``.
    """
    __tablename__ = "wager_requirements"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    deposit_id = Column(UUID(as_uuid=True), ForeignKey("deposits.id", ondelete="SET NULL"), nullable=True, unique=True)
    required_amount = Column(BigInteger, nullable=False, default=0)   # paise
    completed_amount = Column(BigInteger, nullable=False, default=0)  # paise
    is_fulfilled = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user = relationship("User")

    __table_args__ = (
        Index("ix_wager_requirements_user_pending", "user_id", "is_fulfilled"),
    )
