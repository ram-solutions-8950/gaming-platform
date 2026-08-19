import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import Column, BigInteger, String, DateTime, Enum as SAEnum, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from ..database import Base


class WithdrawalStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"


class Withdrawal(Base):
    __tablename__ = "withdrawals"
    __table_args__ = (
        UniqueConstraint("external_reference", name="uq_withdrawals_external_ref"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    wallet_id = Column(UUID(as_uuid=True), ForeignKey("wallets.id", ondelete="RESTRICT"), nullable=False)
    amount = Column(BigInteger, nullable=False)  # paisa (gross amount debited from wallet)
    fee_amount = Column(BigInteger, nullable=False, default=0) # paisa
    net_amount = Column(BigInteger, nullable=False) # paisa (amount paid to user)
    status = Column(SAEnum(WithdrawalStatus, name="withdrawal_status"), nullable=False, default=WithdrawalStatus.PENDING)
    method = Column(String(100))
    destination = Column(String(500))
    external_reference = Column(String(255))
    metadata_ = Column("metadata", JSON)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))
    processed_at = Column(DateTime(timezone=True))
    processed_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
