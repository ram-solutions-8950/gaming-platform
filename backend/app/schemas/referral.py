from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class ReferralSettingsOut(BaseModel):
    reward_amount: float = Field(..., description="Flat reward amount in INR")
    is_active: bool
    reward_type: str = Field("PERCENTAGE", description="FLAT or PERCENTAGE")
    reward_percentage: float = Field(10.0, description="Percent of the first deposit paid to the referrer")
    min_deposit: float = Field(100.0, description="Minimum first deposit in INR that qualifies a referral")

    model_config = {"from_attributes": True}


class ReferralSettingsUpdateIn(BaseModel):
    reward_amount: float = Field(..., description="Flat reward amount in INR")
    is_active: bool
    reward_type: Optional[str] = Field(None, description="FLAT or PERCENTAGE")
    reward_percentage: Optional[float] = Field(None, ge=0, le=100, description="Percent of the first deposit")
    min_deposit: Optional[float] = Field(None, ge=0, description="Minimum qualifying first deposit in INR")


class ReferralStatsOut(BaseModel):
    referral_code: str
    referral_link: str
    reward_amount: float
    successful_referrals: int
    total_earnings: float
    pending_referrals: int
    reward_type: str = "PERCENTAGE"
    reward_percentage: float = 10.0
    min_deposit: float = 100.0


class ReferralHistoryOut(BaseModel):
    name: str
    username: str
    status: str
    reward_amount: float
    created_at: datetime

    model_config = {"from_attributes": True}
