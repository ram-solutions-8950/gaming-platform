import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import Column, BigInteger, String, DateTime, Enum as SAEnum, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from ..database import Base

class GameRoundStatus(str, enum.Enum):
    BETTING = "BETTING"
    CALCULATING = "CALCULATING"
    COMPLETED = "COMPLETED"

class GameColor(str, enum.Enum):
    RED = "RED"
    GREEN = "GREEN"
    VIOLET = "VIOLET"

class GamePrediction(str, enum.Enum):
    RED = "RED"
    GREEN = "GREEN"
    VIOLET = "VIOLET"
    NUM_0 = "0"
    NUM_1 = "1"
    NUM_2 = "2"
    NUM_3 = "3"
    NUM_4 = "4"
    NUM_5 = "5"
    NUM_6 = "6"
    NUM_7 = "7"
    NUM_8 = "8"
    NUM_9 = "9"
    DRAGON = "DRAGON"
    TIGER = "TIGER"
    TIE = "TIE"

class GameBetStatus(str, enum.Enum):
    PENDING = "PENDING"
    WON = "WON"
    LOST = "LOST"

class GameRound(Base):
    __tablename__ = "game_rounds"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    game_id = Column(UUID(as_uuid=True), ForeignKey("games.id", ondelete="RESTRICT"), nullable=False, index=True)
    status = Column(SAEnum(GameRoundStatus, name="game_round_status"), nullable=False, default=GameRoundStatus.BETTING)
    result_color = Column(SAEnum(GameColor, name="game_color"), nullable=True)
    result_number = Column(String(1), nullable=True) # "0"-"9"
    result_data = Column(JSON, nullable=True)  # game-specific result payload
    started_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    betting_closes_at = Column(DateTime(timezone=True), nullable=False)
    ended_at = Column(DateTime(timezone=True), nullable=True)

    game = relationship("Game")
    bets = relationship("GameBet", back_populates="round")

class GameBet(Base):
    __tablename__ = "game_bets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    game_id = Column(UUID(as_uuid=True), ForeignKey("games.id", ondelete="RESTRICT"), nullable=False, index=True)
    round_id = Column(UUID(as_uuid=True), ForeignKey("game_rounds.id", ondelete="RESTRICT"), nullable=False, index=True)
    prediction = Column(SAEnum(GamePrediction, name="game_prediction"), nullable=False)
    
    amount = Column(BigInteger, nullable=False) # Gross amount debited from wallet
    entry_fee_amount = Column(BigInteger, nullable=False) # Amount deducted as fee
    stake_amount = Column(BigInteger, nullable=False) # amount - entry_fee_amount
    
    gross_win_amount = Column(BigInteger, nullable=True) # Winnings before winning fee
    winning_fee_amount = Column(BigInteger, nullable=True) # Fee on winnings
    net_win_amount = Column(BigInteger, nullable=True) # Actual amount credited to wallet
    
    status = Column(SAEnum(GameBetStatus, name="game_bet_status"), nullable=False, default=GameBetStatus.PENDING)
    
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    settled_at = Column(DateTime(timezone=True), nullable=True)
    
    user = relationship("User")
    game = relationship("Game")
    round = relationship("GameRound", back_populates="bets")
