import { useEffect, useState, useCallback } from 'react';
import { Card } from '../../components/common/Card';
import { Loader } from '../../components/common/Loader';
import api from '../../services/api';
import {
  RefreshCw,
  Filter,
  Eye,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  ArrowDownCircle,
  RotateCcw,
  X,
} from 'lucide-react';
import { CopyableId } from '../../components/common/CopyableId';
import { FilterSelect } from '../../components/common/FilterSelect';
import { SearchInput } from '../../components/common/SearchInput';
import { RefreshOverlay } from '../../components/common/RefreshOverlay';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator';
import { copyToClipboard } from '../../utils/clipboard';

export interface AdminDepositItem {
  id: string;
  user_id: string;
  user_name?: string;
  amount: number;
  provider?: string | null;
  payment_method?: string;
  provider_order_id?: string | null;
  status: string;
  created_at: string;
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

function DepositDetailsModal({
  deposit,
  onClose,
}: {
  deposit: AdminDepositItem | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  if (!deposit) return null;

  const handleCopy = async (text: string, label: string) => {
    if (!(await copyToClipboard(text))) return;
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-dark-700 pb-3">
          <div className="flex items-center gap-2">
            <ArrowDownCircle className="w-6 h-6 text-green-400" />
            <h3 className="text-lg font-bold text-white">Deposit Details</h3>
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
            <span className="text-gray-400">Deposit ID</span>
            <div className="flex items-center gap-1.5 font-mono text-xs text-white">
              <span>{deposit.id}</span>
              <button
                onClick={() => handleCopy(deposit.id, 'id')}
                className="p-1 hover:bg-dark-700 rounded text-gray-400 hover:text-white"
                title="Copy Deposit ID"
              >
                {copied === 'id' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-dark-800">
            <span className="text-gray-400">User Name</span>
            <span className="font-semibold text-white">{deposit.user_name || 'Unknown'}</span>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-dark-800">
            <span className="text-gray-400">User ID</span>
            <span className="font-mono text-xs text-gray-300">{deposit.user_id}</span>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-dark-800">
            <span className="text-gray-400">Amount</span>
            <span className="text-lg font-extrabold text-emerald-400">
              ₹{(deposit.amount / 100).toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-dark-800">
            <span className="text-gray-400">Payment Method</span>
            <span className="font-medium text-white">{deposit.payment_method || deposit.provider || 'UPI'}</span>
          </div>

          {deposit.provider_order_id && (
            <div className="flex justify-between items-center py-2 border-b border-dark-800">
              <span className="text-gray-400">Order Reference</span>
              <span className="font-mono text-xs text-gray-300">{deposit.provider_order_id}</span>
            </div>
          )}

          <div className="flex justify-between items-center py-2 border-b border-dark-800">
            <span className="text-gray-400">Date & Time</span>
            <span className="text-gray-200">{new Date(deposit.created_at).toLocaleString('en-IN')}</span>
          </div>

          <div className="flex justify-between items-center py-2">
            <span className="text-gray-400">Status</span>
            <span
              className={`px-2.5 py-0.5 rounded text-xs font-semibold ${
                deposit.status === 'SUCCESS'
                  ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-700/40'
                  : deposit.status === 'PENDING'
                  ? 'bg-amber-900/50 text-amber-400 border border-amber-700/40'
                  : 'bg-red-900/50 text-red-400 border border-red-700/40'
              }`}
            >
              {deposit.status}
            </span>
          </div>
        </div>

        <div className="pt-2">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-dark-800 hover:bg-dark-700 text-white font-semibold rounded-xl border border-dark-600 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminDepositsPage() {
  const [deposits, setDeposits] = useState<AdminDepositItem[]>([]);
  const [totalDeposits, setTotalDeposits] = useState(0);
  const [loading, setLoading] = useState(true);
  const { refreshing, runRefresh } = useRefreshIndicator();

  // Filters & Search (BUG-039)
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [statusFilter, setStatusFilter] = useState('');

  // Pagination (BUG-038)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // View modal state (BUG-037)
  const [selectedDeposit, setSelectedDeposit] = useState<AdminDepositItem | null>(null);

  const fetchDeposits = useCallback(async () => {
    try {
      const params: Record<string, unknown> = {
        page,
        page_size: pageSize,
      };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (statusFilter) params.status = statusFilter;

      const r = await api.get('/admin/deposits', { params });
      setDeposits(r.data.data?.items ?? []);
      setTotalDeposits(r.data.data?.total ?? 0);
    } catch (err) {
      console.error('Failed to load deposits', err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, statusFilter]);

  useEffect(() => {
    fetchDeposits();
  }, [fetchDeposits]);

  const handleRefresh = () => runRefresh(fetchDeposits);

  const filtersActive = Boolean(search || statusFilter);

  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('');
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(totalDeposits / pageSize));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <ArrowDownCircle className="w-8 h-8 text-green-400" />
            Deposits Management
          </h1>
          <p className="text-gray-400 mt-1">
            Monitor and review all incoming player deposits and gateway transactions.
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

      {/* Filters & Search bar (BUG-039) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          busy={search !== debouncedSearch}
          placeholder="Search by Deposit ID, User ID, User Name or Reference…"
          ariaLabel="Search deposits"
          className="min-w-0 flex-1"
        />

        <FilterSelect
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          icon={<Filter className="h-4 w-4" />}
          aria-label="Filter by status"
          wrapperClassName="w-full sm:w-48"
        >
          <option value="">All Statuses</option>
          <option value="SUCCESS">SUCCESS</option>
          <option value="PENDING">PENDING</option>
          <option value="FAILED">FAILED</option>
        </FilterSelect>

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

      {/* Deposits Table - 7 Required Columns (BUG-037) */}
      <Card className="relative">
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
                  {/* Column 1: Deposit ID */}
                  <th className="py-3 px-3">Deposit ID</th>
                  {/* Column 2: User Name */}
                  <th className="py-3 px-3">User Name</th>
                  {/* Column 3: Amount */}
                  <th className="py-3 px-3 text-right">Amount</th>
                  {/* Column 4: Payment Method */}
                  <th className="py-3 px-3">Payment Method</th>
                  {/* Column 5: Date & Time */}
                  <th className="py-3 px-3">Date & Time</th>
                  {/* Column 6: Status */}
                  <th className="py-3 px-3">Status</th>
                  {/* Column 7: Action (View) */}
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800">
                {deposits.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-500">
                      No deposits found matching your search.
                    </td>
                  </tr>
                ) : (
                  deposits.map((d) => (
                    <tr key={d.id} className="hover:bg-dark-800/50 transition-colors">
                      {/* 1. Deposit ID */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <CopyableId value={d.id} label="Deposit ID" />
                      </td>

                      {/* 2. User Name (with a copyable User ID) */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <p className="font-medium text-gray-200">{d.user_name || 'Unknown User'}</p>
                        <CopyableId
                          value={d.user_id}
                          label="User ID"
                          widthClass="max-w-[5.5rem]"
                          valueClassName="text-gray-500"
                          className="mt-0.5"
                        />
                      </td>

                      {/* 3. Amount */}
                      <td className="py-3 px-3 text-right font-bold text-emerald-400 whitespace-nowrap">
                        +₹{(d.amount / 100).toFixed(2)}
                      </td>

                      {/* 4. Payment Method */}
                      <td className="py-3 px-3 text-xs text-gray-300 whitespace-nowrap">
                        {d.payment_method || d.provider || 'UPI'}
                      </td>

                      {/* 5. Date & Time */}
                      <td className="py-3 px-3 text-xs text-gray-400 whitespace-nowrap">
                        {formatDateTime(d.created_at)}
                      </td>

                      {/* 6. Status */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`px-2.5 py-0.5 rounded text-xs font-semibold ${
                            d.status === 'SUCCESS'
                              ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-700/40'
                              : d.status === 'PENDING'
                              ? 'bg-amber-900/50 text-amber-400 border border-amber-700/40'
                              : 'bg-red-900/50 text-red-400 border border-red-700/40'
                          }`}
                        >
                          {d.status}
                        </span>
                      </td>

                      {/* 7. Action (View) */}
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedDeposit(d)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-dark-800 hover:bg-dark-700 text-primary-400 hover:text-primary-300 rounded-lg border border-dark-600 text-xs font-semibold transition cursor-pointer shadow-sm"
                          title="View Deposit Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls (BUG-038) */}
        {totalDeposits > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-3 border-t border-dark-700/60 text-xs text-gray-400">
            <div className="flex items-center gap-3">
              <span>
                Showing {Math.min((page - 1) * pageSize + 1, totalDeposits)} -{' '}
                {Math.min(page * pageSize, totalDeposits)} of {totalDeposits} deposits
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

      {/* View Deposit Modal */}
      {selectedDeposit && (
        <DepositDetailsModal
          deposit={selectedDeposit}
          onClose={() => setSelectedDeposit(null)}
        />
      )}
    </div>
  );
}
