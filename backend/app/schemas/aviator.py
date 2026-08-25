"""
Pydantic schemas for Aviator REST API responses.
"""

from __future__ import annotations
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel


class AviatorRoundOut(BaseModel):
    id: UUID
    nonce: int
    server_seed_hash: str
    server_seed: Optional[str] = None
    crash_multiplier: Optional[float] = None
    status: str
    betting_started_at: datetime
    flight_started_at: Optional[datetime] = None
    crashed_at: Optional[datetime] = None
    settled_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AviatorBetOut(BaseModel):
    id: UUID
    user_id: UUID
    round_id: UUID
    slot: int
    amount: int
    auto_cashout: Optional[float] = None
    status: str
    cashout_multiplier: Optional[float] = None
    payout: Optional[int] = 0
    cashed_out_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AviatorFairnessOut(BaseModel):
    round_id: UUID
    nonce: int
    server_seed_hash: str
    server_seed: Optional[str] = None
    crash_multiplier: Optional[float] = None
    status: str
    verification_note: str
