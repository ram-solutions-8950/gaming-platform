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

interface GameCommission {
  slug: string;
  name: string;
  commission_percent: number;
  is_override: boolean;
}

// Display only — the slug list itself comes from the backend so the two can
// never drift apart (a slug it does not recognise is rejected on save).
const GAME_ICONS: Record<string, string> = {
  'dragon-tiger': '🐉',
  'chicken_road': '🐔',
  'roulette': '🎡',
  'teen-patti': '🃏',
  'triple_777': '🎰',
  'aviator': '✈️',
  'andar-bahar': '🎴',
  'colour-prediction': '🎨',
  'poker': '♠️',
  'rummy': '🀄',
  'ludo': '🎲',
};


export function AdminFeesPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Global Fee State
  const [gameEntryFee, setGameEntryFee] = useState('');
  const [winningFee, setWinningFee] = useState('');
  const [withdrawalFee, setWithdrawalFee] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Per-Game Commission State
  const [gameCommissions, setGameCommissions] = useState<Record<string, string>>({});
  const [platformGames, setPlatformGames] = useState<GameCommission[]>([]);
  const [commSubmitting, setCommSubmitting] = useState(false);
  const [commErrorMsg, setCommErrorMsg] = useState('');
  const [commSuccessMsg, setCommSuccessMsg] = useState('');

  // Referral Settings State
  const [refRewardType, setRefRewardType] = useState<'PERCENTAGE' | 'FLAT'>('PERCENTAGE');
  const [refRewardPercentage, setRefRewardPercentage] = useState('10');
  const [refMinDeposit, setRefMinDeposit] = useState('100');
  const [refRewardAmount, setRefRewardAmount] = useState('100');
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

  const fetchGameCommissions = async () => {
    try {
      const res = await api.get('/admin/fees/game-commissions');
      const games: GameCommission[] = res.data.data?.games || [];
      const overrides: Record<string, number> = res.data.data?.game_overrides || {};
      const mapped: Record<string, string> = {};
      games.forEach((g) => {
        // Blank means "inherit the global winning fee"; only an explicit
        // override is shown as a value.
        mapped[g.slug] = overrides[g.slug] !== undefined ? overrides[g.slug].toString() : '';
      });
      setPlatformGames(games);
      setGameCommissions(mapped);
    } catch (e: any) {
      console.error('Failed to load game commissions', e);
    }
  };

  const fetchReferralSettings = async () => {
    try {
      const refData = await referralService.getAdminSettings();
      setRefRewardAmount((refData.reward_amount ?? 100).toString());
      setRefIsActive(refData.is_active);
      setRefRewardType(refData.reward_type === 'FLAT' ? 'FLAT' : 'PERCENTAGE');
      setRefRewardPercentage((refData.reward_percentage ?? 10).toString());
      setRefMinDeposit((refData.min_deposit ?? 100).toString());
    } catch (e: any) {
      console.error('Failed to load referral settings', e);
    }
  };

  useEffect(() => {
    Promise.all([fetchFees(), fetchGameCommissions(), fetchReferralSettings()]).finally(() => setLoading(false));
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
        withdrawal_fee_percent: withdrawalFeeNum,
      });
      setSuccessMsg('Fee configuration updated successfully.');
      await fetchFees();
    } catch (e: any) {
      setErrorMsg(e.response?.data?.error?.message || 'Failed to update fees. (Requires Super Admin)');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGameCommissionsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCommErrorMsg('');
    setCommSuccessMsg('');

    const payload: Record<string, number> = {};
    for (const [slug, val] of Object.entries(gameCommissions)) {
      if (val !== '' && val !== null && val !== undefined) {
        const num = parseFloat(val);
        if (isNaN(num) || num < 0 || num > 100) {
          setCommErrorMsg(`Commission for ${slug} must be between 0% and 100%.`);
          return;
        }
        payload[slug] = num;
      }
    }

    setCommSubmitting(true);
    try {
      await api.put('/admin/fees/game-commissions', { game_overrides: payload });
      setCommSuccessMsg('Per-game commissions saved successfully.');
      await fetchGameCommissions();
    } catch (e: any) {
      setCommErrorMsg(e.response?.data?.error?.message || 'Failed to update game commissions.');
    } finally {
      setCommSubmitting(false);
    }
  };

  const handleReferralSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRefErrorMsg('');
    setRefSuccessMsg('');

    const rewardNum = parseFloat(refRewardAmount);
    const pctNum = parseFloat(refRewardPercentage);
    const minDepNum = parseFloat(refMinDeposit);

    if (refRewardType === 'PERCENTAGE') {
      if (isNaN(pctNum) || pctNum <= 0 || pctNum > 100) {
        setRefErrorMsg('Referral reward percentage must be between 0.1% and 100%.');
        return;
      }
    } else {
      if (isNaN(rewardNum) || rewardNum <= 0) {
        setRefErrorMsg('Flat referral reward must be a positive number greater than ₹0.');
        return;
      }
    }

    if (isNaN(minDepNum) || minDepNum < 0) {
      setRefErrorMsg('Minimum deposit must be 0 or greater.');
      return;
    }

    setRefSubmitting(true);
    try {
      const updated = await referralService.updateAdminSettings({
        reward_amount: rewardNum,
        is_active: refIsActive,
        reward_type: refRewardType,
        reward_percentage: pctNum,
        min_deposit: minDepNum,
      });
      setRefRewardAmount((updated.reward_amount ?? 100).toString());
      setRefIsActive(updated.is_active);
      setRefRewardType(updated.reward_type === 'FLAT' ? 'FLAT' : 'PERCENTAGE');
      setRefRewardPercentage((updated.reward_percentage ?? 10).toString());
      setRefMinDeposit((updated.min_deposit ?? 100).toString());
      setRefSuccessMsg(
        `Referral settings saved! ${
          refRewardType === 'PERCENTAGE'
            ? `${pctNum}% of first deposit (min ₹${minDepNum})`
            : `₹${rewardNum} flat bonus`
        } (${updated.is_active ? 'Active' : 'Inactive'}).`
      );
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
        <p className="text-gray-400 mt-2">Manage platform fees, per-game commission rates, and referral rewards.</p>
      </div>

      {/* Per-Game Commission Settings Card */}
      <Card title="🎯 Per-Game Commission & House Edge">
        <form onSubmit={handleGameCommissionsSubmit} className="space-y-6">
          <p className="text-xs text-gray-400">
            Set custom commission percentage per game deducted from winning profits. Leave blank to inherit the global default winning fee ({winningFee}%).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {platformGames.map((game) => (
              <div key={game.slug} className="p-3 bg-dark-800/60 rounded-xl border border-dark-700/80 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-xl shrink-0">{GAME_ICONS[game.slug] ?? '🎮'}</span>
                  <div>
                    <span className="text-sm font-bold text-white block truncate">{game.name}</span>
                    <span className="text-[10px] text-gray-500 font-mono">{game.slug}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 w-24">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    placeholder={`${winningFee || '0'}%`}
                    value={gameCommissions[game.slug] ?? ''}
                    onChange={(e) => setGameCommissions((prev) => ({ ...prev, [game.slug]: e.target.value }))}
                    className="bg-dark-900 border border-dark-700 text-gold-400 rounded-lg px-2 py-1.5 text-right text-xs font-mono font-bold w-full focus:ring-gold-500 focus:border-gold-500"
                    disabled={commSubmitting}
                  />
                  <span className="text-xs text-gray-400 font-bold">%</span>
                </div>
              </div>
            ))}
          </div>

          {commErrorMsg && <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded p-3">{commErrorMsg}</p>}
          {commSuccessMsg && <p className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded p-3">{commSuccessMsg}</p>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={commSubmitting}
              className="bg-gold-500 hover:bg-gold-400 text-black font-extrabold py-2.5 px-6 rounded-lg transition-colors cursor-pointer disabled:opacity-50 text-sm shadow-md"
            >
              {commSubmitting ? 'Saving Commissions...' : 'Save Game Commissions'}
            </button>
          </div>
        </form>
      </Card>

      {/* Referral Settings Card */}
      <Card title="🎁 Refer & Earn Configuration">
        <form onSubmit={handleReferralSubmit} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Reward Type Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Reward Type</label>
              <select
                value={refRewardType}
                onChange={(e) => setRefRewardType(e.target.value as 'PERCENTAGE' | 'FLAT')}
                className="bg-dark-800 border border-dark-700 text-white rounded-md px-4 py-3 w-full focus:ring-gold-500 focus:border-gold-500 text-sm font-bold"
                disabled={refSubmitting}
              >
                <option value="PERCENTAGE">Percentage of First Deposit (%)</option>
                <option value="FLAT">Flat Fixed Amount (₹)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">Recommended: 10% of first deposit.</p>
            </div>

            {/* Dynamic Value Input */}
            {refRewardType === 'PERCENTAGE' ? (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Commission Percentage (%)</label>
                <div className="relative rounded-md shadow-sm">
                  <input
                    type="number"
                    step="0.5"
                    min="0.1"
                    max="100"
                    value={refRewardPercentage}
                    onChange={(e) => setRefRewardPercentage(e.target.value)}
                    className="bg-dark-800 border border-dark-700 text-white rounded-md pl-4 pr-8 py-3 w-full focus:ring-gold-500 focus:border-gold-500 text-sm font-bold font-mono"
                    disabled={refSubmitting}
                    placeholder="10"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400 font-bold">%</div>
                </div>
                <p className="text-xs text-gray-500 mt-1">E.g., 10% on ₹100 deposit = ₹10 credited to referrer.</p>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Flat Reward Amount (₹)</label>
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
                <p className="text-xs text-gray-500 mt-1">Credited once upon first qualifying deposit.</p>
              </div>
            )}
          </div>

          {/* Minimum Deposit Requirement */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Minimum Qualifying Deposit (₹)</label>
            <div className="relative rounded-md shadow-sm max-w-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 font-bold">₹</div>
              <input
                type="number"
                step="1"
                min="0"
                value={refMinDeposit}
                onChange={(e) => setRefMinDeposit(e.target.value)}
                className="bg-dark-800 border border-dark-700 text-white rounded-md pl-8 pr-4 py-2.5 w-full focus:ring-gold-500 focus:border-gold-500 text-sm font-bold font-mono"
                disabled={refSubmitting}
                placeholder="100"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Referred user must deposit at least this amount to trigger referral rewards (Default: ₹100).</p>
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

      {/* Global Default Fee Percentages Card */}
      <Card title="Global Fee Defaults">
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
            <label className="block text-sm font-medium text-gray-400 mb-1">Global Winning Fee / House Edge (%)</label>
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
            <p className="text-xs text-gray-500 mt-1">Fallback commission deducted from gross winnings when a game does not have a specific override above.</p>
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
              {submitting ? 'Saving...' : 'Save Global Changes'}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
