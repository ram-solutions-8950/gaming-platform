import { useEffect, useState } from 'react';
import { Card } from '../../components/common/Card';
import { Loader } from '../../components/common/Loader';
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFees();
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

  if (loading) return <Loader />;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-white">Platform Fees Configuration</h1>
        <p className="text-gray-400 mt-2">Manage the percentage fees applied across the platform.</p>
      </div>

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
