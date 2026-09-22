import { useEffect, useRef, useState, useCallback } from 'react';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Loader } from '../../components/common/Loader';
import api from '../../services/api';
import { walletService } from '../../services/wallet';
import { useAuthStore } from '../../store/authStore';
import type { User, WalletTransaction } from '../../types';
import {
  RefreshCw,
  Search,
  Filter,
  ArrowLeft,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Coins,
  X,
} from 'lucide-react';
import { getApiErrorMessage } from '../../utils/apiError';


/* ─── helpers ─── */
const paisaToRupees = (paisa: number) => paisa / 100;
const rupeesToPaisa = (rupees: number) => Math.round(rupees * 100);
const fmtRupees = (paisa: number) =>
  `₹${paisaToRupees(paisa).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function formatJoinedDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return dateStr;
  }
}

/* ─── Toast ─── */
interface ToastState { message: string; type: 'success' | 'error' }
interface ToastState {
  message: string;
  type: 'success' | 'error';
}

function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`fixed bottom-6 right-6 z-[200] flex items-start gap-3 px-5 py-4 rounded-xl shadow-2xl border max-w-sm animate-in slide-in-from-bottom-4 duration-300 ${
        toast.type === 'success'
          ? 'bg-emerald-900/90 border-emerald-500/40 text-emerald-200'
          : 'bg-red-900/90 border-red-500/40 text-red-200'
      }`}
    >
      <span className="text-xl shrink-0">{toast.type === 'success' ? '✅' : '❌'}</span>
      <p className="text-sm font-medium flex-1">{toast.message}</p>
      <button
        onClick={onDismiss}
        className="shrink-0 text-current opacity-60 hover:opacity-100 transition-opacity text-lg leading-none cursor-pointer"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

/* ─── Wallet Adjustment Modal ─── */
interface AdjustModalProps {
  user: User;
  currentBalancePaisa?: number | null;
  onClose: () => void;
  onSuccess: (tx: WalletTransaction) => void;
}

function WalletAdjustModal({ user, currentBalancePaisa, onClose, onSuccess }: AdjustModalProps) {
  const [currentBalance, setCurrentBalance] = useState<number | null>(currentBalancePaisa ?? user.wallet_balance ?? null);
  const [loadingBalance, setLoadingBalance] = useState<boolean>(currentBalancePaisa === undefined && user.wallet_balance === undefined);
  const [mode, setMode] = useState<'add' | 'deduct'>('add');
  const [amountRupees, setAmountRupees] = useState('');
  const [reason, setReason] = useState('');
  const [amountError, setAmountError] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [apiError, setApiError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submitRef = useRef(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Fetch freshest user balance on modal open (BUG-022)
  useEffect(() => {
    let mounted = true;
    api
      .get(`/admin/users/${user.id}`)
      .then((res) => {
        if (mounted && res.data.data?.wallet_balance !== undefined) {
          setCurrentBalance(res.data.data.wallet_balance);
        }
      })
      .catch((err) => {
        console.error('Could not load user wallet balance', err);
      })
      .finally(() => {
        if (mounted) setLoadingBalance(false);
      });

    return () => {
      mounted = false;
    };
  }, [user.id]);

  // Focus amount field on open
  useEffect(() => {
    setTimeout(() => firstInputRef.current?.focus(), 80);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const parsedAmount = parseFloat(amountRupees);
  const amountPaisa = !isNaN(parsedAmount) && parsedAmount > 0 ? rupeesToPaisa(parsedAmount) : 0;
  const currentPaisa = currentBalance ?? 0;
  const expectedPaisa = mode === 'add' ? currentPaisa + amountPaisa : currentPaisa - amountPaisa;
  const showPreview = amountPaisa > 0;

  const validate = (): boolean => {
    let ok = true;
    setAmountError('');
    setReasonError('');

    if (!amountRupees.trim() || isNaN(parsedAmount)) {
      setAmountError('Enter a valid amount.');
      ok = false;
    } else if (parsedAmount <= 0) {
      setAmountError('Amount must be greater than zero.');
      ok = false;
    } else if (parsedAmount < 0.01) {
      setAmountError('Minimum adjustment is ₹0.01.');
      ok = false;
    }

    if (!reason.trim()) {
      setReasonError('Reason is required.');
      ok = false;
    } else if (reason.trim().length < 5) {
      setReasonError('Reason must be at least 5 characters.');
      ok = false;
    }

    return ok;
  };

  const handleSubmit = async () => {
    if (submitRef.current || submitting) return;
    if (!validate()) return;

    const finalAmountPaisa = mode === 'add' ? amountPaisa : -amountPaisa;

    submitRef.current = true;
    setSubmitting(true);
    setApiError('');

    try {
      const tx = await walletService.adjustUserWallet(user.id, finalAmountPaisa, reason.trim());
      onSuccess(tx);
    } catch (err: any) {
      const msg: string = getApiErrorMessage(err, 'Wallet adjustment failed. Please try again.');

      // Friendly messages — do not expose internals
      if (err.response?.status === 403) {
        setApiError('Super-admin access required. You are not authorised to perform this action.');
      } else if (msg.toLowerCase().includes('insufficient')) {
        setApiError('Insufficient balance. The user does not have enough funds to deduct this amount.');
      } else if (msg.toLowerCase().includes('wallet not found')) {
        setApiError('Wallet not found for this user.');
      } else {
        setApiError(msg);
      }
    } finally {
      setSubmitting(false);
      submitRef.current = false;
    }
  };

  return (
    /* Backdrop - Prevent closing on outside click (BUG-024) */
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="adj-modal-title"
    >
      {/* Panel */}
      <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90dvh] overflow-y-auto">
        {/* Header with Back button (BUG-021) and Close (X) button */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-dark-700 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-white px-2.5 py-1.5 rounded-lg bg-dark-800 hover:bg-dark-700 border border-dark-600 transition shadow-sm"
              title="Return to User Management"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
            <h2 id="adj-modal-title" className="text-lg font-bold text-white flex items-center gap-2">
              <Coins className="w-5 h-5 text-amber-400" />
              <span>Adjust Wallet</span>
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-dark-700 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* User info */}
          <div className="bg-dark-800 rounded-xl px-4 py-3 border border-dark-700">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-1">User</p>
            <p className="text-base font-bold text-gray-100">{user.name}</p>
            <p className="text-xs text-gray-500">
              {user.email} &bull; @{user.username}
            </p>
            <p className="text-[11px] font-mono text-gray-400 mt-1">ID: {user.id}</p>
          </div>

          {/* Current balance (BUG-022) */}
          <div className="bg-dark-800 rounded-xl px-4 py-3 border border-dark-700">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-1">Current Balance</p>
            {loadingBalance ? (
              <div className="py-1">
                <Loader size="sm" />
              </div>
            ) : currentBalance !== null ? (
              <p className="text-2xl font-extrabold text-amber-400">{fmtRupees(currentBalance)}</p>
            ) : (
              <p className="text-sm text-gray-500 italic">Could not load balance</p>
            )}
          </div>

          {/* Add / Deduct toggle */}
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-2">Adjustment Type</p>
            <div className="flex rounded-xl overflow-hidden border border-dark-700 text-sm font-bold">
              <button
                type="button"
                onClick={() => setMode('add')}
                className={`flex-1 py-2.5 transition-colors cursor-pointer ${
                  mode === 'add' ? 'bg-emerald-600 text-white' : 'bg-dark-800 text-gray-400 hover:text-gray-100'
                }`}
                aria-pressed={mode === 'add'}
              >
                ＋ Add Funds
              </button>
              <button
                type="button"
                onClick={() => setMode('deduct')}
                className={`flex-1 py-2.5 transition-colors cursor-pointer ${
                  mode === 'deduct' ? 'bg-red-600 text-white' : 'bg-dark-800 text-gray-400 hover:text-gray-100'
                }`}
                aria-pressed={mode === 'deduct'}
              >
                － Deduct Funds
              </button>
            </div>
          </div>

          {/* Amount input */}
          <div>
            <label htmlFor="adj-amount" className="block text-xs text-gray-400 font-medium uppercase tracking-wider mb-2">
              Amount (₹)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm pointer-events-none">
                ₹
              </span>
              <input
                ref={firstInputRef}
                id="adj-amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={amountRupees}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '' || parseFloat(v) >= 0) setAmountRupees(v);
                  setAmountError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === '-' || e.key === 'e') e.preventDefault();
                }}
                disabled={submitting}
                className={`w-full pl-8 pr-4 py-3 bg-dark-800 border rounded-xl text-gray-100 placeholder-gray-600 text-base font-semibold focus:outline-none transition-colors ${
                  amountError
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-dark-600 focus:border-primary-500 focus:ring-1 focus:ring-primary-500'
                } disabled:opacity-50`}
              />
            </div>
            {amountError && <p className="mt-1.5 text-xs text-red-400">{amountError}</p>}
          </div>

          {/* Reason input */}
          <div>
            <label htmlFor="adj-reason" className="block text-xs text-gray-400 font-medium uppercase tracking-wider mb-2">
              Reason <span className="text-gray-500 normal-case">(min 5 characters)</span>
            </label>
            <textarea
              id="adj-reason"
              rows={3}
              placeholder="e.g. Refund for technical issue, promotional credit, correction..."
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setReasonError('');
              }}
              disabled={submitting}
              className={`w-full px-4 py-3 bg-dark-800 border rounded-xl text-gray-100 placeholder-gray-600 text-sm resize-none focus:outline-none transition-colors ${
                reasonError
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-dark-600 focus:border-primary-500 focus:ring-1 focus:ring-primary-500'
              } disabled:opacity-50`}
            />
            <div className="flex justify-between mt-1">
              {reasonError ? <p className="text-xs text-red-400">{reasonError}</p> : <span />}
              <p className={`text-xs ml-auto ${reason.trim().length < 5 ? 'text-gray-600' : 'text-gray-500'}`}>
                {reason.trim().length} / min 5
              </p>
            </div>
          </div>

          {/* Preview */}
          {showPreview && currentBalance !== null && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm space-y-1.5 ${
                mode === 'add' ? 'bg-emerald-900/20 border-emerald-500/30' : 'bg-red-900/20 border-red-500/30'
              }`}
            >
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Preview</p>
              <div className="flex justify-between">
                <span className="text-gray-400">Current balance</span>
                <span className="text-gray-200 font-semibold">{fmtRupees(currentBalance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Adjustment</span>
                <span className={`font-bold ${mode === 'add' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {mode === 'add' ? '+' : '−'}
                  {fmtRupees(amountPaisa)}
                </span>
              </div>
              <div className="border-t border-white/10 pt-1.5 flex justify-between">
                <span className="text-gray-300 font-semibold">Expected balance</span>
                <span className={`font-extrabold ${expectedPaisa < 0 ? 'text-red-400' : 'text-white'}`}>
                  {fmtRupees(Math.max(0, expectedPaisa))}
                </span>
              </div>
              {mode === 'deduct' && expectedPaisa < 0 && (
                <p className="text-xs text-red-400 font-medium">
                  ⚠ Insufficient balance. Backend will reject this deduction.
                </p>
              )}
              <p className="text-[11px] text-gray-500 italic">
                Expected balance is a UI preview only. Backend is authoritative.
              </p>
            </div>
          )}

          {/* API error */}
          {apiError && (
            <div
              className="flex items-start gap-2 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3"
              role="alert"
            >
              <span className="text-red-400 shrink-0 mt-0.5">⚠</span>
              <p className="text-sm text-red-300">{apiError}</p>
            </div>
          )}
        </div>

        {/* Footer with Cancel and Submit */}
        <div className="px-6 pb-6 pt-2 flex gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-3 text-sm font-bold rounded-xl bg-dark-800 text-gray-300 hover:bg-dark-700 border border-dark-600 transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className={`flex-1 py-3 text-sm font-bold rounded-xl text-white transition-colors disabled:opacity-50 cursor-pointer ${
              mode === 'add' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'
            }`}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                Processing…
              </span>
            ) : (
              `Confirm ${mode === 'add' ? 'Credit' : 'Deduction'}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export function AdminUsersPage() {
  const { user: adminUser } = useAuthStore();
  const isSuperAdmin = adminUser?.role === 'SUPER_ADMIN';

  const [users, setUsers] = useState<User[]>([]);
  const [totalUsers, setTotalUsers] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & Search (BUG-026)
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Pagination (BUG-018)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modal state
  const [adjustTarget, setAdjustTarget] = useState<User | null>(null);
  const [targetBalance, setTargetBalance] = useState<number | null>(null);

  // Copy feedback state (BUG-017)
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Toast state
  const [toast, setToast] = useState<ToastState | null>(null);
  const showToast = (message: string, type: ToastState['type']) => setToast({ message, type });

  const fetchUsers = useCallback(async () => {
    try {
      const params: Record<string, unknown> = {
        page,
        page_size: pageSize,
      };
      if (search.trim()) params.search = search.trim();
      if (roleFilter) params.role = roleFilter;
      if (statusFilter) params.status = statusFilter;

      const r = await api.get('/admin/users', { params });
      setUsers(r.data.data?.items ?? []);
      setTotalUsers(r.data.data?.total ?? 0);
    } catch {
      showToast('Failed to load users.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, pageSize, search, roleFilter, statusFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchUsers();
  };
  const handleCopy = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openAdjustModal = (targetUser: User) => {
    setAdjustTarget(targetUser);
    setTargetBalance(null); // no GET /admin/wallet/{id} endpoint exists — shown as unavailable
  };


  const closeAdjustModal = () => {
    setAdjustTarget(null);
    setTargetBalance(null);
  };

  const handleAdjustSuccess = async (tx: WalletTransaction) => {
    closeAdjustModal();
    const newBalanceRupees = (tx.balance_after / 100).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    showToast(
      `✓ Wallet adjusted. New balance: ₹${newBalanceRupees} (Tx: ${tx.id.slice(0, 8)}…)`,
      'success',
    );
    // Refresh the user list in case balance is displayed
    // Refresh user list immediately
    await fetchUsers();
  };

  if (loading) return <Loader />;
  const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize));

  return (
    <div className="space-y-6">
      {/* Header with Refresh button (BUG-025) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">User Management</h1>
          <p className="text-gray-400 mt-1">Manage user accounts, roles, statuses, and wallet balances.</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-dark-800 hover:bg-dark-700 text-gray-200 border border-dark-600 rounded-lg text-sm font-medium transition shadow-sm hover:border-gray-500 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-primary-400' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filters: Search Bar, Role filter, Status filter (BUG-026) */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        <div className="sm:col-span-6 relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by User ID, name, email or username..."
            className="w-full pl-9 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
          />
        </div>

        <div className="sm:col-span-3 relative">
          <Filter className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-8 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500 appearance-none"
          >
            <option value="">All Roles</option>
            <option value="USER">USER</option>
            <option value="ADMIN">ADMIN</option>
            <option value="SUPER_ADMIN">SUPER_ADMIN</option>
          </select>
        </div>

        <div className="sm:col-span-3 relative">
          <Filter className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-8 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500 appearance-none"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="SUSPENDED">SUSPENDED</option>
            <option value="DISABLED">DISABLED</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <Card>
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader size="lg" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-dark-700 text-left text-xs uppercase tracking-wider">
                  <th className="py-3 px-3">User ID</th>
                  <th className="py-3 px-3">User</th>
                  <th className="py-3 px-3">Role</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Balance</th>
                  <th className="py-3 px-3">Joined</th>
                  {isSuperAdmin && <th className="py-3 px-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={isSuperAdmin ? 7 : 6} className="py-8 text-center text-gray-500">
                      No users match your criteria.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="hover:bg-dark-800/50 transition-colors">
                      {/* User ID column with copy button (BUG-017) */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-mono text-xs text-gray-300">
                          <span title={u.id}>{u.id.slice(0, 8)}...</span>
                          <button
                            onClick={(e) => handleCopy(u.id, e)}
                            title="Copy Full User ID"
                            className="p-1 hover:bg-dark-700 rounded text-gray-400 hover:text-white transition"
                          >
                            {copiedId === u.id ? (
                              <Check className="w-3.5 h-3.5 text-green-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* User info */}
                      <td className="py-3 px-3">
                        <p className="font-semibold text-gray-100">{u.name}</p>
                        <p className="text-xs text-gray-500">
                          {u.email} &bull; @{u.username}
                        </p>
                      </td>

                      {/* Role */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <Badge label={u.role} variant="info" />
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <Badge
                          label={u.status}
                          variant={
                            u.status === 'ACTIVE' ? 'success' : u.status === 'SUSPENDED' ? 'warn' : 'danger'
                          }
                        />
                      </td>

                      {/* Balance */}
                      <td className="py-3 px-3 text-right font-semibold text-amber-400 whitespace-nowrap">
                        {fmtRupees(u.wallet_balance ?? 0)}
                      </td>

                      {/* Joined date format DD/MM/YYYY (BUG-019) */}
                      <td className="py-3 px-3 text-xs text-gray-400 whitespace-nowrap">
                        {formatJoinedDate(u.created_at)}
                      </td>

                      {/* Actions */}
                      {isSuperAdmin && (
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <button
                            id={`adjust-wallet-${u.id}`}
                            type="button"
                            onClick={() => openAdjustModal(u)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500/15 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30 transition-colors cursor-pointer"
                            title={`Adjust wallet for ${u.name}`}
                          >
                            💰 Adjust Wallet
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls (BUG-018) */}
        {totalUsers > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-3 border-t border-dark-700/60 text-xs text-gray-400">
            <div className="flex items-center gap-3">
              <span>
                Showing {Math.min((page - 1) * pageSize + 1, totalUsers)} -{' '}
                {Math.min(page * pageSize, totalUsers)} of {totalUsers} users
              </span>
              <div className="flex items-center gap-1">
                <span>Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="bg-dark-800 border border-dark-700 rounded px-2 py-0.5 text-xs text-white focus:outline-none"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded bg-dark-800 hover:bg-dark-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 transition"
                title="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 text-gray-300 font-medium">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded bg-dark-800 hover:bg-dark-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 transition"
                title="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Wallet Adjustment Modal */}
      {adjustTarget && (
        <WalletAdjustModal
          user={adjustTarget}
          currentBalancePaisa={targetBalance}
          onClose={closeAdjustModal}
          onSuccess={handleAdjustSuccess}
        />
      )}

      {/* Toast notification */}
      {toast && (
        <Toast toast={toast} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
