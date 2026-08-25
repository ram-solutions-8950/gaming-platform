from typing import List
from ...models.ludo import LudoToken, LudoColor
from .board import get_next_position, is_safe_cell

def can_move(token: LudoToken, roll: int, color: LudoColor) -> bool:
    pos = get_next_position(token.position, roll, color)
    return pos is not None

def get_legal_moves(tokens: List[LudoToken], roll: int, color: LudoColor) -> List[int]:
    """Returns a list of token_indexes that can move"""
    return [t.token_index for t in tokens if can_move(t, roll, color)]

def check_capture(tokens_in_play: List[LudoToken], target_pos: int, moving_color: LudoColor) -> List[LudoToken]:
    """Returns tokens to be sent back to base"""
    if is_safe_cell(target_pos):
        return []
        
    if target_pos < 0 or target_pos > 51:
        return []
        
    captured = []
    for t in tokens_in_play:
        if t.position == target_pos and t.player.color != moving_color:
            captured.append(t)
    return captured
    
def has_won(tokens: List[LudoToken]) -> bool:
    return all(t.is_home for t in tokens)
