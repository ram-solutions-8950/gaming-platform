from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class ReferralSettingsOut(BaseModel):
    reward_amount: float = Field(..., description="Reward amount in INR")
    is_active: bool

    model_config = {"from_attributes": True}


class ReferralSettingsUpdateIn(BaseModel):
    reward_amount: float = Field(..., description="Reward amount in INR")
    is_active: bool


class ReferralStatsOut(BaseModel):
    referral_code: str
    referral_link: str
    reward_amount: float
    successful_referrals: int
    total_earnings: float
    pending_referrals: int


class ReferralHistoryOut(BaseModel):
    name: str
    username: str
    status: str
    reward_amount: float
    created_at: datetime

    model_config = {"from_attributes": True}
