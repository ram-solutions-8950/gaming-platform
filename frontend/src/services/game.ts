import api from './api';
import type { GameState, GameBet, GameRound, GameRoundAdmin, PaginatedResult } from '../types';

export const gameService = {
  async getCurrentRound(gameSlug?: string, gameId?: string): Promise<GameState> {
    const params: Record<string, string> = {};
    if (gameSlug) params.game_slug = gameSlug;
    if (gameId) params.game_id = gameId;
    const res = await api.get('/games/current', { params });
    return res.data.data;
  },

  async getHistory(limit = 20, gameSlug?: string, gameId?: string): Promise<GameRound[]> {
    const params: Record<string, string | number> = { limit };
    if (gameSlug) params.game_slug = gameSlug;
    if (gameId) params.game_id = gameId;
    const res = await api.get('/games/history', { params });
    return res.data.data;
  },

  async placeBet(round_id: string, prediction: string, amount: number, game_id?: string): Promise<GameBet> {
    const payload: Record<string, string | number> = { round_id, prediction, amount };
    if (game_id) payload.game_id = game_id;
    const res = await api.post('/games/bet', payload);
    return res.data.data;
  },

  async getMyBets(page = 1, page_size = 20, gameSlug?: string, gameId?: string): Promise<PaginatedResult<GameBet>> {
    const params: Record<string, string | number> = { page, page_size };
    if (gameSlug) params.game_slug = gameSlug;
    if (gameId) params.game_id = gameId;
    const res = await api.get('/games/my-bets', { params });
    return res.data.data;
  },

  // Admin
  async getAdminRounds(page = 1, page_size = 20): Promise<PaginatedResult<GameRoundAdmin>> {
    const res = await api.get('/admin/games/rounds', { params: { page, page_size } });
    return res.data.data;
  },

  async getAdminBets(round_id?: string, page = 1, page_size = 20): Promise<PaginatedResult<GameBet>> {
    const params: Record<string, unknown> = { page, page_size };
    if (round_id) params.round_id = round_id;
    const res = await api.get('/admin/games/bets', { params });
    return res.data.data;
  },

  // Catalog
  async getCatalog(): Promise<import('../types').CatalogGame[]> {
    const res = await api.get('/games/catalog');
    return res.data.data;
  },

  async getAdminCatalog(): Promise<import('../types').CatalogGame[]> {
    const res = await api.get('/admin/games');
    return res.data.data;
  },

  async createCatalogGame(data: Partial<import('../types').CatalogGame>): Promise<import('../types').CatalogGame> {
    const res = await api.post('/admin/games', data);
    return res.data.data;
  },

  async updateCatalogGame(id: string, data: Partial<import('../types').CatalogGame>): Promise<import('../types').CatalogGame> {
    const res = await api.patch(`/admin/games/${id}`, data);
    return res.data.data;
  },

  async activateCatalogGame(id: string): Promise<void> {
    await api.post(`/admin/games/${id}/activate`);
  },

  async deactivateCatalogGame(id: string): Promise<void> {
    await api.post(`/admin/games/${id}/deactivate`);
  },
};
