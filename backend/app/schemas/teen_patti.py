"""
Teen Patti Schemas.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class PlayHandRequest(BaseModel):
    boot: int = Field(default=1000, gt=0, le=100_000, description="Entry stake in paise / chips")
    client_seed: str = Field(min_length=1, max_length=120)
    nonce: int = Field(ge=0)
    mode: Literal["virtual", "real"] = "real"


class PlayHandResponse(BaseModel):
    id: str
    hand: Dict[str, Any]
    user_won: bool
    boot: int
    pot: int
    payout: int
    balance: int
    server_seed_hash: str


class TableCreate(BaseModel):
    name: str = Field(default="Teen Patti Table", min_length=1, max_length=80)
    mode: Literal["virtual", "real"] = "real"
    max_players: int = Field(default=4, ge=2, le=6)
    boot_amount: int = Field(default=1000, gt=0)  # in paise
    turn_seconds: int = Field(default=15, ge=5, le=60)
    is_private: bool = False


class TableJoinByCode(BaseModel):
    code: str = Field(min_length=6, max_length=8)


class TableOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    mode: str
    status: str
    max_players: int
    boot_amount: int
    turn_seconds: int
    is_private: bool
    join_code: Optional[str] = None
    created_at: datetime
    player_count: int = 0


class HandHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    table_id: Optional[uuid.UUID]
    mode: str
    boot: int
    pot: int
    winner_seat: int
    won: bool
    payout: int
    hand_json: str
    created_at: datetime
