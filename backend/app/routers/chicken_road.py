"""
Chicken Road Arcade Road-Crossing Game Router.
Server-authoritative game logic with atomic wallet debit/credit integration.

Rounds are rows in chicken_road_rounds. Every action locks its round's row, so
concurrent requests for one round (double taps, retries, several workers) are
applied one at a time, and each action commits its round change together with
its wallet movement.
"""

from __future__ import annotations
import uuid
import secrets
from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..dependencies.database import get_db
from ..security.permissions import require_user
from ..models.user import User
from ..models.transaction import WalletTransactionType
from ..models.chicken_road import ChickenRoadRound, ChickenRoadRoundStatus as RoundStatus
from ..services import wallet_service
from ..services.settlement_service import calculate_winning_settlement, settle_winning_bet
from ..utils.responses import success_response

router = APIRouter(prefix="/games/chicken-road", tags=["Chicken Road"])

DIFFICULTY_MULTIPLIERS = {
    "EASY": [1.01, 1.03, 1.06, 1.10, 1.15, 1.19, 1.24, 1.30, 1.40, 1.50],
    "MEDIUM": [1.03, 1.08, 1.15, 1.25, 1.38, 1.55, 1.75, 2.05, 2.45, 3.00],
    "HARD": [1.05, 1.15, 1.30, 1.55, 1.90, 2.40, 3.10, 4.20, 6.00, 10.00],
}

# Chicken Road is a game of chance. When the bet is placed the server secretly
# draws the lane (if any) where the chicken will be hit; the client only
# animates what the server rules, and progress it reports is always checked
# against that draw, so no client can walk past the lane it is hit on.
CHICKEN_ROAD_RTP = 0.97
_rng = secrets.SystemRandom()


def draw_hit_lane(multipliers: List[float]) -> Optional[int]:
    """Lane the chicken is hit on, or None when it survives the whole road.

    Surviving through lane k has probability RTP / multipliers[k-1], so cashing
    out after any lane returns the RTP on average, whatever the player does.
    """
    u = _rng.random()
    for lane, mult in enumerate(multipliers, start=1):
        if u >= CHICKEN_ROAD_RTP / mult:
            return lane
    return None


GAME_SLUG = "chicken_road"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _round_not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Active game round not found.")


def _lock_active_round(db: Session, round_id: str, user: User) -> ChickenRoadRound:
    """The player's round in play, locked for the rest of the transaction."""
    try:
        rid = uuid.UUID(str(round_id))
    except ValueError:
        raise _round_not_found()
    rnd = (
        db.query(ChickenRoadRound)
        .filter(ChickenRoadRound.id == rid, ChickenRoadRound.user_id == user.id)
        .with_for_update()
        .first()
    )
    if not rnd or rnd.status != RoundStatus.ACTIVE:
        raise _round_not_found()
    return rnd


def _active_round(db: Session, user: User) -> Optional[ChickenRoadRound]:
    return (
        db.query(ChickenRoadRound)
        .filter(ChickenRoadRound.user_id == user.id, ChickenRoadRound.status == RoundStatus.ACTIVE)
        .first()
    )


def _advance(rnd: ChickenRoadRound, lane_index: Optional[int]) -> bool:
    """Move the chicken up to lane_index through the server's draw.

    Returns False, ending the round as lost, when it is hit on the way.
    """
    if lane_index is None or lane_index <= rnd.current_lane:
        return True
    target = min(lane_index, len(rnd.multipliers))
    if rnd.hit_lane is not None and rnd.hit_lane <= target:
        rnd.current_lane = rnd.hit_lane - 1
        rnd.lost_lane = rnd.hit_lane
        rnd.status = RoundStatus.LOST
        rnd.settled_at = _now()
        return False
    rnd.current_lane = target
    return True


def _cashout_amount(db: Session, rnd: ChickenRoadRound) -> Optional[float]:
    """What cashing out now would credit, after the winning fee; None before
    the first lane, when there is nothing to cash out."""
    if rnd.current_lane == 0:
        return None
    gross = int(round(rnd.bet_amount * rnd.multipliers[rnd.current_lane - 1]))
    calc = calculate_winning_settlement(
        db, original_bet=rnd.bet_amount, gross_profit=max(0, gross - rnd.bet_amount), game_slug=GAME_SLUG
    )
    return calc.total_return / 100


