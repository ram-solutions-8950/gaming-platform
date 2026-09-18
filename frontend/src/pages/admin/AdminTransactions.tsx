import { useEffect, useState, useCallback } from 'react';
import { Card } from '../../components/common/Card';
import { Loader } from '../../components/common/Loader';
import api from '../../services/api';
import {
  RefreshCw,
  Search,
  Filter,
  Eye,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Receipt,
} from 'lucide-react';
import {
  TransactionDetailsModal,
  type BaseTransaction,
} from '../../components/common/TransactionDetailsModal';

export interface AdminTransactionItem {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  reference_type: string | null;
  reference_id: string | null;
  payment_method?: string;
  adjustment_direction?: 'add' | 'deduct';
  status: string;
  created_at: string;
  metadata_?: Record<string, any> | null;
}

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2); // YY
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return dateStr;
  }
}

function getTxTypeInfo(tx: AdminTransactionItem) {
  if (tx.type === 'ADJUSTMENT') {
    const isAdd = tx.adjustment_direction === 'add' || tx.balance_after >= tx.balance_before;
    return {
      label: isAdd ? 'Add Funds' : 'Deduct Funds',
      isDeduction: !isAdd,
      badgeColor: isAdd
        ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50'
        : 'bg-red-900/40 text-red-300 border-red-700/50',
    };
  }
  if (tx.type === 'DEPOSIT') {
    return {
      label: 'Deposit',
      isDeduction: false,
      badgeColor: 'bg-blue-900/40 text-blue-300 border-blue-700/50',
    };
  }
  if (tx.type === 'WITHDRAWAL') {
    return {
      label: 'Withdrawal',
      isDeduction: true,
      badgeColor: 'bg-amber-900/40 text-amber-300 border-amber-700/50',
    };
  }
  if (tx.type === 'GAME_ENTRY' || tx.type === 'GAME_LOSS') {
    return {
      label: tx.type === 'GAME_ENTRY' ? 'Game Bet' : 'Game Loss',
      isDeduction: true,
      badgeColor: 'bg-purple-900/40 text-purple-300 border-purple-700/50',
    };
  }
  if (tx.type === 'GAME_WIN' || tx.type === 'BONUS' || tx.type === 'REFUND') {
    return {
      label: tx.type === 'GAME_WIN' ? 'Game Win' : tx.type === 'BONUS' ? 'Bonus' : 'Refund',
      isDeduction: false,
      badgeColor: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50',
    };
  }
  return {
    label: String(tx.type).replace(/_/g, ' '),
    isDeduction: false,
    badgeColor: 'bg-gray-800 text-gray-300 border-gray-700',
  };
}

