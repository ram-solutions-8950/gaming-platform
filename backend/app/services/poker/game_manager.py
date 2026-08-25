from typing import Dict, Optional, List
from .engine import PokerEngine

class PokerGameManager:
    def __init__(self):
        self.tables: Dict[str, PokerEngine] = {}

    def get_or_create_table(self, table_id: str, is_practice: bool = False, small_blind: int = 100, big_blind: int = 200, max_players: int = 6) -> PokerEngine:
        if table_id not in self.tables:
            self.tables[table_id] = PokerEngine(
                table_id=table_id,
                is_practice=is_practice,
                small_blind=small_blind,
                big_blind=big_blind,
                max_players=max_players
            )
        return self.tables[table_id]

    def get_table(self, table_id: str) -> Optional[PokerEngine]:
        return self.tables.get(table_id)

    def list_tables(self) -> List[Dict]:
        res = []
        for t in self.tables.values():
            res.append({
                "table_id": t.table_id,
                "is_practice": t.is_practice,
                "small_blind": t.small_blind,
                "big_blind": t.big_blind,
                "max_players": t.max_players,
                "player_count": len(t.players),
                "phase": t.phase,
            })
        return res

poker_manager = PokerGameManager()
