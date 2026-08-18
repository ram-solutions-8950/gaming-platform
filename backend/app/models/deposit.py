import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import Column, BigInteger, String, DateTime, Enum as SAEnum, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from ..database import Base


class DepositStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class Deposit(Base):
    __tablename__ = "deposits"
    __table_args__ = (
        UniqueConstraint("external_reference", name="uq_deposits_external_ref"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    wallet_id = Column(UUID(as_uuid=True), ForeignKey("wallets.id", ondelete="RESTRICT"), nullable=False)
    amount = Column(BigInteger, nullable=False)  # paisa
    status = Column(SAEnum(DepositStatus, name="deposit_status"), nullable=False, default=DepositStatus.PENDING)
    provider = Column(String(100))
    provider_order_id = Column(String(255), unique=True)
    provider_payment_id = Column(String(255), unique=True)
    external_reference = Column(String(255))
    metadata_ = Column("metadata", JSON)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime(timezone=True))
