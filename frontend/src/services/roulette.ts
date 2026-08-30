import api from './api';

export interface RouletteBetEntry {
  bet_type: string;
  target: string;
  amount: number;
}

export interface RouletteState {
  round_id: string;
  phase: 'BETTING' | 'STOP_BETTING' | 'SPINNING' | 'RESULT';
  seconds_left: number;
  winning_number: number | null;
  winning_color: 'green' | 'red' | 'black' | null;
  history: Array<{ number: number; color: 'green' | 'red' | 'black' }>;
  my_bets: Array<{
    bet_id: string;
    bet_type: string;
    target: string;
    amount_inr: number;
    is_won: boolean;
    win_inr: number;
  }>;
  my_total_bet_inr: number;
  total_bet_pool_inr: number;
  vip_players: Array<{
    name: string;
    vip: string;
    avatar: string;
    balance_inr: number;
    last_win: number | null;
  }>;
  server_time: string;
}

export const rouletteService = {
  async getState(): Promise<RouletteState> {
    const res = await api.get('/games/roulette/state');
    return res.data.data;
  },

  async placeBets(bets: RouletteBetEntry[]): Promise<{ success: boolean; placed_count: number; total_debited_inr: number }> {
    const res = await api.post('/games/roulette/bet', { bets });
    return res.data.data;
  },

  async clearBets(): Promise<{ success: boolean; refunded_inr: number }> {
    const res = await api.post('/games/roulette/clear');
    return res.data.data;
  },

  async getHistory(): Promise<Array<{ number: number; color: 'green' | 'red' | 'black' }>> {
    const res = await api.get('/games/roulette/history');
    return res.data.data.history;
  },
};
