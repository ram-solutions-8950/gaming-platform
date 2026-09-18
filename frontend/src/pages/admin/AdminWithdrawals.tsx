import { useEffect, useState } from 'react';
import { useEffect, useState, useCallback } from 'react';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Loader } from '../../components/common/Loader';
import api from '../../services/api';
import type { Withdrawal, WithdrawalStatus } from '../../types';
import {
  RefreshCw,
  Search,
  Filter,
  Eye,
  CheckCircle2,
  XCircle,
  Calendar,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  ArrowUpCircle,
  X,
} from 'lucide-react';

function getStatusDisplay(status: WithdrawalStatus) {
  switch (status) {
    case 'PROCESSING':
      return 'PAYMENT INITIATED';
    default:
      return status;
  }
}

function getStatusBadgeVariant(status: WithdrawalStatus) {
function getStatusBadgeVariant(status: WithdrawalStatus): 'success' | 'danger' | 'warn' | 'info' | 'default' {
  switch (status) {
    case 'COMPLETED':
      return 'success';
    case 'APPROVED':
      return 'info';
    case 'PROCESSING':
      return 'warn';
    case 'REJECTED':
    case 'FAILED':
    case 'CANCELLED':
      return 'danger';
    case 'PENDING':
    default:
      return 'info';
      return 'warn';
  }
}

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return dateStr;
  }
}