export function AdminTransactionsPage() {
  const [txs, setTxs] = useState<AdminTransactionItem[]>([]);
  const [totalTxs, setTotalTxs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Pagination (BUG-027)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // View modal state (BUG-030)
  const [selectedTx, setSelectedTx] = useState<AdminTransactionItem | null>(null);

  // Copy feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    try {
      const params: Record<string, unknown> = {
        page,
        page_size: pageSize,
      };
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;

      const r = await api.get('/admin/transactions', { params });
      setTxs(r.data.data?.items ?? []);
      setTotalTxs(r.data.data?.total ?? 0);
    } catch (err) {
      console.error('Failed to load transactions', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, pageSize, search, statusFilter]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);
  const handleRefresh = () => {
    setRefreshing(true);
    fetchTransactions();
  };

  const handleCopy = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const totalPages = Math.max(1, Math.ceil(totalTxs / pageSize));

  // Convert selectedTx to BaseTransaction for modal
  const modalTx: BaseTransaction | null = selectedTx
    ? {
        id: selectedTx.id,
        type: getTxTypeInfo(selectedTx).label.toUpperCase().replace(/\s+/g, '_'),
        amount: selectedTx.amount,
        status: selectedTx.status,
        created_at: selectedTx.created_at,
        reference_id: selectedTx.reference_id,
        reference_type: selectedTx.reference_type,
        balance_after: selectedTx.balance_after,
        metadata: {
          user_name: selectedTx.user_name,
          payment_method: selectedTx.payment_method,
          ...(selectedTx.metadata_ || {}),
        },
      }
    : null;

  return (
    <div className="space-y-6">
      {/* Header with Refresh button (BUG-036) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Receipt className="w-8 h-8 text-primary-400" />
            All Transactions
          </h1>
          <p className="text-gray-400 mt-1">
            Real-time audit log of wallet credits, debits, adjustments, and payouts.
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

      {/* Filters & Search bar (BUG-031) */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by Transaction ID or User Name..."
            className="w-full pl-9 pr-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
          />
        </div>

        <div className="relative w-full sm:w-48">
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
            <option value="COMPLETED">COMPLETED</option>
            <option value="PENDING">PENDING</option>
            <option value="FAILED">FAILED</option>
            <option value="REVERSED">REVERSED</option>
          </select>
        </div>
      </div>

      {/* Transactions Table - 8 Required Columns in Exact Order (BUG-035) */}
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
                  {/* Column 1: Transaction ID */}
                  <th className="py-3 px-3">Transaction ID</th>
                  {/* Column 2: User Name */}
                  <th className="py-3 px-3">User Name</th>
                  {/* Column 3: Type */}
                  <th className="py-3 px-3">Type</th>
                  {/* Column 4: Amount */}
                  <th className="py-3 px-3 text-right">Amount</th>
                  {/* Column 5: Payment Method */}
                  <th className="py-3 px-3">Payment Method</th>
                  {/* Column 6: Date & Time (BUG-028) */}
                  <th className="py-3 px-3">Date & Time</th>
                  {/* Column 7: Status */}
                  <th className="py-3 px-3">Status</th>
                  {/* Column 8: Action (View) (BUG-030) */}
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800">
                {txs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-500">
                      No transactions found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  txs.map((tx) => {
                    const typeInfo = getTxTypeInfo(tx);
                    return (
                      <tr key={tx.id} className="hover:bg-dark-800/50 transition-colors">
                        {/* 1. Transaction ID */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 font-mono text-xs text-gray-300">
                            <span title={tx.id}>{tx.id.slice(0, 8)}...</span>
                            <button
                              onClick={(e) => handleCopy(tx.id, e)}
                              title="Copy Full Transaction ID"
                              className="p-1 hover:bg-dark-700 rounded text-gray-400 hover:text-white transition"
                            >
                              {copiedId === tx.id ? (
                                <Check className="w-3.5 h-3.5 text-green-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* 2. User Name (BUG-032) */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className="font-medium text-gray-200 hover:text-white"
                            title={tx.user_email || tx.user_id}
                          >
                            {tx.user_name || 'Unknown User'}
                          </span>
                        </td>

                        {/* 3. Type (BUG-029: Distinguish Add Funds vs Deduct Funds) */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`px-2.5 py-0.5 rounded text-xs font-semibold border ${typeInfo.badgeColor}`}
                          >
                            {typeInfo.label}
                          </span>
                        </td>

                        {/* 4. Amount (BUG-033: Red for deducted, Green/standard for added) */}
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          {typeInfo.isDeduction ? (
                            <span className="text-red-400 font-bold">
                              -₹{(tx.amount / 100).toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-emerald-400 font-bold">
                              +₹{(tx.amount / 100).toFixed(2)}
                            </span>
                          )}
                        </td>

                        {/* 5. Payment Method */}
                        <td className="py-3 px-3 text-xs text-gray-400 whitespace-nowrap">
                          {tx.payment_method || '—'}
                        </td>

                        {/* 6. Date & Time formatted as DD/MM/YY HH:mm (BUG-028) */}
                        <td className="py-3 px-3 text-xs text-gray-400 whitespace-nowrap">
                          {formatDateTime(tx.created_at)}
                        </td>

                        {/* 7. Status */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-semibold ${
                              tx.status === 'COMPLETED'
                                ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-700/40'
                                : tx.status === 'PENDING'
                                ? 'bg-amber-900/50 text-amber-400 border border-amber-700/40'
                                : 'bg-red-900/50 text-red-400 border border-red-700/40'
                            }`}
                          >
                            {tx.status}
                          </span>
                        </td>

                        {/* 8. Action (View) (BUG-030) */}
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setSelectedTx(tx)}
                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-dark-800 hover:bg-dark-700 text-primary-400 hover:text-primary-300 rounded-lg border border-dark-600 text-xs font-semibold transition cursor-pointer shadow-sm"
                            title="Inspect Transaction Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls (BUG-027) */}
        {totalTxs > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-3 border-t border-dark-700/60 text-xs text-gray-400">
            <div className="flex items-center gap-3">
              <span>
                Showing {Math.min((page - 1) * pageSize + 1, totalTxs)} -{' '}
                {Math.min(page * pageSize, totalTxs)} of {totalTxs} transactions
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

      {/* View Transaction Details Modal */}
      {selectedTx && modalTx && (
        <TransactionDetailsModal tx={modalTx} onClose={() => setSelectedTx(null)} />
      )}
    </div>
  );
}
