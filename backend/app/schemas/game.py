from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime
from uuid import UUID

from .game_catalog import GameOut


class PlaceBetIn(BaseModel):
    game_id: Optional[UUID] = None
    round_id: UUID
    prediction: str = Field(..., description="Game-specific bet type, e.g. RED or DRAGON")
    amount: int = Field(..., gt=0, description="Bet amount in paisa")


class GameBetOut(BaseModel):
    id: UUID
    user_id: UUID
    game_id: UUID
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
    game_id: UUID
    status: str
    result_color: Optional[str] = None
    result_number: Optional[str] = None
    result_data: Optional[Dict[str, Any]] = None
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
    game: Optional[GameOut] = None
