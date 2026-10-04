"""Wager Requirement Service.

Business rule: every credited deposit creates a play-through requirement equal
to the deposited amount. The user must wager that full amount (i.e. place bets
totalling at least the deposit) before any withdrawal is allowed.

Wagering is recorded centrally from ``wallet_service.debit_wallet`` whenever a
GAME_ENTRY debit succeeds, so every game on the platform contributes
automatically — win or lose.
"""
from uuid import UUID
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import func

from ..models.wager import WagerRequirement
from ..utils.logging import get_logger

logger = get_logger("wager")


def create_wager_requirement(
    db: Session,
    user_id: UUID,
    deposit_amount: int,
    deposit_id: Optional[UUID] = None,
    multiplier: Optional[float] = None,
) -> Optional[WagerRequirement]:
    """Create a play-through requirement when a deposit is credited.

    Idempotent per ``deposit_id`` — replaying a webhook will not create a
    second requirement for the same deposit.

    Args:
        db: Database session.
        user_id: Owner of the requirement.
        deposit_amount: Deposit amount in paise.
        deposit_id: Deposit this requirement belongs to.
        multiplier: Optional turnover multiplier override. If omitted, uses global_wager_settings.
    """
    if deposit_amount <= 0:
        return None

    if multiplier is None:
        from ..models.system_settings import SystemSetting
        w_setting = db.query(SystemSetting).filter(SystemSetting.key == "global_wager_settings").first()
        multiplier = float(w_setting.value.get("multiplier", 1.0)) if (w_setting and w_setting.value) else 1.0

    required_amount = int(round(deposit_amount * multiplier))

    if deposit_id is not None:
        existing = db.query(WagerRequirement).filter(
            WagerRequirement.deposit_id == deposit_id
        ).first()
        if existing:
            if not existing.is_fulfilled and existing.required_amount != required_amount:
                existing.required_amount = required_amount
                existing.is_fulfilled = existing.completed_amount >= existing.required_amount
                db.flush()
            return existing

    req = WagerRequirement(
        user_id=user_id,
        deposit_id=deposit_id,
        required_amount=required_amount,
        completed_amount=0,
        is_fulfilled=False,
    )
    db.add(req)
    db.flush()
    logger.info(
        "Wager requirement created: user=%s deposit_amount=%s multiplier=%sx required=%s (Rs %.2f) deposit=%s",
        user_id, deposit_amount, multiplier, required_amount, required_amount / 100, deposit_id,
    )
    return req


def _pending_requirements(db: Session, user_id: UUID, lock: bool = False):
    q = db.query(WagerRequirement).filter(
        WagerRequirement.user_id == user_id,
        WagerRequirement.is_fulfilled.is_(False),
    ).order_by(WagerRequirement.created_at.asc(), WagerRequirement.id.asc())
    if lock:
        q = q.with_for_update()
    return q.all()


def record_wager(db: Session, user_id: UUID, amount_paise: int, game_slug: str) -> int:
    """Credit ``amount_paise`` of play-through against the user's requirements.

    Oldest requirement first; any surplus cascades into the next pending
    requirement so a single large bet can clear several deposits.

    Returns the amount actually applied (0 when nothing is pending).
    """
    if amount_paise <= 0:
        return 0

    remaining = amount_paise
    applied = 0

    for req in _pending_requirements(db, user_id, lock=True):
        if remaining <= 0:
            break
        shortfall = max(0, int(req.required_amount) - int(req.completed_amount))
        if shortfall <= 0:
            req.is_fulfilled = True
            continue
        take = min(shortfall, remaining)
        req.completed_amount = int(req.completed_amount) + take
        remaining -= take
        applied += take
        if req.completed_amount >= req.required_amount:
            req.is_fulfilled = True
            logger.info(
                "Wager requirement fulfilled: user=%s required=%s completed=%s game=%s",
                user_id, req.required_amount, req.completed_amount, game_slug,
            )

    if applied:
        db.flush()
    return applied


def reverse_wager(db: Session, user_id: UUID, amount_paise: int, game_slug: str) -> int:
    """Undo previously recorded play-through (used when a bet is refunded/pushed).

    Walks requirements newest-first, mirroring how ``record_wager`` fills them,
    and re-opens any requirement that drops back below its target.

    Returns the amount actually reversed.
    """
    if amount_paise <= 0:
        return 0

    remaining = amount_paise
    reversed_total = 0

    rows = db.query(WagerRequirement).filter(
        WagerRequirement.user_id == user_id,
        WagerRequirement.completed_amount > 0,
    ).order_by(
        WagerRequirement.created_at.desc(), WagerRequirement.id.desc()
    ).with_for_update().all()

    for req in rows:
        if remaining <= 0:
            break
        take = min(int(req.completed_amount), remaining)
        req.completed_amount = int(req.completed_amount) - take
        remaining -= take
        reversed_total += take
        req.is_fulfilled = req.completed_amount >= req.required_amount

    if reversed_total:
        db.flush()
        logger.info(
            "Wager reversed: user=%s amount=%s game=%s", user_id, reversed_total, game_slug
        )
    return reversed_total


