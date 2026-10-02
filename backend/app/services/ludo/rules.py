from typing import List, Optional, Tuple, Dict
from ...models.ludo import LudoColor, LudoToken
from .board import (
    HOME_STEP,
    TRACK_LENGTH,
    MAX_TRACK_STEP,
    get_absolute_position,
    is_cell_safe,
)

def get_target_step(current_step: int, roll: int) -> Optional[int]:
    """Calculates the target step given current step and dice roll (1-6)."""
    if current_step == -1:
        # Can only exit yard on a 6
        return 0 if roll == 6 else None
    
    target = current_step + roll
    if target > HOME_STEP:
        # Must reach home with an exact roll
        return None
    return target

def find_blockades(all_tokens: List[LudoToken], color_map: Dict[str, LudoColor]) -> Dict[int, LudoColor]:
    """Preserved for compatibility. In standard casual rules, blockades do not block movement."""
    return {}

def can_move_token(
    token: LudoToken,
    roll: int,
    color: LudoColor,
    all_tokens: List[LudoToken],
    color_map: Dict[str, LudoColor],
) -> bool:
    """Validates whether a specific token can be legally moved by dice roll."""
    if token.is_home or token.position >= HOME_STEP:
        return False

    target_step = get_target_step(token.position, roll)
    if target_step is None:
        return False

    # Standard casual Ludo rules: Tokens can freely jump over and pass any occupied squares.
    return True

def get_legal_token_indices(
    player_tokens: List[LudoToken],
    roll: int,
    color: LudoColor,
    all_tokens: List[LudoToken],
    color_map: Dict[str, LudoColor],
) -> List[int]:
    """Returns the list of token_index values (0..3) that can legally move."""
    legal = []
    for t in player_tokens:
        if can_move_token(t, roll, color, all_tokens, color_map):
            legal.append(t.token_index)
    return legal

def check_capture(
    target_abs_pos: int,
    moving_color: LudoColor,
    all_tokens: List[LudoToken],
    color_map: Dict[str, LudoColor],
) -> Optional[LudoToken]:
    """
    Checks if moving to target_abs_pos captures an opponent token.
    Safe cells cannot be captured. Blockades cannot be captured.
    Returns the captured LudoToken if capture occurs.
    """
    if is_cell_safe(target_abs_pos):
        return None

    for t in all_tokens:
        if t.position < 0 or t.position >= HOME_STEP:
            continue
        c = color_map.get(str(t.player_id))
        if c and c != moving_color:
            t_abs = get_absolute_position(t.position, c)
            if t_abs == target_abs_pos:
                return t
    return None

def check_player_won(player_tokens: List[LudoToken]) -> bool:
    """Player wins when all 4 tokens have reached HOME (step 56)."""
    return len(player_tokens) == 4 and all(t.position >= HOME_STEP for t in player_tokens)
