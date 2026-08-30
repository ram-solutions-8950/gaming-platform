"""
Roulette Game Engine — Server-authoritative European Roulette (0-36).
Handles round lifecycles, timer countdowns, RNG winning number generation,
bet validation, payout calculations, and atomic wallet settlement.
"""

from __future__ import annotations

import asyncio
import copy
import json
import logging
import random
import threading
import time
from datetime import datetime, timezone, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional, Set, Tuple
from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from ...dependencies.database import SessionLocal
from ...models.transaction import WalletTransactionType
from ...models.user import User
from ...services.wallet_service import debit_wallet, credit_wallet, get_balance

logger = logging.getLogger(__name__)

# European Roulette configuration
RED_NUMBERS = {1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36}
BLACK_NUMBERS = {2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35}

# Payout multipliers: net multiplier (winnings = stake * multiplier, gross = stake * (multiplier + 1))
# Standard European roulette:
# Straight: 35 to 1
# Split: 17 to 1
# Street: 11 to 1
# Corner: 8 to 1
# Six line: 5 to 1
# Column: 2 to 1
# Dozen: 2 to 1
# Red/Black, Even/Odd, Low/High: 1 to 1
PAYOUT_MULTIPLIERS: Dict[str, int] = {
    "straight": 35,
    "split": 17,
    "street": 11,
    "corner": 8,
    "six_line": 5,
    "column": 2,
    "dozen": 2,
    "even_money": 1,
}

# Timing phases in seconds
BETTING_DURATION = 15     # 15 seconds betting window
STOP_DURATION = 2         # 2 seconds "Stop Betting" banner
SPIN_DURATION = 4         # 4 seconds spinning animation
RESULT_DURATION = 6       # 6 seconds result display and settlement

TOTAL_CYCLE = BETTING_DURATION + STOP_DURATION + SPIN_DURATION + RESULT_DURATION  # 27s


class BetItem:
    def __init__(self, bet_id: str, user_id: str, bet_type: str, target: str, amount_paise: int):
        self.bet_id = bet_id
        self.user_id = user_id
        self.bet_type = bet_type  # e.g. "straight", "dozen", "column", "red", "black", "even", "odd", "low", "high"
        self.target = str(target) # e.g. "17", "1st12", "col1", "red", etc.
        self.amount_paise = amount_paise
        self.win_paise = 0
        self.is_won = False


class RouletteRound:
    def __init__(self, round_id: str):
        self.round_id = round_id
        self.started_at = time.time()
        self.winning_number: Optional[int] = None
        self.winning_color: Optional[str] = None
        self.bets: List[BetItem] = []
        self.settled = False

    def elapsed(self) -> float:
        return time.time() - self.started_at

    def phase(self) -> str:
        t = self.elapsed()
        if t < BETTING_DURATION:
            return "BETTING"
        elif t < (BETTING_DURATION + STOP_DURATION):
            return "STOP_BETTING"
        elif t < (BETTING_DURATION + STOP_DURATION + SPIN_DURATION):
            return "SPINNING"
        else:
            return "RESULT"

    def seconds_remaining(self) -> int:
        p = self.phase()
        t = self.elapsed()
        if p == "BETTING":
            return max(0, int(BETTING_DURATION - t))
        elif p == "STOP_BETTING":
            return max(0, int(BETTING_DURATION + STOP_DURATION - t))
        elif p == "SPINNING":
            return max(0, int(BETTING_DURATION + STOP_DURATION + SPIN_DURATION - t))
        else:
            return max(0, int(TOTAL_CYCLE - t))


def check_bet_win(bet_type: str, target: str, winning_number: int) -> Tuple[bool, int]:
    """
    Returns (is_win, net_multiplier).
    """
    t = str(target).lower().strip()

    if bet_type == "straight":
        try:
            num = int(t)
            if num == winning_number:
                return True, 35
        except ValueError:
            pass
        return False, 0

    if winning_number == 0:
        # On European Roulette, only straight 0 wins. Outside bets lose.
        return False, 0

    is_red = winning_number in RED_NUMBERS
    is_black = winning_number in BLACK_NUMBERS
    is_even = (winning_number % 2 == 0)
    is_odd = (winning_number % 2 != 0)
    is_low = (1 <= winning_number <= 18)
    is_high = (19 <= winning_number <= 36)

    # Color
    if t in ("red", "r"):
        return is_red, 1
    if t in ("black", "b"):
        return is_black, 1

    # Even / Odd
    if t in ("even", "e"):
        return is_even, 1
    if t in ("odd", "o"):
        return is_odd, 1

    # Low / High
    if t in ("low", "1-18", "1 to 18"):
        return is_low, 1
    if t in ("high", "19-36", "19 to 36"):
        return is_high, 1

    # Dozens
    if t in ("1st12", "1st 12", "first12"):
        return (1 <= winning_number <= 12), 2
    if t in ("2nd12", "2nd 12", "second12"):
        return (13 <= winning_number <= 24), 2
    if t in ("3rd12", "3rd 12", "third12"):
        return (25 <= winning_number <= 36), 2

    # Columns:
    # Col 1: 1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34 (num % 3 == 1)
    # Col 2: 2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35 (num % 3 == 2)
    # Col 3: 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36 (num % 3 == 0)
    if t in ("col1", "col_1", "column1", "2to1_1"):
        return (winning_number % 3 == 1), 2
    if t in ("col2", "col_2", "column2", "2to1_2"):
        return (winning_number % 3 == 2), 2
    if t in ("col3", "col_3", "column3", "2to1_3"):
        return (winning_number % 3 == 0), 2

    # Split (two adjacent numbers comma or hyphen separated e.g. "1,2" or "1-2")
    if bet_type == "split":
        parts = [int(p.strip()) for p in t.replace("-", ",").split(",") if p.strip().isdigit()]
        if len(parts) == 2 and winning_number in parts:
            return True, 17
        return False, 0

    # Street (3 numbers row)
    if bet_type == "street":
        parts = [int(p.strip()) for p in t.replace("-", ",").split(",") if p.strip().isdigit()]
        if len(parts) == 3 and winning_number in parts:
            return True, 11
        return False, 0

    # Corner (4 numbers intersection)
    if bet_type == "corner":
        parts = [int(p.strip()) for p in t.replace("-", ",").split(",") if p.strip().isdigit()]
        if len(parts) == 4 and winning_number in parts:
            return True, 8
        return False, 0

    # Six Line (6 numbers)
    if bet_type == "six_line":
        parts = [int(p.strip()) for p in t.replace("-", ",").split(",") if p.strip().isdigit()]
        if len(parts) == 6 and winning_number in parts:
            return True, 5
        return False, 0

    return False, 0


