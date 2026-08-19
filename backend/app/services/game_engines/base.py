from abc import ABC, abstractmethod
from typing import Optional
from uuid import UUID
from sqlalchemy.orm import Session

from ...models.game import GameRound, GameBet


class GameEngine(ABC):
    @property
    @abstractmethod
    def slug(self) -> str:
        raise NotImplementedError

    @abstractmethod
    def create_round(self, db: Session) -> GameRound:
        raise NotImplementedError

    @abstractmethod
    def get_current_round(self, db: Session) -> Optional[GameRound]:
        raise NotImplementedError

    @abstractmethod
    def get_round_history(self, db: Session, limit: int = 20) -> list[GameRound]:
        raise NotImplementedError

    @abstractmethod
    def place_bet(
        self,
        db: Session,
        user_id: UUID,
        round_id: UUID,
        prediction: str,
        amount: int,
        game_id: Optional[UUID] = None,
    ) -> GameBet:
        raise NotImplementedError

    @abstractmethod
    def lock_round_for_calculation(self, db: Session, round_id: UUID) -> GameRound:
        raise NotImplementedError

    @abstractmethod
    def settle_round(self, db: Session, round_id: UUID) -> GameRound:
        raise NotImplementedError
