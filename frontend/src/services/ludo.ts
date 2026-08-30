import api from './api';
import type { LudoMatchState, MatchmakingStatus } from '../types/ludo';

export const ludoService = {
  async joinMatchmaking(playerCount: number, entryFee: number): Promise<{ status: string; match_id?: string; queue_id?: string }> {
    const res = await api.post('/ludo/matchmaking/join', {
      player_count: playerCount,
      entry_fee: entryFee,
    });
    return res.data;
  },

  async cancelMatchmaking(): Promise<{ cancelled: boolean }> {
    const res = await api.post('/ludo/matchmaking/cancel');
    return res.data;
  },

  async getMatchmakingStatus(): Promise<MatchmakingStatus> {
    const res = await api.get('/ludo/matchmaking/status');
    return res.data;
  },

  async getMatchState(matchId: string): Promise<LudoMatchState> {
    const res = await api.get(`/ludo/match/${matchId}/state`);
    return res.data;
  },

  async rollDice(matchId: string): Promise<any> {
    const res = await api.post(`/ludo/match/${matchId}/roll`);
    return res.data;
  },

  async moveToken(matchId: string, tokenIndex: number): Promise<any> {
    const res = await api.post(`/ludo/match/${matchId}/move`, { token_index: tokenIndex });
    return res.data;
  },

  async forceTimeout(matchId: string): Promise<any> {
    const res = await api.post(`/ludo/match/${matchId}/timeout`);
    return res.data;
  },

  async leaveMatch(matchId: string): Promise<any> {
    const res = await api.post(`/ludo/match/${matchId}/leave`);
    return res.data;
  },
};
