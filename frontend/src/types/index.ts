export type UserRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN';
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
export type TxType = 'DEPOSIT' | 'GAME_ENTRY' | 'GAME_WIN' | 'GAME_LOSS' | 'WITHDRAWAL' | 'REFUND' | 'ADJUSTMENT';
export type TxStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REVERSED';
export type DepositStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
export type WithdrawalStatus = 'PENDING' | 'PROCESSING' | 'APPROVED' | 'REJECTED' | 'FAILED' | 'CANCELLED';

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
  created_at: string;
}
