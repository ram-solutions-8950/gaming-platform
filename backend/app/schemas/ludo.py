import uuid
from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Dict, Any
from datetime import datetime
from ..models.ludo import LudoMatchStatus, LudoColor

class LudoTokenSchema(BaseModel):
    id: uuid.UUID
    player_id: uuid.UUID
    token_index: int
    position: int
    is_home: bool

    model_config = ConfigDict(from_attributes=True)

class LudoPlayerSchema(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    color: LudoColor
    seat_index: int
    is_ready: bool
    rank: Optional[int]
    tokens: List[LudoTokenSchema]

    model_config = ConfigDict(from_attributes=True)

class LudoMatchSchema(BaseModel):
    id: uuid.UUID
    status: LudoMatchStatus
    current_turn_color: Optional[LudoColor]
    last_dice_roll: Optional[int]
    turn_timeout_seconds: int
    turn_started_at: Optional[datetime] = None
    version: int
    entry_fee: int
    prize_pool: int
    is_settled: bool
    players: List[LudoPlayerSchema]

    model_config = ConfigDict(from_attributes=True)

class CreateMatchRequest(BaseModel):
    turn_timeout_seconds: Optional[int] = 30

class JoinMatchRequest(BaseModel):
    match_id: uuid.UUID

class ReadyRequest(BaseModel):
    match_id: uuid.UUID

class RollDiceRequest(BaseModel):
    match_id: uuid.UUID
    idempotency_key: str

class MoveTokenRequest(BaseModel):
    match_id: uuid.UUID
    token_index: int
    idempotency_key: str

class WSMessage(BaseModel):
    type: str
    data: Dict[str, Any]
    version: Optional[int] = None

class JoinMatchmakingRequest(BaseModel):
    player_count: int
    entry_fee: int

class MatchmakingStatusResponse(BaseModel):
    status: str
    player_count: int
    entry_fee: int
    players_found: int
    players_required: Optional[int] = None
    match_id: Optional[str] = None
    seconds_left: Optional[int] = None
