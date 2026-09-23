import { useEffect, useState, useCallback } from 'react';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Loader } from '../../components/common/Loader';
import { CopyableId } from '../../components/common/CopyableId';
import { FilterSelect } from '../../components/common/FilterSelect';
import { SearchInput } from '../../components/common/SearchInput';
import { RefreshOverlay } from '../../components/common/RefreshOverlay';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator';
import api from '../../services/api';
import type { Withdrawal, WithdrawalStatus } from '../../types';
import {
  RefreshCw,
  Filter,
  Eye,
  CheckCircle2,
  XCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ArrowUpCircle,
  Landmark,
  RotateCcw,
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

interface AccountField {
  label: string;
  value: string;
}

const ACCOUNT_FIELD_LABELS: Record<string, string> = {
  name: 'Account Holder',
  holder: 'Account Holder',
  'a/c': 'Account Number',
  ac: 'Account Number',
  account: 'Account Number',
  'account no': 'Account Number',
  ifsc: 'IFSC Code',
  bank: 'Bank Name',
  branch: 'Branch',
  upi: 'UPI ID',
};

/**
 * Split the stored destination string into labelled fields.
 *
 * Bank withdrawals arrive as `Name: A B, A/C: 123456, IFSC: HDFC0001` and UPI ones
 * as a bare handle. Rendered raw, that whole string was squeezed into one
 * right-aligned line and wrapped mid-word, which is what made the expanded
 * Account Details unreadable.
 */
function parseAccountDetails(
  destination?: string | null,
  method?: string | null,
): AccountField[] {
  const raw = (destination || '').trim();
  if (!raw) return [];

  const fields = raw
    .split(/\s*,\s*/)
    .map((part) => {
      const separator = part.indexOf(':');
      if (separator === -1) return null;
      const rawLabel = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      if (!rawLabel || !value) return null;
      return { label: ACCOUNT_FIELD_LABELS[rawLabel.toLowerCase()] ?? rawLabel, value };
    })
    .filter((field): field is AccountField => field !== null);

  if (fields.length > 0) return fields;

  const isUpi = (method || '').toLowerCase() === 'upi' || raw.includes('@');
  return [{ label: isUpi ? 'UPI ID' : 'Account Details', value: raw }];
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
  if (!withdrawal) return null;

  const accountFields = parseAccountDetails(withdrawal.destination, withdrawal.payment_method || withdrawal.method);

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
          <div className="flex justify-between items-start gap-3 py-2 border-b border-dark-800">
            <span className="text-gray-400 shrink-0">Withdrawal ID</span>
            <CopyableId
              value={withdrawal.id}
              label="Withdrawal ID"
              full
              valueClassName="text-white"
              className="min-w-0 justify-end"
            />
          </div>

          <div className="flex justify-between items-center py-2 border-b border-dark-800">
            <span className="text-gray-400">User Name</span>
            <span className="font-semibold text-white">{withdrawal.user_name || 'Unknown User'}</span>
          </div>

          <div className="flex justify-between items-start gap-3 py-2 border-b border-dark-800">
            <span className="text-gray-400 shrink-0">User ID</span>
            <CopyableId value={withdrawal.user_id} label="User ID" full className="min-w-0 justify-end" />
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

          {/* Account Details — one labelled row per field so long bank strings
              stay aligned and readable, each copyable on its own. */}
          <div className="py-2 border-b border-dark-800 space-y-2">
            <div className="flex items-center gap-2 text-gray-400">
              <Landmark className="w-4 h-4 text-amber-400/80" />
              <span>Account Details</span>
            </div>
            {accountFields.length === 0 ? (
              <p className="pl-6 text-xs text-gray-500">No payment details were submitted.</p>
            ) : (
              <dl className="divide-y divide-dark-800 rounded-xl border border-dark-700 bg-dark-950/60">
                {accountFields.map((field) => (
                  <div
                    key={`${field.label}-${field.value}`}
                    className="grid gap-1 px-3 py-2.5 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:items-start sm:gap-3"
                  >
                    <dt className="text-xs font-medium text-gray-400">{field.label}</dt>
                    <dd className="min-w-0">
                      <CopyableId
                        value={field.value}
                        label={field.label}
                        full
                        valueClassName="text-amber-300"
                      />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
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
  const { refreshing, runRefresh } = useRefreshIndicator();

  // Filters (BUG-041 & BUG-044)
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  // Pagination (BUG-042)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // View modal state (BUG-040)
  const [viewWithdrawal, setViewWithdrawal] = useState<Withdrawal | null>(null);

  // Action modal state (Approve / Reject / Processing / Complete / Fail)
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<
    'approve' | 'processing' | 'complete' | 'reject' | 'fail' | null
  >(null);
  const [reason, setReason] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [processingAction, setProcessingAction] = useState(false);

  const fetchWithdrawals = useCallback(async () => {
    try {
      const params: Record<string, unknown> = {
        page,
        page_size: pageSize,
      };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (statusFilter) params.status = statusFilter;
      if (dateFilter) params.date_filter = dateFilter;

      const r = await api.get('/admin/withdrawals', { params });
      setWithdrawals(r.data.data?.items ?? []);
      setTotalWithdrawals(r.data.data?.total ?? 0);
    } catch (e: any) {
      console.error('Failed to load admin withdrawals', e);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, statusFilter, dateFilter]);

  useEffect(() => {
    fetchWithdrawals();
  }, [fetchWithdrawals]);

  const handleRefresh = () => runRefresh(fetchWithdrawals);

  // Reset (BUG-041): one click back to the unfiltered list.
  const filtersActive = Boolean(search || statusFilter || dateFilter);

  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('');
    setDateFilter('');
    setPage(1);
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

  const totalPages = Math.max(1, Math.ceil(totalWithdrawals / pageSize));

  return (
    <div className="space-y-6">
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
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-brand-400' : ''}`} />
          <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
        </button>
      </div>

      {/* Filters & Search bar (BUG-041 & BUG-044) */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        {/* Search by Withdrawal ID, User Name, User ID or Account */}
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          busy={search !== debouncedSearch}
          placeholder="Search by Withdrawal ID, User Name, User ID or Account…"
          ariaLabel="Search withdrawals"
          className="min-w-0 flex-1"
        />

        {/* Status Filter (BUG-044) */}
        <FilterSelect
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          icon={<Filter className="h-4 w-4" />}
          aria-label="Filter by status"
          wrapperClassName="w-full lg:w-48"
        >
          <option value="">All Statuses</option>
          <option value="PENDING">PENDING</option>
          <option value="APPROVED">APPROVED</option>
          <option value="PROCESSING">PROCESSING</option>
          <option value="COMPLETED">COMPLETED</option>
          <option value="REJECTED">REJECTED</option>
          <option value="FAILED">FAILED</option>
          <option value="CANCELLED">CANCELLED</option>
        </FilterSelect>

        {/* Date Filter */}
        <FilterSelect
          value={dateFilter}
          onChange={(e) => {
            setDateFilter(e.target.value);
            setPage(1);
          }}
          icon={<Calendar className="h-4 w-4" />}
          aria-label="Filter by date"
          wrapperClassName="w-full lg:w-44"
        >
          <option value="">All Time</option>
          <option value="TODAY">Today</option>
          <option value="WEEK">This Week</option>
          <option value="MONTH">This Month</option>
        </FilterSelect>

        {/* Reset all filters at once (BUG-041) */}
        <button
          type="button"
          onClick={handleResetFilters}
          disabled={!filtersActive}
          title={filtersActive ? 'Clear the search and all filters' : 'No filters applied'}
          className="flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dark-600 bg-dark-800 px-4 py-2 text-sm font-medium text-gray-200 transition hover:border-gray-500 hover:bg-dark-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw className="h-4 w-4" />
          <span>Reset</span>
        </button>
      </div>

      {/* Withdrawals Table - 8 Required Columns (BUG-040) */}
      <Card className="relative">
        {/* Visible refresh state (BUG-043) */}
        <RefreshOverlay active={refreshing} />
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
              </thead>
              <tbody className="divide-y divide-dark-800">
                {withdrawals.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-500">
                      No withdrawal requests found matching your search.
                    </td>
                  </tr>
                ) : (
                  withdrawals.map((w) => (
                    <tr key={w.id} className="hover:bg-dark-800/50 transition-colors">
                      {/* 1. Withdrawal ID */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <CopyableId value={w.id} label="Withdrawal ID" widthClass="max-w-[6rem]" />
                      </td>

                      {/* 2. User Name (with a copyable User ID) */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <p className="font-medium text-gray-200">{w.user_name || 'Unknown User'}</p>
                        <CopyableId
                          value={w.user_id}
                          label="User ID"
                          widthClass="max-w-[5.5rem]"
                          valueClassName="text-gray-500"
                          className="mt-0.5"
                        />
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
                        className="py-3 px-3 text-xs font-mono text-gray-400 max-w-[9.5rem] truncate"
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-fadeIn">
          <div className="bg-dark-900 border border-dark-700 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-xl font-bold text-white capitalize">
              Confirm Action: {actionType === 'processing' ? 'Payment Initiated' : actionType}
            </h3>
            <p className="text-sm text-gray-300">
              Are you sure you want to transition this withdrawal request to{' '}
              <span className="font-semibold text-white uppercase">
                {actionType === 'processing' ? 'PROCESSING (Payment Initiated)' : actionType}
              </span>
              ?
            </p>

            {(actionType === 'reject' || actionType === 'fail') && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Reason for rejection / failure (Optional)
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-dark-800 border border-dark-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-primary-500 placeholder-gray-500 resize-none"
                  placeholder="e.g. Invalid bank account IFSC, suspicious activity..."
                  rows={3}
                />
              </div>
            )}

            {errorMsg && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                {errorMsg}
              </p>
            )}

            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={processingAction}
                className="px-4 py-2 text-sm font-semibold rounded-xl bg-dark-800 text-gray-300 hover:bg-dark-700 border border-dark-600 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                disabled={processingAction}
                className={`px-4 py-2 text-sm font-semibold rounded-xl text-white transition cursor-pointer ${
                  actionType === 'reject' || actionType === 'fail'
                    ? 'bg-red-600 hover:bg-red-500'
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
