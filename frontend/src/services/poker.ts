import api from './api';

export interface PokerTableInfo {
  id: string;
  name: string;
  is_practice: boolean;
  small_blind: number;
  big_blind: number;
  min_buy_in: number;
  max_buy_in: number;
  max_players: number;
  player_count: number;
  phase: string;
}

export interface CreatePokerTableData {
  name?: string;
  is_practice?: boolean;
  small_blind?: number;
  big_blind?: number;
  min_buy_in?: number;
  max_buy_in?: number;
  max_players?: number;
}

export const pokerService = {
  getTables: async (): Promise<PokerTableInfo[]> => {
    const response = await api.get('/poker/tables');
    return response.data;
  },

  createTable: async (data: CreatePokerTableData): Promise<PokerTableInfo> => {
    const response = await api.post('/poker/tables', data);
    return response.data;
  },

  getTableDetails: async (tableId: string): Promise<any> => {
    const response = await api.get(`/poker/tables/${tableId}`);
    return response.data;
  },

  joinTable: async (tableId: string, buyInAmount: number): Promise<any> => {
    const response = await api.post(`/poker/tables/${tableId}/join`, { buy_in_amount: buyInAmount });
    return response.data;
  },

  leaveTable: async (tableId: string): Promise<any> => {
    const response = await api.post(`/poker/tables/${tableId}/leave`);
    return response.data;
  },

  getHistory: async (): Promise<any[]> => {
    const response = await api.get('/poker/history');
    return response.data;
  },
};
