"""
Ludo Matchmaking Service — Server-authoritative queue and match creation.

All queue mutation + match creation happens within a single DB transaction.
Uses PostgreSQL SELECT FOR UPDATE for row-level locking.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import select, and_
from ...models.ludo import (
    LudoMatch,
    LudoPlayer,
    LudoToken,
    LudoMatchmakingQueue,
    LudoMatchStatus,
    LudoColor,
    QueueStatus,
)
from ...models.wallet import Wallet
from ...models.transaction import WalletTransactionType
from ..wallet_service import debit_wallet, get_balance
from ...utils.logging import get_logger

logger = get_logger("ludo_matchmaking")

MATCHMAKING_TIMEOUT_SECONDS = 30
PLATFORM_COMMISSION_PERCENT = 10


class LudoMatchmakingService:
    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------------
    # Housekeeping
    # ------------------------------------------------------------------

    def clean_expired_queues(self) -> None:
        """Cancel queue entries older than the timeout window."""
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=MATCHMAKING_TIMEOUT_SECONDS)
        expired = (
            self.db.query(LudoMatchmakingQueue)
            .filter(
                LudoMatchmakingQueue.status == QueueStatus.SEARCHING,
                LudoMatchmakingQueue.queued_at < cutoff,
            )
            .all()
        )
        for q in expired:
            q.status = QueueStatus.CANCELLED
            logger.info(f"[LUDO-MM] Expired queue entry removed user={q.user_id}")
        if expired:
            self.db.flush()

    # ------------------------------------------------------------------
    # Core: join_queue  (ONE atomic transaction)
    # ------------------------------------------------------------------

    def join_queue(
        self,
        user_id: UUID,
        player_count: int,
        entry_fee: int,
    ) -> Dict[str, Any]:
        """
        Place a user into the matchmaking queue.

        Returns a dict with:
          - status: SEARCHING | MATCHED | ALREADY_IN_MATCH
          - For MATCHED: match_id, players (list of {user_id, color})
        """
        logger.info(
            f"[LUDO-MM] join_queue user={user_id} "
            f"player_count={player_count} entry_fee={entry_fee}"
        )

        if player_count not in [2, 4]:
            raise ValueError("Player count must be 2 or 4")
        if entry_fee < 0:
            raise ValueError("Entry fee cannot be negative")

        # ---- 1. Verify wallet balance ----
        wallet = get_balance(self.db, user_id)
        if not wallet or wallet.balance < entry_fee:
            logger.info(f"[LUDO-MM] Insufficient balance user={user_id}")
            raise ValueError("Insufficient wallet balance for this entry fee")

        # ---- 2. Check for existing active match (idempotent) ----
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
            logger.info(
                f"[LUDO-MM] User already in match user={user_id} "
                f"match_id={active_match.id}"
            )
            return {
                "status": "ALREADY_IN_MATCH",
                "match_id": str(active_match.id),
            }

        # ---- 3. Check for already-MATCHED queue entry (idempotent) ----
        already_matched = (
            self.db.query(LudoMatchmakingQueue)
            .filter(
                LudoMatchmakingQueue.user_id == user_id,
                LudoMatchmakingQueue.status == QueueStatus.MATCHED,
            )
            .order_by(LudoMatchmakingQueue.queued_at.desc())
            .first()
        )
        if already_matched and already_matched.match_id:
            m = self.db.query(LudoMatch).filter(
                LudoMatch.id == already_matched.match_id
            ).first()
            if m and m.status == LudoMatchStatus.IN_PROGRESS:
                logger.info(
                    f"[LUDO-MM] User already matched user={user_id} "
                    f"match_id={m.id}"
                )
                players_info = self._build_players_info(m)
                return {
                    "status": QueueStatus.MATCHED.value,
                    "match_id": str(m.id),
                    "players": players_info,
                }

        # ---- 4. Clean expired entries ----
        self.clean_expired_queues()

        # ---- 5. Handle existing SEARCHING entry for this user ----
        existing_q = (
            self.db.query(LudoMatchmakingQueue)
            .filter(
                LudoMatchmakingQueue.user_id == user_id,
                LudoMatchmakingQueue.status == QueueStatus.SEARCHING,
            )
            .first()
        )
        if existing_q:
            if (
                existing_q.entry_fee == entry_fee
                and existing_q.player_count == player_count
            ):
                logger.info(
                    f"[LUDO-MM] User already searching same tier user={user_id} "
                    f"queue_id={existing_q.id}"
                )
                return {
                    "status": QueueStatus.SEARCHING.value,
                    "queue_id": str(existing_q.id),
                    "queued_at": existing_q.queued_at.isoformat(),
                }
            else:
                # Different tier/mode: cancel old, continue to new search
                existing_q.status = QueueStatus.CANCELLED
                logger.info(
                    f"[LUDO-MM] Cancelled old queue (different tier) "
                    f"user={user_id} old_queue={existing_q.id}"
                )
                self.db.flush()

        # ---- 6. Find compatible candidates with row lock ----
        needed = player_count - 1
        logger.info(
            f"[LUDO-MM] Looking for {needed} candidate(s) "
            f"queue_key={player_count}:{entry_fee}"
        )

        candidates = (
            self.db.query(LudoMatchmakingQueue)
            .filter(
                LudoMatchmakingQueue.player_count == player_count,
                LudoMatchmakingQueue.entry_fee == entry_fee,
                LudoMatchmakingQueue.status == QueueStatus.SEARCHING,
                LudoMatchmakingQueue.user_id != user_id,
            )
            .order_by(LudoMatchmakingQueue.queued_at.asc())
            .limit(needed)
            .with_for_update()  # PostgreSQL SELECT FOR UPDATE
            .all()
        )

        queue_size_before = len(candidates)
        logger.info(
            f"[LUDO-MM] queue_size_before={queue_size_before} needed={needed}"
        )

        if len(candidates) < needed:
            # ---- Not enough players: add to queue ----
            new_q = LudoMatchmakingQueue(
                user_id=user_id,
                player_count=player_count,
                entry_fee=entry_fee,
                status=QueueStatus.SEARCHING,
                queued_at=datetime.now(timezone.utc),
            )
            self.db.add(new_q)
            self.db.commit()
            logger.info(
                f"[LUDO-MM] Player queued user={user_id} "
                f"queue_id={new_q.id} key={player_count}:{entry_fee}"
            )
            return {
                "status": QueueStatus.SEARCHING.value,
                "queue_id": str(new_q.id),
                "queued_at": new_q.queued_at.isoformat(),
            }

        # ============================================================
        # ---- We have all required players!  Atomic match creation ----
        # ============================================================
        # Everything below is ONE transaction.  If anything raises,
        # the caller's error handler will roll back.

        matched_user_ids = [c.user_id for c in candidates] + [user_id]
        total_pot = entry_fee * player_count
        commission = (total_pot * PLATFORM_COMMISSION_PERCENT) // 100
        prize_pool = total_pot - commission

        logger.info(
            f"[LUDO-MM] Creating match: "
            f"players={[str(u) for u in matched_user_ids]} "
            f"entry_fee={entry_fee} prize_pool={prize_pool}"
        )

        # Create match
        match = LudoMatch(
            status=LudoMatchStatus.IN_PROGRESS,
            current_turn_color=LudoColor.RED,
            turn_timeout_seconds=10,
            turn_started_at=datetime.now(timezone.utc),
            entry_fee=entry_fee,
            prize_pool=prize_pool,
            is_settled=False,
        )
        self.db.add(match)
        self.db.flush()  # get match.id

        # Color assignments
        if player_count == 2:
            colors = [LudoColor.RED, LudoColor.YELLOW]
        else:
            colors = [LudoColor.RED, LudoColor.GREEN, LudoColor.YELLOW, LudoColor.BLUE]

        # Create players + tokens + debit wallets
        for idx, uid in enumerate(matched_user_ids):
            player = LudoPlayer(
                match_id=match.id,
                user_id=uid,
                color=colors[idx],
                seat_index=idx,
                is_ready=True,
                consecutive_timeouts=0,
            )
            self.db.add(player)
            self.db.flush()

            logger.info(
                f"[LUDO-MM] Player assigned: user={uid} "
                f"color={colors[idx].value} seat={idx}"
            )

            # 4 tokens in yard
            for t_idx in range(4):
                token = LudoToken(
                    player_id=player.id,
                    token_index=t_idx,
                    position=-1,
                    is_home=False,
                )
                self.db.add(token)

            # Debit entry fee (idempotent reference)
            if entry_fee > 0:
                ref_id = f"ludo_entry_{match.id}_{uid}"
                debit_wallet(
                    db=self.db,
                    user_id=uid,
                    amount=entry_fee,
                    tx_type=WalletTransactionType.GAME_ENTRY,
                    reference_type="ludo_entry",
                    reference_id=ref_id,
                    metadata={
                        "match_id": str(match.id),
                        "player_count": player_count,
                    },
                )
                logger.info(
                    f"[LUDO-MM] Wallet debited: user={uid} amount={entry_fee} "
                    f"ref={ref_id}"
                )

        # Update candidate queue entries → MATCHED
        for c in candidates:
            c.status = QueueStatus.MATCHED
            c.match_id = match.id

        # Create a MATCHED queue entry for the joining player too
        joiner_q = LudoMatchmakingQueue(
            user_id=user_id,
            player_count=player_count,
            entry_fee=entry_fee,
            status=QueueStatus.MATCHED,
            match_id=match.id,
            queued_at=datetime.now(timezone.utc),
        )
        self.db.add(joiner_q)

        # ---- SINGLE COMMIT for the entire transaction ----
        self.db.commit()

        # Refresh match to load relationships
        self.db.refresh(match)

        logger.info(
            f"[LUDO-MM] *** MATCH CREATED *** match_id={match.id} "
            f"players={[str(u) for u in matched_user_ids]} "
            f"colors={[c.value for c in colors[:len(matched_user_ids)]]}"
        )

        # Build rich response
        players_info = self._build_players_info(match)

        return {
            "status": QueueStatus.MATCHED.value,
            "match_id": str(match.id),
            "players": players_info,
        }

    # ------------------------------------------------------------------
    # Cancel
    # ------------------------------------------------------------------

    def cancel_queue(self, user_id: UUID) -> bool:
        q = (
            self.db.query(LudoMatchmakingQueue)
            .filter(
                LudoMatchmakingQueue.user_id == user_id,
                LudoMatchmakingQueue.status == QueueStatus.SEARCHING,
            )
            .first()
        )
        if q:
            q.status = QueueStatus.CANCELLED
            self.db.commit()
            logger.info(f"[LUDO-MM] Queue cancelled user={user_id}")
            return True
        logger.info(f"[LUDO-MM] No active queue to cancel user={user_id}")
        return False

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    def get_queue_status(self, user_id: UUID) -> Dict[str, Any]:
        # 1. Check active match first (most important)
        active = (
            self.db.query(LudoMatch)
            .join(LudoPlayer)
            .filter(
                LudoPlayer.user_id == user_id,
                LudoMatch.status == LudoMatchStatus.IN_PROGRESS,
            )
            .first()
        )
        if active:
            return {
                "status": QueueStatus.MATCHED.value,
                "match_id": str(active.id),
            }

        # 2. Check latest queue entry
        q = (
            self.db.query(LudoMatchmakingQueue)
            .filter(LudoMatchmakingQueue.user_id == user_id)
            .order_by(LudoMatchmakingQueue.queued_at.desc())
            .first()
        )
        if not q:
            return {"status": "NONE"}

        if q.status == QueueStatus.SEARCHING:
            elapsed = (datetime.now(timezone.utc) - q.queued_at).total_seconds()
            if elapsed >= MATCHMAKING_TIMEOUT_SECONDS:
                q.status = QueueStatus.CANCELLED
                self.db.commit()
                return {"status": "TIMEOUT"}
            return {
                "status": QueueStatus.SEARCHING.value,
                "elapsed_seconds": int(elapsed),
                "remaining_seconds": max(
                    0, int(MATCHMAKING_TIMEOUT_SECONDS - elapsed)
                ),
            }

        if q.status == QueueStatus.MATCHED and q.match_id:
            m = (
                self.db.query(LudoMatch)
                .filter(LudoMatch.id == q.match_id)
                .first()
            )
            if m and m.status == LudoMatchStatus.IN_PROGRESS:
                return {
                    "status": QueueStatus.MATCHED.value,
                    "match_id": str(q.match_id),
                }
            return {"status": "NONE"}

        return {"status": q.status.value}

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _build_players_info(match: LudoMatch) -> list:
        """Build the players list with user_id and color for the response."""
        return [
            {
                "user_id": str(p.user_id),
                "color": p.color.value,
                "seat_index": p.seat_index,
                "username": p.user.username if p.user else "Player",
            }
            for p in match.players
        ]