def check_wager_fulfilled(db: Session, user_id: UUID) -> bool:
    """True when the user has no outstanding play-through requirement."""
    return db.query(WagerRequirement).filter(
        WagerRequirement.user_id == user_id,
        WagerRequirement.is_fulfilled.is_(False),
    ).first() is None


def get_remaining_wager(db: Session, user_id: UUID) -> int:
    """Outstanding play-through amount in paise."""
    rows = db.query(
        WagerRequirement.required_amount, WagerRequirement.completed_amount
    ).filter(
        WagerRequirement.user_id == user_id,
        WagerRequirement.is_fulfilled.is_(False),
    ).all()
    return sum(max(0, int(r) - int(c)) for r, c in rows)


def get_wager_status(db: Session, user_id: UUID) -> dict:
    """Summary of the user's play-through progress, in rupees."""
    total_required = db.query(
        func.coalesce(func.sum(WagerRequirement.required_amount), 0)
    ).filter(WagerRequirement.user_id == user_id).scalar() or 0

    total_completed = db.query(
        func.coalesce(func.sum(WagerRequirement.completed_amount), 0)
    ).filter(WagerRequirement.user_id == user_id).scalar() or 0

    pending_required = db.query(
        func.coalesce(func.sum(WagerRequirement.required_amount), 0)
    ).filter(
        WagerRequirement.user_id == user_id,
        WagerRequirement.is_fulfilled.is_(False),
    ).scalar() or 0

    pending_completed = db.query(
        func.coalesce(func.sum(WagerRequirement.completed_amount), 0)
    ).filter(
        WagerRequirement.user_id == user_id,
        WagerRequirement.is_fulfilled.is_(False),
    ).scalar() or 0

    remaining = get_remaining_wager(db, user_id)
    total_required = int(total_required)
    total_completed = int(total_completed)

    progress = 100.0
    if total_required > 0:
        progress = round(min(100.0, (total_completed / total_required) * 100), 2)

    return {
        "total_required_inr": round(total_required / 100, 2),
        "total_completed_inr": round(total_completed / 100, 2),
        "pending_required_inr": round(int(pending_required) / 100, 2),
        "pending_completed_inr": round(int(pending_completed) / 100, 2),
        "remaining_inr": round(remaining / 100, 2),
        "progress_percent": progress,
        "is_fulfilled": remaining == 0,
    }


def sync_all_user_wagers_with_multiplier(
    db: Session,
    multiplier: Optional[float] = None,
) -> dict:
    """Recalculate or create wager requirements for all users based on their completed deposits and multiplier."""
    from ..models.deposit import Deposit, DepositStatus
    from ..models.user import User, UserRole
    from ..models.system_settings import SystemSetting

    if multiplier is None:
        w_setting = db.query(SystemSetting).filter(SystemSetting.key == "global_wager_settings").first()
        multiplier = float(w_setting.value.get("multiplier", 1.0)) if (w_setting and w_setting.value) else 1.0

    users = db.query(User).filter(User.role == UserRole.USER).all()
    updated_users = 0
    total_requirements_updated = 0

    for u in users:
        successful_deposits = (
            db.query(Deposit)
            .filter(Deposit.user_id == u.id, Deposit.status == DepositStatus.SUCCESS)
            .order_by(Deposit.created_at.asc())
            .all()
        )

        user_touched = False
        if successful_deposits:
            for dep in successful_deposits:
                req = db.query(WagerRequirement).filter(WagerRequirement.deposit_id == dep.id).first()
                new_required = int(round(dep.amount * multiplier))
                if req:
                    if req.required_amount != new_required:
                        req.required_amount = new_required
                        req.is_fulfilled = req.completed_amount >= req.required_amount
                        total_requirements_updated += 1
                        user_touched = True
                else:
                    new_req = WagerRequirement(
                        user_id=u.id,
                        deposit_id=dep.id,
                        required_amount=new_required,
                        completed_amount=0,
                        is_fulfilled=False,
                    )
                    db.add(new_req)
                    total_requirements_updated += 1
                    user_touched = True

        if user_touched:
            updated_users += 1

    db.commit()
    logger.info(
        "Synced wagers with %sx multiplier: updated %d requirements across %d users",
        multiplier, total_requirements_updated, updated_users,
    )
    return {
        "multiplier": multiplier,
        "updated_users": updated_users,
        "total_requirements_updated": total_requirements_updated,
    }


