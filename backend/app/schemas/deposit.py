from typing import Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel
from ..models.deposit import DepositStatus


class DepositCreateIn(BaseModel):
    amount: int           # paisa
    provider: Optional[str] = None


class DepositOut(BaseModel):
    id: UUID
    user_id: UUID
    amount: int
    status: DepositStatus
    provider: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
