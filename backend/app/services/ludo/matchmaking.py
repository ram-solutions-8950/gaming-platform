import uuid
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import select, and_, or_, func
from datetime import datetime, timezone
import logging

from ...models.ludo import LudoMatchmakingQueue, QueueStatus, LudoMatch, LudoPlayer, LudoMatchStatus, LudoColor
from ...models.game_catalog import Game, GameStatus
from ...services.wallet_service import get_balance, debit_wallet
from ...models.transaction import WalletTransactionType
from ...websocket.ludo import ludo_ws_manager
from .state import create_initial_tokens

logger = logging.getLogger(__name__)

class LudoMatchmakingService:
    def __init__(self, db: Session):
        self.db = db

    def join_queue(self, user_id: uuid.UUID, player_count: int, entry_fee: int) -> Dict[str, Any]:
        if player_count not in [2, 4]:
            raise ValueError("Player count must be 2 or 4")

        # Check if game is active
        game = self.db.query(Game).filter(Game.slug == "ludo").first()
        if not game or game.status != GameStatus.ACTIVE:
            raise ValueError("Ludo is not currently active")

        # Validate entry fee against config (if config exists and specifies options, otherwise just use it)
        if game.config and "entry_fee" in game.config:
            config_fee = int(game.config["entry_fee"])
            if entry_fee != config_fee and entry_fee > 0:
                raise ValueError(f"Invalid entry fee. Must be {config_fee}")

        # Check balance
        wallet = get_balance(self.db, user_id)
        if not wallet or wallet.balance < entry_fee:
            raise ValueError("Insufficient wallet balance")

        # Check if already in an active match
        active_match = self.db.query(LudoMatch).join(LudoPlayer).filter(
            LudoPlayer.user_id == user_id,
            LudoMatch.status == LudoMatchStatus.IN_PROGRESS
        ).first()
        if active_match:
            raise ValueError("You are already in an active match")

        # Check if already in queue
        existing_queue = self.db.query(LudoMatchmakingQueue).filter(
            LudoMatchmakingQueue.user_id == user_id,
            LudoMatchmakingQueue.status == QueueStatus.SEARCHING
        ).first()
        
        if existing_queue:
            if existing_queue.player_count == player_count and existing_queue.entry_fee == entry_fee:
                return self._format_queue_status(existing_queue)
            else:
                # Cancel old queue and create new
                existing_queue.status = QueueStatus.CANCELLED
                self.db.flush()

        # Join queue
        new_queue = LudoMatchmakingQueue(
            user_id=user_id,
            player_count=player_count,
            entry_fee=entry_fee,
            status=QueueStatus.SEARCHING
        )
        self.db.add(new_queue)
        self.db.commit()
        
        # Try to process queue
        self.process_queue(player_count, entry_fee)
        
        self.db.refresh(new_queue)
        return self._format_queue_status(new_queue)

    def cancel_queue(self, user_id: uuid.UUID) -> bool:
        queue = self.db.query(LudoMatchmakingQueue).filter(
            LudoMatchmakingQueue.user_id == user_id,
            LudoMatchmakingQueue.status == QueueStatus.SEARCHING
        ).with_for_update().first()
        
        if queue:
            queue.status = QueueStatus.CANCELLED
            self.db.commit()
            return True
        return False

    def get_status(self, user_id: uuid.UUID) -> Dict[str, Any]:
        queue = self.db.query(LudoMatchmakingQueue).filter(
            LudoMatchmakingQueue.user_id == user_id,
            LudoMatchmakingQueue.status.in_([QueueStatus.SEARCHING, QueueStatus.MATCHED])
        ).order_by(LudoMatchmakingQueue.queued_at.desc()).first()
        
        if not queue:
            # Maybe they are in a match that was just created?
            active_match = self.db.query(LudoMatch).join(LudoPlayer).filter(
                LudoPlayer.user_id == user_id,
                LudoMatch.status == LudoMatchStatus.IN_PROGRESS
            ).first()
            if active_match:
                return {
                    "status": "MATCH_FOUND",
                    "match_id": str(active_match.id),
                    "player_count": len(active_match.players),
                    "entry_fee": active_match.entry_fee,
                    "players_found": len(active_match.players)
                }
            return {
                "status": "NOT_QUEUED",
                "player_count": 0,
                "entry_fee": 0,
                "players_found": 0,
                "players_required": None,
                "match_id": None,
            }
            
        return self._format_queue_status(queue)

    def _format_queue_status(self, queue: LudoMatchmakingQueue) -> Dict[str, Any]:
        if queue.status == QueueStatus.MATCHED and queue.match_id:
            # Get match details
            match = self.db.query(LudoMatch).filter(LudoMatch.id == queue.match_id).first()
            return {
                "status": "MATCH_FOUND",
                "match_id": str(queue.match_id),
                "player_count": queue.player_count,
                "entry_fee": queue.entry_fee,
                "players_found": len(match.players) if match else queue.player_count
            }
            
        # Count how many are currently searching for this exact queue
        players_found = self.db.query(LudoMatchmakingQueue).filter(
            LudoMatchmakingQueue.status == QueueStatus.SEARCHING,
            LudoMatchmakingQueue.player_count == queue.player_count,
            LudoMatchmakingQueue.entry_fee == queue.entry_fee
        ).count()
        
        return {
            "status": "SEARCHING",
            "player_count": queue.player_count,
            "entry_fee": queue.entry_fee,
            "players_found": min(players_found, queue.player_count),
            "players_required": queue.player_count
        }

    def process_queue(self, player_count: int, entry_fee: int):
        # Find candidates (fetch more than needed to account for duplicate user_ids due to race conditions)
        candidates = self.db.query(LudoMatchmakingQueue).filter(
            LudoMatchmakingQueue.status == QueueStatus.SEARCHING,
            LudoMatchmakingQueue.player_count == player_count,
            LudoMatchmakingQueue.entry_fee == entry_fee
        ).order_by(LudoMatchmakingQueue.queued_at.asc()).with_for_update(skip_locked=True).limit(player_count * 5).all()
        
        unique_users = set()
        valid_candidates = []
        
        for c in candidates:
            if c.user_id in unique_users:
                c.status = QueueStatus.CANCELLED # duplicate row due to race condition, cancel it
                continue
                
            unique_users.add(c.user_id)
            wallet = get_balance(self.db, c.user_id)
            if wallet and wallet.balance >= entry_fee:
                valid_candidates.append(c)
                if len(valid_candidates) == player_count:
                    break
            else:
                c.status = QueueStatus.CANCELLED # Kick out of queue
                
        if len(valid_candidates) == player_count:
            # Create the match!
            match = LudoMatch(
                status=LudoMatchStatus.WAITING,
                entry_fee=entry_fee,
                turn_timeout_seconds=30
            )
            self.db.add(match)
            self.db.flush()
            
            colors = [LudoColor.RED, LudoColor.GREEN, LudoColor.YELLOW, LudoColor.BLUE]
            
            try:
                for idx, c in enumerate(valid_candidates):
                    if entry_fee > 0:
                        debit_wallet(
                            self.db,
                            user_id=c.user_id,
                            amount=entry_fee,
                            tx_type=WalletTransactionType.GAME_ENTRY,
                            reference_type="ludo_entry",
                            reference_id=f"{match.id}_{c.user_id}"
                        )
                    c.status = QueueStatus.MATCHED
                    c.match_id = match.id
                    
                    player = LudoPlayer(
                        match_id=match.id,
                        user_id=c.user_id,
                        color=colors[idx],
                        seat_index=idx,
                        is_ready=True # auto-ready
                    )
                    self.db.add(player)
                    self.db.flush()
                    create_initial_tokens(self.db, player.id)
                
                match.status = LudoMatchStatus.IN_PROGRESS
                match.current_turn_color = LudoColor.RED
                match.prize_pool = entry_fee * player_count
                self.db.commit()
                
                # Temporary logging for debugging
                logger.info(f"MATCHMAKING group: players={[str(c.user_id) for c in valid_candidates]} player_count={player_count} entry_fee={entry_fee} match_id={match.id}")
                
            except Exception as e:
                self.db.rollback()
                logger.error(f"Failed to create match due to debit error: {e}")
                # In a real system, we'd remove the specific failed user from the queue and retry.
                # For now, just cancel the first one that probably caused it or let them retry.
                # We will just leave them searching, except they might not have balance. 
                # The next process_queue will catch the insufficient balance.
        else:
            self.db.commit()


