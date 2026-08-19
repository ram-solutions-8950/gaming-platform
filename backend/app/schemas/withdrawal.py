from typing import Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, field_validator
from ..models.withdrawal import WithdrawalStatus


class WithdrawalCreateIn(BaseModel):
    amount: int           # paisa
    method: str
    destination: str

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("Withdrawal amount must be greater than zero")
        return v

    @field_validator("method")
    @classmethod
    def validate_method(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if v not in {"upi", "bank"}:
            raise ValueError("Withdrawal method must be 'upi' or 'bank'")
        return v

    @field_validator("destination")
    @classmethod
    def validate_destination(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Destination payment details are required")
        if len(v) > 500:
            raise ValueError("Destination details too long")
        return v


class WithdrawalActionIn(BaseModel):
    reason: Optional[str] = None


class WithdrawalOut(BaseModel):
    id: UUID
    user_id: UUID
    amount: int
    fee_amount: int
    net_amount: int
    status: WithdrawalStatus
    method: Optional[str] = None
    destination: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    processed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

