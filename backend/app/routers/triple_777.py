"""
Triple 777 Slot Machine Router.
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
from ..models.transaction import WalletTransactionType, WalletTransaction
from ..services import wallet_service
from ..utils.responses import success_response, error_response

router = APIRouter(prefix="/games/triple-777", tags=["Triple 777"])

# Symbol definitions and weights
SYMBOLS = ["7", "BAR", "CHERRY", "LEMON", "BELL", "STAR", "COIN"]
SYMBOL_WEIGHTS = [4, 8, 12, 16, 20, 20, 20]  # Weighted for realistic slot RNG

PAYTABLE_3_MATCH = {
    "7": 100,
    "BAR": 50,
    "CHERRY": 25,
    "LEMON": 15,
    "BELL": 10,
    "STAR": 8,
    "COIN": 5,
}
PAYTABLE_2_MATCH_MULTIPLIER = 2

MIN_BET = 10
MAX_BET = 10000

# Thread-safe persistent jackpot pool
JACKPOT_BASE_PAISE = 5000000  # ₹50,000.00 base jackpot pool
CURRENT_JACKPOT_PAISE = JACKPOT_BASE_PAISE
SPIN_LOCK = threading.Lock()

# In-memory history for quick retrieval per user (in addition to the permanent DB transaction ledger)
USER_SPIN_HISTORY: Dict[uuid.UUID, List[dict]] = {}


class SpinIn(BaseModel):
    stake: float = Field(..., ge=10, le=10000, description="Bet amount in INR")
    client_seed: Optional[str] = None
    nonce: Optional[int] = None


@router.get("/config")
def get_config():
    """Returns the authoritative game configuration and paytable."""
    return success_response({
        "min_bet": MIN_BET,
        "max_bet": MAX_BET,
        "symbols": SYMBOLS,
        "paytable": {
            **PAYTABLE_3_MATCH,
            "two_match": PAYTABLE_2_MATCH_MULTIPLIER,
        },
    })


@router.get("/jackpot")
def get_jackpot():
    """Returns the current server-authoritative progressive jackpot pool in INR."""
    with SPIN_LOCK:
        return success_response({
            "amount": round(CURRENT_JACKPOT_PAISE / 100, 2)
        })


@router.post("/spin")
def spin(
    data: SpinIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
):
    """
    Execute a server-authoritative slot spin:
    1. Validate stake and lock wallet
    2. Atomically debit GAME_ENTRY
    3. Generate 3-reel PRNG outcome
    4. Calculate paytable multipliers & jackpot
    5. If won, atomically credit GAME_WIN
    6. Return result and verified ledger balance
    """
    global CURRENT_JACKPOT_PAISE

    stake_inr = round(float(data.stake), 2)
    if stake_inr < MIN_BET or stake_inr > MAX_BET:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Stake must be between ₹{MIN_BET} and ₹{MAX_BET}",
        )

    bet_paisa = int(round(stake_inr * 100))
    round_id = str(uuid.uuid4())
    entry_ref_id = f"triple777_{round_id}_entry"
    win_ref_id = f"triple777_{round_id}_win"

    with SPIN_LOCK:
        # 1. Debit wallet atomically
        try:
            wallet_service.debit_wallet(
                db=db,
                user_id=user.id,
                amount=bet_paisa,
                tx_type=WalletTransactionType.GAME_ENTRY,
                reference_type="TRIPLE_777_ENTRY",
                reference_id=entry_ref_id,
                metadata={
                    "game": "triple_777",
                    "stake": stake_inr,
                    "round_id": round_id,
                },
            )
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )

        # Increment jackpot pool by 2% of bet
        jackpot_contribution = max(1, int(bet_paisa * 0.02))
        CURRENT_JACKPOT_PAISE += jackpot_contribution

        # 2. Server-authoritative PRNG reel spin
        reels = [
            random.choices(SYMBOLS, weights=SYMBOL_WEIGHTS, k=1)[0],
            random.choices(SYMBOLS, weights=SYMBOL_WEIGHTS, k=1)[0],
            random.choices(SYMBOLS, weights=SYMBOL_WEIGHTS, k=1)[0],
        ]

        # 3. Evaluate outcome
        won = False
        win_symbol: Optional[str] = None
        multiplier = 0.0
        tier = "loss"
        jackpot_won_inr = 0.0

        if reels[0] == reels[1] == reels[2]:
            # 3 of a kind match
            won = True
            win_symbol = reels[0]
            multiplier = float(PAYTABLE_3_MATCH.get(win_symbol, 10))
            if win_symbol == "7":
                tier = "jackpot"
                # Award jackpot bonus
                jackpot_won_inr = round(CURRENT_JACKPOT_PAISE / 100, 2)
                CURRENT_JACKPOT_PAISE = JACKPOT_BASE_PAISE
            elif multiplier >= 25:
                tier = "bigwin"
            else:
                tier = "win"
        elif reels[0] == reels[1] or reels[1] == reels[2] or reels[0] == reels[2]:
            # 2 of a kind match
            won = True
            multiplier = float(PAYTABLE_2_MATCH_MULTIPLIER)
            tier = "win"

        payout_inr = round(stake_inr * multiplier + jackpot_won_inr, 2)
        payout_paisa = int(round(payout_inr * 100))

        # 4. Credit wallet if won
        if won and payout_paisa > 0:
            try:
                wallet_service.credit_wallet(
                    db=db,
                    user_id=user.id,
                    amount=payout_paisa,
                    tx_type=WalletTransactionType.GAME_WIN,
                    reference_type="TRIPLE_777_WIN",
                    reference_id=win_ref_id,
                    metadata={
                        "game": "triple_777",
                        "stake": stake_inr,
                        "reels": reels,
                        "multiplier": multiplier,
                        "payout": payout_inr,
                        "tier": tier,
                        "jackpot_won": jackpot_won_inr,
                        "round_id": round_id,
                    },
                )
            except ValueError as e:
                # Duplicate prevention triggered
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Settlement failed: {str(e)}",
                )

        # Commit all wallet mutations (debit and optional win credit) atomically
        db.commit()

        # 5. Fetch updated balance from authoritative wallet
        wallet = wallet_service.get_balance(db, user.id)
        current_balance_inr = round((wallet.balance / 100), 2) if wallet else 0.0

        history_item = {
            "round_code": f"T777-{round_id[:8].upper()}",
            "stake": stake_inr,
            "reels": reels,
            "won": won,
            "status": "WON" if won else "LOST",
            "multiplier": multiplier,
            "payout": payout_inr,
            "jackpot_payout": jackpot_won_inr,
            "balance_after": current_balance_inr,
            "created_at": uuid.uuid1().time,
        }

        if user.id not in USER_SPIN_HISTORY:
            USER_SPIN_HISTORY[user.id] = []
        USER_SPIN_HISTORY[user.id].insert(0, history_item)
        if len(USER_SPIN_HISTORY[user.id]) > 50:
            USER_SPIN_HISTORY[user.id].pop()

        return success_response({
            "round_id": round_id,
            "round_code": f"T777-{round_id[:8].upper()}",
            "reels": reels,
            "won": won,
            "symbol": win_symbol,
            "multiplier": multiplier,
            "payout": payout_inr,
            "tier": tier,
            "balance": current_balance_inr,
            "jackpot_won": jackpot_won_inr,
            "jackpot_amount": round(CURRENT_JACKPOT_PAISE / 100, 2),
        })


@router.get("/history")
def get_history(
    user: User = Depends(require_user),
):
    """Retrieve the recent spin history for the authenticated user."""
    with SPIN_LOCK:
        items = USER_SPIN_HISTORY.get(user.id, [])
        return success_response(items)
