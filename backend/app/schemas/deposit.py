from typing import Optional
from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, field_validator

from ..models.deposit import DepositStatus


class DepositCreateIn(BaseModel):
    amount: int
    provider: Optional[str] = None


class ManualDepositCreateIn(BaseModel):
    amount: int  # in paise
    transaction_id: str  # 12-digit UTR or transaction ID
    config_id: Optional[UUID] = None
    remarks: Optional[str] = None

    @field_validator("transaction_id")
    @classmethod
    def transaction_id_valid(cls, value: str) -> str:
        value = value.strip()
        if not 4 <= len(value) <= 255:
            raise ValueError("Transaction ID must be between 4 and 255 characters")
        return value

    @field_validator("remarks")
    @classmethod
    def remarks_valid(cls, value: Optional[str]) -> Optional[str]:
        if value is not None:
            value = value.strip()
            if len(value) > 1000:
                raise ValueError("Remarks must be 1000 characters or fewer")
            return value or None
        return value


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