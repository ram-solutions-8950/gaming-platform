from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
import enum
from datetime import datetime, timezone
from ..database import Base

class LudoMatchStatus(str, enum.Enum):
    WAITING = "WAITING"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"

class LudoColor(str, enum.Enum):
    RED = "RED"
    GREEN = "GREEN"
    YELLOW = "YELLOW"
    BLUE = "BLUE"

class QueueStatus(str, enum.Enum):
    SEARCHING = "SEARCHING"
    MATCHED = "MATCHED"
    CANCELLED = "CANCELLED"

class LudoMatch(Base):
    __tablename__ = "ludo_matches"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status = Column(
        SQLEnum(LudoMatchStatus, name="ludo_match_status_enum", create_type=False),
        nullable=False,
        default=LudoMatchStatus.WAITING
    )
    current_turn_color = Column(
        SQLEnum(LudoColor, name="ludo_color_enum", create_type=False),
        nullable=True
    )
    last_dice_roll = Column(Integer, nullable=True)
    turn_timeout_seconds = Column(Integer, nullable=False, default=10)
    turn_started_at = Column(DateTime(timezone=True), nullable=True)
    version = Column(Integer, nullable=False, default=1)
    entry_fee = Column(Integer, nullable=False, default=0)
    prize_pool = Column(Integer, nullable=False, default=0)
    is_settled = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime(timezone=True), nullable=True)

    players = relationship("LudoPlayer", back_populates="match", cascade="all, delete-orphan", order_by="LudoPlayer.seat_index")

class LudoPlayer(Base):
    __tablename__ = "ludo_players"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    match_id = Column(UUID(as_uuid=True), ForeignKey("ludo_matches.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    color = Column(
        SQLEnum(LudoColor, name="ludo_color_enum", create_type=False),
        nullable=False
    )
    seat_index = Column(Integer, nullable=False)
    is_ready = Column(Boolean, nullable=False, default=False)
    rank = Column(Integer, nullable=True)
    consecutive_timeouts = Column(Integer, nullable=False, default=0)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    match = relationship("LudoMatch", back_populates="players")
    user = relationship("User")
    tokens = relationship("LudoToken", back_populates="player", cascade="all, delete-orphan", order_by="LudoToken.token_index")

class LudoToken(Base):
    __tablename__ = "ludo_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    player_id = Column(UUID(as_uuid=True), ForeignKey("ludo_players.id"), nullable=False)
    token_index = Column(Integer, nullable=False)  # 0, 1, 2, 3
    position = Column(Integer, nullable=False, default=-1)  # -1 = yard, 0..50 = track, 51..55 = home path, 56 = home
    is_home = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    player = relationship("LudoPlayer", back_populates="tokens")

class LudoMatchmakingQueue(Base):
    __tablename__ = "ludo_matchmaking_queue"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    player_count = Column(Integer, nullable=False)  # 2 or 4
    entry_fee = Column(Integer, nullable=False)     # in paise
    status = Column(
        SQLEnum(QueueStatus, name="queue_status_enum", create_type=False),
        nullable=False,
        default=QueueStatus.SEARCHING
    )
    match_id = Column(UUID(as_uuid=True), ForeignKey("ludo_matches.id"), nullable=True)
    queued_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User")
    match = relationship("LudoMatch")
