import math
import time
from typing import List, Dict, Any, Optional, Tuple
from .cards import Card, Deck
from .evaluator import evaluate_best_hand, EvaluatedHand
from .hand_rank import HandCategory

class PokerPlayerState:
    def __init__(self, user_id: str, username: str, seat_index: int, stack: int, is_bot: bool = False):
        self.user_id = user_id
        self.username = username
        self.seat_index = seat_index
        self.stack = stack  # Stack in Paise or virtual chips
        self.hole_cards: List[Card] = []
        self.current_bet = 0  # Bet contributed in current betting round
        self.total_bet_in_hand = 0  # Total contributed in this entire hand
        self.is_folded = False
        self.is_all_in = False
        self.is_sitting_out = False
        self.is_bot = is_bot
        self.auto_cashout_multiplier: Optional[float] = None
        self.last_action: Optional[str] = None

    def reset_for_hand(self):
        self.hole_cards = []
        self.current_bet = 0
        self.total_bet_in_hand = 0
        self.is_folded = False
        self.is_all_in = False
        self.last_action = None

    def to_dict(self, for_user_id: Optional[str] = None, reveal_cards: bool = False) -> Dict[str, Any]:
        """Strict private hole card security: only include hole_cards if for_user_id matches or reveal_cards is true."""
        show_cards = reveal_cards or (for_user_id is not None and for_user_id == self.user_id)
        return {
            "user_id": self.user_id,
            "username": self.username,
            "seat_index": self.seat_index,
            "stack": self.stack,
            "current_bet": self.current_bet,
            "total_bet_in_hand": self.total_bet_in_hand,
            "is_folded": self.is_folded,
            "is_all_in": self.is_all_in,
            "is_sitting_out": self.is_sitting_out,
            "is_bot": self.is_bot,
            "last_action": self.last_action,
            "hole_cards": [c.to_str() for c in self.hole_cards] if show_cards and self.hole_cards else None,
        }

class SidePot:
    def __init__(self, amount: int, eligible_user_ids: List[str]):
        self.amount = amount
        self.eligible_user_ids = eligible_user_ids

