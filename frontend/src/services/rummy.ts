import api from "./api";

export interface RummyTableOut {
  id: string;
  name: string;
  mode: "real_money" | "free";
  status: "open" | "running" | "finished";
  max_players: number;
  num_deals: number;
  entry_fee_paise: number;
  pool_limit?: number | null;
  turn_seconds: number;
  starting_chips: number;
  is_private: boolean;
  join_code?: string | null;
  online_players: number;
  created_at: string;
}

export interface RummyTableCreate {
  name: string;
  mode: "real_money" | "free";
  max_players: number;
  num_deals: number;
  entry_fee_paise: number;
  pool_limit?: number | null;
  turn_seconds?: number;
  starting_chips?: number;
  is_private?: boolean;
}

export const RummyApi = {
  async listTables(): Promise<RummyTableOut[]> {
    const res = await api.get("/rummy/tables");
    return res.data;
  },

  async createTable(data: RummyTableCreate): Promise<RummyTableOut> {
    const res = await api.post("/rummy/tables", data);
    return res.data;
  },

  async getTable(tableId: string): Promise<RummyTableOut> {
    const res = await api.get(`/rummy/tables/${tableId}`);
    return res.data;
  },

  async joinByCode(code: string): Promise<RummyTableOut> {
    const res = await api.post("/rummy/tables/join-by-code", { code });
    return res.data;
  },

  async getHistory(): Promise<any[]> {
    const res = await api.get("/rummy/history");
    return res.data;
  },
};
