import uuid
from typing import Dict, Any

from sqlalchemy.orm import Session
from datetime import datetime, timezone
import logging

from ...models.ludo import (
    LudoMatchmakingQueue,
    QueueStatus,
    LudoMatch,
    LudoPlayer,
    LudoMatchStatus,
    LudoColor,
)
from ...models.game_catalog import Game, GameStatus
from ...services.wallet_service import get_balance, debit_wallet
from ...models.transaction import WalletTransactionType
from .state import create_initial_tokens

logger = logging.getLogger(__name__)


class LudoMatchmakingService:
    def __init__(self, db: Session):
        self.db = db

    def join_queue(
        self,
        user_id: uuid.UUID,
        player_count: int,
        entry_fee: int,
    ) -> Dict[str, Any]:

        if player_count not in [2, 4]:
            raise ValueError("Player count must be 2 or 4")

        # Check if Ludo is active
        game = self.db.query(Game).filter(Game.slug == "ludo").first()

        if not game or game.status != GameStatus.ACTIVE:
            raise ValueError("Ludo is not currently active")

        # Validate entry fee against game configuration
        if game.config and "entry_fee" in game.config:
            config_fee = int(game.config["entry_fee"])

            if entry_fee != config_fee and entry_fee > 0:
                raise ValueError(
                    f"Invalid entry fee. Must be {config_fee}"
                )

        # Check wallet balance
        wallet = get_balance(self.db, user_id)

        if not wallet or wallet.balance < entry_fee:
            raise ValueError("Insufficient wallet balance")

        # Check whether user is already in an active match
        active_match = (
            self.db.query(LudoMatch)
            .join(LudoPlayer)
            .filter(
                LudoPlayer.user_id == user_id,
                LudoMatch.status == LudoMatchStatus.IN_PROGRESS,
            )
            .first()
        )

        if active_match:
            raise ValueError(
                "You are already in an active match"
            )

        # Check whether user already has a searching queue entry
        existing_queue = (
            self.db.query(LudoMatchmakingQueue)
            .filter(
                LudoMatchmakingQueue.user_id == user_id,
                LudoMatchmakingQueue.status == QueueStatus.SEARCHING,
            )
            .first()
        )

        if existing_queue:

            # Same queue request - return current status
            if (
                existing_queue.player_count == player_count
                and existing_queue.entry_fee == entry_fee
            ):
                # Expire stale queue before returning it
                elapsed = (
                    datetime.now(timezone.utc)
                    - existing_queue.queued_at
                ).total_seconds()

                if elapsed >= 30:
                    existing_queue.status = QueueStatus.CANCELLED
                    self.db.commit()

                else:
                    return self._format_queue_status(
                        existing_queue
                    )

            else:
                # User changed player count or entry fee
                existing_queue.status = QueueStatus.CANCELLED
                self.db.flush()

        # Create new queue entry
        new_queue = LudoMatchmakingQueue(
            user_id=user_id,
            player_count=player_count,
            entry_fee=entry_fee,
            status=QueueStatus.SEARCHING,
        )

        self.db.add(new_queue)
        self.db.commit()

        # Try to immediately create a match
        self.process_queue(
            player_count,
            entry_fee,
        )

        self.db.refresh(new_queue)

        return self._format_queue_status(
            new_queue
        )

    def cancel_queue(
        self,
        user_id: uuid.UUID,
    ) -> bool:

        queue = (
            self.db.query(LudoMatchmakingQueue)
            .filter(
                LudoMatchmakingQueue.user_id == user_id,
                LudoMatchmakingQueue.status == QueueStatus.SEARCHING,
            )
            .with_for_update()
            .first()
        )

        if queue:
            queue.status = QueueStatus.CANCELLED
            self.db.commit()
            return True

        return False

    def get_status(
        self,
        user_id: uuid.UUID,
    ) -> Dict[str, Any]:

        queue = (
            self.db.query(LudoMatchmakingQueue)
            .filter(
                LudoMatchmakingQueue.user_id == user_id,
                LudoMatchmakingQueue.status.in_(
                    [
                        QueueStatus.SEARCHING,
                        QueueStatus.MATCHED,
                    ]
                ),
            )
            .order_by(
                LudoMatchmakingQueue.queued_at.desc()
            )
            .first()
        )

        # No active queue
        if not queue:

            # Check whether user is already in a match
            active_match = (
                self.db.query(LudoMatch)
                .join(LudoPlayer)
                .filter(
                    LudoPlayer.user_id == user_id,
                    LudoMatch.status == LudoMatchStatus.IN_PROGRESS,
                )
                .first()
            )

            if active_match:
                return {
                    "status": "MATCH_FOUND",
                    "match_id": str(active_match.id),
                    "player_count": len(active_match.players),
                    "entry_fee": active_match.entry_fee,
                    "players_found": len(active_match.players),
                }

            return {
                "status": "NOT_QUEUED",
                "player_count": 0,
                "entry_fee": 0,
                "players_found": 0,
                "players_required": None,
                "match_id": None,
                "seconds_left": 0,
            }

        # Automatically expire stale searching queues
        if queue.status == QueueStatus.SEARCHING:

            elapsed = (
                datetime.now(timezone.utc)
                - queue.queued_at
            ).total_seconds()

            if elapsed >= 30:

                queue.status = QueueStatus.CANCELLED
                self.db.commit()

                return {
                    "status": "NOT_QUEUED",
                    "player_count": 0,
                    "entry_fee": 0,
                    "players_found": 0,
                    "players_required": None,
                    "match_id": None,
                    "seconds_left": 0,
                }

        return self._format_queue_status(queue)

    def _format_queue_status(
        self,
        queue: LudoMatchmakingQueue,
    ) -> Dict[str, Any]:

        # Queue has been matched
        if (
            queue.status == QueueStatus.MATCHED
            and queue.match_id
        ):

            match = (
                self.db.query(LudoMatch)
                .filter(
                    LudoMatch.id == queue.match_id
                )
                .first()
            )

            return {
                "status": "MATCH_FOUND",
                "match_id": str(queue.match_id),
                "player_count": queue.player_count,
                "entry_fee": queue.entry_fee,
                "players_found": (
                    len(match.players)
                    if match
                    else queue.player_count
                ),
                "seconds_left": 0,
            }

        # Count currently searching players
        players_found = (
            self.db.query(LudoMatchmakingQueue)
            .filter(
                LudoMatchmakingQueue.status
                == QueueStatus.SEARCHING,
                LudoMatchmakingQueue.player_count
                == queue.player_count,
                LudoMatchmakingQueue.entry_fee
                == queue.entry_fee,
            )
            .count()
        )

        # Calculate remaining matchmaking time
        elapsed = (
            datetime.now(timezone.utc)
            - queue.queued_at
        ).total_seconds()

        seconds_left = max(
            0,
            30 - int(elapsed),
        )

        return {
            "status": "SEARCHING",
            "player_count": queue.player_count,
            "entry_fee": queue.entry_fee,
            "players_found": min(
                players_found,
                queue.player_count,
            ),
            "players_required": queue.player_count,
            "seconds_left": seconds_left,
        }

    def process_queue(
        self,
        player_count: int,
        entry_fee: int,
    ):

        # Find candidates for this exact queue
        candidates = (
            self.db.query(LudoMatchmakingQueue)
            .filter(
                LudoMatchmakingQueue.status
                == QueueStatus.SEARCHING,
                LudoMatchmakingQueue.player_count
                == player_count,
                LudoMatchmakingQueue.entry_fee
                == entry_fee,
            )
            .order_by(
                LudoMatchmakingQueue.queued_at.asc()
            )
            .with_for_update(
                skip_locked=True
            )
            .limit(player_count * 5)
            .all()
        )

        unique_users = set()
        valid_candidates = []

        for candidate in candidates:

            # Expire old queue entries
            elapsed = (
                datetime.now(timezone.utc)
                - candidate.queued_at
            ).total_seconds()

            if elapsed >= 30:
                candidate.status = QueueStatus.CANCELLED
                continue

            # Prevent duplicate user entries
            if candidate.user_id in unique_users:
                candidate.status = QueueStatus.CANCELLED
                continue

            unique_users.add(candidate.user_id)

            # Check wallet balance again
            wallet = get_balance(
                self.db,
                candidate.user_id,
            )

            if wallet and wallet.balance >= entry_fee:

                valid_candidates.append(candidate)

                if len(valid_candidates) == player_count:
                    break

            else:
                # User no longer has sufficient balance
                candidate.status = QueueStatus.CANCELLED

        # Not enough players yet
        if len(valid_candidates) != player_count:
            self.db.commit()
            return

        # Create match
        match = LudoMatch(
            status=LudoMatchStatus.WAITING,
            entry_fee=entry_fee,
            turn_timeout_seconds=30,
        )

        self.db.add(match)
        self.db.flush()

        # Correct colors for 2-player and 4-player games
        if player_count == 2:
            colors = [
                LudoColor.RED,
                LudoColor.YELLOW,
            ]
        else:
            colors = [
                LudoColor.RED,
                LudoColor.GREEN,
                LudoColor.YELLOW,
                LudoColor.BLUE,
            ]

        try:

            for idx, candidate in enumerate(
                valid_candidates
            ):

                # Deduct entry fee
                if entry_fee > 0:

                    debit_wallet(
                        self.db,
                        user_id=candidate.user_id,
                        amount=entry_fee,
                        tx_type=WalletTransactionType.GAME_ENTRY,
                        reference_type="ludo_entry",
                        reference_id=(
                            f"{match.id}_{candidate.user_id}"
                        ),
                    )

                # Mark queue as matched
                candidate.status = QueueStatus.MATCHED
                candidate.match_id = match.id

                # Create player
                player = LudoPlayer(
                    match_id=match.id,
                    user_id=candidate.user_id,
                    color=colors[idx],
                    seat_index=idx,
                    is_ready=True,
                )

                self.db.add(player)
                self.db.flush()

                # Create four initial tokens
                create_initial_tokens(
                    self.db,
                    player.id,
                )

            # Start match
            match.status = LudoMatchStatus.IN_PROGRESS
            match.current_turn_color = LudoColor.RED
            match.prize_pool = entry_fee * player_count

            self.db.commit()

            logger.info(
                "MATCHMAKING group: "
                f"players={[str(c.user_id) for c in valid_candidates]} "
                f"player_count={player_count} "
                f"entry_fee={entry_fee} "
                f"match_id={match.id}"
            )

        except Exception as exc:

            self.db.rollback()

            logger.error(
                "Failed to create Ludo match: %s",
                exc,
                exc_info=True,
            )

            # Leave candidates available for retry
            # unless their queue was already cancelled.
            return