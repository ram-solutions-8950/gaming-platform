export type LudoMatchStatus = 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type LudoColor = 'RED' | 'GREEN' | 'YELLOW' | 'BLUE';

export interface LudoToken {
  id: string;
  player_id: string;
  token_index: number;
  position: number;
  is_home: boolean;
}

export interface LudoPlayer {
  id: string;
  user_id: string;
  color: LudoColor;
  seat_index: number;
  is_ready: boolean;
  rank: number | null;
  tokens: LudoToken[];
}

export interface LudoMatch {
  id: string;
  status: LudoMatchStatus;
  current_turn_color: LudoColor | null;
  last_dice_roll: number | null;
  turn_timeout_seconds: number;
  turn_started_at: string | null;
  version: number;
  entry_fee: number;
  prize_pool: number;
  is_settled: boolean;
  players: LudoPlayer[];
}

export interface CreateMatchRequest {
  turn_timeout_seconds?: number;
}

export interface JoinMatchRequest {
  match_id: string;
}

export interface ReadyRequest {
  match_id: string;
}

export interface RollDiceRequest {
  match_id: string;
  idempotency_key: string;
}

export interface MoveTokenRequest {
  match_id: string;
  token_index: number;
  idempotency_key: string;
}

export interface WSMessage {
  type: string;
  data: Record<string, any>;
  version?: number | null;
}
