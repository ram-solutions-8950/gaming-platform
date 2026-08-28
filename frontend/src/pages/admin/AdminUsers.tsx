import { useEffect, useRef, useState } from 'react';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Loader } from '../../components/common/Loader';
import api from '../../services/api';
import { walletService } from '../../services/wallet';
import { useAuthStore } from '../../store/authStore';
import type { User, WalletTransaction } from '../../types';


/* ─── helpers ─── */
const paisaToRupees = (paisa: number) => paisa / 100;
const rupeesToPaisa = (rupees: number) => Math.round(rupees * 100);
const fmtRupees = (paisa: number) =>
  `₹${paisaToRupees(paisa).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* ─── Toast ─── */
interface ToastState { message: string; type: 'success' | 'error' }

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
  currentBalancePaisa: number | null;
  onClose: () => void;
  onSuccess: (tx: WalletTransaction) => void;
}

function WalletAdjustModal({ user, currentBalancePaisa, onClose, onSuccess }: AdjustModalProps) {
  const [mode, setMode] = useState<'add' | 'deduct'>('add');
  const [amountRupees, setAmountRupees] = useState('');
  const [reason, setReason] = useState('');
  const [amountError, setAmountError] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [apiError, setApiError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submitRef = useRef(false); // guard against double-click race
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Focus amount field on open
  useEffect(() => {
    setTimeout(() => firstInputRef.current?.focus(), 80);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const parsedAmount = parseFloat(amountRupees);
  const amountPaisa = !isNaN(parsedAmount) && parsedAmount > 0 ? rupeesToPaisa(parsedAmount) : 0;
  const currentPaisa = currentBalancePaisa ?? 0;
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
    if (submitRef.current || submitting) return; // prevent double submission
    if (!validate()) return;

    const finalAmountPaisa = mode === 'add' ? amountPaisa : -amountPaisa;

    submitRef.current = true;
    setSubmitting(true);
    setApiError('');

    try {
      const tx = await walletService.adjustUserWallet(user.id, finalAmountPaisa, reason.trim());
      onSuccess(tx);
    } catch (err: any) {
      const msg: string =
        err.response?.data?.message ||
        err.response?.data?.error?.message ||
        err.response?.data?.detail ||
        'Wallet adjustment failed. Please try again.';

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
    /* Backdrop */
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="adj-modal-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90dvh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-dark-700 shrink-0">
          <h2 id="adj-modal-title" className="text-xl font-bold text-white flex items-center gap-2">
            <span>💰</span> Adjust Wallet
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-dark-700 transition-colors cursor-pointer text-xl leading-none"
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">

          {/* User info */}
          <div className="bg-dark-800 rounded-xl px-4 py-3 border border-dark-700">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-1">User</p>
            <p className="text-base font-bold text-gray-100">{user.name}</p>
            <p className="text-xs text-gray-500">{user.email} &bull; @{user.username}</p>
          </div>

          {/* Current balance */}
          <div className="bg-dark-800 rounded-xl px-4 py-3 border border-dark-700">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-1">Current Balance</p>
            {currentBalancePaisa !== null ? (
              <p className="text-2xl font-extrabold text-gold-400">{fmtRupees(currentBalancePaisa)}</p>
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
                  mode === 'add'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-dark-800 text-gray-400 hover:text-gray-100'
                }`}
                aria-pressed={mode === 'add'}
              >
                ＋ Add Funds
              </button>
              <button
                type="button"
                onClick={() => setMode('deduct')}
                className={`flex-1 py-2.5 transition-colors cursor-pointer ${
                  mode === 'deduct'
                    ? 'bg-red-600 text-white'
                    : 'bg-dark-800 text-gray-400 hover:text-gray-100'
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
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm pointer-events-none">₹</span>
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
                  // Never allow negative via keyboard
                  const v = e.target.value;
                  if (v === '' || parseFloat(v) >= 0) setAmountRupees(v);
                  setAmountError('');
                }}
                onKeyDown={(e) => { if (e.key === '-' || e.key === 'e') e.preventDefault(); }}
                disabled={submitting}
                className={`w-full pl-8 pr-4 py-3 bg-dark-800 border rounded-xl text-gray-100 placeholder-gray-600 text-base font-semibold focus:outline-none transition-colors ${
                  amountError ? 'border-red-500 focus:border-red-500' : 'border-dark-600 focus:border-brand-500 focus:ring-1 focus:ring-brand-500'
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
              onChange={(e) => { setReason(e.target.value); setReasonError(''); }}
              disabled={submitting}
              className={`w-full px-4 py-3 bg-dark-800 border rounded-xl text-gray-100 placeholder-gray-600 text-sm resize-none focus:outline-none transition-colors ${
                reasonError ? 'border-red-500 focus:border-red-500' : 'border-dark-600 focus:border-brand-500 focus:ring-1 focus:ring-brand-500'
              } disabled:opacity-50`}
            />
            <div className="flex justify-between mt-1">
              {reasonError
                ? <p className="text-xs text-red-400">{reasonError}</p>
                : <span />
              }
              <p className={`text-xs ml-auto ${reason.trim().length < 5 ? 'text-gray-600' : 'text-gray-500'}`}>
                {reason.trim().length} / min 5
              </p>
            </div>
          </div>

          {/* Preview */}
          {showPreview && currentBalancePaisa !== null && (
            <div className={`rounded-xl border px-4 py-3 text-sm space-y-1.5 ${
              mode === 'add'
                ? 'bg-emerald-900/20 border-emerald-500/30'
                : 'bg-red-900/20 border-red-500/30'
            }`}>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Preview</p>
              <div className="flex justify-between">
                <span className="text-gray-400">Current balance</span>
                <span className="text-gray-200 font-semibold">{fmtRupees(currentBalancePaisa)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Adjustment</span>
                <span className={`font-bold ${mode === 'add' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {mode === 'add' ? '+' : '−'}{fmtRupees(amountPaisa)}
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
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3" role="alert">
              <span className="text-red-400 shrink-0 mt-0.5">⚠</span>
              <p className="text-sm text-red-300">{apiError}</p>
            </div>
          )}
        </div>

        {/* Footer */}
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
              mode === 'add'
                ? 'bg-emerald-600 hover:bg-emerald-500'
                : 'bg-red-600 hover:bg-red-500'
            }`}
          >
            {submitting
              ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />Processing…</span>
              : `Confirm ${mode === 'add' ? 'Credit' : 'Deduction'}`
            }
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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal state
  const [adjustTarget, setAdjustTarget] = useState<User | null>(null);
  const [targetBalance, setTargetBalance] = useState<number | null>(null);

  // Toast state
  const [toast, setToast] = useState<ToastState | null>(null);
  const showToast = (message: string, type: ToastState['type']) => setToast({ message, type });

  const fetchUsers = async () => {
    try {
      const r = await api.get('/admin/users?page_size=100');
      setUsers(r.data.data?.items ?? []);
    } catch {
      showToast('Failed to load users.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const filtered = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.name.toLowerCase().includes(search.toLowerCase()),
  );

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
    await fetchUsers();
  };

  if (loading) return <Loader />;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold text-white">Users</h1>

      <div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email or username"
          className="w-full max-w-md px-4 py-2.5 bg-dark-800 border border-dark-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500 text-sm"
        />
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-dark-700 text-left">
                <th className="pb-3 font-semibold">User</th>
                <th className="pb-3 font-semibold">Role</th>
                <th className="pb-3 font-semibold">Status</th>
                <th className="pb-3 font-semibold">Joined</th>
                {isSuperAdmin && (
                  <th className="pb-3 font-semibold text-right">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isSuperAdmin ? 5 : 4} className="py-8 text-center text-gray-500">
                    No users found.
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id} className="border-b border-dark-800 hover:bg-dark-800/50 transition-colors">
                    <td className="py-3">
                      <p className="font-semibold text-gray-100">{u.name}</p>
                      <p className="text-xs text-gray-500">{u.email}</p>
                    </td>
                    <td className="py-3"><Badge label={u.role} variant="info" /></td>
                    <td className="py-3">
                      <Badge label={u.status} variant={u.status === 'ACTIVE' ? 'success' : 'danger'} />
                    </td>
                    <td className="py-3 text-gray-400">{new Date(u.created_at).toLocaleDateString()}</td>
                    {isSuperAdmin && (
                      <td className="py-3 text-right">
                        <button
                          id={`adjust-wallet-${u.id}`}
                          type="button"
                          onClick={() => openAdjustModal(u)}
                          disabled={false}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500/15 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30 transition-colors cursor-pointer disabled:opacity-50"
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
