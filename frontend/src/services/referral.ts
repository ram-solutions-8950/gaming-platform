import api from './api';

export interface ReferralStats {
  referral_code: string;
  referral_link: string;
  reward_amount: number;
  successful_referrals: number;
  total_earnings: number;
  pending_referrals: number;
}

export interface ReferralHistoryItem {
  name: string;
  username: string;
  status: 'COMPLETED' | 'PENDING';
  reward_amount: number;
  created_at: string;
}

export interface ReferralSettings {
  reward_amount: number;
  is_active: boolean;
}

export const referralService = {
  async getStats(): Promise<ReferralStats> {
    const res = await api.get('/referrals/stats');
    return res.data.data;
  },

  async getHistory(): Promise<ReferralHistoryItem[]> {
    const res = await api.get('/referrals/history');
    return res.data.data;
  },

  async getAdminSettings(): Promise<ReferralSettings> {
    const res = await api.get('/admin/referral/settings');
    return res.data.data;
  },

  async updateAdminSettings(reward_amount: number, is_active: boolean): Promise<ReferralSettings> {
    const res = await api.put('/admin/referral/settings', {
      reward_amount,
      is_active,
    });
    return res.data.data;
  },
};
