import api from '../api';

export interface Triple777Config {
  min_bet: number;
  max_bet: number;
  symbols: string[];
  paytable: Record<string, number>;
}

export interface SpinResponse {
  round_id: string;
  round_code: string;
  reels: [string, string, string];
  won: boolean;
  symbol: string | null;
  multiplier: number;
  payout: number;
  tier: "jackpot" | "bigwin" | "win" | "loss";
  balance: number;
  jackpot_won: number;
  jackpot_amount: number;
}

export interface HistoryItem {
  round_code: string;
  stake: number;
  reels: string[];
  won: boolean;
  status: "WON" | "LOST";
  multiplier: number;
  payout: number;
  jackpot_payout: number;
  balance_after: number;
  created_at: number;
}

export async function getConfig(): Promise<Triple777Config> {
  const res = await api.get('/games/triple-777/config');
  return res.data.data;
}

export async function getJackpot(): Promise<number> {
  const res = await api.get('/games/triple-777/jackpot');
  return res.data.data.amount;
}

export async function spin(stake: number, clientSeed?: string, nonce?: number): Promise<SpinResponse> {
  const res = await api.post('/games/triple-777/spin', {
    stake,
    client_seed: clientSeed,
    nonce,
  });
  return res.data.data;
}

export async function getHistory(): Promise<HistoryItem[]> {
  const res = await api.get('/games/triple-777/history');
  return res.data.data;
}
