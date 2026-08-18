from typing import Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel
from ..models.withdrawal import WithdrawalStatus


class WithdrawalCreateIn(BaseModel):
    amount: int           # paisa
    method: Optional[str] = None
    destination: Optional[str] = None


class WithdrawalOut(BaseModel):
    id: UUID
    user_id: UUID
    amount: int
    status: WithdrawalStatus
    method: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
