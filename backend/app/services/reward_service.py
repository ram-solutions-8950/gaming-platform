import random
import uuid
from datetime import datetime, timezone, date, timedelta
from typing import Dict, Any, List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from ..models.reward import (
    DailyRewardConfig,
    DailyRewardSettings,
    UserRewardProfile,
    UserDailyRewardClaim,
    LuckySpinSegmentConfig,
    UserLuckySpinLog,
    BonusConfig,
    UserBonusClaim,
    JackpotConfig,
    VipBonusConfig,
)
from ..models.transaction import WalletTransaction, WalletTransactionType, WalletTransactionStatus
from ..models.deposit import Deposit, DepositStatus
from ..services import wallet_service, audit_service
from ..utils.logging import get_logger

logger = get_logger("rewards")


# ─── Default Seeding ───
def seed_default_reward_configs(db: Session) -> None:
    """Ensure all default configs exist in the database."""
    # 1. 7-Day Rewards
    if db.query(DailyRewardConfig).count() == 0:
        default_days = [
            (1, "CASH", 100, 0),       # Rs 1
            (2, "CASH", 200, 0),       # Rs 2
            (3, "CASH", 300, 0),       # Rs 3
            (4, "FREE_SPIN", 0, 1),    # 1 Free Lucky Spin
            (5, "CASH", 600, 0),       # Rs 6
            (6, "CASH", 700, 0),       # Rs 7
            (7, "CASH", 1000, 0),      # Rs 10
        ]
        for day, rtype, amt, spins in default_days:
            db.add(DailyRewardConfig(
                day_number=day,
                reward_type=rtype,
                amount_paisa=amt,
                free_spins_count=spins,
                is_enabled=True,
            ))

    # 2. Daily Reward Settings (min qualifying bet Rs 1 = 100 paisa)
    if db.query(DailyRewardSettings).count() == 0:
        db.add(DailyRewardSettings(
            min_qualifying_bet_paisa=100,
            is_active=True,
        ))

    # 3. Lucky Spin Segments (8 segments)
    if db.query(LuckySpinSegmentConfig).count() == 0:
        default_segments = [
            (0, "₹1", "CASH", 100, 0, 25, "#F59E0B"),
            (1, "₹2", "CASH", 200, 0, 20, "#EC4899"),
            (2, "₹5", "CASH", 500, 0, 15, "#8B5CF6"),
            (3, "₹10", "CASH", 1000, 0, 10, "#3B82F6"),
            (4, "1 FREE SPIN", "FREE_SPIN", 0, 1, 12, "#10B981"),
            (5, "TRY AGAIN", "NO_REWARD", 0, 0, 10, "#64748B"),
            (6, "₹20", "CASH", 2000, 0, 5, "#EF4444"),
            (7, "₹50", "CASH", 5000, 0, 3, "#EAB308"),
        ]
        for idx, lbl, rtype, amt, spins, wt, col in default_segments:
            db.add(LuckySpinSegmentConfig(
                segment_index=idx,
                label=lbl,
                reward_type=rtype,
                amount_paisa=amt,
                free_spins=spins,
                weight=wt,
                color=col,
                is_enabled=True,
            ))

    # 4. Bonuses
    if db.query(BonusConfig).count() == 0:
        db.add(BonusConfig(
            title="Daily Active Bonus",
            description="Claim your daily login bonus of ₹5 every day!",
            bonus_type="DAILY",
            amount_paisa=500,
            is_active=True,
            claim_limit=1,
        ))
        db.add(BonusConfig(
            title="Welcome Bonus",
            description="Welcome to Corona 888! Enjoy ₹10 free cash bonus.",
            bonus_type="WELCOME",
            amount_paisa=1000,
            is_active=True,
            claim_limit=1,
        ))

    # 5. Jackpot
    if db.query(JackpotConfig).count() == 0:
        db.add(JackpotConfig(
            title="Corona 888 Mega Jackpot",
            current_amount_paisa=50000000,  # Rs 5,00,000
            seed_amount_paisa=10000000,     # Rs 1,00,000
            description="Play games with ₹10 or more to qualify for the progressive Mega Jackpot prize!",
            is_active=True,
        ))

    # 6. VIP Tiers
    if db.query(VipBonusConfig).count() == 0:
        default_tiers = [
            (1, "Bronze", 0, 1000),          # Rs 10
            (2, "Silver", 50000, 5000),       # Rs 500 dep -> Rs 50
            (3, "Gold", 200000, 20000),       # Rs 2,000 dep -> Rs 200
            (4, "Platinum", 1000000, 100000), # Rs 10,000 dep -> Rs 1,000
            (5, "Diamond", 5000000, 500000),  # Rs 50,000 dep -> Rs 5,000
        ]
        for lvl, name, min_dep, reward in default_tiers:
            db.add(VipBonusConfig(
                vip_level=lvl,
                level_name=name,
                min_deposit_paisa=min_dep,
                reward_amount_paisa=reward,
                is_active=True,
            ))

    db.commit()


