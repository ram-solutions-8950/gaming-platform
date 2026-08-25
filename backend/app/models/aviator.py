"""
Aviator database models — persisted round and bet history.
"""

import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import (
    Column, BigInteger, Integer, String, Float, DateTime,
    Enum as SAEnum, ForeignKey, Boolean,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from ..database import Base


class AviatorRoundStatus(str, enum.Enum):
    BETTING = "BETTING"
    FLYING = "FLYING"
    CRASHED = "CRASHED"
    SETTLED = "SETTLED"


class AviatorBetStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    CASHED_OUT = "CASHED_OUT"
    LOST = "LOST"


class AviatorRound(Base):
    __tablename__ = "aviator_rounds"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nonce = Column(Integer, nullable=False)
    server_seed_hash = Column(String(64), nullable=False)
    server_seed = Column(String(64), nullable=True)          # revealed after crash
    crash_multiplier = Column(Float, nullable=True)           # revealed after crash
    status = Column(
        SAEnum(AviatorRoundStatus, name="aviator_round_status"),
        nullable=False,
        default=AviatorRoundStatus.BETTING,
    )
    betting_started_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    flight_started_at = Column(DateTime(timezone=True), nullable=True)
    crashed_at = Column(DateTime(timezone=True), nullable=True)
    settled_at = Column(DateTime(timezone=True), nullable=True)

    bets = relationship("AviatorBet", back_populates="round", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<AviatorRound id={self.id} nonce={self.nonce} crash={self.crash_multiplier} status={self.status}>"


class AviatorBet(Base):
    __tablename__ = "aviator_bets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    round_id = Column(UUID(as_uuid=True), ForeignKey("aviator_rounds.id", ondelete="CASCADE"), nullable=False, index=True)
    slot = Column(Integer, nullable=False)                    # 1 or 2
    amount = Column(BigInteger, nullable=False)               # paise
    auto_cashout = Column(Float, nullable=True)               # target multiplier
    status = Column(
        SAEnum(AviatorBetStatus, name="aviator_bet_status"),
        nullable=False,
        default=AviatorBetStatus.ACTIVE,
    )
    cashout_multiplier = Column(Float, nullable=True)
    payout = Column(BigInteger, nullable=True, default=0)
    cashed_out_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    round = relationship("AviatorRound", back_populates="bets")

    def __repr__(self):
        return f"<AviatorBet id={self.id} user={self.user_id} slot={self.slot} status={self.status}>"
