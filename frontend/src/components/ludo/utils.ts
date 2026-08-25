export const LUDO_GRID_SIZE = 15;

export const SAFE_CELLS = [0, 8, 13, 21, 26, 34, 39, 47];

export interface CellCoord {
  row: number;
  col: number;
}

// Logical index 0-51 maps to the main path.
// Red starts at 0, Green at 13, Yellow at 26, Blue at 39.
// Path runs clockwise around the board.
export const COMMON_PATH: CellCoord[] = [
  // Red starting path (logical 0 - 4)
  { row: 6, col: 1 }, { row: 6, col: 2 }, { row: 6, col: 3 }, { row: 6, col: 4 }, { row: 6, col: 5 },
  // Turn up (5 - 10)
  { row: 5, col: 6 }, { row: 4, col: 6 }, { row: 3, col: 6 }, { row: 2, col: 6 }, { row: 1, col: 6 }, { row: 0, col: 6 },
  // Top horizontal (11 - 12)
  { row: 0, col: 7 }, { row: 0, col: 8 },
  // Green starting path / Turn down (13 - 17)
  { row: 1, col: 8 }, { row: 2, col: 8 }, { row: 3, col: 8 }, { row: 4, col: 8 }, { row: 5, col: 8 },
  // Turn right (18 - 23)
  { row: 6, col: 9 }, { row: 6, col: 10 }, { row: 6, col: 11 }, { row: 6, col: 12 }, { row: 6, col: 13 }, { row: 6, col: 14 },
  // Right vertical (24 - 25)
  { row: 7, col: 14 }, { row: 8, col: 14 },
  // Yellow starting path / Turn left (26 - 30)
  { row: 8, col: 13 }, { row: 8, col: 12 }, { row: 8, col: 11 }, { row: 8, col: 10 }, { row: 8, col: 9 },
  // Turn down (31 - 36)
  { row: 9, col: 8 }, { row: 10, col: 8 }, { row: 11, col: 8 }, { row: 12, col: 8 }, { row: 13, col: 8 }, { row: 14, col: 8 },
  // Bottom horizontal (37 - 38)
  { row: 14, col: 7 }, { row: 14, col: 6 },
  // Blue starting path / Turn up (39 - 43)
  { row: 13, col: 6 }, { row: 12, col: 6 }, { row: 11, col: 6 }, { row: 10, col: 6 }, { row: 9, col: 6 },
  // Turn left (44 - 49)
  { row: 8, col: 5 }, { row: 8, col: 4 }, { row: 8, col: 3 }, { row: 8, col: 2 }, { row: 8, col: 1 }, { row: 8, col: 0 },
  // Left vertical (50 - 51)
  { row: 7, col: 0 }, { row: 6, col: 0 }
];

export const HOME_PATHS: Record<string, CellCoord[]> = {
  RED: [
    { row: 7, col: 1 }, { row: 7, col: 2 }, { row: 7, col: 3 }, { row: 7, col: 4 }, { row: 7, col: 5 }
  ],
  GREEN: [
    { row: 1, col: 7 }, { row: 2, col: 7 }, { row: 3, col: 7 }, { row: 4, col: 7 }, { row: 5, col: 7 }
  ],
  YELLOW: [
    { row: 7, col: 13 }, { row: 7, col: 12 }, { row: 7, col: 11 }, { row: 7, col: 10 }, { row: 7, col: 9 }
  ],
  BLUE: [
    { row: 13, col: 7 }, { row: 12, col: 7 }, { row: 11, col: 7 }, { row: 10, col: 7 }, { row: 9, col: 7 }
  ]
};

export const HOME_ZONES: Record<string, CellCoord[]> = {
  RED: [
    { row: 2, col: 2 }, { row: 2, col: 3 }, { row: 3, col: 2 }, { row: 3, col: 3 }
  ],
  GREEN: [
    { row: 2, col: 11 }, { row: 2, col: 12 }, { row: 3, col: 11 }, { row: 3, col: 12 }
  ],
  YELLOW: [
    { row: 11, col: 11 }, { row: 11, col: 12 }, { row: 12, col: 11 }, { row: 12, col: 12 }
  ],
  BLUE: [
    { row: 11, col: 2 }, { row: 11, col: 3 }, { row: 12, col: 2 }, { row: 12, col: 3 }
  ]
};

export const CENTER_HOME = { row: 7, col: 7 };

export const getLogicalCellCoord = (color: string, position: number, tokenIndex: number): CellCoord => {
  if (position === -1) {
    // Return base coordinate
    return HOME_ZONES[color][tokenIndex];
  }
  if (position === 57) {
    // Return center home coordinate
    return CENTER_HOME;
  }
  if (position >= 52 && position <= 56) {
    // Return home path coordinate
    return HOME_PATHS[color][position - 52];
  }
  
  // Backend stores absolute position 0-51 on the main board.
  // COMMON_PATH is indexed 0-51 as the absolute board layout.
  // No color offset needed — backend positions are already absolute.
  return COMMON_PATH[position];
};
