import uuid
from datetime import datetime, timezone, date
from sqlalchemy import Column, BigInteger, Integer, String, Boolean, Date, DateTime, ForeignKey, UniqueConstraint, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from ..database import Base


class DailyRewardConfig(Base):
    """Admin-configurable 7-Day reward configuration."""
    __tablename__ = "daily_reward_configs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    day_number = Column(Integer, nullable=False, unique=True, index=True)  # 1 to 7
    reward_type = Column(String(50), nullable=False, default="CASH")       # CASH, FREE_SPIN
    amount_paisa = Column(BigInteger, nullable=False, default=100)          # 100 paisa = Rs 1
    free_spins_count = Column(Integer, nullable=False, default=0)          # for Day 4, default 1
    is_enabled = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class DailyRewardSettings(Base):
    """Singleton settings for daily rewards."""
    __tablename__ = "daily_reward_settings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    min_qualifying_bet_paisa = Column(BigInteger, nullable=False, default=100)  # 100 paisa = Rs 1
    is_active = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class UserRewardProfile(Base):
    """User-level reward state, entitlements, and tracking."""
    __tablename__ = "user_reward_profiles"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    free_lucky_spins = Column(Integer, nullable=False, default=0)
    current_day = Column(Integer, nullable=False, default=1)  # 1 to 7
    last_claim_date = Column(Date, nullable=True)
    vip_level = Column(Integer, nullable=False, default=1)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", backref="reward_profile")


class UserDailyRewardClaim(Base):
    """Immutable audit ledger of daily reward claims."""
    __tablename__ = "user_daily_reward_claims"
    __table_args__ = (
        UniqueConstraint("user_id", "claimed_date", name="uq_user_daily_claim_date"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    day_number = Column(Integer, nullable=False)
    claimed_date = Column(Date, nullable=False, default=lambda: datetime.now(timezone.utc).date(), index=True)
    reward_type = Column(String(50), nullable=False)
    amount_paisa = Column(BigInteger, nullable=False, default=0)
    free_spins_awarded = Column(Integer, nullable=False, default=0)
    transaction_id = Column(UUID(as_uuid=True), ForeignKey("wallet_transactions.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    transaction = relationship("WalletTransaction", foreign_keys=[transaction_id])


class LuckySpinSegmentConfig(Base):
    """Admin-configurable segments on the Lucky Spin wheel."""
    __tablename__ = "lucky_spin_segment_configs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    segment_index = Column(Integer, nullable=False, unique=True, index=True)  # 0 to 7
    label = Column(String(50), nullable=False)                                # e.g. "Rs 1", "FREE SPIN"
    reward_type = Column(String(50), nullable=False, default="CASH")          # CASH, FREE_SPIN, NO_REWARD
    amount_paisa = Column(BigInteger, nullable=False, default=0)             # paisa
    free_spins = Column(Integer, nullable=False, default=0)
    weight = Column(Integer, nullable=False, default=10)                      # relative RNG probability
    color = Column(String(50), nullable=False, default="#F59E0B")
    is_enabled = Column(Boolean, nullable=False, default=True)


class UserLuckySpinLog(Base):
    """Audit log of user spin actions."""
    __tablename__ = "user_lucky_spin_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    segment_index = Column(Integer, nullable=False)
    reward_type = Column(String(50), nullable=False)
    amount_paisa = Column(BigInteger, nullable=False, default=0)
    free_spins_awarded = Column(Integer, nullable=False, default=0)
    free_spins_consumed = Column(Integer, nullable=False, default=1)
    transaction_id = Column(UUID(as_uuid=True), ForeignKey("wallet_transactions.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    transaction = relationship("WalletTransaction", foreign_keys=[transaction_id])


class BonusConfig(Base):
    """Admin-configurable platform bonuses."""
    __tablename__ = "bonus_configs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    bonus_type = Column(String(50), nullable=False, default="DAILY")  # DAILY, SPECIAL, WELCOME
    amount_paisa = Column(BigInteger, nullable=False, default=500)     # Rs 5
    is_active = Column(Boolean, nullable=False, default=True)
    claim_limit = Column(Integer, nullable=False, default=1)          # times a user can claim
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class UserBonusClaim(Base):
    """Tracks claimed platform bonuses per user."""
    __tablename__ = "user_bonus_claims"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    bonus_id = Column(UUID(as_uuid=True), ForeignKey("bonus_configs.id", ondelete="CASCADE"), nullable=False, index=True)
    amount_paisa = Column(BigInteger, nullable=False)
    transaction_id = Column(UUID(as_uuid=True), ForeignKey("wallet_transactions.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    transaction = relationship("WalletTransaction", foreign_keys=[transaction_id])


class JackpotConfig(Base):
    """Admin-configurable jackpot pool."""
    __tablename__ = "jackpot_configs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(100), nullable=False, default="Corona 888 Mega Jackpot")
    current_amount_paisa = Column(BigInteger, nullable=False, default=50000000)  # Rs 5,00,000
    seed_amount_paisa = Column(BigInteger, nullable=False, default=10000000)     # Rs 1,00,000
    is_active = Column(Boolean, nullable=False, default=True)
    description = Column(Text, nullable=True, default="Play any game with Rs 10+ to stand a chance to trigger the Mega Jackpot!")
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class VipBonusConfig(Base):
    """Admin-configurable VIP tiers and rewards."""
    __tablename__ = "vip_bonus_configs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vip_level = Column(Integer, nullable=False, unique=True, index=True)  # 1 to 5
    level_name = Column(String(50), nullable=False)                       # Bronze, Silver, Gold, Platinum, Diamond
    min_deposit_paisa = Column(BigInteger, nullable=False, default=0)     # deposit required to reach
    reward_amount_paisa = Column(BigInteger, nullable=False, default=1000) # Rs 10
    is_active = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
