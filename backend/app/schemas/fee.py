from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from uuid import UUID

class FeeConfigurationBase(BaseModel):
    game_entry_fee_percent: float = Field(0.00, ge=0.00, le=100.00, description="Percentage of game entry fee")
    winning_fee_percent: float = Field(0.00, ge=0.00, le=100.00, description="Percentage of winning fee")
    withdrawal_fee_percent: float = Field(0.00, ge=0.00, le=100.00, description="Percentage of withdrawal fee")

class FeeConfigurationOut(FeeConfigurationBase):
    id: UUID
    updated_at: datetime
    updated_by_id: Optional[UUID]

    model_config = {"from_attributes": True}

class FeeConfigurationUpdateIn(FeeConfigurationBase):
    pass
