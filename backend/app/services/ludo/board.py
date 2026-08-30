from typing import Dict, List, Tuple
from ...models.ludo import LudoColor

# Common track has 52 cells: 0 to 51
TRACK_LENGTH = 52

# Starting cell offset on common track for each color
START_OFFSETS: Dict[LudoColor, int] = {
    LudoColor.RED: 0,
    LudoColor.GREEN: 13,
    LudoColor.YELLOW: 26,
    LudoColor.BLUE: 39,
}

# 8 Safe cells on the common track: 4 starting cells + 4 star cells
STAR_CELLS = [8, 21, 34, 47]
SAFE_CELLS: List[int] = sorted([0, 13, 26, 39] + STAR_CELLS)

# Maximum steps:
# Step -1: In Yard
# Step 0: At color's starting cell on track
# Steps 0..50: On common track (51 cells total)
# Steps 51..55: Private home path (5 cells)
# Step 56: Home (finished)
HOME_STEP = 56
MAX_TRACK_STEP = 50

def get_absolute_position(step: int, color: LudoColor) -> int:
    """
    Converts a player's relative step (-1 to 56) into a globally unique board position.
    - Yard: -1
    - Common track (0..50): 0..51
    - Home path (51..55): 100 + color_offset + (step - 51)
    - Home (56): 200 + color_offset
    """
    if step == -1:
        return -1
    if step <= MAX_TRACK_STEP:
        return (START_OFFSETS[color] + step) % TRACK_LENGTH
    if step < HOME_STEP:
        color_idx = [LudoColor.RED, LudoColor.GREEN, LudoColor.YELLOW, LudoColor.BLUE].index(color)
        return 100 + (color_idx * 10) + (step - 51)
    return 200 + [LudoColor.RED, LudoColor.GREEN, LudoColor.YELLOW, LudoColor.BLUE].index(color)

def is_cell_safe(abs_pos: int) -> bool:
    """Checks if a global board position is safe from capture."""
    if abs_pos < 0 or abs_pos >= 100:
        # Yard, Home Path, and Home are always safe from opponent capture
        return True
    return abs_pos in SAFE_CELLS
