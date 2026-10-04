import api from './api';

export interface DashboardStats {
  total_players: number;
  total_admin_users: number;
  active_players: number;
  total_deposits_inr: number;
  total_deposits_count: number;
  total_withdrawals_inr: number;
  total_withdrawals_count: number;
  pending_withdrawals: number;
  total_revenue_inr: number;
  coin_circulation: number;
  games_overview: Array<{
    id: string;
    name: string;
    slug: string;
    game_type: string;
    is_live: boolean;
    active_players: number;
    min_bet_inr: number;
    max_bet_inr: number;
  }>;
  live_players: Array<{
    user_id: string;
    display_name: string;
    game_name: string;
    action: string;
    amount_inr: number;
    time: string;
  }>;
  recent_transactions: Array<{
    id: string;
    full_id?: string;
    user_name: string;
    type: string;
    amount_inr: number;
    status: string;
    date: string;
  }>;
  withdrawal_requests: Array<{
    id: string;
    full_id?: string;
    user_name: string;
    amount_inr: number;
    payment_mode: string;
    status: string;
    date: string;
  }>;
  device_distribution: {
    android: number;
    ios: number;
    web: number;
    others: number;
  };
}

export interface TeamMember {
  id: string;
  name: string;
  username: string;
  email: string;
  role: string;
  team_role: string;
  status: string;
  permissions: string[];
  created_at: string | null;
  last_login_at: string | null;
}

