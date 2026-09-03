"""
Chicken Road Arcade Road-Crossing Game Router.
Server-authoritative game logic with atomic wallet debit/credit integration.
"""

from __future__ import annotations
import uuid
import random
import threading
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..dependencies.database import get_db
from ..security.permissions import require_user
from ..models.user import User
from ..models.transaction import WalletTransactionType
from ..services import wallet_service
from ..services.settlement_service import settle_winning_bet, calculate_winning_settlement
from ..utils.responses import success_response, error_response

router = APIRouter(prefix="/games/chicken-road", tags=["Chicken Road"])

# Multiplier progression: the game starts at 1.00x, Road 1 is worth 1.00x, and every
# road crossed AFTER that adds +0.03x.
#   currentMultiplier = 1 + ((successfulCrossings - 1) * 0.03)
# Road 1 = 1.00x, Road 2 = 1.03x, Road 3 = 1.06x, Road 4 = 1.09x, ... continuing the
# same step for every subsequent road. Same formula applies to every difficulty tier
# so the risk is entirely in how many roads the player chooses to cross, not a
# per-tier curve. multipliers[i] (0-indexed) is the payout for having crossed road i+1.
MULTIPLIER_STEP = Decimal("0.03")
TOTAL_LANES = 10


def _build_multiplier_table(count: int, step: Decimal = MULTIPLIER_STEP) -> List[float]:
    """Formula-driven multiplier table, quantized to 2dp via Decimal to avoid float drift."""
    return [
        float((Decimal("1") + step * i).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        for i in range(count)
    ]


_LANE_MULTIPLIERS = _build_multiplier_table(TOTAL_LANES)
DIFFICULTY_MULTIPLIERS = {
    "EASY": _LANE_MULTIPLIERS,
    "MEDIUM": _LANE_MULTIPLIERS,
    "HARD": _LANE_MULTIPLIERS,
}


def _payout_paisa(bet_paisa: int, multiplier: float) -> int:
    """Total return in paise for a given multiplier, computed via Decimal for exactness."""
    return int(
        (Decimal(bet_paisa) * Decimal(str(multiplier))).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    )


def _preview_total_return_paisa(db: Session, bet_paisa: int, multiplier: float) -> int:
    """Exact preview (read-only, no wallet/DB side effects) of what /cashout or
    /finish would actually pay right now at this multiplier — routed through the
    SAME calculate_winning_settlement() used by real settlement (including
    whatever platform winning fee is currently configured), so the previewed
    amount and the real payout can never drift apart."""
    win_paisa = _payout_paisa(bet_paisa, multiplier)
    gross_profit = max(0, win_paisa - bet_paisa)
    calc = calculate_winning_settlement(
        db=db,
        original_bet=bet_paisa,
        gross_profit=gross_profit,
        is_refund=(win_paisa >= bet_paisa and gross_profit == 0),
    )
    return calc.total_return

class ActiveChickenRound:
    def __init__(self, round_id: str, user_id: uuid.UUID, bet_paisa: int, difficulty: str = "EASY"):
        self.round_id = round_id
        self.user_id = user_id
        self.bet_paisa = bet_paisa
        self.difficulty = difficulty if difficulty in DIFFICULTY_MULTIPLIERS else "EASY"
        self.multipliers = DIFFICULTY_MULTIPLIERS[self.difficulty]
        self.total_lanes = len(self.multipliers)
        self.current_lane = 0  # 0 = starting sidewalk, 1..total_lanes
        self.status = "ACTIVE"  # "ACTIVE", "WON", "LOST", "CASHED_OUT"
        self.created_at = uuid.uuid1().time

# In-memory active game state storage with thread-safe lock
ACTIVE_ROUNDS: Dict[str, ActiveChickenRound] = {}
USER_ACTIVE_ROUND: Dict[uuid.UUID, str] = {}
ROUND_LOCK = threading.Lock()


class StartGameIn(BaseModel):
    bet_amount: float = Field(..., ge=1, le=50000, description="Bet amount in INR")
    difficulty: Optional[str] = Field("EASY", description="Game difficulty (EASY, MEDIUM, HARD)")


class CrossLaneIn(BaseModel):
    round_id: str
    lane_index: int = Field(..., ge=1, le=20)


class FinishIn(BaseModel):
    round_id: str


class CollisionIn(BaseModel):
    round_id: str
    lane_index: int = Field(..., ge=1, le=20)


class CashoutIn(BaseModel):
    round_id: str


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
                "potential_win": (_preview_total_return_paisa(db, rnd.bet_paisa, curr_mult) / 100) if rnd.current_lane > 0 else rnd.bet_paisa / 100,
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
    if bet_paisa < 100:  # Minimum ₹1
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Minimum bet is ₹1.00",
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
    db: Session = Depends(get_db),
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

        rnd.current_lane = max(rnd.current_lane, data.lane_index)
        curr_mult = rnd.multipliers[rnd.current_lane - 1]
        next_mult = rnd.multipliers[rnd.current_lane] if rnd.current_lane < rnd.total_lanes else rnd.multipliers[-1]
        potential_win = _preview_total_return_paisa(db, rnd.bet_paisa, curr_mult) / 100

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

        final_multiplier = rnd.multipliers[-1]
        win_paisa = _payout_paisa(rnd.bet_paisa, final_multiplier)
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

        # Backend is authoritative: never trust the frontend's Cash Out button state.
        # A round can only be cashed out after at least one lane has actually been
        # crossed (and recorded server-side via /cross-lane), never at the start pad.
        if rnd.current_lane == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cross at least one lane before cashing out.",
            )

        cashout_mult = rnd.multipliers[rnd.current_lane - 1]
        win_paisa = _payout_paisa(rnd.bet_paisa, cashout_mult)
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