class RouletteEngine:
    _instance: Optional[RouletteEngine] = None
    _lock = threading.Lock()

    @classmethod
    def get_instance(cls) -> RouletteEngine:
        with cls._lock:
            if cls._instance is None:
                cls._instance = RouletteEngine()
            return cls._instance

    def __init__(self):
        self.lock = threading.RLock()
        self.current_round = RouletteRound(str(uuid4()))
        self.history: List[Dict[str, Any]] = [
            {"number": 6, "color": "black"},
            {"number": 2, "color": "black"},
            {"number": 9, "color": "red"},
            {"number": 12, "color": "red"},
            {"number": 3, "color": "red"},
            {"number": 10, "color": "black"},
            {"number": 33, "color": "black"},
            {"number": 30, "color": "red"},
            {"number": 5, "color": "red"},
            {"number": 32, "color": "red"},
            {"number": 25, "color": "red"},
            {"number": 3, "color": "red"},
            {"number": 30, "color": "red"},
            {"number": 20, "color": "black"},
            {"number": 4, "color": "black"},
            {"number": 30, "color": "red"},
        ]
        self.ws_subscribers: Set[Any] = set()
        self._bg_thread_started = False
        self._start_background_ticker()

    def _start_background_ticker(self):
        if self._bg_thread_started:
            return
        self._bg_thread_started = True
        thread = threading.Thread(target=self._ticker_loop, daemon=True)
        thread.start()

    def _ticker_loop(self):
        while True:
            time.sleep(0.5)
            try:
                self.update_round_state()
            except Exception as e:
                logger.error(f"Error in roulette ticker loop: {e}", exc_info=True)

    def update_round_state(self):
        with self.lock:
            rnd = self.current_round
            elapsed = rnd.elapsed()

            # If spinning starts, decide winning number if not already set
            if elapsed >= (BETTING_DURATION + STOP_DURATION) and rnd.winning_number is None:
                rnd.winning_number = random.randint(0, 36)
                if rnd.winning_number == 0:
                    rnd.winning_color = "green"
                elif rnd.winning_number in RED_NUMBERS:
                    rnd.winning_color = "red"
                else:
                    rnd.winning_color = "black"

            # If in result phase and not yet settled, settle round and payout winners
            if elapsed >= (BETTING_DURATION + STOP_DURATION + SPIN_DURATION) and not rnd.settled:
                rnd.settled = True
                self._settle_round(rnd)

            # If cycle finished, record history and start new round
            if elapsed >= TOTAL_CYCLE:
                if rnd.winning_number is not None:
                    self.history.append({
                        "number": rnd.winning_number,
                        "color": rnd.winning_color
                    })
                    if len(self.history) > 30:
                        self.history.pop(0)

                self.current_round = RouletteRound(str(uuid4()))

    def _settle_round(self, rnd: RouletteRound):
        """Perform database transaction to settle bets and credit winnings."""
        win_num = rnd.winning_number
        if win_num is None:
            return

        db = SessionLocal()
        try:
            user_wins: Dict[str, int] = {}
            for b in rnd.bets:
                is_win, mult = check_bet_win(b.bet_type, b.target, win_num)
                if is_win:
                    # Gross win = stake + (stake * multiplier)
                    gross = b.amount_paise * (mult + 1)
                    b.is_won = True
                    b.win_paise = gross
                    user_wins[b.user_id] = user_wins.get(b.user_id, 0) + gross

            # Credit users
            for user_id_str, total_win in user_wins.items():
                if total_win > 0:
                    try:
                        uid = UUID(user_id_str)
                        credit_wallet(
                            db,
                            user_id=uid,
                            amount=total_win,
                            tx_type=WalletTransactionType.GAME_WIN,
                            reference_type="roulette_win",
                            reference_id=f"roulette_{rnd.round_id}_{uid}"
                        )
                        db.commit()
                    except Exception as exc:
                        db.rollback()
                        logger.error(f"Failed crediting roulette win to {user_id_str}: {exc}")
        finally:
            db.close()

    def get_state(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        with self.lock:
            rnd = self.current_round
            phase = rnd.phase()
            sec_left = rnd.seconds_remaining()

            my_bets = []
            my_bet_total_paise = 0
            total_bet_paise = sum(b.amount_paise for b in rnd.bets)

            # Simulated live active bets from other players for rich live atmosphere
            simulated_active_pool = 17020 * 100 + (total_bet_paise * 3)

            if user_id:
                for b in rnd.bets:
                    if b.user_id == str(user_id):
                        my_bets.append({
                            "bet_id": b.bet_id,
                            "bet_type": b.bet_type,
                            "target": b.target,
                            "amount_inr": b.amount_paise / 100,
                            "is_won": b.is_won,
                            "win_inr": b.win_paise / 100
                        })
                        my_bet_total_paise += b.amount_paise

            # VIP avatars data matching reference screenshots
            vip_players = [
                {
                    "name": "Mobile153687..",
                    "vip": "VIP 5",
                    "avatar": "winner",
                    "balance_inr": 51301,
                    "last_win": 6000 if phase == "RESULT" and rnd.winning_color == "red" else None
                },
                {
                    "name": "LIVE 72",
                    "vip": "VIP 5",
                    "avatar": "ban",
                    "balance_inr": 93987,
                    "last_win": 40000 if phase == "RESULT" and rnd.winning_number == 30 else None
                },
                {
                    "name": "Mobile209727..",
                    "vip": "VIP 6",
                    "avatar": "lady",
                    "balance_inr": 76800,
                    "last_win": None
                }
            ]

            return {
                "round_id": rnd.round_id,
                "phase": phase,
                "seconds_left": sec_left,
                "winning_number": rnd.winning_number if phase in ("SPINNING", "RESULT") else None,
                "winning_color": rnd.winning_color if phase in ("SPINNING", "RESULT") else None,
                "history": copy.deepcopy(self.history),
                "my_bets": my_bets,
                "my_total_bet_inr": my_bet_total_paise / 100,
                "total_bet_pool_inr": simulated_active_pool / 100,
                "vip_players": vip_players,
                "server_time": datetime.now(timezone.utc).isoformat()
            }

    def place_bets(self, db: Session, user: User, bets_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        with self.lock:
            rnd = self.current_round
            if rnd.phase() != "BETTING":
                raise ValueError("Betting is currently closed for this round.")

            # Calculate total amount required
            total_paise = 0
            parsed_bets: List[BetItem] = []
            for item in bets_data:
                amt = item.get("amount", 0)
                amt_paise = int(round(amt * 100))
                if amt_paise <= 0:
                    continue
                bet_type = item.get("bet_type", "straight")
                target = str(item.get("target", ""))
                parsed_bets.append(BetItem(
                    bet_id=str(uuid4()),
                    user_id=str(user.id),
                    bet_type=bet_type,
                    target=target,
                    amount_paise=amt_paise
                ))
                total_paise += amt_paise

            if total_paise <= 0:
                raise ValueError("No valid bets provided.")

            # Verify balance
            bal = get_balance(db, user.id)
            if not bal or bal.balance < total_paise:
                raise ValueError("Insufficient balance to place bets.")

            # Debit wallet atomically
            debit_wallet(
                db,
                user_id=user.id,
                amount=total_paise,
                tx_type=WalletTransactionType.GAME_ENTRY,
                reference_type="roulette_bet",
                reference_id=f"roulette_{rnd.round_id}_{uuid4()}"
            )
            db.commit()

            # Record bets
            rnd.bets.extend(parsed_bets)

            return {
                "success": True,
                "placed_count": len(parsed_bets),
                "total_debited_inr": total_paise / 100,
                "round_id": rnd.round_id
            }

    def clear_user_bets(self, db: Session, user: User) -> Dict[str, Any]:
        with self.lock:
            rnd = self.current_round
            if rnd.phase() != "BETTING":
                raise ValueError("Cannot clear bets once betting window has ended.")

            user_str = str(user.id)
            refund_paise = 0
            retained_bets: List[BetItem] = []

            for b in rnd.bets:
                if b.user_id == user_str:
                    refund_paise += b.amount_paise
                else:
                    retained_bets.append(b)

            if refund_paise > 0:
                credit_wallet(
                    db,
                    user_id=user.id,
                    amount=refund_paise,
                    tx_type=WalletTransactionType.REFUND,
                    reference_type="roulette_refund",
                    reference_id=f"roulette_clear_{rnd.round_id}_{uuid4()}"
                )
                db.commit()

            rnd.bets = retained_bets

            return {
                "success": True,
                "refunded_inr": refund_paise / 100
            }


roulette_engine = RouletteEngine.get_instance()
