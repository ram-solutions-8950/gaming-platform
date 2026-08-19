export type UserRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN';
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
export type TxType = 'DEPOSIT' | 'GAME_ENTRY' | 'GAME_WIN' | 'GAME_LOSS' | 'WITHDRAWAL' | 'REFUND' | 'ADJUSTMENT';
export type TxStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REVERSED';
export type DepositStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
export type WithdrawalStatus = 'PENDING' | 'PROCESSING' | 'APPROVED' | 'REJECTED' | 'FAILED' | 'CANCELLED' | 'COMPLETED';

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  last_login_at: string | null;
}

export interface Wallet {
  id: string;
  user_id: string;
  balance: number;
  balance_inr: string;
}

export interface WalletTransaction {
  id: string;
  type: TxType;
  amount: number;
  balance_before: number;
  balance_after: number;
  reference_type: string | null;
  reference_id: string | null;
  status: TxStatus;
  created_at: string;
}

export interface PaginatedResult<T> {
  total: number;
  page: number;
  page_size: number;
  items: T[];
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export interface Deposit {
  id: string;
  user_id: string;
  amount: number;
  status: DepositStatus;
  provider: string | null;
  created_at: string;
}

export interface Withdrawal {
  id: string;
  user_id: string;
  amount: number;
  status: WithdrawalStatus;
  method: string | null;
  destination: string | null;
  created_at: string;
  updated_at: string | null;
  processed_at: string | null;
}

// ── Game types ─────────────────────────────────────────────────────
export type GameRoundStatus = 'BETTING' | 'CALCULATING' | 'COMPLETED';
export type GamePrediction = 'RED' | 'GREEN' | 'VIOLET' | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
export type GameBetStatus = 'PENDING' | 'WON' | 'LOST';

export interface GameRound {
  id: string;
  status: GameRoundStatus;
  result_color: string | null;
  result_number: string | null;
  started_at: string;
  betting_closes_at: string;
  ended_at: string | null;
}

export interface GameBet {
  id: string;
  user_id: string;
  round_id: string;
  prediction: string;
  amount: number;
  entry_fee_amount: number;
  stake_amount: number;
  gross_win_amount: number | null;
  winning_fee_amount: number | null;
  net_win_amount: number | null;
  status: GameBetStatus;
  created_at: string;
  settled_at: string | null;
}

export interface GameState {
  round: GameRound | null;
  server_time: string;
  seconds_remaining: number;
}

export interface GameRoundAdmin extends GameRound {
  total_bets: number;
  total_amount: number;
}

