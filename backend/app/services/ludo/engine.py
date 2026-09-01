import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List, Tuple
from uuid import UUID
from sqlalchemy.orm import Session
from ...models.ludo import (
    LudoMatch,
    LudoPlayer,
    LudoToken,
    LudoMatchStatus,
    LudoColor,
)
from ...models.transaction import WalletTransactionType
from ..wallet_service import credit_wallet
from ..settlement_service import settle_winning_bet
from .board import HOME_STEP, get_absolute_position
from .rules import (
    get_target_step,
    get_legal_token_indices,
    can_move_token,
    check_capture,
    check_player_won,
)

# In-memory tracking of consecutive sixes per match: match_id -> int
_CONSECUTIVE_SIXES: Dict[str, int] = {}

class LudoEngine:
    def __init__(self, db: Session):
        self.db = db

    def get_match(self, match_id: UUID) -> Optional[LudoMatch]:
        return self.db.query(LudoMatch).filter(LudoMatch.id == match_id).first()

    def get_player_for_user(self, match: LudoMatch, user_id: UUID) -> Optional[LudoPlayer]:
        for p in match.players:
            if p.user_id == user_id:
                return p
        return None

    def get_active_players(self, match: LudoMatch) -> List[LudoPlayer]:
        """Active players sorted by seat index who have not forfeited or finished."""
        return [
            p for p in match.players
            if p.consecutive_timeouts < 3 and (p.rank is None or p.rank == 0)
        ]

    def _build_color_map(self, match: LudoMatch) -> Dict[str, LudoColor]:
        return {str(p.id): p.color for p in match.players}

    def _get_all_tokens(self, match: LudoMatch) -> List[LudoToken]:
        tokens = []
        for p in match.players:
            tokens.extend(p.tokens)
        return tokens

    def roll_dice(self, match_id: UUID, user_id: UUID) -> Dict[str, Any]:
        match = self.get_match(match_id)
        if not match:
            raise ValueError("Match not found")
        if match.status != LudoMatchStatus.IN_PROGRESS:
            raise ValueError("Match is not in progress")

        player = self.get_player_for_user(match, user_id)
        if not player:
            raise ValueError("User not a participant in this match")
        if match.current_turn_color != player.color:
            raise ValueError("Not your turn")
        if match.last_dice_roll is not None:
            raise ValueError("Dice already rolled for this turn. Must make a move.")

        # Authoritative Server RNG (1-6)
        roll = secrets.randbelow(6) + 1
        match.last_dice_roll = roll

        match_key = str(match.id)
        current_sixes = _CONSECUTIVE_SIXES.get(match_key, 0)

        if roll == 6:
            current_sixes += 1
            _CONSECUTIVE_SIXES[match_key] = current_sixes
        else:
            _CONSECUTIVE_SIXES[match_key] = 0

        color_map = self._build_color_map(match)
        all_tokens = self._get_all_tokens(match)

        # 3 Consecutive Sixes rule: 3rd six forfeits the turn
        if current_sixes >= 3:
            _CONSECUTIVE_SIXES[match_key] = 0
            self._advance_to_next_turn(match)
            self.db.commit()
            return {
                "roll": roll,
                "consecutive_sixes": 3,
                "turn_ended": True,
                "reason": "THREE_CONSECUTIVE_SIXES",
                "next_color": match.current_turn_color.value if match.current_turn_color else None,
            }

        # Calculate legal moves
        legal_indices = get_legal_token_indices(player.tokens, roll, player.color, all_tokens, color_map)

        if not legal_indices:
            # No legal moves available: auto-pass turn
            _CONSECUTIVE_SIXES[match_key] = 0
            self._advance_to_next_turn(match)
            self.db.commit()
            return {
                "roll": roll,
                "legal_tokens": [],
                "turn_ended": True,
                "reason": "NO_LEGAL_MOVES",
                "next_color": match.current_turn_color.value if match.current_turn_color else None,
            }

        # Reset turn timer for selecting move
        match.turn_started_at = datetime.now(timezone.utc)
        self.db.commit()

        return {
            "roll": roll,
            "legal_tokens": legal_indices,
            "turn_ended": False,
        }

    def move_token(self, match_id: UUID, user_id: UUID, token_index: int) -> Dict[str, Any]:
        match = self.get_match(match_id)
        if not match:
            raise ValueError("Match not found")
        if match.status != LudoMatchStatus.IN_PROGRESS:
            raise ValueError("Match is not in progress")

        player = self.get_player_for_user(match, user_id)
        if not player:
            raise ValueError("User not a participant in this match")
        if match.current_turn_color != player.color:
            raise ValueError("Not your turn")
        if match.last_dice_roll is None:
            raise ValueError("Must roll dice before moving")

        token = next((t for t in player.tokens if t.token_index == token_index), None)
        if not token:
            raise ValueError("Token not found")

        roll = match.last_dice_roll
        color_map = self._build_color_map(match)
        all_tokens = self._get_all_tokens(match)

        if not can_move_token(token, roll, player.color, all_tokens, color_map):
            raise ValueError("Illegal move for this token")

        # Apply move
        new_step = get_target_step(token.position, roll)
        token.position = new_step
        if new_step >= HOME_STEP:
            token.is_home = True

        # Successful turn resets consecutive timeouts counter
        player.consecutive_timeouts = 0

        # Check capture
        captured_token = None
        bonus_roll = False

        if new_step < HOME_STEP:
            target_abs = get_absolute_position(new_step, player.color)
            captured = check_capture(target_abs, player.color, all_tokens, color_map)
            if captured:
                captured.position = -1
                captured.is_home = False
                captured_token = {
                    "player_id": str(captured.player_id),
                    "token_index": captured.token_index,
                }
                bonus_roll = True  # Capture grants a bonus roll

        # Bonus roll on 6 or on getting a token Home
        if roll == 6 or new_step >= HOME_STEP:
            bonus_roll = True

        # Check win condition
        game_over = False
        winner_id = None
        if check_player_won(player.tokens):
            player.rank = 1
            player.finished_at = datetime.now(timezone.utc)
            match.status = LudoMatchStatus.COMPLETED
            match.completed_at = datetime.now(timezone.utc)
            game_over = True
            winner_id = str(player.user_id)
            self._settle_match(match, player.user_id)
        else:
            if bonus_roll:
                # Grant another roll to the same player
                match.last_dice_roll = None
                match.turn_started_at = datetime.now(timezone.utc)
            else:
                _CONSECUTIVE_SIXES[str(match.id)] = 0
                self._advance_to_next_turn(match)

        self.db.commit()

        return {
            "token_index": token_index,
            "new_position": token.position,
            "is_home": token.is_home,
            "captured": captured_token,
            "bonus_roll": bonus_roll and not game_over,
            "game_over": game_over,
            "winner_user_id": winner_id,
            "next_color": match.current_turn_color.value if match.current_turn_color else None,
        }

    def handle_timeout(self, match_id: UUID) -> Dict[str, Any]:
        """
        Server authoritative 10-second turn timeout handler.
        Skips current turn, increments consecutive timeouts.
        3 consecutive timeouts = Forfeit.
        """
        match = self.get_match(match_id)
        if not match or match.status != LudoMatchStatus.IN_PROGRESS:
            return {"status": "NOOP"}

        # Validate that timeout has actually occurred
        now = datetime.now(timezone.utc)
        if match.turn_started_at:
            elapsed = (now - match.turn_started_at).total_seconds()
            if elapsed < match.turn_timeout_seconds - 0.5:  # 0.5s grace for network
                return {"status": "TOO_EARLY", "elapsed": elapsed}

        # Current player who timed out
        current_player = next((p for p in match.players if p.color == match.current_turn_color), None)
        if not current_player:
            return {"status": "NO_CURRENT_PLAYER"}

        current_player.consecutive_timeouts += 1
        forfeited = current_player.consecutive_timeouts >= 3

        _CONSECUTIVE_SIXES[str(match.id)] = 0
        game_over = False
        winner_id = None

        if forfeited:
            current_player.rank = 99  # Forfeited marker
            active_remaining = [p for p in match.players if p.rank is None or p.rank == 0]
            if len(active_remaining) <= 1:
                # Opponent wins!
                winner = active_remaining[0] if active_remaining else None
                if winner:
                    winner.rank = 1
                    winner.finished_at = now
                    winner_id = str(winner.user_id)
                    self._settle_match(match, winner.user_id)
                match.status = LudoMatchStatus.COMPLETED
                match.completed_at = now
                game_over = True
            else:
                # 4-player: move to next active player
                self._advance_to_next_turn(match)
        else:
            self._advance_to_next_turn(match)

        self.db.commit()

        return {
            "status": "TIMEOUT",
            "timed_out_color": current_player.color.value,
            "consecutive_timeouts": current_player.consecutive_timeouts,
            "forfeited": forfeited,
            "game_over": game_over,
            "winner_user_id": winner_id,
            "next_color": match.current_turn_color.value if match.current_turn_color else None,
            "turn_started_at": match.turn_started_at.isoformat() if match.turn_started_at else None,
        }

    def _advance_to_next_turn(self, match: LudoMatch) -> None:
        """Determines the next active player in clockwise seat order."""
        active = self.get_active_players(match)
        if not active:
            match.current_turn_color = None
            return

        current_color = match.current_turn_color
        # Find index in active list
        curr_idx = -1
        for idx, p in enumerate(active):
            if p.color == current_color:
                curr_idx = idx
                break

        next_player = active[(curr_idx + 1) % len(active)]
        match.current_turn_color = next_player.color
        match.last_dice_roll = None
        match.turn_started_at = datetime.now(timezone.utc)

    def _settle_match(self, match: LudoMatch, winner_user_id: UUID) -> None:
        """Atomic, idempotent credit of prize pool to match winner."""
        if match.is_settled or match.prize_pool <= 0:
            return

        ref_id = f"ludo_win_{match.id}_{winner_user_id}"
        gross_profit = max(0, match.prize_pool - match.entry_fee)
        try:
            calc, _ = settle_winning_bet(
                db=self.db,
                user_id=winner_user_id,
                original_bet=match.entry_fee,
                gross_profit=gross_profit,
                reference_type="ludo_win",
                reference_id=ref_id,
                game_slug="ludo",
                metadata={"match_id": str(match.id), "prize_pool": match.prize_pool},
            )
            match.is_settled = True
        except ValueError as e:
            if "Duplicate transaction" in str(e):
                match.is_settled = True
            else:
                raise
