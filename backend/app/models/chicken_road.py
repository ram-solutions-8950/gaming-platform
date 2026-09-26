"""
Chicken Road rounds. One row per bet, kept after settlement as its history.

Rounds live in the database rather than in process memory, so a round in play
survives a restart or crash (the player picks it up where they left it) and
every worker process sees the same round.
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, BigInteger, Integer, String, Float, DateTime, ForeignKey, Index, JSON, text,
)
from sqlalchemy.dialects.postgresql import UUID
from ..database import Base


class ChickenRoadRoundStatus:
    ACTIVE = "ACTIVE"
    WON = "WON"
    LOST = "LOST"
    CASHED_OUT = "CASHED_OUT"


class ChickenRoadRound(Base):
    __tablename__ = "chicken_road_rounds"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    difficulty = Column(String(10), nullable=False)
    # The payout table the round was started on, so it is paid on those terms.
    multipliers = Column(JSON, nullable=False)
    bet_amount = Column(BigInteger, nullable=False)           # paise
    # The server's secret draw: the lane the chicken is hit on, or None when it
    # survives the whole road. Never sent to the client while the round is open.
    hit_lane = Column(Integer, nullable=True)
    current_lane = Column(Integer, nullable=False, default=0)
    lost_lane = Column(Integer, nullable=True)
    status = Column(String(16), nullable=False, default=ChickenRoadRoundStatus.ACTIVE)
    multiplier = Column(Float, nullable=True)                 # multiplier paid out
    payout = Column(BigInteger, nullable=False, default=0)    # paise credited
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    settled_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        # A player has at most one round in play.
        Index(
            "uq_chicken_road_rounds_one_active",
            "user_id",
            unique=True,
            postgresql_where=text("status = 'ACTIVE'"),
        ),
    )

    def __repr__(self):
        return f"<ChickenRoadRound id={self.id} user={self.user_id} lane={self.current_lane} status={self.status}>"
