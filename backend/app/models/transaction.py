import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import Column, BigInteger, String, DateTime, Enum as SAEnum, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from ..database import Base


class WalletTransactionType(str, enum.Enum):
    DEPOSIT = "DEPOSIT"
    GAME_ENTRY = "GAME_ENTRY"
    GAME_WIN = "GAME_WIN"
    GAME_LOSS = "GAME_LOSS"
    WITHDRAWAL = "WITHDRAWAL"
    REFUND = "REFUND"
    ADJUSTMENT = "ADJUSTMENT"


class WalletTransactionStatus(str, enum.Enum):
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    REVERSED = "REVERSED"


class WalletTransaction(Base):
    """Immutable ledger. Never update or delete rows."""
    __tablename__ = "wallet_transactions"
    __table_args__ = (
        UniqueConstraint("reference_type", "reference_id", name="uq_wallet_tx_reference"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    wallet_id = Column(UUID(as_uuid=True), ForeignKey("wallets.id", ondelete="RESTRICT"), nullable=False, index=True)
    type = Column(SAEnum(WalletTransactionType, name="wallet_tx_type"), nullable=False)
    amount = Column(BigInteger, nullable=False)        # paisa, always positive
    balance_before = Column(BigInteger, nullable=False)
    balance_after = Column(BigInteger, nullable=False)
    reference_type = Column(String(100))
    reference_id = Column(String(255))
    status = Column(SAEnum(WalletTransactionStatus, name="wallet_tx_status"), nullable=False, default=WalletTransactionStatus.PENDING)
    metadata_ = Column("metadata", JSON)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    wallet = relationship("Wallet", back_populates="transactions")
