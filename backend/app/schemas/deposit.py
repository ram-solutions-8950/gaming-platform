from typing import Optional
from uuid import UUID
from datetime import datetime

from pydantic import BaseModel

from ..models.deposit import DepositStatus


class DepositCreateIn(BaseModel):
    amount: int
    provider: Optional[str] = None


class ManualDepositCreateIn(BaseModel):
    amount: int  # in paise
    transaction_id: str  # 12-digit UTR or transaction ID
    config_id: Optional[UUID] = None
    remarks: Optional[str] = None


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
    provider_payment_id: Optional[str] = None
    external_reference: Optional[str] = None
    currency: str = "INR"
    key_id: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}