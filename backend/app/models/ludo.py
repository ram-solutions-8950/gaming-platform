import uuid
import enum

from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    Enum,
    Boolean,
)
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
    relationship,
)
from sqlalchemy.dialects.postgresql import UUID

from ..database import Base


# ============================================================
# MATCH STATUS
# ============================================================

class LudoMatchStatus(str, enum.Enum):
    WAITING = "WAITING"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


# ============================================================
# MATCHMAKING STATUS
# ============================================================

class QueueStatus(str, enum.Enum):
    SEARCHING = "SEARCHING"
    MATCHED = "MATCHED"
    CANCELLED = "CANCELLED"


# ============================================================
# PLAYER COLORS
# ============================================================

class LudoColor(str, enum.Enum):
    RED = "RED"
    GREEN = "GREEN"
    YELLOW = "YELLOW"
    BLUE = "BLUE"


# ============================================================
# LUDO MATCH
# ============================================================

class LudoMatch(Base):
    __tablename__ = "ludo_matches"

    # --------------------------------------------------------
    # ID
    # --------------------------------------------------------

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # --------------------------------------------------------
    # STATUS
    # --------------------------------------------------------

    status: Mapped[LudoMatchStatus] = mapped_column(
        Enum(
            LudoMatchStatus,
            name="ludo_match_status_enum",
        ),
        default=LudoMatchStatus.WAITING,
        nullable=False,
    )

    # --------------------------------------------------------
    # TIMESTAMPS
    # --------------------------------------------------------

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # --------------------------------------------------------
    # TURN TIMER
    #
    # Exact time at which the current player's turn started.
    # This MUST be used for timeout calculations.
    # --------------------------------------------------------

    turn_started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # --------------------------------------------------------
    # GAME STATE
    # --------------------------------------------------------

    current_turn_color: Mapped[Optional[LudoColor]] = mapped_column(
        Enum(
            LudoColor,
            name="ludo_color_enum",
        ),
        nullable=True,
    )

    last_dice_roll: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
    )

    # Number of seconds allowed for each turn.
    turn_timeout_seconds: Mapped[int] = mapped_column(
        Integer,
        default=30,
        nullable=False,
    )

    # Optimistic/version counter.
    version: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )

    # --------------------------------------------------------
    # FINANCIAL
    # --------------------------------------------------------

    entry_fee: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    prize_pool: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    is_settled: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    # --------------------------------------------------------
    # PLAYERS
    # --------------------------------------------------------

    players: Mapped[List["LudoPlayer"]] = relationship(
        "LudoPlayer",
        back_populates="match",
        cascade="all, delete-orphan",
    )


# ============================================================
# LUDO PLAYER
# ============================================================

class LudoPlayer(Base):
    __tablename__ = "ludo_players"

    # --------------------------------------------------------
    # ID
    # --------------------------------------------------------

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # --------------------------------------------------------
    # MATCH / USER
    # --------------------------------------------------------

    match_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ludo_matches.id"),
        nullable=False,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )

    # --------------------------------------------------------
    # PLAYER POSITION
    # --------------------------------------------------------

    color: Mapped[LudoColor] = mapped_column(
        Enum(
            LudoColor,
            name="ludo_color_enum",
        ),
        nullable=False,
    )

    seat_index: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    # --------------------------------------------------------
    # READY STATE
    # --------------------------------------------------------

    is_ready: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    # --------------------------------------------------------
    # TIMEOUT SYSTEM
    #
    # 0 = no consecutive timeout
    # 1 = first missed turn
    # 2 = second missed turn
    # 3 = player forfeits
    #
    # Successful activity resets this to 0.
    # --------------------------------------------------------

    consecutive_timeouts: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    # --------------------------------------------------------
    # RESULT / RANK
    # --------------------------------------------------------

    rank: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
    )

    finished_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # --------------------------------------------------------
    # TIMESTAMPS
    # --------------------------------------------------------

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # --------------------------------------------------------
    # RELATIONSHIPS
    # --------------------------------------------------------

    match: Mapped["LudoMatch"] = relationship(
        "LudoMatch",
        back_populates="players",
    )

    tokens: Mapped[List["LudoToken"]] = relationship(
        "LudoToken",
        back_populates="player",
        cascade="all, delete-orphan",
    )


# ============================================================
# LUDO TOKEN
# ============================================================

class LudoToken(Base):
    __tablename__ = "ludo_tokens"

    # --------------------------------------------------------
    # ID
    # --------------------------------------------------------

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # --------------------------------------------------------
    # PLAYER
    # --------------------------------------------------------

    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ludo_players.id"),
        nullable=False,
    )

    # --------------------------------------------------------
    # TOKEN
    # --------------------------------------------------------

    token_index: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    # -1 = Base
    # 0-51 = Main board
    # 52-56 = Home stretch
    # 57 = Home

    position: Mapped[int] = mapped_column(
        Integer,
        default=-1,
        nullable=False,
    )

    is_home: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    # --------------------------------------------------------
    # TIMESTAMPS
    # --------------------------------------------------------

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # --------------------------------------------------------
    # RELATIONSHIP
    # --------------------------------------------------------

    player: Mapped["LudoPlayer"] = relationship(
        "LudoPlayer",
        back_populates="tokens",
    )


# ============================================================
# LUDO MATCHMAKING QUEUE
# ============================================================

class LudoMatchmakingQueue(Base):
    __tablename__ = "ludo_matchmaking_queue"

    # --------------------------------------------------------
    # ID
    # --------------------------------------------------------

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # --------------------------------------------------------
    # USER
    # --------------------------------------------------------

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )

    # --------------------------------------------------------
    # MATCH CONFIG
    # --------------------------------------------------------

    player_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    entry_fee: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    # --------------------------------------------------------
    # QUEUE STATUS
    # --------------------------------------------------------

    status: Mapped[QueueStatus] = mapped_column(
        Enum(
            QueueStatus,
            name="queue_status_enum",
        ),
        default=QueueStatus.SEARCHING,
        nullable=False,
    )

    # --------------------------------------------------------
    # MATCH
    # --------------------------------------------------------

    match_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ludo_matches.id"),
        nullable=True,
    )

    # --------------------------------------------------------
    # TIMESTAMPS
    # --------------------------------------------------------

    queued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )