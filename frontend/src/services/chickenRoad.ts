import api from './api';

export type GameStatus = 'READY' | 'ACTIVE' | 'WON' | 'LOST' | 'CASHED_OUT';
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface ChickenRoadState {
  round_id?: string;
  status: GameStatus;
  difficulty?: Difficulty;
  bet_amount?: number;
  current_lane?: number;
  total_lanes?: number;
  current_multiplier?: number;
  next_multiplier?: number;
  multipliers?: number[];
  difficulty_multipliers?: Record<Difficulty, number[]>;
  potential_win?: number;
  wallet_balance?: number;
}

export interface StartResponse {
  round_id: string;
  status: 'ACTIVE';
  difficulty: Difficulty;
  bet_amount: number;
  current_lane: number;
  total_lanes: number;
  current_multiplier: number;
  next_multiplier: number;
  multipliers: number[];
  potential_win: number;
  wallet_balance: number;
}

export interface CrossLaneResponse {
  round_id: string;
  status: 'ACTIVE';
  current_lane: number;
  total_lanes: number;
  current_multiplier: number;
  next_multiplier: number;
  potential_win: number;
}

export interface FinishResponse {
  round_id: string;
  status: 'WON';
  multiplier: number;
  bet_amount: number;
  won_amount: number;
  wallet_balance: number;
}

export interface CollisionResponse {
  round_id: string;
  status: 'LOST';
  lane_index: number;
  bet_amount: number;
  won_amount: number;
}

export interface CashoutResponse {
  round_id: string;
  status: 'CASHED_OUT';
  multiplier: number;
  bet_amount: number;
  won_amount: number;
  wallet_balance: number;
}

export const chickenRoadService = {
  async getState(): Promise<ChickenRoadState> {
    const res = await api.get('/games/chicken-road/state');
    return res.data.data;
  },

  async startGame(bet_amount: number, difficulty: Difficulty = 'EASY'): Promise<StartResponse> {
    const res = await api.post('/games/chicken-road/start', { bet_amount, difficulty });
    return res.data.data;
  },

  async crossLane(round_id: string, lane_index: number): Promise<CrossLaneResponse> {
    const res = await api.post('/games/chicken-road/cross-lane', { round_id, lane_index });
    return res.data.data;
  },

  async finishGame(round_id: string): Promise<FinishResponse> {
    const res = await api.post('/games/chicken-road/finish', { round_id });
    return res.data.data;
  },

  async reportCollision(round_id: string, lane_index: number): Promise<CollisionResponse> {
    const res = await api.post('/games/chicken-road/collision', { round_id, lane_index });
    return res.data.data;
  },

  async cashout(round_id: string): Promise<CashoutResponse> {
    const res = await api.post('/games/chicken-road/cashout', { round_id });
    return res.data.data;
  },
};
