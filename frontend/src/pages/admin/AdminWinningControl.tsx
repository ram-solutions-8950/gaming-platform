import { useEffect, useState, useCallback } from 'react';
import { Card } from '../../components/common/Card';
import { Loader } from '../../components/common/Loader';
import {
  adminService,
  type GlobalWinningConfig,
  type PersonalWinningControl,
} from '../../services/adminService';
import {
  Sliders,
  TrendingUp,
  UserCheck,
  Search,
  Plus,
  X,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';

export function AdminWinningControlPage() {
  const [activeTab, setActiveTab] = useState<'global' | 'personal'>('global');
  const [globalConfigs, setGlobalConfigs] = useState<GlobalWinningConfig[]>([]);
  const [personalControls, setPersonalControls] = useState<PersonalWinningControl[]>([]);
  const [personalTotal, setPersonalTotal] = useState(0);
  const [personalPage, setPersonalPage] = useState(1);
  const [personalSearch, setPersonalSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Global editing state per game slug
  const [editedGlobals, setEditedGlobals] = useState<Record<string, { mode: string; rtp_percent: number }>>({});
  const [savingSlug, setSavingSlug] = useState<string | null>(null);

  // Personal Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [targetUserId, setTargetUserId] = useState('');
  const [personalMode, setPersonalMode] = useState('BOOSTED');
  const [personalWinRate, setPersonalWinRate] = useState(80);
  const [personalNote, setPersonalNote] = useState('');
  const [submittingPersonal, setSubmittingPersonal] = useState(false);

  const fetchGlobal = useCallback(async () => {
    try {
      const data = await adminService.getGlobalWinningControls();
      setGlobalConfigs(data);
      const initialMap: Record<string, { mode: string; rtp_percent: number }> = {};
      data.forEach((g) => {
        initialMap[g.slug] = { mode: g.mode || 'HOUSE_EDGE', rtp_percent: g.rtp_percent || 95 };
      });
      setEditedGlobals(initialMap);
    } catch (err) {
      console.error('Failed to load global winning configs:', err);
    }
  }, []);

  const fetchPersonal = useCallback(async () => {
    try {
      const data = await adminService.getPersonalWinningControls(personalPage, 20, personalSearch.trim() || undefined);
      setPersonalControls(data.items);
      setPersonalTotal(data.total);
    } catch (err) {
      console.error('Failed to load personal winning controls:', err);
    }
  }, [personalPage, personalSearch]);

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchGlobal(), fetchPersonal()]);
    setLoading(false);
  }, [fetchGlobal, fetchPersonal]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGlobalChange = (slug: string, field: 'mode' | 'rtp_percent', value: any) => {
    setEditedGlobals((prev) => ({
      ...prev,
      [slug]: {
        ...prev[slug],
        [field]: value,
      },
    }));
  };

  const handleSaveGlobal = async (slug: string) => {
    setSavingSlug(slug);
    const item = editedGlobals[slug];
    try {
      await adminService.updateGlobalWinningControl(slug, item.mode, item.rtp_percent);
      toast.success(`Updated winning settings for ${slug}`);
      fetchGlobal();
    } catch (err: any) {
      toast.error('Failed to update winning settings');
    } finally {
      setSavingSlug(null);
    }
  };

  const handleSavePersonal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUserId.trim()) {
      toast.error('Please enter a valid user ID');
      return;
    }
    setSubmittingPersonal(true);
    try {
      await adminService.setPersonalWinningControl({
        user_id: targetUserId.trim(),
        mode: personalMode,
        win_rate_percent: personalWinRate,
        note: personalNote.trim() || undefined,
      });
      toast.success('Personal player winning override saved');
      setModalOpen(false);
      setTargetUserId('');
      setPersonalNote('');
      fetchPersonal();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save personal override');
    } finally {
      setSubmittingPersonal(false);
    }
  };

  const handleDeletePersonal = async (userId: string, username: string) => {
    if (!window.confirm(`Revert @${username} to default global game odds?`)) return;
    try {
      await adminService.deletePersonalWinningControl(userId);
      toast.success(`Removed override for @${username}`);
      fetchPersonal();
    } catch (err: any) {
      toast.error('Failed to delete override');
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Sliders className="text-cyan-400" size={26} />
            <span>Winning & RTP Controls</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Configure Global Game Return-to-Player (RTP) algorithms and Personal Player Luck overrides.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadData()}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#141b2d] hover:bg-[#1a233a] text-gray-300 border border-[#222c44] transition"
          >
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
          {activeTab === 'personal' && (
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/20 transition cursor-pointer"
            >
              <Plus size={16} />
              <span>Set Player Luck Override</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-[#1d273d] gap-6 text-xs font-bold">
        <button
          onClick={() => setActiveTab('global')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition ${
            activeTab === 'global'
              ? 'border-cyan-400 text-cyan-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <TrendingUp size={16} />
          <span>Global Game Controls ({globalConfigs.length} Games)</span>
        </button>
        <button
          onClick={() => setActiveTab('personal')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition ${
            activeTab === 'personal'
              ? 'border-cyan-400 text-cyan-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <UserCheck size={16} />
          <span>Personal Player Luck Overrides ({personalTotal} Active)</span>
        </button>
      </div>

      {/* Tab 1: Global Game Controls */}
      {activeTab === 'global' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {globalConfigs.map((game) => {
            const current = editedGlobals[game.slug] || { mode: 'HOUSE_EDGE', rtp_percent: 95 };
            const isSaving = savingSlug === game.slug;

            return (
              <div
                key={game.slug}
                className="bg-[#111726] border border-[#1d273d] hover:border-cyan-500/40 rounded-2xl p-5 shadow-xl transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-base font-extrabold text-white">{game.name}</h3>
                      <span className="text-[10px] text-gray-500 font-mono">/{game.slug}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-[#182238] text-cyan-400 border border-cyan-500/30">
                      {game.game_type}
                    </span>
                  </div>

                  {/* Mode Selector */}
                  <div className="space-y-3 mt-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-300 mb-1">
                        Winning Bias Mode
                      </label>
                      <select
                        value={current.mode}
                        onChange={(e) => handleGlobalChange(game.slug, 'mode', e.target.value)}
                        className="w-full bg-[#161f33] border border-[#23304d] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                      >
                        <option value="HOUSE_EDGE">House Edge (Lower Pool Wins / Certified Standard)</option>
                        <option value="FAIR">Fair Random (Standard True Odds)</option>
                        <option value="HIGH_PAYOUT">High Payout (Player Favored Promotion)</option>
                      </select>
                    </div>

                    {/* RTP % Slider */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-semibold text-gray-300 mb-1">
                        <span>Target RTP %:</span>
                        <span className="text-cyan-400 font-mono font-bold text-xs">{current.rtp_percent}%</span>
                      </div>
                      <input
                        type="range"
                        min="50"
                        max="99"
                        value={current.rtp_percent}
                        onChange={(e) => handleGlobalChange(game.slug, 'rtp_percent', parseInt(e.target.value))}
                        className="w-full accent-cyan-500 cursor-pointer"
                      />
                      <div className="flex items-center justify-between text-[9px] text-gray-500 font-mono mt-0.5">
                        <span>50% (Tight)</span>
                        <span>95% (Standard)</span>
                        <span>99% (Loose)</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-[#1d273d] flex items-center justify-between">
                  <div className="text-[10px] text-gray-400">
                    House Edge: <strong className="text-white">{100 - current.rtp_percent}%</strong>
                  </div>
                  <button
                    onClick={() => handleSaveGlobal(game.slug)}
                    disabled={isSaving}
                    className="px-4 py-1.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition disabled:opacity-50 cursor-pointer shadow-md"
                  >
                    {isSaving ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 2: Personal Player Overrides */}
      {activeTab === 'personal' && (
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <input
              type="text"
              placeholder="Search user by username or email..."
              value={personalSearch}
              onChange={(e) => {
                setPersonalSearch(e.target.value);
                setPersonalPage(1);
              }}
              className="w-full bg-[#111726] border border-[#1d273d] rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <Card title="Player Personal Luck Overrides">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="text-gray-400 border-b border-[#1d273d] uppercase text-[10px]">
                    <th className="py-3 px-3">Player</th>
                    <th className="py-3 px-3">Luck Mode</th>
                    <th className="py-3 px-3 text-right">Win Rate %</th>
                    <th className="py-3 px-3">Note</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#182136]">
                  {personalControls.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-500">
                        No personal player luck overrides configured. Click "Set Player Luck Override" above to configure a player.
                      </td>
                    </tr>
                  ) : (
                    personalControls.map((ctrl) => {
                      return (
                        <tr key={ctrl.id} className="hover:bg-[#141b2d] transition-colors">
                          <td className="py-3 px-3">
                            <span className="font-bold text-white block">{ctrl.name}</span>
                            <span className="text-[11px] text-gray-400 font-mono">@{ctrl.username}</span>
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                ctrl.mode === 'FORCED_WIN'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : ctrl.mode === 'BOOSTED'
                                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                  : ctrl.mode === 'REDUCED'
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              {ctrl.mode}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-white">
                            {ctrl.win_rate_percent}%
                          </td>
                          <td className="py-3 px-3 text-gray-400 text-xs">
                            {ctrl.note || '-'}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              onClick={() => handleDeletePersonal(ctrl.user_id, ctrl.username)}
                              className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-rose-600/20 text-rose-400 hover:bg-rose-600 hover:text-white transition"
                              title="Revert to Global Default"
                            >
                              Revert Default
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Modal: Set Personal Player Luck */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0f1422] border border-[#222c44] rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#222c44]">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="text-cyan-400" size={18} />
                <span>Set Player Luck Override</span>
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePersonal} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Player User UUID
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 6b6ce039-35c4-4c96-a850-2813c5e33d84"
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                  className="w-full bg-[#141b2d] border border-[#222c44] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Luck Mode
                </label>
                <select
                  value={personalMode}
                  onChange={(e) => {
                    setPersonalMode(e.target.value);
                    if (e.target.value === 'FORCED_WIN') setPersonalWinRate(100);
                    if (e.target.value === 'BOOSTED') setPersonalWinRate(80);
                    if (e.target.value === 'REDUCED') setPersonalWinRate(20);
                    if (e.target.value === 'FORCED_LOSS') setPersonalWinRate(0);
                  }}
                  className="w-full bg-[#141b2d] border border-[#222c44] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="FORCED_WIN">FORCED WIN (Guaranteed Card / Spin Win)</option>
                  <option value="BOOSTED">BOOSTED (80% Win Rate / VIP Player Luck)</option>
                  <option value="REDUCED">REDUCED (20% Win Rate / House Advantage)</option>
                  <option value="FORCED_LOSS">FORCED LOSS (Risk Flag / High Cooldown)</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-gray-300 mb-1">
                  <span>Win Rate Probability:</span>
                  <span className="font-mono text-cyan-400 font-bold">{personalWinRate}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={personalWinRate}
                  onChange={(e) => setPersonalWinRate(parseInt(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Internal Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. VIP high roller bonus luck"
                  value={personalNote}
                  onChange={(e) => setPersonalNote(e.target.value)}
                  className="w-full bg-[#141b2d] border border-[#222c44] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#222c44]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-gray-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingPersonal}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition disabled:opacity-50"
                >
                  {submittingPersonal ? 'Saving...' : 'Apply Luck Override'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