function WithdrawalDetailsModal({
  withdrawal,
  onClose,
  onApprove,
  onReject,
}: {
  withdrawal: Withdrawal | null;
  onClose: () => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  if (!withdrawal) return null;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-dark-700 pb-3">
          <div className="flex items-center gap-2">
            <ArrowUpCircle className="w-6 h-6 text-amber-400" />
            <h3 className="text-lg font-bold text-white">Withdrawal Request</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-dark-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-center py-2 border-b border-dark-800">
            <span className="text-gray-400">Withdrawal ID</span>
            <div className="flex items-center gap-1.5 font-mono text-xs text-white">
              <span>{withdrawal.id}</span>
              <button
                onClick={() => handleCopy(withdrawal.id, 'id')}
                className="p-1 hover:bg-dark-700 rounded text-gray-400 hover:text-white"
                title="Copy Withdrawal ID"
              >
                {copied === 'id' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-dark-800">
            <span className="text-gray-400">User Name</span>
            <span className="font-semibold text-white">{withdrawal.user_name || 'Unknown User'}</span>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-dark-800">
            <span className="text-gray-400">User ID</span>
            <span className="font-mono text-xs text-gray-300">{withdrawal.user_id}</span>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-dark-800">
            <span className="text-gray-400">Requested Amount</span>
            <span className="text-xl font-extrabold text-amber-400">
              ₹{(withdrawal.amount / 100).toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-dark-800">
            <span className="text-gray-400">Payment Method</span>
            <span className="font-medium text-white capitalize">
              {withdrawal.payment_method || withdrawal.method || 'Bank Transfer'}
            </span>
          </div>

          <div className="flex justify-between items-start py-2 border-b border-dark-800">
            <span className="text-gray-400">Account Details</span>
            <div className="text-right">
              <span className="font-mono text-xs text-amber-300 break-all">
                {withdrawal.destination || '—'}
              </span>
              {withdrawal.destination && (
                <button
                  onClick={() => handleCopy(withdrawal.destination!, 'dest')}
                  className="ml-2 inline p-0.5 hover:bg-dark-700 rounded text-gray-400 hover:text-white align-middle"
                  title="Copy Account Details"
                >
                  {copied === 'dest' ? (
                    <Check className="w-3 h-3 text-green-400 inline" />
                  ) : (
                    <Copy className="w-3 h-3 inline" />
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-dark-800">
            <span className="text-gray-400">Requested Date</span>
            <span className="text-gray-200">{new Date(withdrawal.created_at).toLocaleString('en-IN')}</span>
          </div>

          {withdrawal.processed_at && (
            <div className="flex justify-between items-center py-2 border-b border-dark-800">
              <span className="text-gray-400">Processed Date</span>
              <span className="text-gray-200">{new Date(withdrawal.processed_at).toLocaleString('en-IN')}</span>
            </div>
          )}

          <div className="flex justify-between items-center py-2">
            <span className="text-gray-400">Status</span>
            <Badge
              label={getStatusDisplay(withdrawal.status)}
              variant={getStatusBadgeVariant(withdrawal.status)}
            />
          </div>
        </div>

        {/* Action Buttons inside modal if pending */}
        {withdrawal.status === 'PENDING' && (
          <div className="flex gap-3 pt-3 border-t border-dark-700">
            <button
              onClick={() => {
                onClose();
                onApprove?.(withdrawal.id);
              }}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-sm transition flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Approve</span>
            </button>
            <button
              onClick={() => {
                onClose();
                onReject?.(withdrawal.id);
              }}
              className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-xl text-sm transition flex items-center justify-center gap-1.5"
            >
              <XCircle className="w-4 h-4" />
              <span>Reject</span>
            </button>
          </div>
        )}

        <div className="pt-1">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-dark-800 hover:bg-dark-700 text-gray-300 font-semibold rounded-xl border border-dark-600 transition text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminWithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [totalWithdrawals, setTotalWithdrawals] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters (BUG-041 & BUG-044)
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  // Pagination (BUG-042)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // View modal state (BUG-040)
  const [viewWithdrawal, setViewWithdrawal] = useState<Withdrawal | null>(null);

  // Action modal state (Approve / Reject / Processing / Complete / Fail)
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'processing' | 'complete' | 'reject' | 'fail' | null>(null);
  const [actionType, setActionType] = useState<
    'approve' | 'processing' | 'complete' | 'reject' | 'fail' | null
  >(null);
  const [reason, setReason] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [processingAction, setProcessingAction] = useState(false);

  const fetchWithdrawals = async () => {
  // Copy feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchWithdrawals = useCallback(async () => {
    try {
      const r = await api.get('/admin/withdrawals?page_size=50');
      const params: Record<string, unknown> = {
        page,
        page_size: pageSize,
      };
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;
      if (dateFilter) params.date_filter = dateFilter;

      const r = await api.get('/admin/withdrawals', { params });
      setWithdrawals(r.data.data?.items ?? []);
      setTotalWithdrawals(r.data.data?.total ?? 0);
    } catch (e: any) {
      console.error('Failed to load admin withdrawals', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  }, [page, pageSize, search, statusFilter, dateFilter]);

  useEffect(() => {
    fetchWithdrawals();
  }, []);
  }, [fetchWithdrawals]);

  const openActionModal = (id: string, type: 'approve' | 'processing' | 'complete' | 'reject' | 'fail') => {
  const handleRefresh = () => {
    setRefreshing(true);
    fetchWithdrawals();
  };

  const handleCopy = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openActionModal = (
    id: string,
    type: 'approve' | 'processing' | 'complete' | 'reject' | 'fail',
  ) => {
    setActionId(id);
    setActionType(type);
    setReason('');
    setErrorMsg('');
  };

  const closeModal = () => {
    setActionId(null);
    setActionType(null);
    setReason('');
    setErrorMsg('');
  };

  const handleConfirmAction = async () => {
    if (!actionId || !actionType) return;
    setProcessingAction(true);
    setErrorMsg('');

    try {
      if (actionType === 'reject' || actionType === 'fail') {
        await api.post(`/admin/withdrawals/${actionId}/${actionType}`, { reason });
      } else {
        await api.post(`/admin/withdrawals/${actionId}/${actionType}`);
      }
      closeModal();
      await fetchWithdrawals();
    } catch (e: any) {
      setErrorMsg(e.response?.data?.error?.message || `Failed to execute ${actionType} action`);
    } finally {
      setProcessingAction(false);
    }
  };

  if (loading) return <Loader />;
  const totalPages = Math.max(1, Math.ceil(totalWithdrawals / pageSize));

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold text-white">Withdrawals Management</h1>
      {/* Header with Refresh button (BUG-043) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <ArrowUpCircle className="w-8 h-8 text-amber-400" />
            Withdrawals Management
          </h1>
          <p className="text-gray-400 mt-1">
            Review, approve, process, and reconcile all user withdrawal requests.
          </p>
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

      {/* Filters & Search bar (BUG-041 & BUG-044) */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        {/* Search by ID, User Name, or Destination */}
        <div className="sm:col-span-6 relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by Withdrawal ID, User Name, or Account..."
            className="w-full pl-9 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
          />
        </div>

        {/* Status Filter (BUG-044) */}
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
            <option value="PENDING">PENDING</option>
            <option value="APPROVED">APPROVED</option>
            <option value="PROCESSING">PROCESSING</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="REJECTED">REJECTED</option>
            <option value="FAILED">FAILED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </div>

        {/* Date Filter (BUG-044) */}
        {/* Date Filter */}
        <div className="sm:col-span-3 relative">
          <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <select
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-8 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500 appearance-none"
          >
            <option value="">All Time</option>
            <option value="TODAY">Today</option>
            <option value="WEEK">This Week</option>
            <option value="MONTH">This Month</option>
          </select>
        </div>
      </div>

      {/* Withdrawals Table - 8 Required Columns (BUG-040) */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-dark-700 text-left">
                <th className="pb-3">User</th>
                <th className="pb-3">Amount</th>
                <th className="pb-3">Method</th>
                <th className="pb-3">Destination</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Requested Date</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-500">
                    No withdrawal requests found.
                  </td>
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader size="lg" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-dark-700 text-left text-xs uppercase tracking-wider">
                  {/* Column 1: Withdrawal ID */}
                  <th className="py-3 px-3">Withdrawal ID</th>
                  {/* Column 2: User Name */}
                  <th className="py-3 px-3">User Name</th>
                  {/* Column 3: Amount */}
                  <th className="py-3 px-3 text-right">Amount</th>
                  {/* Column 4: Payment Method */}
                  <th className="py-3 px-3">Payment Method</th>
                  {/* Column 5: Account Details */}
                  <th className="py-3 px-3">Account Details</th>
                  {/* Column 6: Date & Time */}
                  <th className="py-3 px-3">Date & Time</th>
                  {/* Column 7: Status */}
                  <th className="py-3 px-3">Status</th>
                  {/* Column 8: Action (View / Approve / Reject) */}
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              ) : (
                withdrawals.map((w) => (
                  <tr key={w.id} className="border-b border-dark-800 hover:bg-dark-800/50 transition-colors">
                    <td className="py-3 text-xs text-gray-400 font-mono" title={w.user_id}>
                      {w.user_id.slice(0, 8)}…
              </thead>
              <tbody className="divide-y divide-dark-800">
                {withdrawals.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-500">
                      No withdrawal requests found matching your search.
                    </td>
                    <td className="py-3 font-bold text-gray-100">₹{(w.amount / 100).toFixed(2)}</td>
                    <td className="py-3 text-gray-300 capitalize">{w.method ?? '—'}</td>
                    <td className="py-3 text-gray-400 text-xs font-mono max-w-xs truncate" title={w.destination ?? ''}>
                      {w.destination ?? '—'}
                    </td>
                    <td className="py-3">
                      <Badge label={getStatusDisplay(w.status)} variant={getStatusBadgeVariant(w.status)} />
                    </td>
                    <td className="py-3 text-gray-400 text-xs">{new Date(w.created_at).toLocaleString()}</td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        {w.status === 'PENDING' && (
                          <>
                            <button
                              onClick={() => openActionModal(w.id, 'approve')}
                              className="px-2.5 py-1 text-xs font-semibold rounded bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/40 border border-emerald-500/30 transition-colors cursor-pointer"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => openActionModal(w.id, 'reject')}
                              className="px-2.5 py-1 text-xs font-semibold rounded bg-red-600/20 text-red-400 hover:bg-red-600/40 border border-red-500/30 transition-colors cursor-pointer"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {w.status === 'APPROVED' && (
                          <>
                            <button
                              onClick={() => openActionModal(w.id, 'processing')}
                              className="px-2.5 py-1 text-xs font-semibold rounded bg-amber-600/20 text-amber-400 hover:bg-amber-600/40 border border-amber-500/30 transition-colors cursor-pointer"
                            >
                              Payment Initiated
                            </button>
                            <button
                              onClick={() => openActionModal(w.id, 'reject')}
                              className="px-2.5 py-1 text-xs font-semibold rounded bg-red-600/20 text-red-400 hover:bg-red-600/40 border border-red-500/30 transition-colors cursor-pointer"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {w.status === 'PROCESSING' && (
                          <>
                            <button
                              onClick={() => openActionModal(w.id, 'complete')}
                              className="px-2.5 py-1 text-xs font-semibold rounded bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/40 border border-emerald-500/30 transition-colors cursor-pointer"
                            >
                              Complete
                            </button>
                            <button
                              onClick={() => openActionModal(w.id, 'fail')}
                              className="px-2.5 py-1 text-xs font-semibold rounded bg-red-600/20 text-red-400 hover:bg-red-600/40 border border-red-500/30 transition-colors cursor-pointer"
                            >
                              Fail
                            </button>
                          </>
                        )}
                        {(w.status === 'COMPLETED' || w.status === 'REJECTED' || w.status === 'FAILED' || w.status === 'CANCELLED') && (
                          <span className="text-xs text-gray-500 italic">No actions</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
                ) : (
                  withdrawals.map((w) => (
                    <tr key={w.id} className="hover:bg-dark-800/50 transition-colors">
                      {/* 1. Withdrawal ID */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-mono text-xs text-gray-300">
                          <span title={w.id}>{w.id.slice(0, 8)}...</span>
                          <button
                            onClick={(e) => handleCopy(w.id, e)}
                            title="Copy Full Withdrawal ID"
                            className="p-1 hover:bg-dark-700 rounded text-gray-400 hover:text-white transition"
                          >
                            {copiedId === w.id ? (
                              <Check className="w-3.5 h-3.5 text-green-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* 2. User Name */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="font-medium text-gray-200 hover:text-white" title={w.user_id}>
                          {w.user_name || 'Unknown User'}
                        </span>
                      </td>

                      {/* 3. Amount */}
                      <td className="py-3 px-3 text-right font-bold text-amber-400 whitespace-nowrap">
                        ₹{(w.amount / 100).toFixed(2)}
                      </td>

                      {/* 4. Payment Method */}
                      <td className="py-3 px-3 text-xs text-gray-300 whitespace-nowrap capitalize">
                        {w.payment_method || w.method || 'Bank'}
                      </td>

                      {/* 5. Account Details */}
                      <td
                        className="py-3 px-3 text-xs font-mono text-gray-400 max-w-xs truncate"
                        title={w.destination ?? ''}
                      >
                        {w.destination || '—'}
                      </td>

                      {/* 6. Date & Time */}
                      <td className="py-3 px-3 text-xs text-gray-400 whitespace-nowrap">
                        {formatDateTime(w.created_at)}
                      </td>

                      {/* 7. Status */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <Badge
                          label={getStatusDisplay(w.status)}
                          variant={getStatusBadgeVariant(w.status)}
                        />
                      </td>

                      {/* 8. Action (View / Approve / Reject) */}
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View Button */}
                          <button
                            onClick={() => setViewWithdrawal(w)}
                            className="p-1.5 text-xs font-semibold rounded-lg bg-dark-800 hover:bg-dark-700 text-primary-400 hover:text-primary-300 border border-dark-600 transition shadow-sm"
                            title="View Full Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Action Buttons for PENDING */}
                          {w.status === 'PENDING' && (
                            <>
                              <button
                                onClick={() => openActionModal(w.id, 'approve')}
                                className="px-2 py-1 text-xs font-semibold rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/40 border border-emerald-500/30 transition shadow-sm cursor-pointer"
                                title="Approve Request"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => openActionModal(w.id, 'reject')}
                                className="px-2 py-1 text-xs font-semibold rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/40 border border-red-500/30 transition shadow-sm cursor-pointer"
                                title="Reject Request"
                              >
                                Reject
                              </button>
                            </>
                          )}

                          {/* APPROVED: can initiate payment or reject */}
                          {w.status === 'APPROVED' && (
                            <>
                              <button
                                onClick={() => openActionModal(w.id, 'processing')}
                                className="px-2 py-1 text-xs font-semibold rounded-lg bg-amber-600/20 text-amber-400 hover:bg-amber-600/40 border border-amber-500/30 transition shadow-sm cursor-pointer"
                              >
                                Initiate
                              </button>
                              <button
                                onClick={() => openActionModal(w.id, 'reject')}
                                className="px-2 py-1 text-xs font-semibold rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/40 border border-red-500/30 transition shadow-sm cursor-pointer"
                              >
                                Reject
                              </button>
                            </>
                          )}

                          {/* PROCESSING: can complete or fail */}
                          {w.status === 'PROCESSING' && (
                            <>
                              <button
                                onClick={() => openActionModal(w.id, 'complete')}
                                className="px-2 py-1 text-xs font-semibold rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/40 border border-emerald-500/30 transition shadow-sm cursor-pointer"
                              >
                                Complete
                              </button>
                              <button
                                onClick={() => openActionModal(w.id, 'fail')}
                                className="px-2 py-1 text-xs font-semibold rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/40 border border-red-500/30 transition shadow-sm cursor-pointer"
                              >
                                Fail
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

        {/* Pagination Controls (BUG-042) */}
        {totalWithdrawals > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-3 border-t border-dark-700/60 text-xs text-gray-400">
            <div className="flex items-center gap-3">
              <span>
                Showing {Math.min((page - 1) * pageSize + 1, totalWithdrawals)} -{' '}
                {Math.min(page * pageSize, totalWithdrawals)} of {totalWithdrawals} withdrawals
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
                  <option value={15}>15</option>
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

      {/* Confirmation Modal */}
      {/* View Details Modal */}
      {viewWithdrawal && (
        <WithdrawalDetailsModal
          withdrawal={viewWithdrawal}
          onClose={() => setViewWithdrawal(null)}
          onApprove={(id) => openActionModal(id, 'approve')}
          onReject={(id) => openActionModal(id, 'reject')}
        />
      )}

      {/* Confirmation Action Modal */}
      {actionId && actionType && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-dark-900 border border-dark-700 rounded-xl p-6 max-w-md w-full space-y-4">
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-fadeIn">
          <div className="bg-dark-900 border border-dark-700 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-xl font-bold text-white capitalize">
              Confirm Action: {actionType === 'processing' ? 'Payment Initiated' : actionType}
            </h3>
            <p className="text-sm text-gray-300">
              Are you sure you want to transition this withdrawal to <span className="font-semibold text-white uppercase">{actionType === 'processing' ? 'PROCESSING (Payment Initiated)' : actionType}</span>?
              Are you sure you want to transition this withdrawal request to{' '}
              <span className="font-semibold text-white uppercase">
                {actionType === 'processing' ? 'PROCESSING (Payment Initiated)' : actionType}
              </span>
              ?
            </p>

            {(actionType === 'reject' || actionType === 'fail') && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Reason (Optional)</label>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Reason for rejection / failure (Optional)
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-dark-800 border border-dark-700 rounded p-2 text-sm text-white focus:outline-hidden focus:border-brand-500"
                  placeholder="Enter reason for rejection or failure..."
                  className="w-full bg-dark-800 border border-dark-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-primary-500 placeholder-gray-500 resize-none"
                  placeholder="e.g. Invalid bank account IFSC, suspicious activity..."
                  rows={3}
                />
              </div>
            )}

            {errorMsg && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2">{errorMsg}</p>
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                {errorMsg}
              </p>
            )}

            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={processingAction}
                className="px-4 py-2 text-sm font-semibold rounded bg-dark-800 text-gray-300 hover:bg-dark-700 transition-colors"
                className="px-4 py-2 text-sm font-semibold rounded-xl bg-dark-800 text-gray-300 hover:bg-dark-700 border border-dark-600 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                disabled={processingAction}
                className={`px-4 py-2 text-sm font-semibold rounded text-white transition-colors cursor-pointer ${
                className={`px-4 py-2 text-sm font-semibold rounded-xl text-white transition cursor-pointer ${
                  actionType === 'reject' || actionType === 'fail'
                    ? 'bg-red-600 hover:bg-red-500'
                    : 'bg-brand-600 hover:bg-brand-500'
                    : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                {processingAction ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