export interface WagerRequirementItem {
  id: string;
  user_id: string;
  username: string;
  user_name: string;
  deposit_id: string | null;
  required_amount_paise: number;
  required_amount_inr: number;
  completed_amount_paise: number;
  completed_amount_inr: number;
  remaining_amount_inr: number;
  progress_percent: number;
  is_fulfilled: boolean;
  status?: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface GlobalWinningConfig {
  game_id: string;
  name: string;
  slug: string;
  game_type: string;
  status: string;
  mode: string;
  rtp_percent: number;
  house_edge_percent: number;
  min_bet: number;
  max_bet: number;
  updated_at: string | null;
}

export interface PersonalWinningControl {
  id: string;
  user_id: string;
  username: string;
  name: string;
  email: string;
  mode: string;
  win_rate_percent: number;
  note: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export const adminService = {
  // Fast Dashboard
  getDashboardStats: async (): Promise<DashboardStats> => {
    const res = await api.get('/admin/dashboard/stats');
    return res.data.data;
  },

  // On-Demand Deep Game Analytics
  getDashboardAnalytics: async (period = 'weekly', gameSlug = 'all') => {
    const res = await api.get(`/admin/dashboard/analytics?period=${period}&game_slug=${gameSlug}`);
    return res.data.data;
  },

  // Current Admin Info & Permissions
  getCurrentAdminMe: async () => {
    const res = await api.get('/admin/me');
    return res.data.data;
  },

  // RBAC & Team Management
  getTeamMembers: async (): Promise<TeamMember[]> => {
    const res = await api.get('/admin/team');
    return res.data.data;
  },

  createTeamMember: async (payload: {
    name: string;
    username: string;
    email: string;
    password: string;
    team_role?: string;
    permissions?: string[];
  }) => {
    const res = await api.post('/admin/team', payload);
    return res.data.data;
  },

  updateTeamMember: async (userId: string, payload: Partial<{
    name: string;
    email: string;
    password?: string;
    team_role: string;
    permissions: string[];
    status: string;
  }>) => {
    const res = await api.patch(`/admin/team/${userId}`, payload);
    return res.data.data;
  },

  deleteTeamMember: async (userId: string) => {
    const res = await api.delete(`/admin/team/${userId}`);
    return res.data.data;
  },

  getPermissionsList: async () => {
    const res = await api.get('/admin/team/permissions');
    return res.data.data;
  },

  getPresetRoles: async () => {
    const res = await api.get('/admin/team/roles');
    return res.data.data;
  },

  // Wager Controls
  getWagers: async (page = 1, pageSize = 20, search?: string, isFulfilled?: boolean, statusFilter?: string) => {
    let url = `/admin/wagers?page=${page}&page_size=${pageSize}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (statusFilter && statusFilter !== 'ALL') {
      url += `&status_filter=${encodeURIComponent(statusFilter)}`;
    } else if (isFulfilled !== undefined) {
      url += `&is_fulfilled=${isFulfilled}`;
    }
    const res = await api.get(url);
    return res.data.data;
  },

  createWager: async (userId: string, requiredAmountInr: number) => {
    const res = await api.post('/admin/wagers', {
      user_id: userId,
      required_amount_inr: requiredAmountInr,
    });
    return res.data.data;
  },

  fulfillWager: async (wagerId: string) => {
    const res = await api.post(`/admin/wagers/${wagerId}/fulfill`);
    return res.data.data;
  },

  waiveUserWagers: async (userId: string) => {
    const res = await api.post(`/admin/wagers/users/${userId}/waive`);
    return res.data.data;
  },

  // Winning & RTP Controls
  getGlobalWinningControls: async (): Promise<GlobalWinningConfig[]> => {
    const res = await api.get('/admin/winning-controls/global');
    return res.data.data;
  },

  updateGlobalWinningControl: async (gameSlug: string, mode: string, rtpPercent: number) => {
    const res = await api.put(`/admin/winning-controls/global/${gameSlug}`, {
      mode,
      rtp_percent: rtpPercent,
    });
    return res.data.data;
  },

  getPersonalWinningControls: async (page = 1, pageSize = 20, search?: string) => {
    let url = `/admin/winning-controls/personal?page=${page}&page_size=${pageSize}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    const res = await api.get(url);
    return res.data.data;
  },

  setPersonalWinningControl: async (payload: {
    user_id: string;
    mode: string;
    win_rate_percent?: number;
    note?: string;
  }) => {
    const res = await api.post('/admin/winning-controls/personal', payload);
    return res.data.data;
  },

  deletePersonalWinningControl: async (userId: string) => {
    const res = await api.delete(`/admin/winning-controls/personal/${userId}`);
    return res.data.data;
  },

  // Quick withdrawal approval
  approveWithdrawal: async (withdrawalId: string) => {
    const res = await api.post(`/admin/withdrawals/${withdrawalId}/approve`);
    return res.data.data;
  },

  rejectWithdrawal: async (withdrawalId: string, reason = 'Administrative review') => {
    const res = await api.post(`/admin/withdrawals/${withdrawalId}/reject`, { reason });
    return res.data.data;
  },

  // Notifications
  getNotifications: async (limit = 20) => {
    try {
      const res = await api.get(`/admin/notifications?limit=${limit}`);
      return res.data.data;
    } catch {
      return { unread_count: 0, items: [] };
    }
  },

  // Audit Logs
  getAuditLogs: async (page = 1, pageSize = 20, action?: string, entityType?: string, search?: string, adminOnly = true) => {
    let url = `/admin/audit-logs?page=${page}&page_size=${pageSize}&admin_only=${adminOnly}`;
    if (action) url += `&action=${encodeURIComponent(action)}`;
    if (entityType) url += `&entity_type=${encodeURIComponent(entityType)}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    const res = await api.get(url);
    return res.data.data;
  },

  // Deposit Actions
  approveDeposit: async (depositId: string) => {
    const res = await api.post(`/admin/deposits/${depositId}/approve`);
    return res.data.data;
  },

  rejectDeposit: async (depositId: string, reason = 'Administrative review') => {
    const res = await api.post(`/admin/deposits/${depositId}/reject`, { reason });
    return res.data.data;
  },

  // User Password Management
  resetUserPassword: async (userId: string, newPassword: string) => {
    const res = await api.put(`/admin/users/${userId}/password`, { new_password: newPassword });
    return res.data.data;
  },

  // Global & Individual Wagers
  getGlobalWagerConfig: async () => {
    const res = await api.get('/admin/wagers/global');
    return res.data.data;
  },

  updateGlobalWagerConfig: async (payload: { multiplier: number; default_user_wager_inr?: number; apply_to_existing_deposits?: boolean }) => {
    const res = await api.put('/admin/wagers/global', payload);
    return res.data.data;
  },

  syncMultiplierToDeposits: async () => {
    const res = await api.post('/admin/wagers/sync-multiplier');
    return res.data.data;
  },

  applyWagerToAllUsers: async (requiredAmountInr: number) => {
    const res = await api.post('/admin/wagers/apply-all', { required_amount_inr: requiredAmountInr });
    return res.data.data;
  },

  updateWager: async (wagerId: string, payload: { required_amount_inr?: number; completed_amount_inr?: number; is_fulfilled?: boolean }) => {
    const res = await api.put(`/admin/wagers/${wagerId}`, payload);
    return res.data.data;
  },

  // Support Tickets Helpdesk
  getSupportTickets: async (page = 1, pageSize = 20, status?: string, category?: string, search?: string) => {
    let url = `/admin/support/tickets?page=${page}&page_size=${pageSize}`;
    if (status && status !== 'ALL') url += `&status=${encodeURIComponent(status)}`;
    if (category && category !== 'ALL') url += `&category=${encodeURIComponent(category)}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    const res = await api.get(url);
    return res.data.data;
  },

  updateSupportTicket: async (ticketId: string, payload: { status: string; admin_reply?: string }) => {
    const res = await api.patch(`/admin/support/tickets/${ticketId}`, payload);
    return res.data.data;
  },

  // Support Config
  getSupportConfig: async () => {
    const res = await api.get('/admin/support/config');
    return res.data.data;
  },

  updateSupportConfig: async (payload: any) => {
    const res = await api.put('/admin/support/config', payload);
    return res.data.data;
  },

  // Payment Gateways (Cashfree / Razorpay)
  getPaymentGateways: async () => {
    const res = await api.get('/admin/payment-gateways');
    return res.data.data;
  },

  updatePaymentGateway: async (gatewayName: string, payload: any) => {
    const res = await api.put(`/admin/payment-gateways/${gatewayName}`, payload);
    return res.data.data;
  },

  activatePaymentGateway: async (gatewayName: string) => {
    const res = await api.post(`/admin/payment-gateways/${gatewayName}/activate`);
    return res.data.data;
  },

  // Live Games Status
  getLiveGameStatuses: async () => {
    const res = await api.get('/admin/games/live-status');
    return res.data.data;
  },

  // App Version Config
  getAdminAppVersion: async () => {
    const res = await api.get('/admin/system/app-version');
    return res.data.data;
  },

  updateAdminAppVersion: async (payload: any) => {
    const res = await api.put('/admin/system/app-version', payload);
    return res.data.data;
  },
};
