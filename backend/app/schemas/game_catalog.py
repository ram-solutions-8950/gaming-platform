from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, Dict, Any
from datetime import datetime
from uuid import UUID
from ..models.game_catalog import GameStatus


class GameBase(BaseModel):
    name: str = Field(..., max_length=255)
    slug: str = Field(..., max_length=255)
    game_type: str = Field(..., max_length=100)
    description: Optional[str] = None
    icon_url: Optional[str] = Field(None, max_length=500)
    min_bet: int = Field(..., ge=0)
    max_bet: int = Field(..., ge=0)
    config: Optional[Dict[str, Any]] = None


class GameCreate(GameBase):
    pass


class GameUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    icon_url: Optional[str] = Field(None, max_length=500)
    min_bet: Optional[int] = Field(None, ge=0)
    max_bet: Optional[int] = Field(None, ge=0)
    config: Optional[Dict[str, Any]] = None


class GameOut(GameBase):
    id: UUID
    status: GameStatus
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by_id: Optional[UUID] = None
    updated_by_id: Optional[UUID] = None

    model_config = ConfigDict(from_attributes=True)
