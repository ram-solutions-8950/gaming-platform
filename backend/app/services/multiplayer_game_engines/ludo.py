import uuid
from typing import Dict, Any
from sqlalchemy.orm import Session

from .base import BaseMultiplayerGameEngine
from ..ludo.engine import LudoEngine

class LudoMultiplayerEngine(BaseMultiplayerGameEngine):
    def __init__(self, db: Session):
        self.engine = LudoEngine(db)

    def create_match(self, user_id: uuid.UUID, **kwargs) -> Any:
        return self.engine.create_match(user_id, kwargs.get("turn_timeout_seconds", 30))
        
    def join_match(self, match_id: uuid.UUID, user_id: uuid.UUID) -> Any:
        return self.engine.join_match(match_id, user_id)

    def set_ready(self, match_id: uuid.UUID, user_id: uuid.UUID) -> Any:
        return self.engine.set_ready(match_id, user_id)
        
    def process_action(self, match_id: uuid.UUID, user_id: uuid.UUID, action_type: str, data: Dict[str, Any]) -> Any:
        idem = data.get("idempotency_key")
        if action_type == "ROLL_DICE":
            return self.engine.roll_dice(match_id, user_id, idem)
        elif action_type == "MOVE_TOKEN":
            token_index = data.get("token_index")
            return self.engine.move_token(match_id, user_id, token_index, idem)
        elif action_type == "TIMEOUT":
            return self.engine.timeout_turn(match_id, user_id)
        else:
            raise ValueError(f"Unknown action {action_type}")
