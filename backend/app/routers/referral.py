from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from ..dependencies.database import get_db
from ..schemas.referral import ReferralStatsOut, ReferralHistoryOut
from ..models.user import User
from ..models.referral import Referral, ReferralStatus
from ..services.referral_service import get_referral_settings
from ..security.permissions import require_user
from ..utils.responses import success_response

router = APIRouter(prefix="/referrals", tags=["Referrals"])


@router.get("/stats", response_model=None)
def get_user_referral_stats(
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    settings = get_referral_settings(db)
    
    # Successful referrals (REWARD_PAID)
    successful_referrals = db.query(Referral).filter(
        Referral.referrer_user_id == current_user.id,
        Referral.status == ReferralStatus.REWARD_PAID
    ).count()
    
    # Total earnings
    total_earnings_paisa = db.query(func.sum(Referral.reward_amount)).filter(
        Referral.referrer_user_id == current_user.id,
        Referral.status == ReferralStatus.REWARD_PAID
    ).scalar() or 0
    total_earnings = float(total_earnings_paisa) / 100.0
    
    # Pending referrals (REGISTERED or QUALIFIED)
    pending_referrals = db.query(Referral).filter(
        Referral.referrer_user_id == current_user.id,
        Referral.status == ReferralStatus.REGISTERED
    ).count()
    
    # Check: does user have a referral code? If not (e.g. legacy user created before migration), generate one now
    if not current_user.referral_code:
        import secrets
        while True:
            my_ref_code = secrets.token_hex(4).upper()
            if not db.query(User).filter(User.referral_code == my_ref_code).first():
                break
        current_user.referral_code = my_ref_code
        db.commit()
        db.refresh(current_user)

    return success_response({
        "referral_code": current_user.referral_code,
        "referral_link": f"http://localhost:5173/signup?ref={current_user.referral_code}",
        "reward_amount": float(settings.reward_amount) / 100.0,
        "successful_referrals": successful_referrals,
        "total_earnings": total_earnings,
        "pending_referrals": pending_referrals
    })


@router.get("/history", response_model=None)
def get_user_referral_history(
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    referrals = db.query(Referral).filter(
        Referral.referrer_user_id == current_user.id
    ).order_by(Referral.created_at.desc()).all()
    
    history = []
    for r in referrals:
        status_str = "COMPLETED" if r.status == ReferralStatus.REWARD_PAID else "PENDING"
        reward = float(r.reward_amount) / 100.0 if r.status == ReferralStatus.REWARD_PAID else 0.0
        history.append({
            "name": r.referred.name,
            "username": r.referred.username,
            "status": status_str,
            "reward_amount": reward,
            "created_at": r.created_at.isoformat()
        })
        
    return success_response(history)
