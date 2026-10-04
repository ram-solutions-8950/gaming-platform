import { useEffect, useState, useCallback } from 'react';
import { Card } from '../../components/common/Card';
import { Loader } from '../../components/common/Loader';
import { adminService, type WagerRequirementItem } from '../../services/adminService';
import {
  Coins,
  Search,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Edit3,
  Sliders,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';

export function AdminWagersPage() {
  const [wagers, setWagers] = useState<WagerRequirementItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterFulfilled, setFilterFulfilled] = useState<string>('ALL');

  // Global wager config state
  const [globalConfig, setGlobalConfig] = useState<{ multiplier: number; default_user_wager_inr?: number } | null>(null);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [inputMultiplier, setInputMultiplier] = useState('1.0');
  const [applyToExisting, setApplyToExisting] = useState(true);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [syncingMultiplier, setSyncingMultiplier] = useState(false);

  // Apply to all modal state
  const [applyAllModalOpen, setApplyAllModalOpen] = useState(false);
  const [applyAllAmount, setApplyAllAmount] = useState('100');
  const [applyingAll, setApplyingAll] = useState(false);

  // Add individual wager modal
  const [modalOpen, setModalOpen] = useState(false);
  const [targetUserId, setTargetUserId] = useState('');
  const [requiredAmountInr, setRequiredAmountInr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit individual wager modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingWager, setEditingWager] = useState<WagerRequirementItem | null>(null);
  const [editRequiredAmt, setEditRequiredAmt] = useState('');
  const [editCompletedAmt, setEditCompletedAmt] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const pageSize = 15;

  const fetchGlobalConfig = async () => {
    try {
      const cfg = await adminService.getGlobalWagerConfig();
      if (cfg) {
        setGlobalConfig(cfg);
        setInputMultiplier(String(cfg.multiplier ?? 1.0));
      }
    } catch (err) {
      console.error('Failed to load global wager config', err);
    }
  };

  const fetchWagers = useCallback(async () => {
    try {
      setLoading(true);
      const isFulfilled = filterFulfilled === 'ALL' ? undefined : (filterFulfilled === 'FULFILLED' ? true : (filterFulfilled === 'PENDING' ? false : undefined));
      const statusFilter = filterFulfilled === 'NO_REQUIREMENT' ? 'NO_REQUIREMENT' : undefined;
      const data = await adminService.getWagers(page, pageSize, search.trim() || undefined, isFulfilled, statusFilter);
      setWagers(data.items);
      setTotal(data.total);
    } catch (err) {
      console.error('Failed to load wagers:', err);
      toast.error('Failed to load wager requirements');
    } finally {
      setLoading(false);
    }
  }, [page, search, filterFulfilled]);

  useEffect(() => {
    fetchGlobalConfig();
    fetchWagers();
  }, [fetchWagers]);

  const handleSaveGlobalWager = async (e: React.FormEvent) => {
    e.preventDefault();
    const mult = parseFloat(inputMultiplier);
    if (isNaN(mult) || mult < 0) {
      toast.error('Multiplier must be a non-negative number');
      return;
    }
    setSavingGlobal(true);
    try {
      const res = await adminService.updateGlobalWagerConfig({
        multiplier: mult,
        apply_to_existing_deposits: applyToExisting,
      });
      if (res?.synced_info) {
        toast.success(`Updated to ${mult}x & synced ${res.synced_info.total_requirements_updated} deposit requirements!`);
      } else {
        toast.success(`Global wager multiplier updated to ${mult}x`);
      }
      setAdjustModalOpen(false);
      fetchGlobalConfig();
      fetchWagers();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update global wager');
    } finally {
      setSavingGlobal(false);
    }
  };

  const handleSyncMultiplier = async () => {
    if (!window.confirm(`Recalculate and apply the active ${globalConfig?.multiplier ?? 1.0}x multiplier to all player deposits?`)) return;
    setSyncingMultiplier(true);
    try {
      const res = await adminService.syncMultiplierToDeposits();
      toast.success(res?.message || 'Successfully synced multiplier with all player deposits!');
      fetchWagers();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to sync multiplier');
    } finally {
      setSyncingMultiplier(false);
    }
  };

  const handleApplyToAll = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(applyAllAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (!window.confirm(`Apply ₹${amt} baseline wager requirement to ALL active player accounts?`)) return;

    setApplyingAll(true);
    try {
      const res = await adminService.applyWagerToAllUsers(amt);
      toast.success(res?.message || `Successfully applied baseline wager to all users!`);
      setApplyAllModalOpen(false);
      fetchWagers();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to apply wager to all users');
    } finally {
      setApplyingAll(false);
    }
  };

  const openEditModal = (w: WagerRequirementItem) => {
    setEditingWager(w);
    setEditRequiredAmt(String(w.required_amount_inr));
    setEditCompletedAmt(String(w.completed_amount_inr));
    setEditModalOpen(true);
  };

  const handleSaveWagerEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWager) return;
    const reqAmt = parseFloat(editRequiredAmt);
    const compAmt = parseFloat(editCompletedAmt);
    if (isNaN(reqAmt) || reqAmt < 0 || isNaN(compAmt) || compAmt < 0) {
      toast.error('Amounts must be non-negative numbers');
      return;
    }
    setSavingEdit(true);
    try {
      await adminService.updateWager(editingWager.id, {
        required_amount_inr: reqAmt,
        completed_amount_inr: compAmt,
        is_fulfilled: compAmt >= reqAmt,
      });
      toast.success('Wager requirement updated successfully');
      setEditModalOpen(false);
      setEditingWager(null);
      fetchWagers();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update wager');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleFulfillWager = async (wagerId: string) => {
    try {
      await adminService.fulfillWager(wagerId);
      toast.success('Wager requirement waived / fulfilled');
      fetchWagers();
    } catch {
      toast.error('Failed to fulfill wager');
    }
  };

  const handleWaiveAll = async (userId: string, username: string) => {
    if (!window.confirm(`Waive all unfulfilled wagers for @${username}?`)) return;
    try {
      await adminService.waiveUserWagers(userId);
      toast.success(`All wagers waived for @${username}`);
      fetchWagers();
    } catch {
      toast.error('Failed to waive user wagers');
    }
  };

  const handleCreateWager = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(requiredAmountInr);
    if (!amt || amt <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    setSubmitting(true);
    try {
      await adminService.createWager(targetUserId.trim(), amt);
      toast.success('Wager requirement created successfully');
      setModalOpen(false);
      setTargetUserId('');
      setRequiredAmountInr('');
      fetchWagers();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create wager requirement');
    } finally {
      setSubmitting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Compute stats from current page
  const totalRequired = wagers.reduce((acc, w) => acc + w.required_amount_inr, 0);
  const totalCompleted = wagers.reduce((acc, w) => acc + w.completed_amount_inr, 0);
  const pendingCount = wagers.filter((w) => w.required_amount_inr > 0 && !w.is_fulfilled).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Coins className="text-cyan-400" size={26} />
            <span>Wager Requirement Controls</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Configure player play-through criteria, monitor bet rollover progress, and clear withdrawal holds.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchWagers()}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#141b2d] hover:bg-[#1a233a] text-gray-300 border border-[#222c44] transition"
          >
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/20 transition cursor-pointer"
          >
            <Plus size={16} />
            <span>Add Wager Requirement</span>
          </button>
        </div>
      </div>

      {/* Global Wager Settings & Batch Actions Card */}
      <div className="bg-gradient-to-r from-[#111726] to-[#151c30] border border-cyan-500/20 rounded-2xl p-5 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
              <Sliders size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Global Auto-Wager Rollover Setting</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                  {globalConfig ? `${globalConfig.multiplier}x Multiplier` : '1.0x Multiplier'}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1 max-w-2xl">
                Automatically calculates wager rollover requirement when any player deposits (e.g. ₹1,000 deposit at {globalConfig?.multiplier ?? 1.0}x = ₹{((globalConfig?.multiplier ?? 1.0) * 1000).toLocaleString('en-IN')} bet playthrough before withdrawal unlock).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => {
                setInputMultiplier(String(globalConfig?.multiplier ?? 1.0));
                setAdjustModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 transition cursor-pointer"
            >
              <Edit3 size={13} />
              <span>Adjust Multiplier</span>
            </button>

            <button
              onClick={handleSyncMultiplier}
              disabled={syncingMultiplier}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#1a233a] hover:bg-[#232f4e] text-cyan-200 border border-[#2d3a5e] transition cursor-pointer disabled:opacity-50"
              title="Recalculate turnover for all player deposits using current multiplier"
            >
              <RefreshCw size={13} className={syncingMultiplier ? 'animate-spin' : ''} />
              <span>{syncingMultiplier ? 'Syncing...' : 'Sync to Deposits'}</span>
            </button>

            <button
              onClick={() => setApplyAllModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-purple-600/30 hover:bg-purple-600/40 text-purple-200 border border-purple-500/40 transition cursor-pointer"
            >
              <Users size={14} />
              <span>Apply Baseline Wager to All</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-[#111726] border border-[#1d273d] rounded-2xl p-4">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Requirements</span>
          <p className="text-2xl font-black text-white mt-1 font-mono">{total}</p>
        </div>
        <div className="bg-[#111726] border border-[#1d273d] rounded-2xl p-4">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Page Required Turnover</span>
          <p className="text-2xl font-black text-amber-400 mt-1 font-mono">
            ₹{totalRequired.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-[#111726] border border-[#1d273d] rounded-2xl p-4">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Completed Turnover</span>
          <p className="text-2xl font-black text-emerald-400 mt-1 font-mono">
            ₹{totalCompleted.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-[#111726] border border-[#1d273d] rounded-2xl p-4">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Pending Play-throughs</span>
          <p className="text-2xl font-black text-rose-400 mt-1 font-mono">{pendingCount}</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
          <input
            type="text"
            placeholder="Search by username, user ID, or email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full bg-[#111726] border border-[#1d273d] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <select
          value={filterFulfilled}
          onChange={(e) => {
            setFilterFulfilled(e.target.value);
            setPage(1);
          }}
          className="bg-[#111726] border border-[#1d273d] text-white text-xs font-semibold rounded-xl px-4 py-2.5 focus:outline-none"
        >
          <option value="ALL">All Statuses</option>
          <option value="PENDING">Pending Turnover Only</option>
          <option value="FULFILLED">Fulfilled Only</option>
          <option value="NO_REQUIREMENT">No Requirement</option>
        </select>
      </div>

      {/* Table */}
      <Card title="Player Wager Requirements">
        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader size="lg" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="text-gray-400 border-b border-[#1d273d] uppercase text-[10px]">
                  <th className="py-3 px-3">Player</th>
                  <th className="py-3 px-3 text-right">Required (₹)</th>
                  <th className="py-3 px-3 text-right">Wagered (₹)</th>
                  <th className="py-3 px-3 text-right">Remaining (₹)</th>
                  <th className="py-3 px-3">Progress</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#182136]">
                {wagers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-500">
                      No wager requirements found.
                    </td>
                  </tr>
                ) : (
                  wagers.map((w) => (
                    <tr key={w.id} className="hover:bg-[#141b2d] transition-colors">
                      <td className="py-3 px-3">
                        <span className="font-bold text-white block">{w.user_name}</span>
                        <span className="text-[11px] text-gray-400 font-mono">@{w.username}</span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-white">
                        ₹{w.required_amount_inr.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold text-emerald-400">
                        ₹{w.completed_amount_inr.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-rose-400">
                        ₹{w.remaining_amount_inr.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 w-40">
                        {w.required_amount_inr === 0 ? (
                          <span className="text-[11px] text-gray-500 font-mono italic">No requirement</span>
                        ) : (
                          <>
                            <div className="w-full bg-[#1a233a] rounded-full h-2 overflow-hidden mb-1">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  w.is_fulfilled ? 'bg-emerald-500' : 'bg-cyan-500'
                                }`}
                                style={{ width: `${Math.min(100, Math.max(4, w.progress_percent))}%` }}
                              ></div>
                            </div>
                            <span className="text-[10px] text-gray-400 font-mono">{w.progress_percent}% completed</span>
                          </>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {w.required_amount_inr === 0 ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#141b2d] text-gray-400 border border-gray-700/60">
                            NO REQUIREMENT
                          </span>
                        ) : (
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              w.is_fulfilled
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            }`}
                          >
                            {w.is_fulfilled ? 'FULFILLED' : 'PENDING'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditModal(w)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-cyan-400 hover:bg-[#1a233a] transition cursor-pointer"
                            title="Edit Required or Completed Turnover"
                          >
                            <Edit3 size={14} />
                          </button>
                          {!w.is_fulfilled && (
                            <>
                              <button
                                onClick={() => handleFulfillWager(w.id)}
                                className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600 hover:text-white transition cursor-pointer"
                                title="Fulfill this deposit's requirement"
                              >
                                Waive Wager
                              </button>
                              <button
                                onClick={() => handleWaiveAll(w.user_id, w.username)}
                                className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-cyan-600/30 text-cyan-300 hover:bg-cyan-600 hover:text-white transition cursor-pointer"
                                title="Waive all pending requirements for this user"
                              >
                                Clear All
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > pageSize && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#1d273d] text-xs text-gray-400">
            <span>
              Showing {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, total)} of {total} requirements
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg bg-[#141b2d] border border-[#222c44] text-gray-300 hover:text-white disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg bg-[#141b2d] border border-[#222c44] text-gray-300 hover:text-white disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Modal: Add Wager Requirement */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0f1422] border border-[#222c44] rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#222c44]">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Coins className="text-cyan-400" size={18} />
                <span>Add Wager Requirement</span>
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateWager} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  User UUID (User ID)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 4dc86278-02b4-4640-869c-ce84169f4f40"
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                  className="w-full bg-[#141b2d] border border-[#222c44] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Required Turnover Amount (₹ INR)
                </label>
                <input
                  type="number"
                  step="any"
                  min="1"
                  required
                  placeholder="e.g. 500.00"
                  value={requiredAmountInr}
                  onChange={(e) => setRequiredAmountInr(e.target.value)}
                  className="w-full bg-[#141b2d] border border-[#222c44] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
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
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Set Wager'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Wager Requirement */}
      {editModalOpen && editingWager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0f1422] border border-[#222c44] rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#222c44]">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Edit3 className="text-cyan-400" size={18} />
                <span>Adjust Wager Requirement</span>
              </h2>
              <button
                onClick={() => {
                  setEditModalOpen(false);
                  setEditingWager(null);
                }}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveWagerEdit} className="space-y-4 pt-4">
              <div className="p-3 rounded-xl bg-[#141b2d] border border-[#222c44] text-xs">
                <span className="text-gray-400 block text-[11px]">Target Player</span>
                <span className="font-bold text-white text-sm">{editingWager.user_name}</span>
                <span className="text-gray-400 block font-mono text-[11px]">@{editingWager.username} • {editingWager.user_id.slice(0, 8)}...</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Required Turnover Amount (₹ INR)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={editRequiredAmt}
                  onChange={(e) => setEditRequiredAmt(e.target.value)}
                  className="w-full bg-[#141b2d] border border-[#222c44] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Completed / Wagered Amount (₹ INR)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={editCompletedAmt}
                  onChange={(e) => setEditCompletedAmt(e.target.value)}
                  className="w-full bg-[#141b2d] border border-[#222c44] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#222c44]">
                <button
                  type="button"
                  onClick={() => {
                    setEditModalOpen(false);
                    setEditingWager(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs text-gray-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition disabled:opacity-50"
                >
                  {savingEdit ? 'Updating...' : 'Save Adjustments'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Adjust Multiplier */}
      {adjustModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0f1422] border border-[#222c44] rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#222c44]">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Sliders className="text-cyan-400" size={18} />
                <span>Adjust Global Turnover Multiplier</span>
              </h2>
              <button
                onClick={() => setAdjustModalOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveGlobalWager} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Rollover Play-Through Multiplier
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    required
                    value={inputMultiplier}
                    onChange={(e) => setInputMultiplier(e.target.value)}
                    className="w-full bg-[#141b2d] border border-[#222c44] rounded-xl px-3.5 py-2.5 text-sm text-white font-mono font-bold focus:outline-none focus:border-cyan-500"
                    placeholder="e.g. 50"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-cyan-400 font-black text-sm">x</span>
                </div>
                {/* Presets */}
                <div className="flex items-center gap-1.5 mt-2">
                  {[1, 2, 5, 10, 25, 50].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setInputMultiplier(String(preset))}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                        parseFloat(inputMultiplier) === preset
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                          : 'bg-[#141b2d] text-gray-400 border-[#222c44] hover:text-white'
                      }`}
                    >
                      {preset}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic example calculation */}
              <div className="p-3 bg-cyan-950/30 border border-cyan-500/30 rounded-xl text-xs text-cyan-200 space-y-1">
                <span className="font-bold block text-white">Example Calculation:</span>
                <p className="text-gray-300 text-[11px]">
                  When a player deposits <strong className="text-gold-400 font-mono">₹1,000</strong> at{' '}
                  <strong className="text-cyan-400 font-mono">{parseFloat(inputMultiplier) || 0}x</strong> multiplier, they must place{' '}
                  <strong className="text-emerald-400 font-mono">₹{(1000 * (parseFloat(inputMultiplier) || 0)).toLocaleString('en-IN')}</strong> in bets before withdrawal unlock.
                </p>
              </div>

              {/* Apply to existing deposits checkbox */}
              <label className="flex items-start gap-2.5 p-3 bg-[#141b2d] border border-[#222c44] rounded-xl cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={applyToExisting}
                  onChange={(e) => setApplyToExisting(e.target.checked)}
                  className="rounded border-gray-700 text-cyan-500 focus:ring-0 mt-0.5"
                />
                <div className="text-xs">
                  <span className="font-bold text-white block">
                    Recalculate & apply to all active player deposits now
                  </span>
                  <span className="text-[11px] text-gray-400">
                    Immediately recalculates turnover requirements for all existing deposits in the table below using {parseFloat(inputMultiplier) || 0}x multiplier.
                  </span>
                </div>
              </label>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#222c44]">
                <button
                  type="button"
                  onClick={() => setAdjustModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-gray-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingGlobal}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition disabled:opacity-50 cursor-pointer shadow-lg shadow-cyan-600/20"
                >
                  {savingGlobal ? 'Applying Multiplier...' : 'Save & Update Wagers'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Apply Baseline Wager to All Users */}
      {applyAllModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0f1422] border border-[#222c44] rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#222c44]">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="text-purple-400" size={18} />
                <span>Apply Baseline Wager to All Players</span>
              </h2>
              <button
                onClick={() => setApplyAllModalOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleApplyToAll} className="space-y-4 pt-4">
              <div className="p-3 bg-purple-900/20 border border-purple-500/30 rounded-xl text-xs text-purple-200">
                ⚠️ This will set or add a baseline playthrough wager requirement for <strong>all registered player accounts</strong> in the system. Players will need to reach this betting turnover before requesting withdrawals.
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Baseline Required Turnover (₹ INR)
                </label>
                <input
                  type="number"
                  step="any"
                  min="1"
                  required
                  placeholder="e.g. 100"
                  value={applyAllAmount}
                  onChange={(e) => setApplyAllAmount(e.target.value)}
                  className="w-full bg-[#141b2d] border border-[#222c44] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#222c44]">
                <button
                  type="button"
                  onClick={() => setApplyAllModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-gray-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={applyingAll}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition disabled:opacity-50"
                >
                  {applyingAll ? 'Applying to All Accounts...' : 'Confirm & Apply to All'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
