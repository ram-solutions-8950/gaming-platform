from abc import ABC, abstractmethod
from typing import Optional
from uuid import UUID
from sqlalchemy.orm import Session

from ...models.game import GameRound, GameBet


class GameEngine(ABC):
    # Pause between a round's result broadcast and the next round opening.
    # Games whose client presents the result (reveal, hold, popup) raise it so
    # the next betting window doesn't open underneath that presentation.
    result_display_seconds: float = 1

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

    @abstractmethod
    def get_round_duration_seconds(self, db: Session) -> int:
        raise NotImplementedError

    @abstractmethod
    def get_betting_duration_seconds(self, db: Session) -> int:
        raise NotImplementedError
