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
) -> Optional[WagerRequirement]:
    """Create a play-through requirement when a deposit is credited.

    Idempotent per ``deposit_id`` — replaying a webhook will not create a
    second requirement for the same deposit.

    Args:
        db: Database session.
        user_id: Owner of the requirement.
        deposit_amount: Deposit amount in paise.
        deposit_id: Deposit this requirement belongs to.
    """
    if deposit_amount <= 0:
        return None

    if deposit_id is not None:
        existing = db.query(WagerRequirement).filter(
            WagerRequirement.deposit_id == deposit_id
        ).first()
        if existing:
            return existing

    req = WagerRequirement(
        user_id=user_id,
        deposit_id=deposit_id,
        required_amount=deposit_amount,
        completed_amount=0,
        is_fulfilled=False,
    )
    db.add(req)
    db.flush()
    logger.info(
        "Wager requirement created: user=%s amount=%s (Rs %.2f) deposit=%s",
        user_id, deposit_amount, deposit_amount / 100, deposit_id,
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
