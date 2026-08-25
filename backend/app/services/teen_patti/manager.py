"""
In-memory registry of live Teen Patti hands, keyed by table ID.
"""
from __future__ import annotations

from threading import RLock
from typing import Dict, Optional

from .engine import GameConfig, TeenPattiHand


class TeenPattiGameManager:
    def __init__(self) -> None:
        self._lock = RLock()
        self._games: Dict[str, TeenPattiHand] = {}

    def get_or_create(self, table_id: str, config: GameConfig) -> TeenPattiHand:
        with self._lock:
            if table_id not in self._games:
                self._games[table_id] = TeenPattiHand(config)
            return self._games[table_id]

    def get(self, table_id: str) -> Optional[TeenPattiHand]:
        with self._lock:
            return self._games.get(table_id)

    def remove(self, table_id: str) -> Optional[TeenPattiHand]:
        with self._lock:
            return self._games.pop(table_id, None)

    def clear(self) -> None:
        with self._lock:
            self._games.clear()


teen_patti_manager = TeenPattiGameManager()
