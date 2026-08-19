from typing import Optional
from uuid import UUID
from datetime import datetime

from pydantic import BaseModel

from ..models.deposit import DepositStatus


class DepositCreateIn(BaseModel):
    amount: int
    provider: Optional[str] = None


class DepositVerifyIn(BaseModel):
    provider_order_id: str
    provider_payment_id: str
    signature: str


class DepositOut(BaseModel):
    id: UUID
    user_id: UUID
    amount: int
    status: DepositStatus
    provider: Optional[str] = None
    provider_order_id: Optional[str] = None
    currency: str = "INR"
    key_id: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}