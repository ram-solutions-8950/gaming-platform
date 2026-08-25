from abc import ABC, abstractmethod
import uuid
from typing import Any, Dict

class BaseMultiplayerGameEngine(ABC):
    
    @abstractmethod
    def create_match(self, user_id: uuid.UUID, **kwargs) -> Any:
        pass
        
    @abstractmethod
    def join_match(self, match_id: uuid.UUID, user_id: uuid.UUID) -> Any:
        pass

    @abstractmethod
    def set_ready(self, match_id: uuid.UUID, user_id: uuid.UUID) -> Any:
        pass
        
    @abstractmethod
    def process_action(self, match_id: uuid.UUID, user_id: uuid.UUID, action_type: str, data: Dict[str, Any]) -> Any:
        pass
