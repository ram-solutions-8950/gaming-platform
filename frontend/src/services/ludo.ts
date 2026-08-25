import api from './api';
import type { LudoMatch } from '../types/ludo';
import { v4 as uuidv4 } from 'uuid';

export const ludoService = {
  async joinMatchmaking(playerCount: number, entryFee: number): Promise<any> {
    const res = await api.post('/ludo/matchmaking/join', {
      player_count: playerCount,
      entry_fee: entryFee,
    });
    return res.data.data || res.data;
  },

  async cancelMatchmaking(): Promise<void> {
    await api.post('/ludo/matchmaking/cancel');
  },

  async getMatchmakingStatus(): Promise<any> {
    const res = await api.get('/ludo/matchmaking/status');
    return res.data.data || res.data;
  },

  async createMatch(turnTimeoutSeconds: number = 30): Promise<LudoMatch> {
    const res = await api.post<{ success: boolean; data: LudoMatch }>('/ludo/match', {
      turn_timeout_seconds: turnTimeoutSeconds,
    });
    // @ts-ignore - Some endpoints might not wrap in {success, data} depending on backend. We inspect the actual response.
    return res.data.data || res.data;
  },

  async joinMatch(matchId: string): Promise<LudoMatch> {
    const res = await api.post<{ success: boolean; data: LudoMatch }>(`/ludo/match/${matchId}/join`);
    // @ts-ignore
    return res.data.data || res.data;
  },

  async setReady(matchId: string): Promise<LudoMatch> {
    const res = await api.post<{ success: boolean; data: LudoMatch }>(`/ludo/match/${matchId}/ready`);
    // @ts-ignore
    return res.data.data || res.data;
  },

  async rollDice(matchId: string): Promise<{ roll: number; legal_moves: number[] }> {
    const res = await api.post<{ success: boolean; data: any }>(`/ludo/match/${matchId}/roll`, {
      match_id: matchId,
      idempotency_key: uuidv4(),
    });
    // @ts-ignore
    return res.data.data || res.data;
  },

  async moveToken(matchId: string, tokenIndex: number): Promise<{ moved: boolean }> {
    const res = await api.post<{ success: boolean; data: any }>(`/ludo/match/${matchId}/move`, {
      match_id: matchId,
      token_index: tokenIndex,
      idempotency_key: uuidv4(),
    });
    // @ts-ignore
    return res.data.data || res.data;
  },

  async claimTimeout(matchId: string): Promise<any> {
    const res = await api.post(`/ludo/match/${matchId}/timeout`);
    return res.data.data || res.data;
  },

  async getMatchState(matchId: string): Promise<LudoMatch> {
    const res = await api.get<{ success: boolean; data: LudoMatch }>(`/ludo/match/${matchId}/state`);
    // @ts-ignore
    return res.data.data || res.data;
  }
};