# ─── 7-Day Rewards Engine ───
def get_or_create_user_reward_profile(db: Session, user_id: UUID) -> UserRewardProfile:
    profile = db.query(UserRewardProfile).filter(UserRewardProfile.user_id == user_id).first()
    if not profile:
        profile = UserRewardProfile(
            user_id=user_id,
            free_lucky_spins=0,
            current_day=1,
            last_claim_date=None,
            vip_level=1,
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def check_user_qualifying_bet(db: Session, user_id: UUID, min_bet_paisa: int) -> bool:
    """Checks if the user has completed at least one valid bet of >= min_bet_paisa (Rs 1+)."""
    tx = db.query(WalletTransaction).filter(
        WalletTransaction.user_id == user_id,
        WalletTransaction.type == WalletTransactionType.GAME_ENTRY,
        WalletTransaction.status == WalletTransactionStatus.COMPLETED,
        WalletTransaction.amount >= min_bet_paisa,
    ).first()
    return tx is not None


def get_7day_reward_status(db: Session, user_id: UUID) -> Dict[str, Any]:
    settings = db.query(DailyRewardSettings).first()
    min_bet_paisa = settings.min_qualifying_bet_paisa if settings else 100
    has_bet = check_user_qualifying_bet(db, user_id, min_bet_paisa)

    profile = get_or_create_user_reward_profile(db, user_id)
    today = datetime.now(timezone.utc).date()

    # Determine if today has been claimed
    claimed_today = profile.last_claim_date == today

    # Check for streak reset: if last claim was earlier than yesterday, streak resets to Day 1
    if profile.last_claim_date is not None and (today - profile.last_claim_date).days > 1:
        profile.current_day = 1
        db.commit()
        db.refresh(profile)

    can_claim_today = has_bet and not claimed_today

    # Calculate seconds until midnight UTC
    now_utc = datetime.now(timezone.utc)
    tomorrow_utc = datetime.combine(now_utc.date() + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)
    next_claim_seconds = int((tomorrow_utc - now_utc).total_seconds()) if claimed_today else 0

    # Fetch 7 days configuration
    day_configs = db.query(DailyRewardConfig).order_by(DailyRewardConfig.day_number).all()
    days_out = []

    for cfg in day_configs:
        d_num = cfg.day_number
        label = f"₹{cfg.amount_paisa / 100:.0f}" if cfg.reward_type == "CASH" else "FREE SPIN"

        if claimed_today:
            if d_num <= profile.current_day:
                status = "CLAIMED"
            else:
                status = "LOCKED"
        else:
            if d_num < profile.current_day:
                status = "CLAIMED"
            elif d_num == profile.current_day:
                status = "CLAIMABLE" if has_bet else "LOCKED"
            else:
                status = "LOCKED"

        days_out.append({
            "day_number": d_num,
            "label": label,
            "reward_type": cfg.reward_type,
            "amount_inr": float(cfg.amount_paisa) / 100.0,
            "free_spins": cfg.free_spins_count,
            "status": status,
        })

    return {
        "has_qualifying_bet": has_bet,
        "min_qualifying_bet_inr": float(min_bet_paisa) / 100.0,
        "current_day": profile.current_day,
        "can_claim_today": can_claim_today,
        "next_claim_seconds": next_claim_seconds,
        "days": days_out,
    }


def claim_7day_reward(db: Session, user_id: UUID, day_number: int) -> Dict[str, Any]:
    settings = db.query(DailyRewardSettings).first()
    min_bet_paisa = settings.min_qualifying_bet_paisa if settings else 100

    # 1. Verify qualifying bet
    if not check_user_qualifying_bet(db, user_id, min_bet_paisa):
        raise ValueError(f"Place at least ₹{min_bet_paisa / 100:.0f} bet to unlock 7-Day Rewards.")

    profile = get_or_create_user_reward_profile(db, user_id)
    today = datetime.now(timezone.utc).date()

    # 2. Prevent duplicate claim today
    if profile.last_claim_date == today:
        raise ValueError("You have already claimed today's reward. Please return tomorrow!")

    # 3. Check streak reset if missed
    if profile.last_claim_date is not None and (today - profile.last_claim_date).days > 1:
        profile.current_day = 1

    # 4. Verify day match
    if day_number != profile.current_day:
        raise ValueError(f"Invalid reward day requested. Current claimable day is Day {profile.current_day}.")

    # 5. Fetch configuration
    cfg = db.query(DailyRewardConfig).filter(DailyRewardConfig.day_number == day_number).first()
    if not cfg or not cfg.is_enabled:
        raise ValueError(f"Reward for Day {day_number} is currently unavailable.")

    # 6. Execute atomic reward distribution
    tx_id = None
    if cfg.reward_type == "CASH" and cfg.amount_paisa > 0:
        ref_id = f"7days_{user_id}_{day_number}_{today.isoformat()}"
        tx = wallet_service.credit_wallet(
            db,
            user_id=user_id,
            amount=cfg.amount_paisa,
            tx_type=WalletTransactionType.ADJUSTMENT,
            reference_type="daily_reward",
            reference_id=ref_id,
            metadata={"day_number": day_number, "date": today.isoformat()},
        )
        tx_id = tx.id

    spins_awarded = 0
    if cfg.reward_type == "FREE_SPIN" and cfg.free_spins_count > 0:
        spins_awarded = cfg.free_spins_count
        profile.free_lucky_spins += spins_awarded

    # 7. Record claim in ledger
    claim = UserDailyRewardClaim(
        user_id=user_id,
        day_number=day_number,
        claimed_date=today,
        reward_type=cfg.reward_type,
        amount_paisa=cfg.amount_paisa if cfg.reward_type == "CASH" else 0,
        free_spins_awarded=spins_awarded,
        transaction_id=tx_id,
    )
    db.add(claim)

    # 8. Update profile state
    profile.last_claim_date = today
    if profile.current_day >= 7:
        profile.current_day = 1  # cycle restarts on next claim
    else:
        profile.current_day += 1

    db.commit()
    db.refresh(profile)

    wallet = wallet_service.get_balance(db, user_id)
    wallet_bal_inr = float(wallet.balance) / 100.0 if wallet else 0.0

    msg = f"Claimed Day {day_number} reward successfully!"
    if cfg.reward_type == "CASH":
        msg = f"₹{cfg.amount_paisa / 100:.0f} credited to your wallet!"
    elif cfg.reward_type == "FREE_SPIN":
        msg = f"Awarded {spins_awarded} Free Lucky Spin! Spin now in Lucky Spin."

    return {
        "success": True,
        "day_number": day_number,
        "reward_type": cfg.reward_type,
        "amount_inr": float(cfg.amount_paisa) / 100.0 if cfg.reward_type == "CASH" else 0.0,
        "free_spins_awarded": spins_awarded,
        "wallet_balance_inr": wallet_bal_inr,
        "total_free_spins": profile.free_lucky_spins,
        "message": msg,
    }


# ─── Lucky Spin Engine ───
def get_lucky_spin_status(db: Session, user_id: UUID) -> Dict[str, Any]:
    profile = get_or_create_user_reward_profile(db, user_id)
    segments = db.query(LuckySpinSegmentConfig).filter(
        LuckySpinSegmentConfig.is_enabled == True
    ).order_by(LuckySpinSegmentConfig.segment_index).all()

    segments_out = []
    for s in segments:
        segments_out.append({
            "segment_index": s.segment_index,
            "label": s.label,
            "reward_type": s.reward_type,
            "amount_inr": float(s.amount_paisa) / 100.0,
            "free_spins": s.free_spins,
            "color": s.color,
        })

    return {
        "free_spins_available": profile.free_lucky_spins,
        "can_spin": profile.free_lucky_spins > 0,
        "segments": segments_out,
    }


def execute_lucky_spin(db: Session, user_id: UUID) -> Dict[str, Any]:
    profile = get_or_create_user_reward_profile(db, user_id)

    # 1. Require at least 1 free spin
    if profile.free_lucky_spins <= 0:
        raise ValueError("No free spins available. Complete Day 4 in 7-Day Rewards to earn a Free Spin!")

    # 2. Fetch enabled segments
    segments = db.query(LuckySpinSegmentConfig).filter(
        LuckySpinSegmentConfig.is_enabled == True
    ).order_by(LuckySpinSegmentConfig.segment_index).all()

    if not segments:
        raise ValueError("Lucky Spin is currently not configured.")

    # 3. Server-authoritative weighted RNG outcome
    weights = [max(1, s.weight) for s in segments]
    winning_segment = random.choices(segments, weights=weights, k=1)[0]

    # 4. Deduct 1 free spin
    profile.free_lucky_spins -= 1

    # 5. Process winnings
    tx_id = None
    if winning_segment.reward_type == "CASH" and winning_segment.amount_paisa > 0:
        spin_ref = f"spin_{uuid.uuid4()}"
        tx = wallet_service.credit_wallet(
            db,
            user_id=user_id,
            amount=winning_segment.amount_paisa,
            tx_type=WalletTransactionType.ADJUSTMENT,
            reference_type="lucky_spin_reward",
            reference_id=spin_ref,
            metadata={"segment_index": winning_segment.segment_index, "label": winning_segment.label},
        )
        tx_id = tx.id

    spins_awarded = 0
    if winning_segment.reward_type == "FREE_SPIN" and winning_segment.free_spins > 0:
        spins_awarded = winning_segment.free_spins
        profile.free_lucky_spins += spins_awarded

    # 6. Audit log
    spin_log = UserLuckySpinLog(
        user_id=user_id,
        segment_index=winning_segment.segment_index,
        reward_type=winning_segment.reward_type,
        amount_paisa=winning_segment.amount_paisa,
        free_spins_awarded=spins_awarded,
        free_spins_consumed=1,
        transaction_id=tx_id,
    )
    db.add(spin_log)
    db.commit()
    db.refresh(profile)

    wallet = wallet_service.get_balance(db, user_id)
    wallet_bal_inr = float(wallet.balance) / 100.0 if wallet else 0.0

    msg = f"Congratulations! You won {winning_segment.label}!"
    if winning_segment.reward_type == "NO_REWARD":
        msg = "Better luck next time!"

    return {
        "winning_index": winning_segment.segment_index,
        "segment": {
            "segment_index": winning_segment.segment_index,
            "label": winning_segment.label,
            "reward_type": winning_segment.reward_type,
            "amount_inr": float(winning_segment.amount_paisa) / 100.0,
            "free_spins": winning_segment.free_spins,
            "color": winning_segment.color,
        },
        "wallet_balance_inr": wallet_bal_inr,
        "free_spins_left": profile.free_lucky_spins,
        "message": msg,
    }


# ─── Bonus System Engine ───
def list_user_bonuses(db: Session, user_id: UUID) -> List[Dict[str, Any]]:
    bonuses = db.query(BonusConfig).filter(BonusConfig.is_active == True).all()
    user_claims = db.query(UserBonusClaim.bonus_id, func.count(UserBonusClaim.id)).filter(
        UserBonusClaim.user_id == user_id
    ).group_by(UserBonusClaim.bonus_id).all()
    claims_map = {b_id: cnt for b_id, cnt in user_claims}

    out = []
    for b in bonuses:
        claimed_cnt = claims_map.get(b.id, 0)
        is_claimed = claimed_cnt >= b.claim_limit
        out.append({
            "id": b.id,
            "title": b.title,
            "description": b.description,
            "bonus_type": b.bonus_type,
            "amount_inr": float(b.amount_paisa) / 100.0,
            "can_claim": not is_claimed,
            "is_claimed": is_claimed,
        })
    return out


def claim_user_bonus(db: Session, user_id: UUID, bonus_id: UUID) -> Dict[str, Any]:
    bonus = db.query(BonusConfig).filter(BonusConfig.id == bonus_id, BonusConfig.is_active == True).first()
    if not bonus:
        raise ValueError("Bonus offer not found or inactive.")

    claimed_count = db.query(UserBonusClaim).filter(
        UserBonusClaim.user_id == user_id,
        UserBonusClaim.bonus_id == bonus_id,
    ).count()

    if claimed_count >= bonus.claim_limit:
        raise ValueError("You have already claimed this bonus!")

    ref_id = f"bonus_{user_id}_{bonus_id}_{claimed_count + 1}"
    tx = wallet_service.credit_wallet(
        db,
        user_id=user_id,
        amount=bonus.amount_paisa,
        tx_type=WalletTransactionType.ADJUSTMENT,
        reference_type="bonus_reward",
        reference_id=ref_id,
        metadata={"bonus_title": bonus.title},
    )

    claim = UserBonusClaim(
        user_id=user_id,
        bonus_id=bonus_id,
        amount_paisa=bonus.amount_paisa,
        transaction_id=tx.id,
    )
    db.add(claim)
    db.commit()

    wallet = wallet_service.get_balance(db, user_id)
    wallet_bal_inr = float(wallet.balance) / 100.0 if wallet else 0.0

    return {
        "success": True,
        "amount_inr": float(bonus.amount_paisa) / 100.0,
        "wallet_balance_inr": wallet_bal_inr,
        "message": f"Successfully claimed {bonus.title}! ₹{bonus.amount_paisa / 100:.0f} added to wallet.",
    }


# ─── Jackpot Engine ───
def get_jackpot_info(db: Session) -> Dict[str, Any]:
    jackpot = db.query(JackpotConfig).first()
    if not jackpot:
        return {
            "title": "Corona 888 Mega Jackpot",
            "current_amount_inr": 500000.0,
            "seed_amount_inr": 100000.0,
            "description": "Play games with ₹10 or more to stand a chance to trigger the Mega Jackpot!",
            "is_active": True,
        }
    return {
        "title": jackpot.title,
        "current_amount_inr": float(jackpot.current_amount_paisa) / 100.0,
        "seed_amount_inr": float(jackpot.seed_amount_paisa) / 100.0,
        "description": jackpot.description,
        "is_active": jackpot.is_active,
    }


# ─── VIP Bonus Engine ───
def get_vip_info(db: Session, user_id: UUID) -> Dict[str, Any]:
    # Calculate lifetime completed deposits
    total_dep_paisa = db.query(func.coalesce(func.sum(Deposit.amount), 0)).filter(
        Deposit.user_id == user_id,
        Deposit.status == DepositStatus.COMPLETED,
    ).scalar() or 0

    tiers = db.query(VipBonusConfig).filter(VipBonusConfig.is_active == True).order_by(VipBonusConfig.vip_level).all()

    # Determine current tier
    current_lvl = 1
    current_name = "Bronze"
    for t in tiers:
        if total_dep_paisa >= t.min_deposit_paisa:
            current_lvl = t.vip_level
            current_name = t.level_name

    # Check claimed VIP levels
    claimed_levels = db.query(WalletTransaction.metadata_).filter(
        WalletTransaction.user_id == user_id,
        WalletTransaction.reference_type == "vip_bonus",
    ).all()
    claimed_set = set()
    for row in claimed_levels:
        if row and isinstance(row[0], dict) and "vip_level" in row[0]:
            claimed_set.add(row[0]["vip_level"])

    tiers_out = []
    for t in tiers:
        is_curr = t.vip_level == current_lvl
        is_claimed = t.vip_level in claimed_set
        can_claim = (total_dep_paisa >= t.min_deposit_paisa) and not is_claimed

        tiers_out.append({
            "vip_level": t.vip_level,
            "level_name": t.level_name,
            "min_deposit_inr": float(t.min_deposit_paisa) / 100.0,
            "reward_amount_inr": float(t.reward_amount_paisa) / 100.0,
            "is_current_tier": is_curr,
            "can_claim": can_claim,
            "is_claimed": is_claimed,
        })

    return {
        "current_vip_level": current_lvl,
        "current_level_name": current_name,
        "total_deposited_inr": float(total_dep_paisa) / 100.0,
        "tiers": tiers_out,
    }


def claim_vip_tier_bonus(db: Session, user_id: UUID, vip_level: int) -> Dict[str, Any]:
    tier = db.query(VipBonusConfig).filter(
        VipBonusConfig.vip_level == vip_level,
        VipBonusConfig.is_active == True,
    ).first()
    if not tier:
        raise ValueError("VIP tier not found.")

    total_dep_paisa = db.query(func.coalesce(func.sum(Deposit.amount), 0)).filter(
        Deposit.user_id == user_id,
        Deposit.status == DepositStatus.COMPLETED,
    ).scalar() or 0

    if total_dep_paisa < tier.min_deposit_paisa:
        raise ValueError(f"You need at least ₹{tier.min_deposit_paisa / 100:.0f} in deposits to unlock VIP {tier.level_name}.")

    ref_id = f"vip_{user_id}_{vip_level}"
    existing_claim = db.query(WalletTransaction).filter(
        WalletTransaction.user_id == user_id,
        WalletTransaction.reference_type == "vip_bonus",
        WalletTransaction.reference_id == ref_id,
    ).first()

    if existing_claim:
        raise ValueError(f"You have already claimed the VIP {tier.level_name} bonus!")

    tx = wallet_service.credit_wallet(
        db,
        user_id=user_id,
        amount=tier.reward_amount_paisa,
        tx_type=WalletTransactionType.ADJUSTMENT,
        reference_type="vip_bonus",
        reference_id=ref_id,
        metadata={"vip_level": vip_level, "tier_name": tier.level_name},
    )

    db.commit()
    wallet = wallet_service.get_balance(db, user_id)
    wallet_bal_inr = float(wallet.balance) / 100.0 if wallet else 0.0

    return {
        "success": True,
        "reward_amount_inr": float(tier.reward_amount_paisa) / 100.0,
        "wallet_balance_inr": wallet_bal_inr,
        "message": f"Claimed VIP {tier.level_name} bonus of ₹{tier.reward_amount_paisa / 100:.0f}!",
    }
