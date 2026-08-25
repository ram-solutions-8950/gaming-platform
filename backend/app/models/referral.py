import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import Column, BigInteger, String, DateTime, Enum as SAEnum, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from ..database import Base


class ReferralStatus(str, enum.Enum):
    REGISTERED = "REGISTERED"
    QUALIFIED = "QUALIFIED"
    REWARD_PAID = "REWARD_PAID"


class ReferralSettings(Base):
    """Admin-configurable platform referral reward settings (singleton)."""
    __tablename__ = "referral_settings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reward_amount = Column(BigInteger, nullable=False, default=10000)  # paisa (e.g. 10000 = Rs 100)
    is_active = Column(Boolean, nullable=False, default=True)
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc), default=lambda: datetime.now(timezone.utc))

    updater = relationship("User", foreign_keys=[updated_by])

    def __repr__(self):
        return f"<ReferralSettings reward={self.reward_amount} paisa active={self.is_active}>"


class Referral(Base):
    """Tracks referral relationship between referring and referred user."""
    __tablename__ = "referrals"
    __table_args__ = (
        UniqueConstraint("referred_user_id", name="uq_referral_referred_user"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    referrer_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    referred_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, unique=True, index=True)
    referral_code = Column(String(100), nullable=False, index=True)
    status = Column(SAEnum(ReferralStatus, name="referral_status"), nullable=False, default=ReferralStatus.REGISTERED)
    reward_amount = Column(BigInteger, nullable=False, default=0)  # historical paisa actually credited
    qualified_at = Column(DateTime(timezone=True), nullable=True)
    reward_transaction_id = Column(UUID(as_uuid=True), ForeignKey("wallet_transactions.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc), default=lambda: datetime.now(timezone.utc))

    referrer = relationship("User", foreign_keys=[referrer_user_id])
    referred = relationship("User", foreign_keys=[referred_user_id])
    reward_transaction = relationship("WalletTransaction", foreign_keys=[reward_transaction_id])

    def __repr__(self):
        return f"<Referral referrer={self.referrer_user_id} referred={self.referred_user_id} status={self.status}>"
