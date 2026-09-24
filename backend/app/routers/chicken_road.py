"""
Chicken Road Arcade Road-Crossing Game Router.
Server-authoritative game logic with atomic wallet debit/credit integration.
"""

from __future__ import annotations
import uuid
import secrets
import threading
from typing import Dict, List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..dependencies.database import get_db
from ..security.permissions import require_user
from ..models.user import User
from ..models.transaction import WalletTransactionType
from ..services import wallet_service
from ..services.settlement_service import settle_winning_bet
from ..utils.responses import success_response, error_response

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


class ActiveChickenRound:
    def __init__(self, round_id: str, user_id: uuid.UUID, bet_paisa: int, difficulty: str = "EASY"):
        self.round_id = round_id
        self.user_id = user_id
        self.bet_paisa = bet_paisa
        self.difficulty = difficulty if difficulty in DIFFICULTY_MULTIPLIERS else "EASY"
        self.multipliers = DIFFICULTY_MULTIPLIERS[self.difficulty]
        self.total_lanes = len(self.multipliers)
        self.current_lane = 0  # 0 = starting sidewalk, 1..total_lanes
        self.status = "ACTIVE"  # "ACTIVE", "WON", "LOST", "CASHED_OUT", "VOID"
        self.hit_lane = draw_hit_lane(self.multipliers)
        self.lost_lane: Optional[int] = None
        self.created_at = uuid.uuid1().time

# In-memory active game state storage with thread-safe lock
ACTIVE_ROUNDS: Dict[str, ActiveChickenRound] = {}
USER_ACTIVE_ROUND: Dict[uuid.UUID, str] = {}
ROUND_LOCK = threading.Lock()


def _advance(rnd: ActiveChickenRound, lane_index: Optional[int]) -> bool:
    """Move the chicken up to lane_index through the server's draw.

    Returns False, ending the round as lost, when it is hit on the way.
    Called with the ROUND_LOCK held.
    """
    if lane_index is None or lane_index <= rnd.current_lane:
        return True
    target = min(lane_index, rnd.total_lanes)
    if rnd.hit_lane is not None and rnd.hit_lane <= target:
        rnd.current_lane = rnd.hit_lane - 1
        rnd.lost_lane = rnd.hit_lane
        rnd.status = "LOST"
        USER_ACTIVE_ROUND.pop(rnd.user_id, None)
        return False
    rnd.current_lane = target
    return True


def _lost_response(rnd: ActiveChickenRound):
    return success_response({
        "round_id": rnd.round_id,
        "status": "LOST",
        "lane_index": rnd.lost_lane,
        "current_lane": rnd.current_lane,
        "bet_amount": rnd.bet_paisa / 100,
        "won_amount": 0.0,
    })


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
    round_id = USER_ACTIVE_ROUND.get(user.id)
    if round_id and round_id in ACTIVE_ROUNDS:
        rnd = ACTIVE_ROUNDS[round_id]
        if rnd.status == "ACTIVE":
            curr_mult = rnd.multipliers[rnd.current_lane - 1] if rnd.current_lane > 0 else 1.0
            next_mult = rnd.multipliers[rnd.current_lane] if rnd.current_lane < rnd.total_lanes else rnd.multipliers[-1]
            wallet = wallet_service.get_balance(db, user.id)
            return success_response({
                "round_id": rnd.round_id,
                "status": "ACTIVE",
                "difficulty": rnd.difficulty,
                "bet_amount": rnd.bet_paisa / 100,
                "current_lane": rnd.current_lane,
                "total_lanes": rnd.total_lanes,
                "current_multiplier": curr_mult,
                "next_multiplier": next_mult,
                "multipliers": rnd.multipliers,
                "potential_win": (rnd.bet_paisa * curr_mult) / 100 if rnd.current_lane > 0 else rnd.bet_paisa / 100,
                "wallet_balance": (wallet.balance / 100) if wallet else 0.0,
            })
    
    # Return ready state
    wallet = wallet_service.get_balance(db, user.id)
    return success_response({
        "status": "READY",
        "difficulty_multipliers": DIFFICULTY_MULTIPLIERS,
        "wallet_balance": (wallet.balance / 100) if wallet else 0.0,
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

    with ROUND_LOCK:
        # Check if there's already an active round
        existing_round_id = USER_ACTIVE_ROUND.get(user.id)
        if existing_round_id and existing_round_id in ACTIVE_ROUNDS:
            if ACTIVE_ROUNDS[existing_round_id].status == "ACTIVE":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="You have an active round in progress. Please finish or cash out first.",
                )

        # Debit wallet atomically
        round_id = str(uuid.uuid4())
        ref_id = f"cr_{round_id[:8]}_{uuid.uuid4().hex[:6]}_bet"

        try:
            wallet_service.debit_wallet(
                db=db,
                user_id=user.id,
                amount=bet_paisa,
                tx_type=WalletTransactionType.GAME_ENTRY,
                reference_type="chicken_road_bet",
                reference_id=ref_id,
                metadata={
                    "game": "chicken_road",
                    "round_id": round_id,
                    "difficulty": data.difficulty or "EASY",
                    "bet_amount": data.bet_amount,
                },
            )
            db.commit()
        except ValueError as e:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )

        # Initialize active round
        diff = data.difficulty.upper() if data.difficulty and data.difficulty.upper() in DIFFICULTY_MULTIPLIERS else "EASY"
        rnd = ActiveChickenRound(
            round_id=round_id,
            user_id=user.id,
            bet_paisa=bet_paisa,
            difficulty=diff,
        )
        ACTIVE_ROUNDS[round_id] = rnd
        USER_ACTIVE_ROUND[user.id] = round_id

    # Fetch updated wallet balance
    wallet = wallet_service.get_balance(db, user.id)

    return success_response({
        "round_id": round_id,
        "status": "ACTIVE",
        "difficulty": rnd.difficulty,
        "bet_amount": data.bet_amount,
        "current_lane": 0,
        "total_lanes": rnd.total_lanes,
        "current_multiplier": 1.0,
        "next_multiplier": rnd.multipliers[0],
        "multipliers": rnd.multipliers,
        "potential_win": data.bet_amount,
        "wallet_balance": (wallet.balance / 100) if wallet else 0.0,
    })


