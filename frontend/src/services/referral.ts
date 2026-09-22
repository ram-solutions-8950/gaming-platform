import api from './api';

export interface ReferralStats {
  referral_code: string;
  referral_link: string;
  reward_amount: number;
  reward_type?: string;
  reward_percentage?: number;
  min_deposit?: number;
  is_active?: boolean;
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
  reward_type?: 'FLAT' | 'PERCENTAGE';
  reward_percentage?: number;
  min_deposit?: number;
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

  async updateAdminSettings(payload: {
    reward_amount?: number;
    is_active?: boolean;
    reward_type?: 'FLAT' | 'PERCENTAGE';
    reward_percentage?: number;
    min_deposit?: number;
  } | number, is_active?: boolean): Promise<ReferralSettings> {
    const body = typeof payload === 'number'
      ? { reward_amount: payload, is_active: is_active ?? true }
      : payload;
    const res = await api.put('/admin/referral/settings', body);
    return res.data.data;
  },
};

/**
 * Human-readable summary of the active Refer & Win terms.
 * In PERCENTAGE mode the payout depends on the friend's first deposit, so a
 * flat rupee figure would misstate it.
 */
export function describeReferralReward(stats?: ReferralStats | null): {
  headline: string;
  perFriend: string;
  condition: string;
  isPercentage: boolean;
} {
  const isPercentage = (stats?.reward_type ?? 'PERCENTAGE') === 'PERCENTAGE';
  const pct = stats?.reward_percentage ?? 10;
  const minDeposit = stats?.min_deposit ?? 100;
  const flat = stats?.reward_amount ?? 100;

  return {
    isPercentage,
    headline: isPercentage ? `${pct}%` : `₹${flat}`,
    perFriend: isPercentage
      ? `${pct}% of their first deposit`
      : `₹${flat} per friend`,
    condition: `Minimum first deposit ₹${minDeposit}`,
  };
}
