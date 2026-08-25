/**
 * Teen Patti API Service & Type Definitions.
 */
import api from './api';

export interface TeenPattiTable {
  id: string;
  name: string;
  mode: 'virtual' | 'real';
  status: 'open' | 'running' | 'finished';
  max_players: number;
  boot_amount: number;
  turn_seconds: number;
  is_private: boolean;
  join_code?: string | null;
  created_at: string;
  player_count: number;
}

export interface TableCreatePayload {
  name: string;
  mode: 'virtual' | 'real';
  max_players: number;
  boot_amount: number;
  turn_seconds: number;
  is_private: boolean;
}

export interface HandHistoryItem {
  id: string;
  table_id?: string;
  mode: string;
  boot: number;
  pot: number;
  winner_seat: number;
  won: boolean;
  payout: number;
  hand_json: string;
  created_at: string;
}

export interface TeenPattiSeat {
  id: string;
  name: string;
  is_bot: boolean;
  seen: boolean;
  status: 'active' | 'packed' | 'lost_side_show' | 'show_winner' | 'show_loser';
  total_bet: number;
  cards: string[] | null;
  card_count: number;
}

export interface TeenPattiGameState {
  phase: 'waiting' | 'boot' | 'playing' | 'showdown' | 'finished';
  pot: number;
  current_stake: number;
  current_turn: number;
  dealer_seat: number;
  winner_seat: number | null;
  reason: string | null;
  seats: TeenPattiSeat[];
  last_action?: {
    seat: number;
    user_id?: string;
    action: string;
    amount?: number;
    pot?: number;
  } | null;
}

export const teenPattiService = {
  getTables: async (mode?: string): Promise<TeenPattiTable[]> => {
    const res = await api.get('/teen-patti/tables', { params: mode ? { mode } : {} });
    return res.data;
  },

  getTable: async (tableId: string): Promise<TeenPattiTable> => {
    const res = await api.get(`/teen-patti/tables/${tableId}`);
    return res.data;
  },

  createTable: async (payload: TableCreatePayload): Promise<TeenPattiTable> => {
    const res = await api.post('/teen-patti/tables', payload);
    return res.data;
  },

  joinByCode: async (code: string): Promise<TeenPattiTable> => {
    const res = await api.post('/teen-patti/tables/join-by-code', { code });
    return res.data;
  },

  getHistory: async (): Promise<HandHistoryItem[]> => {
    const res = await api.get('/teen-patti/history');
    return res.data;
  },
};