@router.post("/cross-lane")
def cross_lane(
    data: CrossLaneIn,
    user: User = Depends(require_user),
):
    """Player successfully crosses a traffic lane."""
    with ROUND_LOCK:
        rnd = ACTIVE_ROUNDS.get(data.round_id)
        if not rnd or rnd.user_id != user.id or rnd.status != "ACTIVE":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Active game round not found.",
            )

        if data.lane_index > rnd.total_lanes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid lane index.",
            )

        if not _advance(rnd, data.lane_index):
            return _lost_response(rnd)
        curr_mult = rnd.multipliers[rnd.current_lane - 1]
        next_mult = rnd.multipliers[rnd.current_lane] if rnd.current_lane < rnd.total_lanes else rnd.multipliers[-1]
        potential_win = round((rnd.bet_paisa * curr_mult) / 100, 2)

    return success_response({
        "round_id": rnd.round_id,
        "status": "ACTIVE",
        "current_lane": rnd.current_lane,
        "total_lanes": rnd.total_lanes,
        "current_multiplier": curr_mult,
        "next_multiplier": next_mult,
        "potential_win": potential_win,
    })


@router.post("/finish")
def finish_game(
    data: FinishIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
):
    """Player reaches the finish line across all lanes safely."""
    with ROUND_LOCK:
        rnd = ACTIVE_ROUNDS.get(data.round_id)
        if not rnd or rnd.user_id != user.id or rnd.status != "ACTIVE":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Active game round not found.",
            )

        # Reaching the far side means crossing every lane, which the draw decides.
        if not _advance(rnd, rnd.total_lanes):
            return _lost_response(rnd)

        if rnd.current_lane < rnd.total_lanes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot finish: only {rnd.current_lane} of {rnd.total_lanes} lanes crossed."
                ),
            )

        final_multiplier = rnd.multipliers[-1]
        win_paisa = int(round(rnd.bet_paisa * final_multiplier))
        rnd.status = "WON"
        rnd.current_lane = rnd.total_lanes
        USER_ACTIVE_ROUND.pop(user.id, None)

    # Credit winnings atomically
    ref_id = f"cr_{rnd.round_id[:8]}_{uuid.uuid4().hex[:6]}_win"
    gross_profit = max(0, win_paisa - rnd.bet_paisa)
    calc, _ = settle_winning_bet(
        db=db,
        user_id=user.id,
        original_bet=rnd.bet_paisa,
        gross_profit=gross_profit,
        reference_type="chicken_road_win",
        reference_id=ref_id,
        game_slug="chicken_road",
        metadata={
            "round_id": rnd.round_id,
            "final_multiplier": final_multiplier,
            "difficulty": rnd.difficulty,
        },
    )
    win_paisa = calc.total_return
    db.commit()

    wallet = wallet_service.get_balance(db, user.id)

    return success_response({
        "round_id": rnd.round_id,
        "status": "WON",
        "multiplier": final_multiplier,
        "bet_amount": rnd.bet_paisa / 100,
        "won_amount": win_paisa / 100,
        "wallet_balance": (wallet.balance / 100) if wallet else 0.0,
    })


