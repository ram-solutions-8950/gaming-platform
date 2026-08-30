from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from uuid import UUID
from datetime import datetime
from ..models.ludo import LudoMatchStatus, LudoColor, QueueStatus

class LudoTokenSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    player_id: UUID
    token_index: int
    position: int
    is_home: bool

class LudoPlayerSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    match_id: UUID
    user_id: UUID
    username: Optional[str] = None
    color: LudoColor
    seat_index: int
    is_ready: bool
    rank: Optional[int] = None
    consecutive_timeouts: int = 0
    tokens: List[LudoTokenSchema] = []

class LudoMatchSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: LudoMatchStatus
    current_turn_color: Optional[LudoColor] = None
    last_dice_roll: Optional[int] = None
    turn_timeout_seconds: int = 10
    turn_started_at: Optional[datetime] = None
    version: int = 1
    entry_fee: int = 0
    prize_pool: int = 0
    is_settled: bool = False
    created_at: datetime
    players: List[LudoPlayerSchema] = []
    legal_token_indices: List[int] = []

class MatchmakingRequest(BaseModel):
    player_count: int = 2  # 2 or 4
    entry_fee: int = 1000  # in paise (default ₹10)

class MatchmakingStatusResponse(BaseModel):
    status: QueueStatus
    match_id: Optional[UUID] = None
    player_count: int
    entry_fee: int
    queued_at: datetime

class RollDiceRequest(BaseModel):
    pass

class MoveTokenRequest(BaseModel):
    token_index: int

class TimeoutRequest(BaseModel):
    pass
