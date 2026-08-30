import uuid
import enum
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Column, BigInteger, Boolean, Integer, String, Text, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from ..database import Base


class RummyTableMode(str, enum.Enum):
    REAL_MONEY = "real_money"
    FREE = "free"


class RummyTableStatus(str, enum.Enum):
    OPEN = "open"
    RUNNING = "running"
    FINISHED = "finished"


class RummyTable(Base):
    __tablename__ = "rummy_tables"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(80), nullable=False, default="Deals Rummy")
    mode = Column(SAEnum(RummyTableMode, values_callable=lambda x: [e.value for e in x], name="rummy_table_mode"), nullable=False, default=RummyTableMode.FREE)
    status = Column(SAEnum(RummyTableStatus, values_callable=lambda x: [e.value for e in x], name="rummy_table_status"), nullable=False, default=RummyTableStatus.OPEN)
    max_players = Column(Integer, nullable=False, default=2)
    num_deals = Column(Integer, nullable=False, default=2)
    entry_fee_paise = Column(BigInteger, nullable=False, default=0)
    pool_limit = Column(Integer, nullable=True)
    turn_seconds = Column(Integer, nullable=False, default=30)
    starting_chips = Column(Integer, nullable=False, default=160)
    is_private = Column(Boolean, nullable=False, default=False)
    join_code = Column(String(8), unique=True, index=True, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))

    rounds = relationship("RummyRound", back_populates="table", cascade="all, delete-orphan")


class RummyRound(Base):
    __tablename__ = "rummy_rounds"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    table_id = Column(UUID(as_uuid=True), ForeignKey("rummy_tables.id", ondelete="CASCADE"), nullable=False, index=True)
    winner_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    deals_played = Column(Integer, nullable=False, default=0)
    result_json = Column(Text, nullable=False, default="{}")
    prize_pool_paise = Column(BigInteger, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))

    table = relationship("RummyTable", back_populates="rounds")


class RummyMatchmakingQueue(Base):
    __tablename__ = "rummy_matchmaking_queue"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    max_players = Column(Integer, nullable=False, default=2)
    num_deals = Column(Integer, nullable=False, default=2)
    entry_fee_paise = Column(BigInteger, nullable=False, default=0)
    status = Column(String(20), nullable=False, default="WAITING")  # WAITING, MATCHED, CANCELLED
    table_id = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))
