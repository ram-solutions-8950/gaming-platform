"""
Chicken Road Arcade Road-Crossing Game Router.
Server-authoritative game logic with atomic wallet debit/credit integration.
"""

from __future__ import annotations
import uuid
import random
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
from ..utils.responses import success_response, error_response

router = APIRouter(prefix="/games/chicken-road", tags=["Chicken Road"])

DIFFICULTY_MULTIPLIERS = {
    "EASY": [1.01, 1.03, 1.06, 1.10, 1.15, 1.19, 1.24, 1.30, 1.40, 1.50],
    "MEDIUM": [1.03, 1.08, 1.15, 1.25, 1.38, 1.55, 1.75, 2.05, 2.45, 3.00],
    "HARD": [1.05, 1.15, 1.30, 1.55, 1.90, 2.40, 3.10, 4.20, 6.00, 10.00],
}

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

        final_multiplier = rnd.multipliers[-1]
        win_paisa = int(round(rnd.bet_paisa * final_multiplier))
        rnd.status = "WON"
        rnd.current_lane = rnd.total_lanes
        USER_ACTIVE_ROUND.pop(user.id, None)

    # Credit winnings atomically
    ref_id = f"cr_{rnd.round_id[:8]}_{uuid.uuid4().hex[:6]}_win"
    wallet_service.credit_wallet(
        db=db,
        user_id=user.id,
        amount=win_paisa,
        tx_type=WalletTransactionType.GAME_WIN,
        reference_type="chicken_road_win",
        reference_id=ref_id,
        metadata={
            "game": "chicken_road",
            "round_id": rnd.round_id,
            "bet_paisa": rnd.bet_paisa,
            "final_multiplier": final_multiplier,
            "won_amount": win_paisa / 100,
            "difficulty": rnd.difficulty,
        },
    )
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

        if rnd.current_lane == 0:
            # At start sidewalk, refund/cashout 1.00x
            cashout_mult = 1.0
        else:
            cashout_mult = rnd.multipliers[rnd.current_lane - 1]

        win_paisa = int(round(rnd.bet_paisa * cashout_mult))
        rnd.status = "CASHED_OUT"
        USER_ACTIVE_ROUND.pop(user.id, None)

    # Credit winnings atomically
    ref_id = f"cr_{rnd.round_id[:8]}_{uuid.uuid4().hex[:6]}_win"
    wallet_service.credit_wallet(
        db=db,
        user_id=user.id,
        amount=win_paisa,
        tx_type=WalletTransactionType.GAME_WIN,
        reference_type="chicken_road_win",
        reference_id=ref_id,
        metadata={
            "game": "chicken_road",
            "round_id": rnd.round_id,
            "bet_paisa": rnd.bet_paisa,
            "cashout_multiplier": cashout_mult,
            "won_amount": win_paisa / 100,
            "difficulty": rnd.difficulty,
        },
    )
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
