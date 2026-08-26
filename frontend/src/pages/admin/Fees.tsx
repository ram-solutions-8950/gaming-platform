import { useEffect, useState } from 'react';
import { Card } from '../../components/common/Card';
import { Loader } from '../../components/common/Loader';
import { referralService } from '../../services/referral';
import api from '../../services/api';

interface FeeConfiguration {
  game_entry_fee_percent: number;
  winning_fee_percent: number;
  withdrawal_fee_percent: number;
}

export function AdminFeesPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  const [gameEntryFee, setGameEntryFee] = useState('');
  const [winningFee, setWinningFee] = useState('');
  const [withdrawalFee, setWithdrawalFee] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Referral Settings State
  const [refRewardAmount, setRefRewardAmount] = useState('');
  const [refIsActive, setRefIsActive] = useState(true);
  const [refSubmitting, setRefSubmitting] = useState(false);
  const [refErrorMsg, setRefErrorMsg] = useState('');
  const [refSuccessMsg, setRefSuccessMsg] = useState('');

  const fetchFees = async () => {
    try {
      const res = await api.get('/admin/fees');
      const data: FeeConfiguration = res.data.data;
      setGameEntryFee(data.game_entry_fee_percent.toString());
      setWinningFee(data.winning_fee_percent.toString());
      setWithdrawalFee(data.withdrawal_fee_percent.toString());
    } catch (e: any) {
      console.error('Failed to load fee configuration', e);
      if (e.response?.status !== 403) {
        setErrorMsg('Failed to load fee configuration.');
      } else {
        setErrorMsg('You do not have permission to view fees.');
      }
    }
  };

  const fetchReferralSettings = async () => {
    try {
      const refData = await referralService.getAdminSettings();
      setRefRewardAmount(refData.reward_amount.toString());
      setRefIsActive(refData.is_active);
    } catch (e: any) {
      console.error('Failed to load referral settings', e);
    }
  };

  useEffect(() => {
    Promise.all([fetchFees(), fetchReferralSettings()]).finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const gameFeeNum = parseFloat(gameEntryFee);
    const winningFeeNum = parseFloat(winningFee);
    const withdrawalFeeNum = parseFloat(withdrawalFee);

    if (
      isNaN(gameFeeNum) || gameFeeNum < 0 || gameFeeNum > 100 ||
      isNaN(winningFeeNum) || winningFeeNum < 0 || winningFeeNum > 100 ||
      isNaN(withdrawalFeeNum) || withdrawalFeeNum < 0 || withdrawalFeeNum > 100
    ) {
      setErrorMsg('All fees must be valid percentages between 0 and 100.');
      return;
    }

    setSubmitting(true);
    try {
      await api.patch('/admin/fees', {
        game_entry_fee_percent: gameFeeNum,
        winning_fee_percent: winningFeeNum,
        withdrawal_fee_percent: withdrawalFeeNum
      });
      setSuccessMsg('Fee configuration updated successfully.');
      await fetchFees();
    } catch (e: any) {
      setErrorMsg(e.response?.data?.error?.message || 'Failed to update fees. (Requires Super Admin)');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReferralSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRefErrorMsg('');
    setRefSuccessMsg('');

    const rewardNum = parseFloat(refRewardAmount);
    if (isNaN(rewardNum) || rewardNum <= 0) {
      setRefErrorMsg('Referral reward must be a positive number greater than ₹0.');
      return;
    }
    if (rewardNum > 10000) {
      setRefErrorMsg('Referral reward cannot exceed ₹10,000.');
      return;
    }

    setRefSubmitting(true);
    try {
      const updated = await referralService.updateAdminSettings(rewardNum, refIsActive);
      setRefRewardAmount(updated.reward_amount.toString());
      setRefIsActive(updated.is_active);
      setRefSuccessMsg(`Referral reward updated to ₹${updated.reward_amount} (${updated.is_active ? 'Active' : 'Inactive'}).`);
    } catch (e: any) {
      setRefErrorMsg(e.response?.data?.error?.message || 'Failed to update referral settings.');
    } finally {
      setRefSubmitting(false);
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-white">Platform Settings & Fees</h1>
        <p className="text-gray-400 mt-2">Manage platform fees, referral rewards, and commission rates.</p>
      </div>

      {/* Referral Settings Card */}
      <Card title="🎁 Refer & Earn Configuration">
        <form onSubmit={handleReferralSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Referral Reward Amount (₹)</label>
            <div className="relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 font-bold">₹</div>
              <input
                type="number"
                step="1"
                min="1"
                max="10000"
                value={refRewardAmount}
                onChange={(e) => setRefRewardAmount(e.target.value)}
                className="bg-dark-800 border border-dark-700 text-white rounded-md pl-8 pr-4 py-3 w-full focus:ring-gold-500 focus:border-gold-500 text-sm font-bold font-mono"
                disabled={refSubmitting}
                placeholder="100"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Credited directly to the referrer's wallet upon the new user's first successful deposit.</p>
          </div>

          <div className="flex items-center gap-3 p-3 bg-dark-800/60 rounded-lg border border-dark-700">
            <input
              id="ref-active"
              type="checkbox"
              checked={refIsActive}
              onChange={(e) => setRefIsActive(e.target.checked)}
              className="h-4 w-4 rounded bg-dark-900 border-dark-600 text-gold-500 focus:ring-gold-500"
            />
            <label htmlFor="ref-active" className="text-sm font-semibold text-gray-200 cursor-pointer">
              Enable Referral Rewards Program
            </label>
          </div>

          {refErrorMsg && <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded p-3">{refErrorMsg}</p>}
          {refSuccessMsg && <p className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded p-3">{refSuccessMsg}</p>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={refSubmitting}
              className="bg-gold-500 hover:bg-gold-400 text-black font-extrabold py-2.5 px-6 rounded-lg transition-colors cursor-pointer disabled:opacity-50 text-sm shadow-md"
            >
              {refSubmitting ? 'Updating...' : 'Save Referral Settings'}
            </button>
          </div>
        </form>
      </Card>

      {/* Fee Percentages Card */}
      <Card title="Fee Percentages">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Game Entry Fee (%)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={gameEntryFee}
              onChange={(e) => setGameEntryFee(e.target.value)}
              className="bg-dark-800 border border-dark-700 text-white rounded-md px-4 py-3 w-full focus:ring-brand-500 focus:border-brand-500 text-sm"
              disabled={submitting}
            />
            <p className="text-xs text-gray-500 mt-1">Deducted from the user's wallet when joining a game.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Winning Fee (%)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={winningFee}
              onChange={(e) => setWinningFee(e.target.value)}
              className="bg-dark-800 border border-dark-700 text-white rounded-md px-4 py-3 w-full focus:ring-brand-500 focus:border-brand-500 text-sm"
              disabled={submitting}
            />
            <p className="text-xs text-gray-500 mt-1">Deducted from the gross winnings before crediting the wallet.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Withdrawal Fee (%)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={withdrawalFee}
              onChange={(e) => setWithdrawalFee(e.target.value)}
              className="bg-dark-800 border border-dark-700 text-white rounded-md px-4 py-3 w-full focus:ring-brand-500 focus:border-brand-500 text-sm"
              disabled={submitting}
            />
            <p className="text-xs text-gray-500 mt-1">Deducted from the requested withdrawal amount.</p>
          </div>

          {errorMsg && <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded p-3">{errorMsg}</p>}
          {successMsg && <p className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded p-3">{successMsg}</p>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="bg-brand-600 hover:bg-brand-500 text-white font-bold py-2 px-6 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
