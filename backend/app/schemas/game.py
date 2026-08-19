from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID


class PlaceBetIn(BaseModel):
    round_id: UUID
    prediction: str = Field(..., description="RED, GREEN, VIOLET, or 0-9")
    amount: int = Field(..., gt=0, description="Bet amount in paisa")


class GameBetOut(BaseModel):
    id: UUID
    user_id: UUID
    round_id: UUID
    prediction: str
    amount: int
    entry_fee_amount: int
    stake_amount: int
    gross_win_amount: Optional[int] = None
    winning_fee_amount: Optional[int] = None
    net_win_amount: Optional[int] = None
    status: str
    created_at: datetime
    settled_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class GameRoundOut(BaseModel):
    id: UUID
    status: str
    result_color: Optional[str] = None
    result_number: Optional[str] = None
    started_at: datetime
    betting_closes_at: datetime
    ended_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class GameRoundDetailOut(GameRoundOut):
    total_bets: int = 0
    total_amount: int = 0


class GameStateOut(BaseModel):
    round: Optional[GameRoundOut] = None
    server_time: datetime
    seconds_remaining: float = 0.0