def _progress(db: Session, rnd: ChickenRoadRound) -> dict:
    lanes = len(rnd.multipliers)
    curr_mult = rnd.multipliers[rnd.current_lane - 1] if rnd.current_lane > 0 else 1.0
    next_mult = rnd.multipliers[rnd.current_lane] if rnd.current_lane < lanes else rnd.multipliers[-1]
    return {
        "round_id": str(rnd.id),
        "status": "ACTIVE",
        "current_lane": rnd.current_lane,
        "total_lanes": lanes,
        "current_multiplier": curr_mult,
        "next_multiplier": next_mult,
        "potential_win": round(rnd.bet_amount * curr_mult / 100, 2),
        "cashout_amount": _cashout_amount(db, rnd),
    }


def _lost_response(rnd: ChickenRoadRound):
    return success_response({
        "round_id": str(rnd.id),
        "status": "LOST",
        "lane_index": rnd.lost_lane,
        "current_lane": rnd.current_lane,
        "bet_amount": rnd.bet_amount / 100,
        "won_amount": 0.0,
    })


def _pay_out(db: Session, rnd: ChickenRoadRound, multiplier: float, new_status: str) -> int:
    """Settle the round as won at this multiplier; returns the paise credited."""
    win_paisa = int(round(rnd.bet_amount * multiplier))
    gross_profit = max(0, win_paisa - rnd.bet_amount)
    calc, _ = settle_winning_bet(
        db=db,
        user_id=rnd.user_id,
        original_bet=rnd.bet_amount,
        gross_profit=gross_profit,
        reference_type="chicken_road_win",
        # One win per round, ever: the ledger's unique reference backs this up.
        reference_id=f"cr_{rnd.id}_win",
        game_slug=GAME_SLUG,
        is_refund=(win_paisa >= rnd.bet_amount and gross_profit == 0),
        metadata={
            "round_id": str(rnd.id),
            "multiplier": multiplier,
            "lane": rnd.current_lane,
            "difficulty": rnd.difficulty,
        },
    )
    rnd.status = new_status
    rnd.multiplier = multiplier
    rnd.payout = calc.total_return
    rnd.settled_at = _now()
    return calc.total_return


def _balance(db: Session, user: User) -> float:
    wallet = wallet_service.get_balance(db, user.id)
    return (wallet.balance / 100) if wallet else 0.0


class StartGameIn(BaseModel):
    bet_amount: float = Field(..., ge=10, le=100, description="Bet amount in INR (10 to 100)")
    difficulty: Optional[str] = Field("EASY", description="Game difficulty (EASY, MEDIUM, HARD)")


class CrossLaneIn(BaseModel):
    round_id: str
    lane_index: int = Field(..., ge=1, le=20)


class FinishIn(BaseModel):
    round_id: str
    lane_index: Optional[int] = Field(None, ge=1, le=20, description="Optional crossed lane index to settle a racing cross-lane call")


class CollisionIn(BaseModel):
    round_id: str
    lane_index: int = Field(..., ge=1, le=20)


class CashoutIn(BaseModel):
    round_id: str
    lane_index: Optional[int] = Field(None, ge=1, le=20, description="Optional crossed lane index to ensure accurate settlement")


@router.get("/state")
def get_game_state(
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
):
    """Retrieve active game state if player is mid-round."""
    rnd = _active_round(db, user)
    if rnd:
        return success_response({
            **_progress(db, rnd),
            "difficulty": rnd.difficulty,
            "bet_amount": rnd.bet_amount / 100,
            "multipliers": rnd.multipliers,
            "wallet_balance": _balance(db, user),
        })

    return success_response({
        "status": "READY",
        "difficulty_multipliers": DIFFICULTY_MULTIPLIERS,
        "wallet_balance": _balance(db, user),
    })


