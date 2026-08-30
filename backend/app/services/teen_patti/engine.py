"""
Teen Patti Hand State Machine and Rules Engine.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

from ..rummy.errors import GameError, GameStateError, InvalidAction, NotYourTurn
from .bot_strategy import Action, decide_action, decide_see, decide_side_show_response
from .cards import Card, derive_seed, fresh_deck, new_server_seed, shuffled_deck
from .hand_rank import category_of, evaluate_hand


class Phase(str, Enum):
    WAITING = "waiting"
    BOOT = "boot"
    PLAYING = "playing"
    SHOWDOWN = "showdown"
    FINISHED = "finished"


class PlayerStatus(str, Enum):
    ACTIVE = "active"
    PACKED = "packed"
    LOST_SIDE_SHOW = "lost_side_show"
    SHOW_WINNER = "show_winner"
    SHOW_LOSER = "show_loser"


@dataclass
class GameConfig:
    boot_amount: int = 10
    max_players: int = 4
    turn_seconds: int = 15
    max_blind_rounds: int = 4
    pot_limit: Optional[int] = None
    max_stake: Optional[int] = None


@dataclass
class Seat:
    id: str
    name: str
    is_bot: bool = False
    cards: List[Card] = field(default_factory=list)
    seen: bool = False
    blind_count: int = 0
    status: PlayerStatus = PlayerStatus.ACTIVE
    total_bet: int = 0
    show_cards: bool = False

    @property
    def is_in_hand(self) -> bool:
        return self.status == PlayerStatus.ACTIVE


class TeenPattiHand:
    def __init__(self, config: GameConfig, server_seed: Optional[str] = None):
        self.config = config
        self.server_seed = server_seed or new_server_seed()
        self.client_seed: Optional[str] = None
        self.nonce: Optional[int] = None
        self.rng: random.Random = random.Random()

        self.phase: Phase = Phase.WAITING
        self.seats: List[Seat] = []
        self.pot: int = 0
        self.current_stake: int = config.boot_amount
        self.current_turn: int = 0
        self.dealer_seat: int = 0
        self.winner_seat: Optional[int] = None
        self.reason: Optional[str] = None
        self.last_action: Optional[Dict[str, Any]] = None
        self.is_settled: bool = False

    @property
    def is_full(self) -> bool:
        return len(self.seats) >= self.config.max_players

    def add_seat(self, user_id: str, name: str, is_bot: bool = False) -> int:
        if len(self.seats) >= self.config.max_players:
            raise GameError("table is full")
        if any(s.id == user_id for s in self.seats):
            raise GameError("player already seated")
        if self.phase != Phase.WAITING:
            raise GameError("hand in progress")
        seat = Seat(id=user_id, name=name, is_bot=is_bot)
        self.seats.append(seat)
        return len(self.seats) - 1

    def remove_seat(self, user_id: str) -> None:
        idx = self._seat_index(user_id)
        if idx is None:
            return
        if self.phase == Phase.PLAYING and self.seats[idx].is_in_hand:
            self.pack(user_id)
        self.seats.pop(idx)
        if len(self.seats) < 2 and self.phase == Phase.PLAYING:
            active = self._active_seats()
            if active:
                self._finish_hand(winner_idx=active[0], reason="All other players left")

    def start_hand(self, client_seed: str = "default", nonce: int = 0) -> None:
        if len(self.seats) < 2:
            raise GameError("need at least 2 players to start")
        self.client_seed = client_seed
        self.nonce = nonce
        seed_int = derive_seed(self.server_seed, client_seed, nonce)
        self.rng = random.Random(seed_int)

        self.pot = 0
        self.current_stake = self.config.boot_amount
        self.phase = Phase.PLAYING
        self.winner_seat = None
        self.reason = None
        self.is_settled = False

        deck = shuffled_deck(self.rng)
        for s in self.seats:
            s.cards = [deck.pop(), deck.pop(), deck.pop()]
            s.seen = False
            s.blind_count = 0
            s.status = PlayerStatus.ACTIVE
            s.total_bet = self.config.boot_amount
            s.show_cards = False
            self.pot += self.config.boot_amount

        # First turn is left of dealer
        self.current_turn = self._next_active_seat(self.dealer_seat)

    def _require_turn(self, user_id: str) -> int:
        if self.phase != Phase.PLAYING:
            raise GameStateError(f"not in playing phase (currently {self.phase})")
        idx = self._seat_index(user_id)
        if idx is None:
            raise InvalidAction("player not at table")
        if idx != self.current_turn:
            raise NotYourTurn("not your turn")
        if not self.seats[idx].is_in_hand:
            raise InvalidAction("player is not active in this hand")
        return idx

    def _seat_index(self, user_id: str) -> Optional[int]:
        for i, s in enumerate(self.seats):
            if s.id == user_id:
                return i
        return None

    def _active_seats(self) -> List[int]:
        return [i for i, s in enumerate(self.seats) if s.is_in_hand]

    def _next_active_seat(self, from_idx: int) -> int:
        n = len(self.seats)
        for step in range(1, n + 1):
            cand = (from_idx + step) % n
            if self.seats[cand].is_in_hand:
                return cand
        return from_idx

    def prev_seen_seat_index(self, from_idx: int) -> Optional[int]:
        n = len(self.seats)
        for step in range(1, n):
            cand = (from_idx - step + n) % n
            s = self.seats[cand]
            if s.is_in_hand:
                return cand if s.seen else None
        return None

    def see(self, user_id: str) -> None:
        idx = self._seat_index(user_id)
        if idx is None:
            raise InvalidAction("player not at table")
        s = self.seats[idx]
        if not s.is_in_hand:
            raise InvalidAction("player is packed")
        s.seen = True

    def bet(self, user_id: str, raise_: bool = False) -> Dict[str, Any]:
        idx = self._require_turn(user_id)
        s = self.seats[idx]

        if not s.seen and s.blind_count >= self.config.max_blind_rounds:
            s.seen = True

        if raise_:
            self.current_stake *= 2
            if self.config.max_stake and self.current_stake > self.config.max_stake:
                self.current_stake = self.config.max_stake

        multiplier = 2 if s.seen else 1
        bet_amount = self.current_stake * multiplier

        if not s.seen:
            s.blind_count += 1

        s.total_bet += bet_amount
        self.pot += bet_amount

        self.last_action = {
            "seat": idx,
            "user_id": user_id,
            "action": "raise" if raise_ else "chaal",
            "amount": bet_amount,
            "seen": s.seen,
            "pot": self.pot,
        }

        self._advance_turn()
        return self.last_action

    def pack(self, user_id: str) -> Dict[str, Any]:
        idx = self._require_turn(user_id)
        s = self.seats[idx]
        s.status = PlayerStatus.PACKED

        self.last_action = {
            "seat": idx,
            "user_id": user_id,
            "action": "pack",
            "pot": self.pot,
        }

        active = self._active_seats()
        if len(active) == 1:
            self._finish_hand(winner_idx=active[0], reason="All opponents packed")
        else:
            self._advance_turn()
        return self.last_action

    def show(self, user_id: str) -> Dict[str, Any]:
        idx = self._require_turn(user_id)
        active = self._active_seats()
        if len(active) != 2:
            raise InvalidAction(f"Show only allowed with exactly 2 active players (current: {len(active)})")

        s = self.seats[idx]
        multiplier = 2 if s.seen else 1
        show_cost = self.current_stake * multiplier
        s.total_bet += show_cost
        self.pot += show_cost

        other_idx = [i for i in active if i != idx][0]
        rank_caller = evaluate_hand(s.cards)
        rank_other = evaluate_hand(self.seats[other_idx].cards)

        # Ties go to the player who did NOT call the show
        if rank_caller > rank_other:
            winner_idx, loser_idx = idx, other_idx
        else:
            winner_idx, loser_idx = other_idx, idx

        for i in active:
            self.seats[i].show_cards = True
        self.seats[winner_idx].status = PlayerStatus.SHOW_WINNER
        self.seats[loser_idx].status = PlayerStatus.SHOW_LOSER

        self.phase = Phase.SHOWDOWN
        self._finish_hand(winner_idx=winner_idx, reason=f"Showdown: {category_of(self.seats[winner_idx].cards)}")
        return {
            "winner_seat": winner_idx,
            "loser_seat": loser_idx,
            "pot": self.pot,
            "reason": self.reason,
        }

    def side_show(self, user_id: str, accept: Optional[bool] = None, rng: Optional[random.Random] = None) -> Dict[str, Any]:
        idx = self._require_turn(user_id)
        s = self.seats[idx]
        if not s.seen:
            raise InvalidAction("must be seen to request side-show")

        target_idx = self.prev_seen_seat_index(idx)
        if target_idx is None:
            raise InvalidAction("no previous seen player to side-show with")

        target = self.seats[target_idx]

        # Side-show cost is equal to a seen chaal
        cost = self.current_stake * 2
        s.total_bet += cost
        self.pot += cost

        if accept is None:
            if target.is_bot:
                accept = decide_side_show_response(target.cards, target.seen, rng or self.rng)
            else:
                accept = True

        if not accept:
            self.last_action = {
                "seat": idx,
                "target_seat": target_idx,
                "action": "side_show_declined",
                "pot": self.pot,
            }
            self._advance_turn()
            return {"accepted": False, "target_seat": target_idx}

        # Compare hands privately between requester and target
        r_req = evaluate_hand(s.cards)
        r_tgt = evaluate_hand(target.cards)

        if r_req > r_tgt:
            loser_idx = target_idx
            winner_sub = idx
        else:
            # Ties go to target
            loser_idx = idx
            winner_sub = target_idx

        self.seats[loser_idx].status = PlayerStatus.LOST_SIDE_SHOW

        active = self._active_seats()
        if len(active) == 1:
            self._finish_hand(winner_idx=active[0], reason="Side-show elimination")
        else:
            self._advance_turn()

        return {
            "accepted": True,
            "requester_seat": idx,
            "target_seat": target_idx,
            "loser_seat": loser_idx,
            "winner_sub": winner_sub,
            "pot": self.pot,
        }

    def _advance_turn(self) -> None:
        self.current_turn = self._next_active_seat(self.current_turn)

    def _finish_hand(self, winner_idx: int, reason: str) -> None:
        self.phase = Phase.FINISHED
        self.winner_seat = winner_idx
        self.reason = reason
        self.dealer_seat = (self.dealer_seat + 1) % max(1, len(self.seats))

    def reset_for_next_hand(self) -> None:
        self.phase = Phase.WAITING
        self.pot = 0
        self.current_stake = self.config.boot_amount
        self.winner_seat = None
        self.reason = None
        self.last_action = None
        self.is_settled = False
        for s in self.seats:
            s.cards = []
            s.seen = False
            s.blind_count = 0
            s.status = PlayerStatus.ACTIVE
            s.total_bet = 0
            s.show_cards = False

    def as_dict(self, for_user_id: Optional[str] = None) -> Dict[str, Any]:
        viewer_idx = self._seat_index(for_user_id) if for_user_id else None
        return {
            "phase": self.phase.value,
            "pot": self.pot,
            "current_stake": self.current_stake,
            "current_turn": self.current_turn,
            "dealer_seat": self.dealer_seat,
            "winner_seat": self.winner_seat,
            "reason": self.reason,
            "seats": [
                {
                    "id": s.id,
                    "name": s.name,
                    "is_bot": s.is_bot,
                    "seen": s.seen,
                    "status": s.status.value,
                    "total_bet": s.total_bet,
                    "cards": [c.code for c in s.cards] if (s.show_cards or (viewer_idx is not None and viewer_idx == i and s.seen)) else None,
                    "card_count": len(s.cards),
                }
                for i, s in enumerate(self.seats)
            ],
            "last_action": self.last_action,
        }
