import api from './api';

export interface DailyRewardDay {
  day_number: number;
  label: string;
  reward_type: 'CASH' | 'FREE_SPIN';
  amount_inr: number;
  free_spins: number;
  status: 'CLAIMED' | 'CLAIMABLE' | 'LOCKED';
}

export interface DailyRewardStatus {
  has_qualifying_bet: boolean;
  min_qualifying_bet_inr: number;
  current_day: number;
  can_claim_today: boolean;
  next_claim_seconds: number;
  days: DailyRewardDay[];
}

export interface DailyRewardClaimResult {
  success: boolean;
  day_number: number;
  reward_type: string;
  amount_inr: number;
  free_spins_awarded: number;
  wallet_balance_inr: number;
  total_free_spins: number;
  message: string;
}

export interface LuckySpinSegment {
  segment_index: number;
  label: string;
  reward_type: string;
  amount_inr: number;
  free_spins: number;
  color: string;
}

export interface LuckySpinStatus {
  free_spins_available: number;
  can_spin: boolean;
  segments: LuckySpinSegment[];
}

export interface LuckySpinResult {
  winning_index: number;
  segment: LuckySpinSegment;
  wallet_balance_inr: number;
  free_spins_left: number;
  message: string;
}

export interface BonusItem {
  id: string;
  title: string;
  description?: string;
  bonus_type: string;
  amount_inr: number;
  can_claim: boolean;
  is_claimed: boolean;
}

export interface JackpotStatus {
  title: string;
  current_amount_inr: number;
  seed_amount_inr: number;
  description?: string;
  is_active: boolean;
}

export interface VipTier {
  vip_level: number;
  level_name: string;
  min_deposit_inr: number;
  reward_amount_inr: number;
  is_current_tier: boolean;
  can_claim: boolean;
  is_claimed: boolean;
}

export interface VipStatus {
  current_vip_level: number;
  current_level_name: string;
  total_deposited_inr: number;
  tiers: VipTier[];
}

export const rewardService = {
  // ─── 7-Day Rewards ───
  async get7DayStatus(): Promise<DailyRewardStatus> {
    const res = await api.get('/rewards/7days/status');
    return res.data.data;
  },

  async claim7DayReward(dayNumber: number): Promise<DailyRewardClaimResult> {
    const res = await api.post('/rewards/7days/claim', { day_number: dayNumber });
    return res.data.data;
  },

  // ─── Lucky Spin ───
  async getLuckySpinStatus(): Promise<LuckySpinStatus> {
    const res = await api.get('/rewards/lucky-spin/status');
    return res.data.data;
  },

  async executeLuckySpin(): Promise<LuckySpinResult> {
    const res = await api.post('/rewards/lucky-spin/spin');
    return res.data.data;
  },

  // ─── Bonuses ───
  async getBonusList(): Promise<BonusItem[]> {
    const res = await api.get('/rewards/bonus/list');
    return res.data.data;
  },

  async claimBonus(bonusId: string): Promise<{ success: boolean; amount_inr: number; wallet_balance_inr: number; message: string }> {
    const res = await api.post('/rewards/bonus/claim', { bonus_id: bonusId });
    return res.data.data;
  },

  // ─── Jackpot ───
  async getJackpotStatus(): Promise<JackpotStatus> {
    const res = await api.get('/rewards/jackpot/status');
    return res.data.data;
  },

  // ─── VIP Bonus ───
  async getVipStatus(): Promise<VipStatus> {
    const res = await api.get('/rewards/vip/status');
    return res.data.data;
  },

  async claimVipBonus(vipLevel: number): Promise<{ success: boolean; reward_amount_inr: number; wallet_balance_inr: number; message: string }> {
    const res = await api.post('/rewards/vip/claim', { vip_level: vipLevel });
    return res.data.data;
  },

  // ─── Admin Endpoints ───
  async getAdmin7Days(): Promise<{ settings: { min_qualifying_bet_inr: number; is_active: boolean }; days: any[] }> {
    const res = await api.get('/admin/rewards/7days');
    return res.data.data;
  },

  async updateAdmin7DaySettings(data: { min_qualifying_bet_inr: number; is_active: boolean }): Promise<any> {
    const res = await api.put('/admin/rewards/7days/settings', data);
    return res.data.data;
  },

  async updateAdmin7DayDay(dayNumber: number, data: { amount_inr?: number; reward_type?: string; free_spins_count?: number; is_enabled?: boolean }): Promise<any> {
    const res = await api.put(`/admin/rewards/7days/${dayNumber}`, data);
    return res.data.data;
  },

  async getAdminLuckySpin(): Promise<any[]> {
    const res = await api.get('/admin/rewards/lucky-spin');
    return res.data.data;
  },

  async updateAdminLuckySpinSegment(segmentIndex: number, data: any): Promise<any> {
    const res = await api.put(`/admin/rewards/lucky-spin/${segmentIndex}`, data);
    return res.data.data;
  },

  async getAdminBonuses(): Promise<any[]> {
    const res = await api.get('/admin/rewards/bonuses');
    return res.data.data;
  },

  async createAdminBonus(data: any): Promise<any> {
    const res = await api.post('/admin/rewards/bonuses', data);
    return res.data.data;
  },

  async updateAdminBonus(bonusId: string, data: any): Promise<any> {
    const res = await api.put(`/admin/rewards/bonuses/${bonusId}`, data);
    return res.data.data;
  },

  async deleteAdminBonus(bonusId: string): Promise<any> {
    const res = await api.delete(`/admin/rewards/bonuses/${bonusId}`);
    return res.data.data;
  },

  async getAdminJackpot(): Promise<any> {
    const res = await api.get('/admin/rewards/jackpot');
    return res.data.data;
  },

  async updateAdminJackpot(data: any): Promise<any> {
    const res = await api.put('/admin/rewards/jackpot', data);
    return res.data.data;
  },

  async getAdminVip(): Promise<any[]> {
    const res = await api.get('/admin/rewards/vip');
    return res.data.data;
  },

  async updateAdminVipTier(vipLevel: number, data: any): Promise<any> {
    const res = await api.put(`/admin/rewards/vip/${vipLevel}`, data);
    return res.data.data;
  },
};