def admin_list_wagers(
    db: Session,
    page: int = 1,
    page_size: int = 20,
    user_id: Optional[UUID] = None,
    is_fulfilled: Optional[bool] = None,
    search: Optional[str] = None,
    status_filter: Optional[str] = None,
) -> dict:
    from ..models.user import User
    from sqlalchemy import or_, String, cast

    user_q = db.query(User)
    if user_id:
        user_q = user_q.filter(User.id == user_id)
    if search:
        s = f"%{search.strip()}%"
        user_q = user_q.filter(
            or_(
                User.username.ilike(s),
                User.name.ilike(s),
                User.email.ilike(s),
                cast(User.id, String).ilike(s),
            )
        )

    all_users = user_q.order_by(User.created_at.desc()).all()

    formatted = []
    for u in all_users:
        wager_rows = (
            db.query(WagerRequirement)
            .filter(WagerRequirement.user_id == u.id)
            .order_by(WagerRequirement.created_at.desc())
            .all()
        )

        req_p = sum(int(r.required_amount) for r in wager_rows)
        comp_p = sum(int(r.completed_amount) for r in wager_rows)
        rem_p = max(0, req_p - comp_p)

        if req_p == 0:
            status = "NO_REQUIREMENT"
            is_ful = False
            prog = 0.0
        elif rem_p == 0 or comp_p >= req_p:
            status = "FULFILLED"
            is_ful = True
            prog = 100.0
        else:
            status = "PENDING"
            is_ful = False
            prog = round(min(100.0, (comp_p / req_p) * 100), 1)

        if status_filter and status_filter != "ALL":
            if status_filter != status:
                continue
        elif is_fulfilled is not None:
            if is_fulfilled and status != "FULFILLED":
                continue
            if not is_fulfilled and status != "PENDING":
                continue

        latest_id = str(wager_rows[0].id) if wager_rows else str(u.id)
        deposit_id = str(wager_rows[0].deposit_id) if (wager_rows and wager_rows[0].deposit_id) else None
        created_at = wager_rows[0].created_at.isoformat() if (wager_rows and wager_rows[0].created_at) else (u.created_at.isoformat() if u.created_at else None)
        updated_at = wager_rows[0].updated_at.isoformat() if (wager_rows and wager_rows[0].updated_at) else None

        formatted.append({
            "id": latest_id,
            "user_id": str(u.id),
            "username": u.username or u.name or "Unknown",
            "user_name": u.name or u.username or "Player",
            "deposit_id": deposit_id,
            "required_amount_paise": req_p,
            "required_amount_inr": round(req_p / 100, 2),
            "completed_amount_paise": comp_p,
            "completed_amount_inr": round(comp_p / 100, 2),
            "remaining_amount_inr": round(rem_p / 100, 2),
            "progress_percent": prog,
            "is_fulfilled": is_ful,
            "status": status,
            "created_at": created_at,
            "updated_at": updated_at,
        })

    total = len(formatted)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated_items = formatted[start_idx:end_idx]

    return {
        "items": paginated_items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def admin_set_user_wager(
    db: Session,
    user_id: UUID,
    required_amount_paise: int,
    deposit_id: Optional[UUID] = None,
) -> WagerRequirement:
    """Explicitly set or add a wager requirement for a user."""
    req = WagerRequirement(
        user_id=user_id,
        deposit_id=deposit_id,
        required_amount=required_amount_paise,
        completed_amount=0,
        is_fulfilled=False,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    logger.info("Admin manually set wager requirement: user=%s req=Rs %.2f", user_id, required_amount_paise / 100)
    return req


def admin_fulfill_wager(db: Session, wager_id: UUID) -> bool:
    """Manually mark a wager requirement as fulfilled/waived."""
    from ..models.user import User
    req = db.query(WagerRequirement).filter(WagerRequirement.id == wager_id).first()
    if not req:
        # Check if wager_id corresponds to a User ID
        user = db.query(User).filter(User.id == wager_id).first()
        if user:
            admin_waive_all_user_wagers(db, user.id)
            return True
        return False
    req.completed_amount = req.required_amount
    req.is_fulfilled = True
    db.commit()
    logger.info("Admin fulfilled wager requirement %s", wager_id)
    return True


def admin_waive_all_user_wagers(db: Session, user_id: UUID) -> int:
    """Waive all unfulfilled wager requirements for a user."""
    wagers = db.query(WagerRequirement).filter(
        WagerRequirement.user_id == user_id,
        WagerRequirement.is_fulfilled.is_(False),
    ).all()
    count = len(wagers)
    for w in wagers:
        w.completed_amount = w.required_amount
        w.is_fulfilled = True
    db.commit()
    logger.info("Admin waived %d wager requirements for user %s", count, user_id)
    return count
