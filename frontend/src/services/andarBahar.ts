import type { Card } from "../game/andarBahar/deck";
import type { Side } from "../game/andarBahar/andarBahar";
import api from "./api";
import { walletService } from "./wallet";
import { gameService } from "./game";
import type { GameRound, GameState } from "../types";

export interface HistoryEntry {
  id: string;
  ts: number;
  openCard: Card;
  bet: Side;
  stake: number;
  winner: Side;
  won: boolean;
  payout: number;
  cardsDealt?: number;
}

export const SLUG = "andar-bahar";

export async function getCurrentRound(): Promise<GameState> {
  return await gameService.getCurrentRound(SLUG);
}

export async function getRoundHistory(limit = 20): Promise<GameRound[]> {
  return await gameService.getHistory(limit, SLUG);
}

export async function placeBet(roundId: string, prediction: "ANDAR" | "BAHAR", amountInPaise: number, gameId?: string) {
  return await gameService.placeBet(roundId, prediction, amountInPaise, gameId);
}

export async function getRealBalance(): Promise<number> {
  try {
    const w = await walletService.getWallet();
    return Math.floor((w.balance || 0) / 100); // return in INR
  } catch {
    return 1000;
  }
}

export async function pingServer(_url?: string): Promise<boolean> {
  try {
    const res = await api.get("/health");
    return res.status === 200;
  } catch {
    return false;
  }
}

// ---- Legacy / Auxiliary Table types for multi-table screens ----
export interface TableOut {
  id: string;
  name: string;
  mode: "virtual" | "real";
  status: string;
  max_players: number;
  betting_seconds: number;
  online_players: number;
  is_private: boolean;
  join_code: string | null;
}

export interface TablePublicState {
  table_id: string;
  phase: "waiting" | "betting" | "dealing" | "settled";
  round_number: number;
  betting_seconds: number;
  bets: Array<{ user_id: string; name: string; side: Side; stake: number }>;
  round: {
    middle: Card;
    steps: Array<{ side: Side; card: Card }>;
    andar: Card[];
    bahar: Card[];
    winner: Side;
    cardsDealt: number;
  } | null;
  settlements: Record<string, { payout: number; won: boolean; returned: number }>;
}

export interface AndarBaharSocket {
  bet(side: Side, stake: number): void;
  close(): void;
}

export function getServerUrl(): string {
  return localStorage.getItem("ab_server_url") || "";
}

export function setServerUrl(url: string): void {
  localStorage.setItem("ab_server_url", url.trim());
}

export function getVirtualBalance(fallback = 1000): number {
  const v = localStorage.getItem("ab_virtual_balance");
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export function setVirtualBalance(balance: number): void {
  localStorage.setItem("ab_virtual_balance", String(Math.round(balance)));
}

export async function listTables(_serverUrl?: string): Promise<TableOut[]> {
  return [];
}

export async function findOrCreateTable(
  _serverUrl: string,
  mode: "virtual" | "real",
  bettingSeconds: number
): Promise<TableOut> {
  return {
    id: "live-table-1",
    name: "Andar Bahar Live",
    mode,
    status: "ACTIVE",
    max_players: 8,
    betting_seconds: bettingSeconds,
    online_players: 1,
    is_private: false,
    join_code: null,
  };
}

export async function connectAndarBaharTable(
  _serverUrl: string,
  _tableId: string,
  _handlers: any
): Promise<AndarBaharSocket> {
  return {
    bet: () => {},
    close: () => {},
  };
}
