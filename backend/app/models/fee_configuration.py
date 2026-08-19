import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, Numeric, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from ..database import Base

class FeeConfiguration(Base):
    __tablename__ = "fee_configurations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    game_entry_fee_percent = Column(Numeric(5, 2), nullable=False, default=0.00)
    winning_fee_percent = Column(Numeric(5, 2), nullable=False, default=0.00)
    withdrawal_fee_percent = Column(Numeric(5, 2), nullable=False, default=0.00)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    updated_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    updated_by = relationship("User")