class PokerEngine:
    def __init__(self, table_id: str, is_practice: bool = False, small_blind: int = 100, big_blind: int = 200, max_players: int = 6):
        self.table_id = table_id
        self.is_practice = is_practice
        self.small_blind = small_blind
        self.big_blind = big_blind
        self.max_players = max_players

        self.players: List[PokerPlayerState] = []
        self.deck = Deck()
        self.community_cards: List[Card] = []

        self.phase: str = 'WAITING'  # WAITING, PRE_FLOP, FLOP, TURN, RIVER, SHOWDOWN, SETTLEMENT
        self.hand_id: Optional[str] = None
        self.dealer_seat_idx: int = 0
        self.current_turn_seat_idx: Optional[int] = None
        self.current_high_bet: int = 0
        self.min_raise_amount: int = big_blind
        self.pot: int = 0
        self.side_pots: List[SidePot] = []
        self.winners_summary: List[Dict[str, Any]] = []
        self.turn_start_time: float = time.time()
        self.turn_duration: int = 15  # 15 seconds per turn
        self.hand_nonce: int = 0
        self.action_history: List[Dict[str, Any]] = []

    def get_player_by_id(self, user_id: str) -> Optional[PokerPlayerState]:
        for p in self.players:
            if p.user_id == user_id:
                return p
        return None

    def add_player(self, user_id: str, username: str, buy_in_amount: int, is_bot: bool = False) -> Tuple[bool, str]:
        if len(self.players) >= self.max_players:
            return False, "Table is full"
        if self.get_player_by_id(user_id):
            return False, "Already seated at table"

        # Occupy first available seat
        taken_seats = {p.seat_index for p in self.players}
        seat_index = 0
        while seat_index in taken_seats:
            seat_index += 1

        player = PokerPlayerState(user_id, username, seat_index, buy_in_amount, is_bot=is_bot)
        self.players.append(player)
        return True, "Successfully seated"

    def remove_player(self, user_id: str) -> Tuple[bool, str, int]:
        player = self.get_player_by_id(user_id)
        if not player:
            return False, "Player not at table", 0

        remaining_stack = player.stack
        if self.phase not in ['WAITING', 'SETTLEMENT'] and not player.is_folded:
            # Fold player if hand is active
            self.process_action(user_id, 'fold')

        self.players = [p for p in self.players if p.user_id != user_id]
        if len(self.players) < 2 and self.phase not in ['WAITING', 'SETTLEMENT']:
            self.phase = 'WAITING'

        return True, "Player left table", remaining_stack

    def get_active_unfolded_players(self) -> List[PokerPlayerState]:
        return [p for p in self.players if not p.is_folded and not p.is_sitting_out]

    def get_active_can_act_players(self) -> List[PokerPlayerState]:
        return [p for p in self.players if not p.is_folded and not p.is_all_in and not p.is_sitting_out]

    def start_hand(self) -> Tuple[bool, str]:
        active_players = [p for p in self.players if p.stack > 0 and not p.is_sitting_out]
        if len(active_players) < 2:
            self.phase = 'WAITING'
            return False, "Need at least 2 active players to start hand"

        self.hand_nonce += 1
        self.hand_id = f"pk_{self.table_id}_{self.hand_nonce}_{int(time.time())}"
        self.community_cards = []
        self.pot = 0
        self.side_pots = []
        self.winners_summary = []
        self.action_history = []

        # Reset all player states
        for p in self.players:
            p.reset_for_hand()

        # Advance dealer button
        seated_sorted = sorted(active_players, key=lambda p: p.seat_index)
        dealer_pos = 0
        for i, p in enumerate(seated_sorted):
            if p.seat_index > self.dealer_seat_idx:
                dealer_pos = i
                break
        self.dealer_seat_idx = seated_sorted[dealer_pos].seat_index

        # Determine Small Blind and Big Blind seats
        if len(seated_sorted) == 2:
            # Heads Up: Dealer is SB, other player is BB
            sb_player = seated_sorted[dealer_pos]
            bb_player = seated_sorted[(dealer_pos + 1) % 2]
        else:
            sb_player = seated_sorted[(dealer_pos + 1) % len(seated_sorted)]
            bb_player = seated_sorted[(dealer_pos + 2) % len(seated_sorted)]

        # Post Blinds
        self.post_blind(sb_player, self.small_blind)
        self.post_blind(bb_player, self.big_blind)

        self.current_high_bet = max(sb_player.current_bet, bb_player.current_bet)
        self.min_raise_amount = self.big_blind

        # Deal cards
        self.deck = Deck()
        self.deck.shuffle()
        for p in active_players:
            p.hole_cards = self.deck.deal(2)

        self.phase = 'PRE_FLOP'

        # Set first action turn
        if len(seated_sorted) == 2:
            # Heads Up pre-flop: Dealer (SB) acts first
            first_act_player = sb_player
        else:
            # 3+ players: Player left of BB acts first
            bb_idx = seated_sorted.index(bb_player)
            first_act_player = seated_sorted[(bb_idx + 1) % len(seated_sorted)]

        self.current_turn_seat_idx = first_act_player.seat_index
        self.turn_start_time = time.time()

        return True, "Hand started"

    def post_blind(self, player: PokerPlayerState, blind_amount: int):
        actual_blind = min(player.stack, blind_amount)
        player.stack -= actual_blind
        player.current_bet += actual_blind
        player.total_bet_in_hand += actual_blind
        self.pot += actual_blind
        if player.stack == 0:
            player.is_all_in = True

    def process_action(self, user_id: str, action: str, amount: int = 0, action_id: Optional[str] = None) -> Tuple[bool, str]:
        player = self.get_player_by_id(user_id)
        if not player:
            return False, "Player not found at table"

        # Server-authoritative turn enforcement
        if self.current_turn_seat_idx != player.seat_index:
            return False, "Not your turn"

        if player.is_folded or player.is_all_in:
            return False, "Player cannot act"

        action = action.lower().strip()
        call_amount = self.current_high_bet - player.current_bet

        if action == 'fold':
            player.is_folded = True
            player.last_action = 'FOLD'
        elif action == 'check':
            if call_amount > 0:
                return False, f"Cannot check, must call {call_amount}"
            player.last_action = 'CHECK'
        elif action == 'call':
            if call_amount <= 0:
                player.last_action = 'CHECK'
            else:
                pay = min(player.stack, call_amount)
                player.stack -= pay
                player.current_bet += pay
                player.total_bet_in_hand += pay
                self.pot += pay
                if player.stack == 0:
                    player.is_all_in = True
                player.last_action = 'CALL'
        elif action in ['bet', 'raise', 'all_in']:
            if action == 'all_in' or amount >= player.stack + player.current_bet:
                total_put = player.stack + player.current_bet
                added = player.stack
                player.stack = 0
                player.current_bet = total_put
                player.total_bet_in_hand += added
                self.pot += added
                player.is_all_in = True
                if total_put > self.current_high_bet:
                    self.min_raise_amount = max(self.big_blind, total_put - self.current_high_bet)
                    self.current_high_bet = total_put
                player.last_action = 'ALL-IN'
            else:
                # Bet or Raise to specific target amount
                if amount < self.current_high_bet + self.min_raise_amount:
                    return False, f"Minimum raise target is {self.current_high_bet + self.min_raise_amount}"
                additional_needed = amount - player.current_bet
                if additional_needed > player.stack:
                    return False, "Insufficient stack for raise"

                player.stack -= additional_needed
                player.total_bet_in_hand += additional_needed
                self.pot += additional_needed
                self.min_raise_amount = amount - self.current_high_bet
                player.current_bet = amount
                self.current_high_bet = amount
                player.last_action = 'RAISE'
        else:
            return False, f"Invalid action: {action}"

        self.action_history.append({
            "user_id": user_id,
            "action": player.last_action,
            "amount": amount,
            "action_id": action_id,
            "timestamp": time.time(),
        })

        # Advance betting round or turn
        self.advance_hand_state()
        return True, "Action accepted"

    def advance_hand_state(self):
        active_unfolded = self.get_active_unfolded_players()
        if len(active_unfolded) <= 1:
            # Everyone else folded -> Single winner by default
            self.settle_default_winner(active_unfolded[0])
            return

        can_act = self.get_active_can_act_players()
        # Check if betting round is complete
        # Round complete if all non-folded non-all-in players have matched current_high_bet
        bets_equal = all(p.current_bet == self.current_high_bet for p in can_act)
        acted_this_round = all(p.last_action is not None for p in can_act)

        if (bets_equal and acted_this_round) or len(can_act) == 0:
            # Move to next phase
            self.next_phase()
        else:
            # Advance turn to next available player
            self.advance_turn()

    def advance_turn(self):
        seated_sorted = sorted(self.players, key=lambda p: p.seat_index)
        curr_idx = -1
        for i, p in enumerate(seated_sorted):
            if p.seat_index == self.current_turn_seat_idx:
                curr_idx = i
                break

        for k in range(1, len(seated_sorted) + 1):
            next_player = seated_sorted[(curr_idx + k) % len(seated_sorted)]
            if not next_player.is_folded and not next_player.is_all_in and not next_player.is_sitting_out:
                self.current_turn_seat_idx = next_player.seat_index
                self.turn_start_time = time.time()
                return

    def next_phase(self):
        # Reset current_bet for next betting round
        for p in self.players:
            p.current_bet = 0
        self.current_high_bet = 0
        self.min_raise_amount = self.big_blind

        if self.phase == 'PRE_FLOP':
            self.phase = 'FLOP'
            self.community_cards.extend(self.deck.deal(3))
        elif self.phase == 'FLOP':
            self.phase = 'TURN'
            self.community_cards.extend(self.deck.deal(1))
        elif self.phase == 'TURN':
            self.phase = 'RIVER'
            self.community_cards.extend(self.deck.deal(1))
        elif self.phase == 'RIVER':
            self.phase = 'SHOWDOWN'
            self.evaluate_showdown()
            return

        can_act = self.get_active_can_act_players()
        if len(can_act) <= 1:
            # Run out remaining community cards if everyone is all-in
            while len(self.community_cards) < 5:
                self.community_cards.extend(self.deck.deal(1))
            self.phase = 'SHOWDOWN'
            self.evaluate_showdown()
            return

        # Next phase first actor: First active player after dealer button
        seated_sorted = sorted(self.players, key=lambda p: p.seat_index)
        dealer_pos = 0
        for i, p in enumerate(seated_sorted):
            if p.seat_index == self.dealer_seat_idx:
                dealer_pos = i
                break

        for k in range(1, len(seated_sorted) + 1):
            next_player = seated_sorted[(dealer_pos + k) % len(seated_sorted)]
            if not next_player.is_folded and not next_player.is_all_in and not next_player.is_sitting_out:
                self.current_turn_seat_idx = next_player.seat_index
                self.turn_start_time = time.time()
                break

    def evaluate_showdown(self):
        self.current_turn_seat_idx = None
        active_unfolded = self.get_active_unfolded_players()

        # Evaluate hands for each player
        player_evals: Dict[str, EvaluatedHand] = {}
        for p in active_unfolded:
            hand_cards = p.hole_cards + self.community_cards
            player_evals[p.user_id] = evaluate_best_hand(hand_cards)

        # Side Pot & Main Pot Distribution Algorithm
        # Calculate distinct contribution levels
        contribs = sorted(list({p.total_bet_in_hand for p in self.players if p.total_bet_in_hand > 0}))
        prev_level = 0
        pot_layers = []

        for level in contribs:
            layer_amount = 0
            eligible = []
            for p in self.players:
                contributed_at_level = min(p.total_bet_in_hand - prev_level, level - prev_level)
                if contributed_at_level > 0:
                    layer_amount += contributed_at_level
                if p.total_bet_in_hand >= level and not p.is_folded:
                    eligible.append(p)
            if layer_amount > 0 and eligible:
                pot_layers.append((layer_amount, eligible))
            prev_level = level

        payout_map: Dict[str, int] = {p.user_id: 0 for p in self.players}
        winners_info = []

        for pot_amount, eligible_players in pot_layers:
            # Find best hand among eligible players
            best_score = max(player_evals[p.user_id] for p in eligible_players)
            winners = [p for p in eligible_players if player_evals[p.user_id] == best_score]

            share = pot_amount // len(winners)
            remainder = pot_amount % len(winners)

            for w in winners:
                payout_map[w.user_id] += share

            # Distribute remainder chip to player closest left of dealer
            if remainder > 0:
                payout_map[winners[0].user_id] += remainder

            for w in winners:
                winners_info.append({
                    "user_id": w.user_id,
                    "username": w.username,
                    "amount": share,
                    "hand_description": player_evals[w.user_id].description,
                    "best_five": [c.to_str() for c in player_evals[w.user_id].best_five],
                })

        # Apply payouts to stacks
        for p in self.players:
            p.stack += payout_map[p.user_id]

        self.winners_summary = winners_info
        self.phase = 'SETTLEMENT'

    def settle_default_winner(self, winner: PokerPlayerState):
        self.current_turn_seat_idx = None
        winner.stack += self.pot
        self.winners_summary = [{
            "user_id": winner.user_id,
            "username": winner.username,
            "amount": self.pot,
            "hand_description": "Won by fold",
            "best_five": [],
        }]
        self.phase = 'SETTLEMENT'

    def get_public_state(self, for_user_id: Optional[str] = None) -> Dict[str, Any]:
        """Returns the state of the table with strict private card filtering."""
        reveal_all_cards = self.phase in ['SHOWDOWN', 'SETTLEMENT']
        return {
            "table_id": self.table_id,
            "is_practice": self.is_practice,
            "small_blind": self.small_blind,
            "big_blind": self.big_blind,
            "max_players": self.max_players,
            "phase": self.phase,
            "hand_id": self.hand_id,
            "dealer_seat_idx": self.dealer_seat_idx,
            "current_turn_seat_idx": self.current_turn_seat_idx,
            "current_high_bet": self.current_high_bet,
            "min_raise_amount": self.min_raise_amount,
            "pot": self.pot,
            "community_cards": [c.to_str() for c in self.community_cards],
            "players": [p.to_dict(for_user_id=for_user_id, reveal_cards=reveal_all_cards) for p in self.players],
            "winners_summary": self.winners_summary,
            "turn_start_time": self.turn_start_time,
            "turn_duration": self.turn_duration,
        }