@router.post("/collision")
def report_collision(
    data: CollisionIn,
    user: User = Depends(require_user),
):
    """Chicken collided with a vehicle. Settle round as LOST."""
    with ROUND_LOCK:
        rnd = ACTIVE_ROUNDS.get(data.round_id)
        if not rnd or rnd.user_id != user.id or rnd.status != "ACTIVE":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Active game round not found.",
            )

        rnd.status = "LOST"
        USER_ACTIVE_ROUND.pop(user.id, None)

    return success_response({
        "round_id": rnd.round_id,
        "status": "LOST",
        "lane_index": data.lane_index,
        "bet_amount": rnd.bet_paisa / 100,
        "won_amount": 0.0,
    })


@router.post("/cashout")
def cashout_game(
    data: CashoutIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
):
    """Player cashes out accumulated winnings mid-game."""
    with ROUND_LOCK:
        rnd = ACTIVE_ROUNDS.get(data.round_id)
        if not rnd or rnd.user_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Active game round not found.",
            )

        if rnd.status != "ACTIVE":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot cash out round with status {rnd.status}.",
            )

        # A lane the client crossed just before cashing out still has to survive the draw.
        if data.lane_index is not None and not _advance(rnd, data.lane_index):
            return _lost_response(rnd)

        if rnd.current_lane == 0:
            # Cannot cash out before crossing any lane — bet is committed
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You must cross at least one lane before cashing out. Your bet is committed for this round.",
            )

        cashout_mult = rnd.multipliers[rnd.current_lane - 1]

        win_paisa = int(round(rnd.bet_paisa * cashout_mult))
        rnd.status = "CASHED_OUT"
        USER_ACTIVE_ROUND.pop(user.id, None)

    # Credit winnings atomically
    ref_id = f"cr_{rnd.round_id[:8]}_{uuid.uuid4().hex[:6]}_win"
    gross_profit = max(0, win_paisa - rnd.bet_paisa)
    calc, _ = settle_winning_bet(
        db=db,
        user_id=user.id,
        original_bet=rnd.bet_paisa,
        gross_profit=gross_profit,
        reference_type="chicken_road_win",
        reference_id=ref_id,
        game_slug="chicken_road",
        is_refund=(win_paisa >= rnd.bet_paisa and gross_profit == 0),
        metadata={
            "round_id": rnd.round_id,
            "cashout_multiplier": cashout_mult,
            "difficulty": rnd.difficulty,
        },
    )
    win_paisa = calc.total_return
    db.commit()

    wallet = wallet_service.get_balance(db, user.id)

    return success_response({
        "round_id": rnd.round_id,
        "status": "CASHED_OUT",
        "multiplier": cashout_mult,
        "bet_amount": rnd.bet_paisa / 100,
        "won_amount": win_paisa / 100,
        "wallet_balance": (wallet.balance / 100) if wallet else 0.0,
    })


def void_active_rounds() -> None:
    """On shutdown: rounds live in memory only, so refund every round still in
    play instead of letting its stake disappear with the process."""
    from ..database import SessionLocal
    from ..services.wager_service import reverse_wager

    with ROUND_LOCK:
        live = [r for r in ACTIVE_ROUNDS.values() if r.status == "ACTIVE"]
        for rnd in live:
            rnd.status = "VOID"
            USER_ACTIVE_ROUND.pop(rnd.user_id, None)
    db = SessionLocal()
    try:
        for rnd in live:
            try:
                wallet_service.credit_wallet(
                    db,
                    user_id=rnd.user_id,
                    amount=rnd.bet_paisa,
                    tx_type=WalletTransactionType.REFUND,
                    reference_type="chicken_road_void",
                    reference_id=rnd.round_id,
                    metadata={"round_id": rnd.round_id, "reason": "server_shutdown"},
                )
                reverse_wager(db, rnd.user_id, rnd.bet_paisa, "chicken_road")
                db.commit()
            except Exception:
                db.rollback()
    finally:
        db.close()