@router.post("/start")
def start_game(
    data: StartGameIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
):
    """Place bet, debit wallet, and start a new Chicken Road round."""
    bet_paisa = int(round(data.bet_amount * 100))
    if bet_paisa < 1000:  # Minimum ₹10
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Minimum bet is ₹10.00",
        )

    active_round_error = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="You have an active round in progress. Please finish or cash out first.",
    )
    if _active_round(db, user):
        raise active_round_error

    diff = data.difficulty.upper() if data.difficulty and data.difficulty.upper() in DIFFICULTY_MULTIPLIERS else "EASY"
    multipliers = DIFFICULTY_MULTIPLIERS[diff]
    rnd = ChickenRoadRound(
        id=uuid.uuid4(),
        user_id=user.id,
        difficulty=diff,
        multipliers=list(multipliers),
        bet_amount=bet_paisa,
        hit_lane=draw_hit_lane(multipliers),
        current_lane=0,
        status=RoundStatus.ACTIVE,
    )

    # The stake and the round are committed together: neither exists without the other.
    try:
        wallet_service.debit_wallet(
            db=db,
            user_id=user.id,
            amount=bet_paisa,
            tx_type=WalletTransactionType.GAME_ENTRY,
            reference_type="chicken_road_bet",
            reference_id=f"cr_{rnd.id}_bet",
            metadata={
                "game": GAME_SLUG,
                "round_id": str(rnd.id),
                "difficulty": diff,
                "bet_amount": data.bet_amount,
            },
        )
        db.add(rnd)
        db.commit()
    except ValueError as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except IntegrityError:
        # Another start for this player won the race to the one active round.
        db.rollback()
        raise active_round_error

    return success_response({
        **_progress(db, rnd),
        "difficulty": rnd.difficulty,
        "bet_amount": data.bet_amount,
        "multipliers": rnd.multipliers,
        "potential_win": data.bet_amount,
        "wallet_balance": _balance(db, user),
    })


@router.post("/cross-lane")
def cross_lane(
    data: CrossLaneIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
):
    """Player successfully crosses a traffic lane."""
    rnd = _lock_active_round(db, data.round_id, user)

    if data.lane_index > len(rnd.multipliers):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid lane index.",
        )

    survived = _advance(rnd, data.lane_index)
    db.commit()
    if not survived:
        return _lost_response(rnd)
    return success_response(_progress(db, rnd))


@router.post("/finish")
def finish_game(
    data: FinishIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
):
    """Player reaches the finish line across all lanes safely."""
    rnd = _lock_active_round(db, data.round_id, user)

    # Reaching the far side means crossing every lane, which the draw decides.
    if not _advance(rnd, len(rnd.multipliers)):
        db.commit()
        return _lost_response(rnd)

    final_multiplier = rnd.multipliers[-1]
    win_paisa = _pay_out(db, rnd, final_multiplier, RoundStatus.WON)
    db.commit()

    return success_response({
        "round_id": str(rnd.id),
        "status": "WON",
        "multiplier": final_multiplier,
        "bet_amount": rnd.bet_amount / 100,
        "won_amount": win_paisa / 100,
        "wallet_balance": _balance(db, user),
    })


@router.post("/collision")
def report_collision(
    data: CollisionIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
):
    """Chicken collided with a vehicle. Settle round as LOST."""
    rnd = _lock_active_round(db, data.round_id, user)
    rnd.status = RoundStatus.LOST
    rnd.lost_lane = data.lane_index
    rnd.settled_at = _now()
    db.commit()

    return success_response({
        "round_id": str(rnd.id),
        "status": "LOST",
        "lane_index": data.lane_index,
        "bet_amount": rnd.bet_amount / 100,
        "won_amount": 0.0,
    })


@router.post("/cashout")
def cashout_game(
    data: CashoutIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
):
    """Player cashes out accumulated winnings mid-game."""
    rnd = _lock_active_round(db, data.round_id, user)

    # A lane the client crossed just before cashing out still has to survive the draw.
    if data.lane_index is not None and not _advance(rnd, data.lane_index):
        db.commit()
        return _lost_response(rnd)

    if rnd.current_lane == 0:
        # Cannot cash out before crossing any lane — bet is committed
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must cross at least one lane before cashing out. Your bet is committed for this round.",
        )

    cashout_mult = rnd.multipliers[rnd.current_lane - 1]
    win_paisa = _pay_out(db, rnd, cashout_mult, RoundStatus.CASHED_OUT)
    db.commit()

    return success_response({
        "round_id": str(rnd.id),
        "status": "CASHED_OUT",
        "multiplier": cashout_mult,
        "bet_amount": rnd.bet_amount / 100,
        "won_amount": win_paisa / 100,
        "wallet_balance": _balance(db, user),
    })
