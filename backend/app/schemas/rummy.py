from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class TableCreate(BaseModel):
    name: str = Field(default="Deals Rummy", max_length=80)
    mode: str = Field(default="free", pattern="^(real_money|free)$")
    max_players: int = Field(default=2, ge=2, le=6)
    num_deals: int = Field(default=2, ge=1, le=10)
    entry_fee_paise: int = Field(default=0, ge=0)
    pool_limit: Optional[int] = Field(default=None)
    turn_seconds: int = Field(default=30, ge=10, le=90)
    starting_chips: int = Field(default=160, ge=80, le=1000)
    is_private: bool = False


class TableOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    mode: str
    status: str
    max_players: int
    num_deals: int
    entry_fee_paise: int
    pool_limit: Optional[int] = None
    turn_seconds: int
    starting_chips: int
    is_private: bool
    join_code: Optional[str] = None
    online_players: int = 0
    created_at: datetime


class JoinByCodeRequest(BaseModel):
    code: str = Field(min_length=4, max_length=8)


class MatchmakingJoinRequest(BaseModel):
    max_players: int = Field(default=2, ge=2, le=6)
    num_deals: int = Field(default=2, ge=1, le=10)
    entry_fee_paise: int = Field(default=0, ge=0)


class MatchmakingStatusResponse(BaseModel):
    status: str  # "IDLE", "WAITING", "MATCHED"
    table_id: Optional[str] = None
    queue_id: Optional[str] = None
