from pydantic import BaseModel, Field
from typing import List, Optional
from uuid import UUID
from datetime import datetime


# ─── 7-Day Rewards ───
class DailyRewardDayItem(BaseModel):
    day_number: int
    label: str
    reward_type: str  # CASH, FREE_SPIN
    amount_inr: float
    free_spins: int
    status: str       # CLAIMED, CLAIMABLE, LOCKED


class DailyRewardStatusOut(BaseModel):
    has_qualifying_bet: bool
    min_qualifying_bet_inr: float
    current_day: int
    can_claim_today: bool
    next_claim_seconds: int
    days: List[DailyRewardDayItem]


class DailyRewardClaimIn(BaseModel):
    day_number: int = Field(..., ge=1, le=7)


class DailyRewardClaimOut(BaseModel):
    success: bool
    day_number: int
    reward_type: str
    amount_inr: float
    free_spins_awarded: int
    wallet_balance_inr: float
    total_free_spins: int
    message: str


# ─── Lucky Spin ───
class LuckySpinSegmentOut(BaseModel):
    segment_index: int
    label: str
    reward_type: str  # CASH, FREE_SPIN, NO_REWARD
    amount_inr: float
    free_spins: int
    color: str


class LuckySpinStatusOut(BaseModel):
    free_spins_available: int
    can_spin: bool
    segments: List[LuckySpinSegmentOut]


class LuckySpinResultOut(BaseModel):
    winning_index: int
    segment: LuckySpinSegmentOut
    wallet_balance_inr: float
    free_spins_left: int
    message: str


# ─── Bonuses ───
class BonusItemOut(BaseModel):
    id: UUID
    title: str
    description: Optional[str] = None
    bonus_type: str
    amount_inr: float
    can_claim: bool
    is_claimed: bool


class BonusClaimIn(BaseModel):
    bonus_id: UUID


class BonusClaimOut(BaseModel):
    success: bool
    amount_inr: float
    wallet_balance_inr: float
    message: str


# ─── Jackpot ───
class JackpotStatusOut(BaseModel):
    title: str
    current_amount_inr: float
    seed_amount_inr: float
    description: Optional[str] = None
    is_active: bool


# ─── VIP Bonus ───
class VipTierOut(BaseModel):
    vip_level: int
    level_name: str
    min_deposit_inr: float
    reward_amount_inr: float
    is_current_tier: bool
    can_claim: bool
    is_claimed: bool


class VipStatusOut(BaseModel):
    current_vip_level: int
    current_level_name: str
    total_deposited_inr: float
    tiers: List[VipTierOut]


class VipClaimIn(BaseModel):
    vip_level: int


class VipClaimOut(BaseModel):
    success: bool
    reward_amount_inr: float
    wallet_balance_inr: float
    message: str


# ─── Admin Configuration Inputs ───
class DailyRewardConfigUpdateIn(BaseModel):
    amount_inr: Optional[float] = None
    reward_type: Optional[str] = None
    free_spins_count: Optional[int] = None
    is_enabled: Optional[bool] = None


class DailyRewardSettingsUpdateIn(BaseModel):
    min_qualifying_bet_inr: float = Field(..., ge=0.1)
    is_active: bool = True


class LuckySpinSegmentUpdateIn(BaseModel):
    label: Optional[str] = None
    reward_type: Optional[str] = None
    amount_inr: Optional[float] = None
    free_spins: Optional[int] = None
    weight: Optional[int] = Field(default=None, ge=1)
    color: Optional[str] = None
    is_enabled: Optional[bool] = None


class BonusCreateIn(BaseModel):
    title: str
    description: Optional[str] = None
    bonus_type: str = "DAILY"
    amount_inr: float = Field(..., gt=0)
    is_active: bool = True
    claim_limit: int = 1


class BonusUpdateIn(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    amount_inr: Optional[float] = None
    is_active: Optional[bool] = None
    claim_limit: Optional[int] = None


class JackpotUpdateIn(BaseModel):
    title: Optional[str] = None
    current_amount_inr: Optional[float] = None
    seed_amount_inr: Optional[float] = None
    is_active: Optional[bool] = None
    description: Optional[str] = None


class VipBonusUpdateIn(BaseModel):
    level_name: Optional[str] = None
    min_deposit_inr: Optional[float] = None
    reward_amount_inr: Optional[float] = None
    is_active: Optional[bool] = None
