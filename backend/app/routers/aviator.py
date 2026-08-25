"""
Aviator REST API router.

GET /aviator/history       — recent rounds
GET /aviator/my-bets       — player's bet history
GET /aviator/fairness/{id} — provably fair verification data
"""

from __future__ import annotations
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..dependencies.database import get_db
from ..security.permissions import require_user
from ..models.user import User
from ..models.aviator import AviatorRound, AviatorBet, AviatorRoundStatus
from ..schemas.aviator import AviatorRoundOut, AviatorBetOut, AviatorFairnessOut
from ..utils.responses import success_response

router = APIRouter(prefix="/aviator", tags=["Aviator"])


@router.get("/history")
def aviator_history(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _user: User = Depends(require_user),
):
    """Recent settled rounds with crash points (most recent first)."""
    rounds = (
        db.query(AviatorRound)
        .filter(AviatorRound.status.in_([
            AviatorRoundStatus.CRASHED,
            AviatorRoundStatus.SETTLED,
        ]))
        .order_by(AviatorRound.crashed_at.desc())
        .limit(limit)
        .all()
    )
    data = [AviatorRoundOut.model_validate(r).model_dump(mode="json") for r in rounds]
    return success_response(data)


@router.get("/my-bets")
def aviator_my_bets(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
):
    """Player's recent Aviator bets."""
    bets = (
        db.query(AviatorBet)
        .filter(AviatorBet.user_id == user.id)
        .order_by(AviatorBet.created_at.desc())
        .limit(limit)
        .all()
    )
    data = [AviatorBetOut.model_validate(b).model_dump(mode="json") for b in bets]
    return success_response(data)


@router.get("/fairness/{round_id}")
def aviator_fairness(
    round_id: UUID,
    db: Session = Depends(get_db),
    _user: User = Depends(require_user),
):
    """Provably fair verification data for a completed round."""
    rnd = db.query(AviatorRound).filter(AviatorRound.id == round_id).first()
    if not rnd:
        raise HTTPException(status_code=404, detail="Round not found")

    if rnd.status not in (AviatorRoundStatus.CRASHED, AviatorRoundStatus.SETTLED):
        return success_response(AviatorFairnessOut(
            round_id=rnd.id,
            nonce=rnd.nonce,
            server_seed_hash=rnd.server_seed_hash,
            server_seed=None,
            crash_multiplier=None,
            status=rnd.status.value,
            verification_note="Round is still in progress. Seed will be revealed after crash.",
        ).model_dump(mode="json"))

    return success_response(AviatorFairnessOut(
        round_id=rnd.id,
        nonce=rnd.nonce,
        server_seed_hash=rnd.server_seed_hash,
        server_seed=rnd.server_seed,
        crash_multiplier=rnd.crash_multiplier,
        status=rnd.status.value,
        verification_note=(
            "To verify: compute HMAC-SHA256(server_seed, str(nonce)), "
            "take first 13 hex chars as h, then crash = max(1.0, (2^52 / (2^52 - h)) * 0.97). "
            "Verify SHA-256(server_seed) == server_seed_hash."
        ),
    ).model_dump(mode="json"))
