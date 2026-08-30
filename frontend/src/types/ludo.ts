export type LudoColor = 'RED' | 'GREEN' | 'YELLOW' | 'BLUE';

export type LudoMatchStatus = 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface LudoToken {
  id: string;
  token_index: number;
  position: number; // -1 = yard, 0..50 = track, 51..55 = home path, 56 = home
  is_home: boolean;
}

export interface LudoPlayer {
  id: string;
  user_id: string;
  username?: string;
  color: LudoColor;
  seat_index: number;
  is_ready: boolean;
  rank?: number | null;
  consecutive_timeouts: number;
  tokens: LudoToken[];
}

export interface LudoMatchState {
  id: string;
  status: LudoMatchStatus;
  current_turn_color: LudoColor | null;
  last_dice_roll: number | null;
  turn_timeout_seconds: number;
  remaining_timer_seconds: number;
  entry_fee: number;
  prize_pool: number;
  is_settled: boolean;
  created_at: string;
  players: LudoPlayer[];
  legal_token_indices: number[];
}

export interface MatchmakingStatus {
  status: 'SEARCHING' | 'MATCHED' | 'CANCELLED' | 'NONE' | 'TIMEOUT';
  match_id?: string;
  elapsed_seconds?: number;
  remaining_seconds?: number;
}
