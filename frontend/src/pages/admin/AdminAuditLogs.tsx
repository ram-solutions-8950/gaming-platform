import { useEffect, useState, useCallback } from 'react';
import { adminService } from '../../services/adminService';
import { Card } from '../../components/common/Card';
import { Loader } from '../../components/common/Loader';
import {
  FileText,
  Search,
  RefreshCw,
  Filter,
  Eye,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  X,
  Shield,
  Activity,
  Calendar,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface AuditLogItem {
  id: string;
  actor_id: string | null;
  actor_name: string;
  actor_username: string;
  actor_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: any;
  ip_address: string | null;
  created_at: string | null;
}

export function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedAction, setSelectedAction] = useState('ALL');
  const [selectedEntity, setSelectedEntity] = useState('ALL');

  // JSON Details Modal
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchLogs = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const actionParam = selectedAction === 'ALL' ? undefined : selectedAction;
        const entityParam = selectedEntity === 'ALL' ? undefined : selectedEntity;
        const searchParam = search.trim() ? search.trim() : undefined;

        const data = await adminService.getAuditLogs(
          page,
          pageSize,
          actionParam,
          entityParam,
          searchParam
        );

        if (data) {
          setLogs(data.items || []);
          setTotal(data.total || 0);
        }
      } catch (err: any) {
        toast.error(err.response?.data?.detail || 'Failed to load audit logs');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, pageSize, selectedAction, selectedEntity, search]
  );

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleCopyJson = (content: any) => {
    navigator.clipboard.writeText(JSON.stringify(content, null, 2));
    setCopied(true);
    toast.success('Metadata copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  const getActionBadgeColor = (action: string) => {
    const act = action.toUpperCase();
    if (act.includes('DELETE') || act.includes('BAN') || act.includes('FREEZE') || act.includes('REJECT')) {
      return 'bg-red-500/10 text-red-400 border-red-500/20';
    }
    if (act.includes('UPDATE') || act.includes('CONFIG') || act.includes('ADJUST') || act.includes('CONTROL')) {
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    }
    if (act.includes('CREATE') || act.includes('APPROVE') || act.includes('UNBAN') || act.includes('UNFREEZE')) {
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    }
    return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-brand-500" />
            Security & Audit Trail
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Immutable log of all administrative actions, risk decisions, configuration changes, and payouts.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchLogs(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-2 px-4 py-2 bg-dark-800 hover:bg-dark-700 text-gray-200 rounded-lg text-sm font-medium border border-dark-600 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="!p-4 bg-dark-900 border-dark-800">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Search Input */}
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-gray-500" />
            <input
              type="text"
              placeholder="Search by action, actor, username, entity ID, or keyword..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full bg-dark-950 border border-dark-700 rounded-lg pl-9 pr-4 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch('');
                  setPage(1);
                }}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Action Filter */}
          <div className="relative">
            <Filter className="w-4 h-4 absolute left-3 top-3 text-gray-500" />
            <select
              value={selectedAction}
              onChange={(e) => {
                setSelectedAction(e.target.value);
                setPage(1);
              }}
              className="w-full bg-dark-950 border border-dark-700 rounded-lg pl-9 pr-4 py-2 text-sm text-gray-200 focus:outline-none focus:border-brand-500 cursor-pointer appearance-none"
            >
              <option value="ALL">All Actions</option>
              <option value="USER_STATUS_CHANGE">User Status Change</option>
              <option value="WALLET_ADJUSTMENT">Wallet Balance Adjust</option>
              <option value="WITHDRAWAL_STATUS_CHANGE">Withdrawal Status</option>
              <option value="GAME_RTP_UPDATE">Game RTP Update</option>
              <option value="PAYMENT_GATEWAY_CONFIG">Payment Gateway Config</option>
              <option value="SUPPORT_CONFIG_UPDATE">Support Channel Update</option>
              <option value="RBAC_ROLE_CHANGE">RBAC Role Change</option>
              <option value="USER_LOGIN">User Login</option>
            </select>
          </div>

          {/* Entity Type Filter */}
          <div className="relative">
            <Activity className="w-4 h-4 absolute left-3 top-3 text-gray-500" />
            <select
              value={selectedEntity}
              onChange={(e) => {
                setSelectedEntity(e.target.value);
                setPage(1);
              }}
              className="w-full bg-dark-950 border border-dark-700 rounded-lg pl-9 pr-4 py-2 text-sm text-gray-200 focus:outline-none focus:border-brand-500 cursor-pointer appearance-none"
            >
              <option value="ALL">All Entities</option>
              <option value="user">User</option>
              <option value="wallet">Wallet</option>
              <option value="withdrawal">Withdrawal</option>
              <option value="deposit">Deposit</option>
              <option value="game">Game Engine</option>
              <option value="payment_setting">Payment Config</option>
              <option value="support_configuration">Support Settings</option>
              <option value="rbac_member">Staff / RBAC</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Logs Table */}
      <Card className="!p-0 overflow-hidden bg-dark-900 border-dark-800">
        {loading ? (
          <div className="py-20">
            <Loader size="lg" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30 text-brand-500" />
            <p className="text-base font-medium text-gray-300">No audit records match your filters</p>
            <p className="text-xs text-gray-500 mt-1">Try clearing your search query or choosing another action filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-dark-950/60 text-xs uppercase tracking-wider text-gray-400 border-b border-dark-800">
                <tr>
                  <th className="px-5 py-3 font-semibold">Timestamp</th>
                  <th className="px-5 py-3 font-semibold">Operator / Actor</th>
                  <th className="px-5 py-3 font-semibold">Action</th>
                  <th className="px-5 py-3 font-semibold">Target Resource</th>
                  <th className="px-5 py-3 font-semibold">IP Address</th>
                  <th className="px-5 py-3 font-semibold text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800/60 font-mono text-xs">
                {logs.map((log) => {
                  const dateStr = log.created_at
                    ? new Date(log.created_at).toLocaleString('en-IN', {
                        dateStyle: 'medium',
                        timeStyle: 'medium',
                      })
                    : '—';

                  return (
                    <tr key={log.id} className="hover:bg-dark-800/40 transition">
                      {/* Timestamp */}
                      <td className="px-5 py-3 whitespace-nowrap text-gray-400 font-sans">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-gray-500" />
                          <span>{dateStr}</span>
                        </div>
                      </td>

                      {/* Actor */}
                      <td className="px-5 py-3 whitespace-nowrap font-sans">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 font-bold text-xs">
                            {log.actor_username ? log.actor_username[0].toUpperCase() : 'S'}
                          </div>
                          <div>
                            <div className="font-semibold text-gray-200">
                              {log.actor_name || log.actor_username || 'System'}
                            </div>
                            <div className="text-[11px] text-gray-500">
                              @{log.actor_username || 'system'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="px-5 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold border ${getActionBadgeColor(
                            log.action
                          )}`}
                        >
                          {log.action}
                        </span>
                      </td>

                      {/* Target Entity */}
                      <td className="px-5 py-3 whitespace-nowrap font-sans">
                        {log.entity_type ? (
                          <div className="text-xs">
                            <span className="text-gray-400 uppercase tracking-wider text-[10px] font-bold">
                              {log.entity_type}:
                            </span>{' '}
                            <span className="text-gray-200 font-mono">
                              {log.entity_id ? log.entity_id.slice(0, 14) + (log.entity_id.length > 14 ? '...' : '') : 'all'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>

                      {/* IP Address */}
                      <td className="px-5 py-3 whitespace-nowrap text-gray-400">
                        {log.ip_address || '—'}
                      </td>

                      {/* Metadata Inspector Button */}
                      <td className="px-5 py-3 whitespace-nowrap text-right font-sans">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-dark-800 hover:bg-dark-700 text-gray-300 hover:text-white rounded border border-dark-700 text-xs transition"
                        >
                          <Eye className="w-3.5 h-3.5 text-brand-400" />
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="px-5 py-3.5 bg-dark-950/40 border-t border-dark-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400">
          <div>
            Showing <span className="font-semibold text-gray-200">{logs.length}</span> of{' '}
            <span className="font-semibold text-gray-200">{total}</span> total events
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="p-1.5 bg-dark-800 hover:bg-dark-700 text-gray-300 rounded border border-dark-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 font-sans">
              Page <span className="font-bold text-gray-200">{page}</span> of{' '}
              <span className="font-bold text-gray-200">{totalPages}</span>
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="p-1.5 bg-dark-800 hover:bg-dark-700 text-gray-300 rounded border border-dark-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </Card>

      {/* JSON Metadata Inspector Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-dark-900 border border-dark-700 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-dark-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-brand-500" />
                  Audit Event Details
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  ID: <span className="font-mono text-gray-300">{selectedLog.id}</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-dark-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="bg-dark-950 p-3 rounded-lg border border-dark-800">
                  <span className="text-gray-400 block mb-1">Action:</span>
                  <span className="font-semibold text-brand-400 font-mono">{selectedLog.action}</span>
                </div>
                <div className="bg-dark-950 p-3 rounded-lg border border-dark-800">
                  <span className="text-gray-400 block mb-1">Actor:</span>
                  <span className="font-semibold text-gray-200">
                    {selectedLog.actor_name} (@{selectedLog.actor_username})
                  </span>
                </div>
                <div className="bg-dark-950 p-3 rounded-lg border border-dark-800">
                  <span className="text-gray-400 block mb-1">Entity:</span>
                  <span className="font-semibold text-gray-200 font-mono">
                    {selectedLog.entity_type || '—'}: {selectedLog.entity_id || 'all'}
                  </span>
                </div>
                <div className="bg-dark-950 p-3 rounded-lg border border-dark-800">
                  <span className="text-gray-400 block mb-1">IP & Time:</span>
                  <span className="font-semibold text-gray-200 font-mono">
                    {selectedLog.ip_address || 'Unknown'} /{' '}
                    {selectedLog.created_at ? new Date(selectedLog.created_at).toLocaleTimeString() : '—'}
                  </span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-300">Payload Metadata (JSON):</span>
                  <button
                    onClick={() => handleCopyJson(selectedLog.metadata)}
                    className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied' : 'Copy JSON'}
                  </button>
                </div>
                <pre className="p-4 bg-dark-950 border border-dark-800 rounded-lg text-xs font-mono text-emerald-400 overflow-x-auto max-h-60">
                  {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0
                    ? JSON.stringify(selectedLog.metadata, null, 2)
                    : '// No additional payload metadata logged'}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-dark-800 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-dark-800 hover:bg-dark-700 text-gray-200 rounded-lg text-sm font-medium transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
