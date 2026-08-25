import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from ..database import Base

class PokerTable(Base):
    __tablename__ = 'poker_tables'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False, default="Texas Hold'em Table")
    is_practice = Column(Boolean, default=False, nullable=False)
    small_blind = Column(Integer, default=100, nullable=False)
    big_blind = Column(Integer, default=200, nullable=False)
    min_buy_in = Column(Integer, default=2000, nullable=False)
    max_buy_in = Column(Integer, default=20000, nullable=False)
    max_players = Column(Integer, default=6, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class PokerHand(Base):
    __tablename__ = 'poker_hands'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    table_id = Column(String, ForeignKey('poker_tables.id'), nullable=False)
    dealer_seat_idx = Column(Integer, nullable=False, default=0)
    small_blind = Column(Integer, nullable=False)
    big_blind = Column(Integer, nullable=False)
    community_cards = Column(JSON, nullable=False, default=list)  # ["AH", "KD", ...]
    pot = Column(Integer, nullable=False, default=0)
    winners_summary = Column(JSON, nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)

class PokerPlayer(Base):
    __tablename__ = 'poker_players'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    table_id = Column(String, ForeignKey('poker_tables.id'), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    seat_index = Column(Integer, nullable=False)
    stack = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, default=True, nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class PokerAction(Base):
    __tablename__ = 'poker_actions'

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    hand_id = Column(String, ForeignKey('poker_hands.id'), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    action = Column(String, nullable=False)  # FOLD, CHECK, CALL, BET, RAISE, ALL-IN
    amount = Column(Integer, nullable=False, default=0)
    sequence_num = Column(Integer, nullable=False, default=0)
    action_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
