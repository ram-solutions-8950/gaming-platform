from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from uuid import UUID

from ..dependencies.database import get_db
from ..security.permissions import require_user
from ..models.user import User
from ..schemas.reward import (
    DailyRewardStatusOut,
    DailyRewardClaimIn,
    DailyRewardClaimOut,
    LuckySpinStatusOut,
    LuckySpinResultOut,
    BonusItemOut,
    BonusClaimIn,
    BonusClaimOut,
    JackpotStatusOut,
    VipStatusOut,
    VipClaimIn,
    VipClaimOut,
)
from ..services import reward_service
from ..utils.responses import success_response, error_response
from ..middleware.rate_limiter import limiter

router = APIRouter(prefix="/rewards", tags=["Rewards & Promotions"])


# ─── 7-Day Rewards ───
@router.get("/7days/status")
@limiter.limit("60/minute")
def get_7day_status_endpoint(
    request: Request,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    status = reward_service.get_7day_reward_status(db, current_user.id)
    return success_response(DailyRewardStatusOut(**status).model_dump())


@router.post("/7days/claim")
@limiter.limit("15/minute")
def claim_7day_endpoint(
    request: Request,
    data: DailyRewardClaimIn,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    try:
        res = reward_service.claim_7day_reward(db, current_user.id, data.day_number)
        return success_response(DailyRewardClaimOut(**res).model_dump())
    except ValueError as e:
        return error_response("CLAIM_ERROR", str(e), status_code=400)


# ─── Lucky Spin ───
@router.get("/lucky-spin/status")
@limiter.limit("60/minute")
def get_lucky_spin_status_endpoint(
    request: Request,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    res = reward_service.get_lucky_spin_status(db, current_user.id)
    return success_response(LuckySpinStatusOut(**res).model_dump())


@router.post("/lucky-spin/spin")
@limiter.limit("20/minute")
def execute_lucky_spin_endpoint(
    request: Request,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    try:
        res = reward_service.execute_lucky_spin(db, current_user.id)
        return success_response(LuckySpinResultOut(**res).model_dump())
    except ValueError as e:
        return error_response("SPIN_ERROR", str(e), status_code=400)


# ─── Bonuses ───
@router.get("/bonus/list")
@limiter.limit("60/minute")
def list_bonuses_endpoint(
    request: Request,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    items = reward_service.list_user_bonuses(db, current_user.id)
    return success_response([BonusItemOut(**b).model_dump() for b in items])


@router.post("/bonus/claim")
@limiter.limit("15/minute")
def claim_bonus_endpoint(
    request: Request,
    data: BonusClaimIn,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    try:
        res = reward_service.claim_user_bonus(db, current_user.id, data.bonus_id)
        return success_response(BonusClaimOut(**res).model_dump())
    except ValueError as e:
        return error_response("BONUS_CLAIM_ERROR", str(e), status_code=400)


# ─── Jackpot ───
@router.get("/jackpot/status")
def get_jackpot_endpoint(db: Session = Depends(get_db)):
    info = reward_service.get_jackpot_info(db)
    return success_response(JackpotStatusOut(**info).model_dump())


# ─── VIP Bonus ───
@router.get("/vip/status")
@limiter.limit("60/minute")
def get_vip_status_endpoint(
    request: Request,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    res = reward_service.get_vip_info(db, current_user.id)
    return success_response(VipStatusOut(**res).model_dump())


@router.post("/vip/claim")
@limiter.limit("15/minute")
def claim_vip_endpoint(
    request: Request,
    data: VipClaimIn,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    try:
        res = reward_service.claim_vip_tier_bonus(db, current_user.id, data.vip_level)
        return success_response(VipClaimOut(**res).model_dump())
    except ValueError as e:
        return error_response("VIP_CLAIM_ERROR", str(e), status_code=400)
