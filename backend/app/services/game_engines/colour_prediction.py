from typing import Optional
from uuid import UUID
from sqlalchemy.orm import Session

from .base import GameEngine
from .. import game_service
from ...models.game import GameRound, GameBet


class ColourPredictionEngine(GameEngine):
    slug = "colour-prediction"

    def create_round(self, db: Session) -> GameRound:
        return game_service.create_round(db)

    def get_current_round(self, db: Session) -> Optional[GameRound]:
        return game_service.get_current_round(db)

    def get_round_history(self, db: Session, limit: int = 20) -> list[GameRound]:
        return game_service.get_round_history(db, limit=limit)

    def place_bet(
        self,
        db: Session,
        user_id: UUID,
        round_id: UUID,
        prediction: str,
        amount: int,
        game_id: Optional[UUID] = None,
    ) -> GameBet:
        return game_service.place_bet(
            db=db,
            user_id=user_id,
            round_id=round_id,
            game_id=game_id,
            prediction_str=prediction,
            amount=amount,
        )

    def lock_round_for_calculation(self, db: Session, round_id: UUID) -> GameRound:
        return game_service.lock_round_for_calculation(db, round_id)

    def settle_round(self, db: Session, round_id: UUID) -> GameRound:
        return game_service.settle_round(db, round_id)
