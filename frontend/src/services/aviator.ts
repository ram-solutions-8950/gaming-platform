import api from './api';

export interface AviatorRoundHistoryItem {
  id: string;
  nonce: number;
  server_seed_hash: string;
  server_seed?: string | null;
  crash_multiplier?: number | null;
  status: string;
  betting_started_at: string;
  flight_started_at?: string | null;
  crashed_at?: string | null;
  settled_at?: string | null;
}

export interface AviatorBetHistoryItem {
  id: string;
  user_id: string;
  round_id: string;
  slot: number;
  amount: number;
  auto_cashout?: number | null;
  status: string;
  cashout_multiplier?: number | null;
  payout: number;
  cashed_out_at?: string | null;
  created_at: string;
}

export interface AviatorFairnessData {
  round_id: string;
  nonce: number;
  server_seed_hash: string;
  server_seed?: string | null;
  crash_multiplier?: number | null;
  status: string;
  verification_note: string;
}

export const aviatorService = {
  async getHistory(limit = 20): Promise<AviatorRoundHistoryItem[]> {
    const res = await api.get('/aviator/history', { params: { limit } });
    return res.data.data;
  },

  async getMyBets(limit = 20): Promise<AviatorBetHistoryItem[]> {
    const res = await api.get('/aviator/my-bets', { params: { limit } });
    return res.data.data;
  },

  async getFairness(roundId: string): Promise<AviatorFairnessData> {
    const res = await api.get(`/aviator/fairness/${roundId}`);
    return res.data.data;
  },
};
