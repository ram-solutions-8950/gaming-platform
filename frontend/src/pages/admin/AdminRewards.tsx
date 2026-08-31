import React, { useEffect, useState } from 'react';
import { rewardService } from '../../services/rewardService';

export function AdminRewardsPage() {
  const [activeTab, setActiveTab] = useState<'7days' | 'lucky_spin' | 'bonuses' | 'jackpot' | 'vip'>('7days');
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ msg: string; isError: boolean } | null>(null);

  // 7-Day State
  const [sevenDaysData, setSevenDaysData] = useState<{ settings: { min_qualifying_bet_inr: number; is_active: boolean }; days: any[] } | null>(null);
  const [minBetInr, setMinBetInr] = useState<number>(1.0);

  // Lucky Spin State
  const [spinSegments, setSpinSegments] = useState<any[]>([]);

  // Bonuses State
  const [bonuses, setBonuses] = useState<any[]>([]);
  const [newBonusTitle, setNewBonusTitle] = useState('');
  const [newBonusAmount, setNewBonusAmount] = useState('5');
  const [newBonusDesc, setNewBonusDesc] = useState('');

  // Jackpot State
  const [jackpot, setJackpot] = useState<any>(null);

  // VIP State
  const [vipTiers, setVipTiers] = useState<any[]>([]);

  const loadData = async () => {
    setLoading(true);
    setSaveStatus(null);
    try {
      if (activeTab === '7days') {
        const res = await rewardService.getAdmin7Days();
        setSevenDaysData(res);
        setMinBetInr(res.settings.min_qualifying_bet_inr);
      } else if (activeTab === 'lucky_spin') {
        const res = await rewardService.getAdminLuckySpin();
        setSpinSegments(res);
      } else if (activeTab === 'bonuses') {
        const res = await rewardService.getAdminBonuses();
        setBonuses(res);
      } else if (activeTab === 'jackpot') {
        const res = await rewardService.getAdminJackpot();
        setJackpot(res);
      } else if (activeTab === 'vip') {
        const res = await rewardService.getAdminVip();
        setVipTiers(res);
      }
    } catch (err: any) {
      setSaveStatus({ msg: err.response?.data?.message || err.message || 'Failed to load data', isError: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  // Save 7-Day Day Config
  const handleUpdateDay = async (dayNum: number, field: string, value: any) => {
    try {
      await rewardService.updateAdmin7DayDay(dayNum, { [field]: value });
      setSaveStatus({ msg: `Day ${dayNum} updated successfully!`, isError: false });
      loadData();
    } catch (err: any) {
      setSaveStatus({ msg: err.response?.data?.message || err.message, isError: true });
    }
  };

  // Save 7-Day Settings
  const handleSave7DaySettings = async () => {
    try {
      await rewardService.updateAdmin7DaySettings({
        min_qualifying_bet_inr: minBetInr,
        is_active: sevenDaysData?.settings.is_active ?? true,
      });
      setSaveStatus({ msg: 'Minimum qualifying bet requirement saved!', isError: false });
      loadData();
    } catch (err: any) {
      setSaveStatus({ msg: err.response?.data?.message || err.message, isError: true });
    }
  };

  // Save Lucky Spin Segment
  const handleUpdateSegment = async (idx: number, field: string, value: any) => {
    try {
      await rewardService.updateAdminLuckySpinSegment(idx, { [field]: value });
      setSaveStatus({ msg: `Segment ${idx} updated!`, isError: false });
      loadData();
    } catch (err: any) {
      setSaveStatus({ msg: err.response?.data?.message || err.message, isError: true });
    }
  };

  // Create Bonus
  const handleCreateBonus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBonusTitle || !newBonusAmount) return;
    try {
      await rewardService.createAdminBonus({
        title: newBonusTitle,
        description: newBonusDesc,
        amount_inr: parseFloat(newBonusAmount),
        bonus_type: 'DAILY',
        is_active: true,
        claim_limit: 1,
      });
      setNewBonusTitle('');
      setNewBonusDesc('');
      setNewBonusAmount('5');
      setSaveStatus({ msg: 'Bonus created successfully!', isError: false });
      loadData();
    } catch (err: any) {
      setSaveStatus({ msg: err.response?.data?.message || err.message, isError: true });
    }
  };

  // Delete Bonus
  const handleDeleteBonus = async (id: string) => {
    if (!confirm('Are you sure you want to delete this bonus?')) return;
    try {
      await rewardService.deleteAdminBonus(id);
      setSaveStatus({ msg: 'Bonus deleted.', isError: false });
      loadData();
    } catch (err: any) {
      setSaveStatus({ msg: err.response?.data?.message || err.message, isError: true });
    }
  };

  // Save Jackpot
  const handleSaveJackpot = async () => {
    if (!jackpot) return;
    try {
      await rewardService.updateAdminJackpot({
        title: jackpot.title,
        current_amount_inr: parseFloat(jackpot.current_amount_inr),
        seed_amount_inr: parseFloat(jackpot.seed_amount_inr),
        is_active: jackpot.is_active,
        description: jackpot.description,
      });
      setSaveStatus({ msg: 'Jackpot configuration saved!', isError: false });
      loadData();
    } catch (err: any) {
      setSaveStatus({ msg: err.response?.data?.message || err.message, isError: true });
    }
  };

  // Save VIP Tier
  const handleUpdateVipTier = async (lvl: number, field: string, value: any) => {
    try {
      await rewardService.updateAdminVipTier(lvl, { [field]: value });
      setSaveStatus({ msg: `VIP Tier ${lvl} updated!`, isError: false });
      loadData();
    } catch (err: any) {
      setSaveStatus({ msg: err.response?.data?.message || err.message, isError: true });
    }
  };

  return (
    <div className="space-y-6 text-gray-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-dark-700 pb-5">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <span>🎁</span> Rewards & Promotions Management
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Configure 7-Day rewards, minimum bet qualification, Lucky Spin wheel segments, Bonuses, Jackpot, and VIP tiers.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-dark-700 pb-2 scrollbar-hide">
        {[
          { id: '7days', label: '📅 7-Day Rewards', icon: '📅' },
          { id: 'lucky_spin', label: '🎰 Lucky Spin Wheel', icon: '🎰' },
          { id: 'bonuses', label: '🎁 Platform Bonuses', icon: '🎁' },
          { id: 'jackpot', label: '🎟️ Mega Jackpot', icon: '🎟️' },
          { id: 'vip', label: '👑 VIP Bonus Tiers', icon: '👑' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition shrink-0 cursor-pointer ${
              activeTab === tab.id
                ? 'bg-amber-400 text-purple-950 shadow-md'
                : 'bg-dark-800 text-gray-400 hover:text-white hover:bg-dark-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Save Feedback Banner */}
      {saveStatus && (
        <div
          className={`p-4 rounded-xl text-xs font-bold border ${
            saveStatus.isError
              ? 'bg-red-950/70 border-red-500/60 text-red-200'
              : 'bg-emerald-950/70 border-emerald-500/60 text-emerald-200'
          }`}
        >
          {saveStatus.msg}
        </div>
      )}

      {loading && (
        <div className="py-12 flex flex-col items-center justify-center gap-2">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs text-gray-400">Loading settings...</span>
        </div>
      )}

      {/* TAB 1: 7-Day Rewards */}
      {!loading && activeTab === '7days' && sevenDaysData && (
        <div className="space-y-6">
          {/* Qualifying Bet Card */}
          <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-black text-amber-400 uppercase tracking-wide mb-1">
              Minimum Qualifying Bet Requirement
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              Users must place at least this amount in a completed bet in any game before Day 1 unlocks.
            </p>
            <div className="flex items-center gap-3 max-w-sm">
              <div className="relative flex-1">
                <span className="absolute left-3 top-2.5 text-xs text-gray-400">₹</span>
                <input
                  type="number"
                  min="0.1"
                  step="0.5"
                  value={minBetInr}
                  onChange={(e) => setMinBetInr(parseFloat(e.target.value) || 0)}
                  className="w-full pl-7 pr-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-white font-mono"
                />
              </div>
              <button
                type="button"
                onClick={handleSave7DaySettings}
                className="bg-amber-400 hover:bg-amber-300 text-purple-950 font-black text-xs px-4 py-2.5 rounded-lg uppercase shadow active:scale-95 transition cursor-pointer"
              >
                Save Min Bet
              </button>
            </div>
          </div>

          {/* Days Grid */}
          <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-black text-white uppercase tracking-wide mb-4">
              7-Day Reward Schedule Configuration
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-dark-700 text-gray-400 font-bold">
                    <th className="pb-3 px-2">Day</th>
                    <th className="pb-3 px-2">Reward Type</th>
                    <th className="pb-3 px-2">Cash Amount (₹)</th>
                    <th className="pb-3 px-2">Free Lucky Spins</th>
                    <th className="pb-3 px-2">Enabled</th>
                    <th className="pb-3 px-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-800">
                  {sevenDaysData.days.map((d) => (
                    <tr key={d.day_number} className="hover:bg-dark-800/40">
                      <td className="py-3 px-2 font-black text-amber-400">Day {d.day_number}</td>
                      <td className="py-3 px-2">
                        <select
                          value={d.reward_type}
                          onChange={(e) => handleUpdateDay(d.day_number, 'reward_type', e.target.value)}
                          className="bg-dark-800 border border-dark-600 rounded px-2 py-1 text-xs text-white"
                        >
                          <option value="CASH">CASH (₹)</option>
                          <option value="FREE_SPIN">FREE_SPIN (🎰)</option>
                        </select>
                      </td>
                      <td className="py-3 px-2">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          defaultValue={d.amount_inr}
                          onBlur={(e) => handleUpdateDay(d.day_number, 'amount_inr', parseFloat(e.target.value) || 0)}
                          className="w-24 bg-dark-800 border border-dark-600 rounded px-2 py-1 text-xs text-white font-mono"
                        />
                      </td>
                      <td className="py-3 px-2">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={d.free_spins_count}
                          onBlur={(e) => handleUpdateDay(d.day_number, 'free_spins_count', parseInt(e.target.value, 10) || 0)}
                          className="w-20 bg-dark-800 border border-dark-600 rounded px-2 py-1 text-xs text-white font-mono"
                        />
                      </td>
                      <td className="py-3 px-2">
                        <input
                          type="checkbox"
                          checked={d.is_enabled}
                          onChange={(e) => handleUpdateDay(d.day_number, 'is_enabled', e.target.checked)}
                          className="rounded text-amber-400 focus:ring-0"
                        />
                      </td>
                      <td className="py-3 px-2">
                        <span className="text-[10px] text-gray-500 font-mono">Auto-saves on change</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Lucky Spin Segments */}
      {!loading && activeTab === 'lucky_spin' && (
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wide">
                Lucky Spin Wheel Segments (8 Segments)
              </h3>
              <p className="text-xs text-gray-400">
                Configure labels, cash amounts, probabilities (weight), colors, and rewards for each segment.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-dark-700 text-gray-400 font-bold">
                  <th className="pb-3 px-2">Idx</th>
                  <th className="pb-3 px-2">Label</th>
                  <th className="pb-3 px-2">Reward Type</th>
                  <th className="pb-3 px-2">Cash (₹)</th>
                  <th className="pb-3 px-2">Spins</th>
                  <th className="pb-3 px-2">RNG Weight</th>
                  <th className="pb-3 px-2">Color</th>
                  <th className="pb-3 px-2">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800">
                {spinSegments.map((s) => (
                  <tr key={s.segment_index} className="hover:bg-dark-800/40">
                    <td className="py-3 px-2 font-mono font-bold text-gray-400">{s.segment_index}</td>
                    <td className="py-3 px-2">
                      <input
                        type="text"
                        defaultValue={s.label}
                        onBlur={(e) => handleUpdateSegment(s.segment_index, 'label', e.target.value)}
                        className="w-24 bg-dark-800 border border-dark-600 rounded px-2 py-1 text-xs text-white"
                      />
                    </td>
                    <td className="py-3 px-2">
                      <select
                        value={s.reward_type}
                        onChange={(e) => handleUpdateSegment(s.segment_index, 'reward_type', e.target.value)}
                        className="bg-dark-800 border border-dark-600 rounded px-2 py-1 text-xs text-white"
                      >
                        <option value="CASH">CASH</option>
                        <option value="FREE_SPIN">FREE_SPIN</option>
                        <option value="NO_REWARD">NO_REWARD</option>
                      </select>
                    </td>
                    <td className="py-3 px-2">
                      <input
                        type="number"
                        defaultValue={s.amount_inr}
                        onBlur={(e) => handleUpdateSegment(s.segment_index, 'amount_inr', parseFloat(e.target.value) || 0)}
                        className="w-20 bg-dark-800 border border-dark-600 rounded px-2 py-1 text-xs text-white font-mono"
                      />
                    </td>
                    <td className="py-3 px-2">
                      <input
                        type="number"
                        defaultValue={s.free_spins}
                        onBlur={(e) => handleUpdateSegment(s.segment_index, 'free_spins', parseInt(e.target.value, 10) || 0)}
                        className="w-16 bg-dark-800 border border-dark-600 rounded px-2 py-1 text-xs text-white font-mono"
                      />
                    </td>
                    <td className="py-3 px-2">
                      <input
                        type="number"
                        defaultValue={s.weight}
                        onBlur={(e) => handleUpdateSegment(s.segment_index, 'weight', parseInt(e.target.value, 10) || 1)}
                        className="w-16 bg-dark-800 border border-dark-600 rounded px-2 py-1 text-xs text-white font-mono"
                      />
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          defaultValue={s.color}
                          onChange={(e) => handleUpdateSegment(s.segment_index, 'color', e.target.value)}
                          className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                        />
                        <span className="text-[10px] font-mono text-gray-400">{s.color}</span>
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <input
                        type="checkbox"
                        checked={s.is_enabled}
                        onChange={(e) => handleUpdateSegment(s.segment_index, 'is_enabled', e.target.checked)}
                        className="rounded text-amber-400 focus:ring-0"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Bonuses */}
      {!loading && activeTab === 'bonuses' && (
        <div className="space-y-6">
          {/* Create Bonus Form */}
          <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-black text-amber-400 uppercase tracking-wide mb-3">
              Add New Platform Bonus
            </h3>
            <form onSubmit={handleCreateBonus} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold text-gray-400 block mb-1">Bonus Title</label>
                <input
                  type="text"
                  placeholder="e.g. Festival Special Bonus"
                  value={newBonusTitle}
                  onChange={(e) => setNewBonusTitle(e.target.value)}
                  className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-xs text-white"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-400 block mb-1">Cash Amount (₹)</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  placeholder="10"
                  value={newBonusAmount}
                  onChange={(e) => setNewBonusAmount(e.target.value)}
                  className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-xs text-white font-mono"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-400 block mb-1">Description</label>
                <input
                  type="text"
                  placeholder="Description or requirements"
                  value={newBonusDesc}
                  onChange={(e) => setNewBonusDesc(e.target.value)}
                  className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>
              <div className="sm:col-span-3 flex justify-end">
                <button
                  type="submit"
                  className="bg-amber-400 hover:bg-amber-300 text-purple-950 font-black text-xs px-5 py-2 rounded-lg uppercase shadow active:scale-95 transition cursor-pointer"
                >
                  Create Bonus +
                </button>
              </div>
            </form>
          </div>

          {/* Bonuses List */}
          <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-black text-white uppercase tracking-wide">
              Active Bonuses
            </h3>
            <div className="divide-y divide-dark-800">
              {bonuses.map((b) => (
                <div key={b.id} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <h4 className="text-xs font-black text-white">{b.title}</h4>
                    <p className="text-[11px] text-gray-400 mt-0.5">{b.description}</p>
                    <span className="text-xs font-bold text-amber-400 mt-1 block">
                      Amount: ₹{b.amount_inr.toFixed(2)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteBonus(b.id)}
                    className="text-red-400 hover:text-red-300 text-xs font-bold border border-red-500/40 px-2.5 py-1 rounded-lg hover:bg-red-500/10 transition"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Jackpot */}
      {!loading && activeTab === 'jackpot' && jackpot && (
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 shadow-sm max-w-xl space-y-4">
          <h3 className="text-sm font-black text-amber-400 uppercase tracking-wide">
            Mega Jackpot Configuration
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-bold text-gray-400 block mb-1">Jackpot Title</label>
              <input
                type="text"
                value={jackpot.title}
                onChange={(e) => setJackpot({ ...jackpot, title: e.target.value })}
                className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-400 block mb-1">Current Pool Amount (₹)</label>
              <input
                type="number"
                step="100"
                value={jackpot.current_amount_inr}
                onChange={(e) => setJackpot({ ...jackpot, current_amount_inr: e.target.value })}
                className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-400 block mb-1">Seed Amount (₹)</label>
              <input
                type="number"
                step="100"
                value={jackpot.seed_amount_inr}
                onChange={(e) => setJackpot({ ...jackpot, seed_amount_inr: e.target.value })}
                className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-400 block mb-1">Rules / Description</label>
              <textarea
                rows={3}
                value={jackpot.description}
                onChange={(e) => setJackpot({ ...jackpot, description: e.target.value })}
                className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-xs text-white"
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="jp-active"
                checked={jackpot.is_active}
                onChange={(e) => setJackpot({ ...jackpot, is_active: e.target.checked })}
                className="rounded text-amber-400 focus:ring-0"
              />
              <label htmlFor="jp-active" className="text-xs text-white font-bold">Jackpot Active</label>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={handleSaveJackpot}
                className="bg-amber-400 hover:bg-amber-300 text-purple-950 font-black text-xs px-5 py-2.5 rounded-lg uppercase shadow active:scale-95 transition cursor-pointer"
              >
                Save Jackpot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: VIP Tiers */}
      {!loading && activeTab === 'vip' && (
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wide">
              VIP Tier Thresholds & Rewards
            </h3>
            <p className="text-xs text-gray-400">
              Configure deposit requirements and one-time cash rewards for reaching each VIP level.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-dark-700 text-gray-400 font-bold">
                  <th className="pb-3 px-2">Level</th>
                  <th className="pb-3 px-2">Tier Name</th>
                  <th className="pb-3 px-2">Min Deposit (₹)</th>
                  <th className="pb-3 px-2">Cash Reward (₹)</th>
                  <th className="pb-3 px-2">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800">
                {vipTiers.map((t) => (
                  <tr key={t.vip_level} className="hover:bg-dark-800/40">
                    <td className="py-3 px-2 font-mono font-bold text-amber-400">VIP {t.vip_level}</td>
                    <td className="py-3 px-2">
                      <input
                        type="text"
                        defaultValue={t.level_name}
                        onBlur={(e) => handleUpdateVipTier(t.vip_level, 'level_name', e.target.value)}
                        className="w-28 bg-dark-800 border border-dark-600 rounded px-2 py-1 text-xs text-white"
                      />
                    </td>
                    <td className="py-3 px-2">
                      <input
                        type="number"
                        defaultValue={t.min_deposit_inr}
                        onBlur={(e) => handleUpdateVipTier(t.vip_level, 'min_deposit_inr', parseFloat(e.target.value) || 0)}
                        className="w-28 bg-dark-800 border border-dark-600 rounded px-2 py-1 text-xs text-white font-mono"
                      />
                    </td>
                    <td className="py-3 px-2">
                      <input
                        type="number"
                        defaultValue={t.reward_amount_inr}
                        onBlur={(e) => handleUpdateVipTier(t.vip_level, 'reward_amount_inr', parseFloat(e.target.value) || 0)}
                        className="w-28 bg-dark-800 border border-dark-600 rounded px-2 py-1 text-xs text-white font-mono"
                      />
                    </td>
                    <td className="py-3 px-2">
                      <input
                        type="checkbox"
                        checked={t.is_active}
                        onChange={(e) => handleUpdateVipTier(t.vip_level, 'is_active', e.target.checked)}
                        className="rounded text-amber-400 focus:ring-0"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
