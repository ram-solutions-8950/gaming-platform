"""
Teen Patti Database Models.
"""
import enum
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import BigInteger, Boolean, Column, DateTime, ForeignKey, Integer, String, Text, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from ..database import Base


class TeenPattiTableMode(str, enum.Enum):
    VIRTUAL = "virtual"
    REAL = "real"


class TeenPattiTableStatus(str, enum.Enum):
    OPEN = "open"
    RUNNING = "running"
    FINISHED = "finished"


class TeenPattiTable(Base):
    __tablename__ = "teen_patti_tables"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(80), nullable=False, default="Teen Patti Table")
    mode = Column(SAEnum(TeenPattiTableMode, name="teen_patti_table_mode"), nullable=False, default=TeenPattiTableMode.VIRTUAL)
    status = Column(SAEnum(TeenPattiTableStatus, name="teen_patti_table_status"), nullable=False, default=TeenPattiTableStatus.OPEN)
    max_players = Column(Integer, nullable=False, default=4)
    boot_amount = Column(BigInteger, nullable=False, default=1000)  # in paise / chips
    turn_seconds = Column(Integer, nullable=False, default=15)
    is_private = Column(Boolean, nullable=False, default=False)
    join_code = Column(String(8), unique=True, index=True, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))

    history_records = relationship("TeenPattiHandHistory", back_populates="table", cascade="all, delete-orphan")


class TeenPattiHandHistory(Base):
    __tablename__ = "teen_patti_hand_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    table_id = Column(UUID(as_uuid=True), ForeignKey("teen_patti_tables.id", ondelete="SET NULL"), nullable=True, index=True)
    mode = Column(String(10), nullable=False, default="real")
    boot = Column(BigInteger, nullable=False, default=0)
    pot = Column(BigInteger, nullable=False, default=0)
    winner_seat = Column(Integer, nullable=False, default=0)
    won = Column(Boolean, nullable=False, default=False)
    payout = Column(BigInteger, nullable=False, default=0)
    hand_json = Column(Text, nullable=False, default="{}")
    client_seed = Column(String(120), nullable=False, default="")
    nonce = Column(BigInteger, nullable=False, default=0)
    server_seed = Column(String(64), nullable=False, default="")
    server_seed_hash = Column(String(64), nullable=False, default="")
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User")
    table = relationship("TeenPattiTable", back_populates="history_records")
