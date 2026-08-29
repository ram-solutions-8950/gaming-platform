import uuid
from typing import Dict, Any
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from ...models.ludo import (
    LudoMatch,
    LudoMatchStatus,
    LudoColor,
    LudoPlayer,
)
from ...models.idempotency import IdempotencyKey
from ...models.game_catalog import Game
from ...models.transaction import WalletTransactionType

from ..wallet_service import debit_wallet, credit_wallet, get_balance

from .board import get_next_position
from .dice import roll_dice
from .rules import get_legal_moves, check_capture, has_won
from .state import (
    get_match_with_lock,
    create_initial_tokens,
    next_turn,
)


class LudoEngine:

    def __init__(self, db: Session):
        self.db = db

    # =========================================================
    # IDEMPOTENCY
    # =========================================================

    def check_idempotency(self, key: str) -> bool:

        if not key:
            raise ValueError("Idempotency key required")

        idem = (
            self.db.query(IdempotencyKey)
            .filter(IdempotencyKey.key == key)
            .first()
        )

        if idem:
            return True

        self.db.add(
            IdempotencyKey(key=key)
        )

        return False

    # =========================================================
    # CREATE MATCH
    # =========================================================

    def create_match(
        self,
        user_id: uuid.UUID,
        turn_timeout_seconds: int = 30,
    ) -> LudoMatch:

        game = (
            self.db.query(Game)
            .filter(Game.slug == "ludo")
            .first()
        )

        entry_fee = 0

        if (
            game
            and game.config
            and "entry_fee" in game.config
        ):
            entry_fee = int(
                game.config["entry_fee"]
            )

        # Safety
        turn_timeout_seconds = max(
            10,
            min(turn_timeout_seconds, 300),
        )

        match = LudoMatch(
            turn_timeout_seconds=turn_timeout_seconds,
            status=LudoMatchStatus.WAITING,
            entry_fee=entry_fee,
        )

        self.db.add(match)
        self.db.flush()

        player = LudoPlayer(
            match_id=match.id,
            user_id=user_id,
            color=LudoColor.RED,
            seat_index=0,
            consecutive_timeouts=0,
        )

        self.db.add(player)
        self.db.flush()

        create_initial_tokens(
            self.db,
            player.id,
        )

        self.db.commit()

        return match

    # =========================================================
    # JOIN MATCH
    # =========================================================

    def join_match(
        self,
        match_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> LudoMatch:

        match = get_match_with_lock(
            self.db,
            match_id,
        )

        if not match:
            raise ValueError(
                "Match not found"
            )

        if match.status != LudoMatchStatus.WAITING:
            raise ValueError(
                "Match already in progress"
            )

        existing_player = next(
            (
                p
                for p in match.players
                if p.user_id == user_id
            ),
            None,
        )

        if existing_player:
            raise ValueError(
                "Already joined"
            )

        if len(match.players) >= 4:
            raise ValueError(
                "Match full"
            )

        colors = [
            LudoColor.RED,
            LudoColor.GREEN,
            LudoColor.YELLOW,
            LudoColor.BLUE,
        ]

        seat = len(match.players)

        player = LudoPlayer(
            match_id=match.id,
            user_id=user_id,
            color=colors[seat],
            seat_index=seat,
            consecutive_timeouts=0,
        )

        self.db.add(player)
        self.db.flush()

        create_initial_tokens(
            self.db,
            player.id,
        )

        match.version += 1

        self.db.commit()

        return match

    # =========================================================
    # READY
    # =========================================================

    def set_ready(
        self,
        match_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> LudoMatch:

        match = get_match_with_lock(
            self.db,
            match_id,
        )

        if not match:
            raise ValueError(
                "Match not found"
            )

        player = next(
            (
                p
                for p in match.players
                if p.user_id == user_id
            ),
            None,
        )

        if not player:
            raise ValueError(
                "Not in match"
            )

        player.is_ready = True

        if (
            match.status == LudoMatchStatus.WAITING
            and len(match.players) >= 2
            and all(
                p.is_ready
                for p in match.players
            )
        ):

            # ---------------------------------------------
            # Debit entry fee (with upfront balance check)
            # ---------------------------------------------

            if match.entry_fee > 0:

                for p in match.players:
                    w = get_balance(self.db, p.user_id)
                    if not w or w.balance < match.entry_fee:
                        raise ValueError("Insufficient balance")

                for p in match.players:

                    debit_wallet(
                        self.db,
                        user_id=p.user_id,
                        amount=match.entry_fee,
                        tx_type=WalletTransactionType.GAME_ENTRY,
                        reference_type="ludo_entry",
                        reference_id=(
                            f"{match.id}_{p.user_id}"
                        ),
                    )

            # ---------------------------------------------
            # Start match
            # ---------------------------------------------

            match.status = (
                LudoMatchStatus.IN_PROGRESS
            )

            match.current_turn_color = (
                LudoColor.RED
            )

            # IMPORTANT:
            # Start timer for first turn.
            match.turn_started_at = (
                datetime.now(timezone.utc)
            )

            match.prize_pool = (
                match.entry_fee
                * len(match.players)
            )

        match.version += 1

        self.db.commit()

        return match

    # =========================================================
    # ROLL DICE
    # =========================================================

    def roll_dice(
        self,
        match_id: uuid.UUID,
        user_id: uuid.UUID,
        idempotency_key: str,
    ) -> Dict[str, Any]:

        match = get_match_with_lock(
            self.db,
            match_id,
        )

        if not match:
            raise ValueError(
                "Match not found"
            )

        if match.status != LudoMatchStatus.IN_PROGRESS:
            raise ValueError(
                "Match not in progress"
            )

        player = next(
            (
                p
                for p in match.players
                if p.user_id == user_id
            ),
            None,
        )

        if not player:
            raise ValueError(
                "Not in match"
            )

        if (
            player.color
            != match.current_turn_color
        ):
            raise ValueError(
                "Not your turn"
            )

        if self.check_idempotency(
            idempotency_key
        ):
            raise ValueError(
                "Duplicate action"
            )

        if match.last_dice_roll is not None:
            raise ValueError(
                "Dice already rolled"
            )

        # ---------------------------------------------
        # PLAYER IS ACTIVE AGAIN
        #
        # Reset consecutive timeout counter.
        # ---------------------------------------------

        player.consecutive_timeouts = 0

        roll = roll_dice()

        match.last_dice_roll = roll

        match.version += 1

        legal_moves = get_legal_moves(
            player.tokens,
            roll,
            player.color,
        )

        # ---------------------------------------------
        # No legal move
        # ---------------------------------------------

        if not legal_moves:

            match.last_dice_roll = None

            next_turn(match)

            # Start timer for next player.
            match.turn_started_at = (
                datetime.now(timezone.utc)
            )

            match.version += 1

        self.db.commit()

        return {
            "roll": roll,
            "legal_moves": legal_moves,
        }

    # =========================================================
    # MOVE TOKEN
    # =========================================================

    def move_token(
        self,
        match_id: uuid.UUID,
        user_id: uuid.UUID,
        token_index: int,
        idempotency_key: str,
    ) -> Dict[str, Any]:

        match = get_match_with_lock(
            self.db,
            match_id,
        )

        if not match:
            raise ValueError(
                "Match not found"
            )

        if match.status != LudoMatchStatus.IN_PROGRESS:
            raise ValueError(
                "Match not in progress"
            )

        player = next(
            (
                p
                for p in match.players
                if p.user_id == user_id
            ),
            None,
        )

        if not player:
            raise ValueError(
                "Not in match"
            )

        if (
            player.color
            != match.current_turn_color
        ):
            raise ValueError(
                "Not your turn"
            )

        if self.check_idempotency(
            idempotency_key
        ):
            raise ValueError(
                "Duplicate action"
            )

        if match.last_dice_roll is None:
            raise ValueError(
                "Roll dice first"
            )

        token = next(
            (
                t
                for t in player.tokens
                if t.token_index == token_index
            ),
            None,
        )

        if not token:
            raise ValueError(
                "Token not found"
            )

        target_pos = get_next_position(
            token.position,
            match.last_dice_roll,
            player.color,
        )

        if target_pos is None:
            raise ValueError(
                "Illegal move"
            )

        token.position = target_pos
        player.consecutive_timeouts = 0

        if target_pos == 57:
            token.is_home = True

        # ---------------------------------------------
        # CAPTURE
        # ---------------------------------------------

        all_tokens = []

        for p in match.players:
            all_tokens.extend(
                p.tokens
            )

        captured_tokens = check_capture(
            all_tokens,
            target_pos,
            player.color,
        )

        for captured_token in captured_tokens:

            captured_token.position = -1

            captured_token.is_home = False

        # ---------------------------------------------
        # WIN CHECK
        # ---------------------------------------------

        if has_won(player.tokens):

            rank = (
                max(
                    [
                        p.rank
                        for p in match.players
                        if p.rank is not None
                    ]
                    + [0]
                )
                + 1
            )

            player.rank = rank

            player.finished_at = (
                datetime.now(timezone.utc)
            )

            # -----------------------------------------
            # FIRST PLAYER = WINNER
            # -----------------------------------------

            if rank == 1:

                if not match.is_settled:

                    game = (
                        self.db.query(Game)
                        .filter(
                            Game.slug == "ludo"
                        )
                        .first()
                    )

                    platform_fee_percent = Decimal(
                        "0"
                    )

                    if (
                        game
                        and game.config
                        and "platform_fee_percent"
                        in game.config
                    ):

                        platform_fee_percent = Decimal(
                            str(
                                game.config[
                                    "platform_fee_percent"
                                ]
                            )
                        )

                    prize_pool_dec = Decimal(
                        match.prize_pool
                    )

                    platform_fee = (
                        prize_pool_dec
                        * (
                            platform_fee_percent
                            / Decimal("100")
                        )
                    ).quantize(
                        Decimal("1"),
                        rounding=ROUND_HALF_UP,
                    )

                    net_win = int(
                        prize_pool_dec
                        - platform_fee
                    )

                    if net_win > 0:

                        credit_wallet(
                            self.db,
                            user_id=player.user_id,
                            amount=net_win,
                            tx_type=WalletTransactionType.GAME_WIN,
                            reference_type="ludo_win",
                            reference_id=str(
                                match.id
                            ),
                            metadata={
                                "prize_pool": (
                                    match.prize_pool
                                ),
                                "platform_fee": int(
                                    platform_fee
                                ),
                            },
                        )

                    match.is_settled = True

                # -------------------------------------
                # GAME OVER
                # -------------------------------------

                match.status = (
                    LudoMatchStatus.COMPLETED
                )

                match.completed_at = (
                    datetime.now(timezone.utc)
                )

                match.current_turn_color = None
                match.turn_started_at = None
                match.last_dice_roll = None

                match.version += 1

                self.db.commit()

                return {
                    "moved": True,
                    "game_over": True,
                    "winner_user_id": str(
                        player.user_id
                    ),
                    "winner_color": (
                        player.color.value
                    ),
                    "rank": 1,
                    "match_status": "COMPLETED",
                }

        # ---------------------------------------------
        # NORMAL TURN
        # ---------------------------------------------

        if (
            match.last_dice_roll == 6
            or captured_tokens
            or target_pos == 57
        ):

            # Same player gets another turn.
            # Restart timer.
            match.turn_started_at = (
                datetime.now(timezone.utc)
            )

        else:

            next_turn(match)

            # IMPORTANT:
            # Start timer for next player.
            match.turn_started_at = (
                datetime.now(timezone.utc)
            )

        match.last_dice_roll = None

        match.version += 1

        self.db.commit()

        return {
            "moved": True,
            "game_over": False,
            "match_status": match.status.value,
        }

    # =========================================================
    # TIMEOUT
    # =========================================================

    def timeout_turn(
        self,
        match_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> Dict[str, Any]:

        match = get_match_with_lock(
            self.db,
            match_id,
        )

        if not match:
            raise ValueError(
                "Match not found"
            )

        if match.status != LudoMatchStatus.IN_PROGRESS:
            raise ValueError(
                "Match not in progress"
            )

        # ---------------------------------------------
        # Current player
        # ---------------------------------------------

        current_player = next(
            (
                p
                for p in match.players
                if p.color
                == match.current_turn_color
            ),
            None,
        )

        if not current_player:
            raise ValueError(
                "Current player not found"
            )

        # ---------------------------------------------
        # Requester must be in match
        # ---------------------------------------------

        requester = next(
            (
                p
                for p in match.players
                if p.user_id == user_id
            ),
            None,
        )

        if not requester:
            raise ValueError(
                "Not in match"
            )

        # ---------------------------------------------
        # Timer safety
        # ---------------------------------------------

        if not match.turn_started_at:

            match.turn_started_at = (
                datetime.now(timezone.utc)
            )

            self.db.commit()

            raise ValueError(
                "Turn timer initialized. "
                "Please wait for timeout."
            )

        now = datetime.now(timezone.utc)

        diff = (
            now
            - match.turn_started_at
        ).total_seconds()

        timeout_seconds = (
            match.turn_timeout_seconds
            or 30
        )

        # Check timeout threshold
        if diff < timeout_seconds:

            raise ValueError(
                "Turn has not timed out yet"
            )

        # ---------------------------------------------
        # Increment timeout
        # ---------------------------------------------

        current_player.consecutive_timeouts += 1

        timeout_count = (
            current_player.consecutive_timeouts
        )

        # ---------------------------------------------
        # 3 CONSECUTIVE TIMEOUTS
        # = FORFEIT
        # ---------------------------------------------

        if timeout_count >= 3:

            current_player.rank = len(match.players)

            current_player.finished_at = (
                datetime.now(timezone.utc)
            )

            active_players = [
                p
                for p in match.players
                if (
                    p.rank is None
                    and p.id
                    != current_player.id
                )
            ]

            # -----------------------------------------
            # One player remains
            # -----------------------------------------

            if len(active_players) == 1:

                winner = active_players[0]

                winner.rank = 1

                winner.finished_at = (
                    datetime.now(timezone.utc)
                )

                # -------------------------------------
                # SETTLE PRIZE
                # -------------------------------------

                if (
                    not match.is_settled
                    and match.prize_pool > 0
                ):

                    game = (
                        self.db.query(Game)
                        .filter(
                            Game.slug == "ludo"
                        )
                        .first()
                    )

                    platform_fee_percent = Decimal(
                        "0"
                    )

                    if (
                        game
                        and game.config
                        and "platform_fee_percent"
                        in game.config
                    ):

                        platform_fee_percent = Decimal(
                            str(
                                game.config[
                                    "platform_fee_percent"
                                ]
                            )
                        )

                    prize_pool_dec = Decimal(
                        match.prize_pool
                    )

                    platform_fee = (
                        prize_pool_dec
                        * (
                            platform_fee_percent
                            / Decimal("100")
                        )
                    ).quantize(
                        Decimal("1"),
                        rounding=ROUND_HALF_UP,
                    )

                    net_win = int(
                        prize_pool_dec
                        - platform_fee
                    )

                    if net_win > 0:

                        credit_wallet(
                            self.db,
                            user_id=winner.user_id,
                            amount=net_win,
                            tx_type=WalletTransactionType.GAME_WIN,
                            reference_type=(
                                "ludo_timeout_win"
                            ),
                            reference_id=str(
                                match.id
                            ),
                            metadata={
                                "prize_pool": (
                                    match.prize_pool
                                ),
                                "platform_fee": int(
                                    platform_fee
                                ),
                                "reason": (
                                    "opponent_three_"
                                    "consecutive_timeouts"
                                ),
                            },
                        )

                    match.is_settled = True

                # -------------------------------------
                # COMPLETE GAME
                # -------------------------------------

                match.status = (
                    LudoMatchStatus.COMPLETED
                )

                match.completed_at = (
                    datetime.now(timezone.utc)
                )

                match.current_turn_color = None
                match.turn_started_at = None
                match.last_dice_roll = None

                match.version += 1

                self.db.commit()

                return {
                    "moved": False,
                    "game_over": True,
                    "timeout": True,
                    "forfeited": True,
                    "forfeited_user_id": str(
                        current_player.user_id
                    ),
                    "winner_user_id": str(
                        winner.user_id
                    ),
                    "winner_color": (
                        winner.color.value
                    ),
                    "consecutive_timeouts": (
                        timeout_count
                    ),
                    "match_status": "COMPLETED",
                    "message": (
                        "Player forfeited after "
                        "3 consecutive timeouts"
                    ),
                }

            # -----------------------------------------
            # Multiple players remain
            # -----------------------------------------

            match.last_dice_roll = None

            next_turn(match)

            match.turn_started_at = (
                datetime.now(timezone.utc)
            )

            match.version += 1

            self.db.commit()

            return {
                "moved": False,
                "game_over": False,
                "timeout": True,
                "forfeited": True,
                "forfeited_user_id": str(
                    current_player.user_id
                ),
                "consecutive_timeouts": (
                    timeout_count
                ),
                "next_turn_color": (
                    match.current_turn_color.value
                    if match.current_turn_color
                    else None
                ),
                "match_status": (
                    match.status.value
                ),
                "message": (
                    "Player forfeited after "
                    "3 consecutive timeouts"
                ),
            }

        # ---------------------------------------------
        # NORMAL TIMEOUT 1/3 OR 2/3
        # ---------------------------------------------

        match.last_dice_roll = None

        next_turn(match)

        # Reset timer for next player
        match.turn_started_at = (
            datetime.now(timezone.utc)
        )

        match.version += 1

        self.db.commit()

        return {
            "moved": False,
            "game_over": False,
            "timeout": True,
            "consecutive_timeouts": (
                timeout_count
            ),
            "next_turn_color": (
                match.current_turn_color.value
                if match.current_turn_color
                else None
            ),
            "match_status": (
                match.status.value
            ),
            "message": (
                f"Turn skipped. "
                f"Timeout {timeout_count}/3"
            ),
        }