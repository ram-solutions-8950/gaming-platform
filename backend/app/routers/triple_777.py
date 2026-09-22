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
from ..services.settlement_service import settle_winning_bet
from ..utils.responses import success_response, error_response

router = APIRouter(prefix="/games/triple-777", tags=["Triple 777"])

# Symbol definitions and weights
SYMBOLS = ["7", "BAR", "CHERRY", "LEMON", "BELL", "STAR", "COIN"]
# Weighted for balanced slot RTP; '7' weight is 1 for high-volatility jackpot hits
SYMBOL_WEIGHTS = [1, 6, 11, 16, 22, 22, 22]

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
MAX_BET = 100
ALLOWED_BETS = [10, 20, 50, 100]

# Thread-safe persistent jackpot pool
JACKPOT_BASE_PAISE = 5000000  # ₹50,000.00 base jackpot pool
CURRENT_JACKPOT_PAISE = JACKPOT_BASE_PAISE
SPIN_LOCK = threading.Lock()

# In-memory history for quick retrieval per user (in addition to the permanent DB transaction ledger)
USER_SPIN_HISTORY: Dict[uuid.UUID, List[dict]] = {}

# --- Win-ratio control -------------------------------------------------------
# House requirement: a player wins roughly 2 spins out of every 10.
TARGET_WIN_RATIO = 0.20
# Chance that an allowed win is a 3-of-a-kind rather than a 2-of-a-kind pair.
THREE_MATCH_SHARE = 0.12

# Lifetime spin/win counters per user, seeded from the ledger on first use so
# the ratio survives a process restart.
USER_SPIN_STATS: Dict[uuid.UUID, Dict[str, int]] = {}


def _get_user_stats(db: Session, user_id: uuid.UUID) -> Dict[str, int]:
    """Return {"spins", "wins"} for a user, seeding from the ledger if needed."""
    stats = USER_SPIN_STATS.get(user_id)
    if stats is not None:
        return stats

    spins = db.query(WalletTransaction).filter(
        WalletTransaction.user_id == user_id,
        WalletTransaction.reference_type == "TRIPLE_777_ENTRY",
    ).count()
    wins = db.query(WalletTransaction).filter(
        WalletTransaction.user_id == user_id,
        WalletTransaction.reference_type == "TRIPLE_777_WIN",
    ).count()

    stats = {"spins": int(spins), "wins": int(wins)}
    USER_SPIN_STATS[user_id] = stats
    return stats


def _should_win(stats: Dict[str, int]) -> bool:
    """Decide whether the upcoming spin is allowed to win.

    The player is held to ``TARGET_WIN_RATIO`` (2 wins in 10) over their spin
    history. ``deficit`` is how many wins they are behind that pace:

    * a full win ahead of pace  -> the spin is forced to lose;
    * within one win of pace    -> wins at roughly the base rate, so they land
      at unpredictable positions instead of on a fixed cadence;
    * a full win behind pace    -> probability climbs towards certainty so the
      ratio is pulled back up.
    """
    spins_after = stats["spins"] + 1
    deficit = spins_after * TARGET_WIN_RATIO - stats["wins"]

    if deficit <= -1.0:
        return False
    if deficit >= 1.0:
        win_prob = min(1.0, 0.35 + 0.5 * deficit)
    else:
        win_prob = max(0.0, TARGET_WIN_RATIO * (1.0 + deficit))

    return random.random() < win_prob


def _pick_symbol(pool: List[str]) -> str:
    """Weighted pick from a subset of SYMBOLS."""
    weights = [SYMBOL_WEIGHTS[SYMBOLS.index(sym)] for sym in pool]
    return random.choices(pool, weights=weights, k=1)[0]


def _build_reels(should_win: bool) -> List[str]:
    """Generate a reel outcome that matches the requested win/loss decision."""
    if not should_win:
        # Three distinct symbols -> no 3-match and no pair, guaranteed loss.
        first = _pick_symbol(list(SYMBOLS))
        pool = [s for s in SYMBOLS if s != first]
        second = _pick_symbol(pool)
        pool = [s for s in pool if s != second]
        third = _pick_symbol(pool)
        reels = [first, second, third]
        random.shuffle(reels)
        return reels

    if random.random() < THREE_MATCH_SHARE:
        sym = _pick_symbol(list(SYMBOLS))
        return [sym, sym, sym]

    # Two of a kind: a matching pair plus one different symbol.
    pair_sym = _pick_symbol(list(SYMBOLS))
    odd_sym = _pick_symbol([s for s in SYMBOLS if s != pair_sym])
    reels = [pair_sym, pair_sym, odd_sym]
    random.shuffle(reels)
    return reels


class SpinIn(BaseModel):
    stake: float = Field(..., ge=10, le=100, description="Bet amount in INR (10, 20, 50, 100)")
    client_seed: Optional[str] = None
    nonce: Optional[int] = None


@router.get("/config")
def get_config():
    """Returns the authoritative game configuration and paytable."""
    return success_response({
        "min_bet": MIN_BET,
        "max_bet": MAX_BET,
        "bet_options": ALLOWED_BETS,
        "symbols": SYMBOLS,
        "paytable": {
            **PAYTABLE_3_MATCH,
            "two_match": PAYTABLE_2_MATCH_MULTIPLIER,
        },
        "target_win_ratio": TARGET_WIN_RATIO,
        "jackpot_display_only": True,
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

        # 2. Server-authoritative reel spin, capped at the house win ratio
        stats = _get_user_stats(db, user.id)
        allow_win = _should_win(stats)
        reels = _build_reels(allow_win)

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
            # Jackpot is display-only — never awarded to users
            if win_symbol == "7":
                tier = "bigwin"
                # jackpot pool continues to grow for display purposes only
            elif multiplier >= 25:
                tier = "bigwin"
            else:
                tier = "win"
        elif reels[0] == reels[1] or reels[1] == reels[2] or reels[0] == reels[2]:
            # 2 of a kind payline match (left pair, right pair, or split pair)
            won = True
            if reels[0] == reels[1]:
                win_symbol = reels[0]
            elif reels[1] == reels[2]:
                win_symbol = reels[1]
            else:
                win_symbol = reels[0]
            multiplier = float(PAYTABLE_2_MATCH_MULTIPLIER)
            tier = "win"

        payout_inr = round(stake_inr * multiplier + jackpot_won_inr, 2)
        payout_paisa = int(round(payout_inr * 100))

        # 4. Credit wallet if won
        if won and payout_paisa > 0:
            gross_profit = max(0, payout_paisa - bet_paisa)
            try:
                calc, _ = settle_winning_bet(
                    db=db,
                    user_id=user.id,
                    original_bet=bet_paisa,
                    gross_profit=gross_profit,
                    reference_type="TRIPLE_777_WIN",
                    reference_id=win_ref_id,
                    game_slug="triple_777",
                    metadata={
                        "stake": stake_inr,
                        "reels": reels,
                        "multiplier": multiplier,
                        "tier": tier,
                        "jackpot_won": jackpot_won_inr,
                        "round_id": round_id,
                    },
                )
                payout_paisa = calc.total_return
                payout_inr = round(payout_paisa / 100, 2)
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

        # Keep the win-ratio counters in step with what actually settled.
        stats["spins"] += 1
        if won:
            stats["wins"] += 1

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
