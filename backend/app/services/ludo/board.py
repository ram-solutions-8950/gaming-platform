from typing import Dict, List, Optional
from ...models.ludo import LudoColor

# Each color has a specific start position and home path
# Main board is 0-51 (52 cells)
# Home paths are 52-56 (5 cells)
# Home is 57

STARTS = {
    LudoColor.RED: 0,
    LudoColor.GREEN: 13,
    LudoColor.YELLOW: 26,
    LudoColor.BLUE: 39
}

SAFE_CELLS = [0, 8, 13, 21, 26, 34, 39, 47]

def is_safe_cell(position: int) -> bool:
    return position in SAFE_CELLS or position >= 52

def get_next_position(current_pos: int, roll: int, color: LudoColor) -> Optional[int]:
    if current_pos == -1: # base
        if roll == 6:
            return STARTS[color]
        return None
        
    if current_pos == 57: # already home
        return None
        
    target = current_pos + roll
    
    # Check if currently on main board
    if current_pos <= 51:
        # Check transition to home path
        turn_pos = (STARTS[color] - 2) % 52
        if turn_pos < 0:
            turn_pos += 52
            
        # Distance from current to turn_pos
        dist_to_turn = (turn_pos - current_pos) % 52
        if dist_to_turn < 0:
            dist_to_turn += 52
            
        if dist_to_turn < roll and current_pos != turn_pos:
            # We are entering home path
            remaining = roll - dist_to_turn - 1
            if remaining < 5:
                return 52 + remaining
            elif remaining == 5:
                return 57
            else:
                return None # overshoot
                
        # Normal move on main board
        return target % 52
        
    # Already on home path
    if target <= 56:
        return target
    elif target == 57:
        return 57
        
    return None # overshoot
