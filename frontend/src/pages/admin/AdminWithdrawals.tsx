import { useEffect, useState } from 'react';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Loader } from '../../components/common/Loader';
import api from '../../services/api';
import type { Withdrawal, WithdrawalStatus } from '../../types';

function getStatusDisplay(status: WithdrawalStatus) {
  switch (status) {
    case 'PROCESSING':
      return 'PAYMENT INITIATED';
    default:
      return status;
  }
}

function getStatusBadgeVariant(status: WithdrawalStatus) {
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
  }
}

export function AdminWithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'processing' | 'complete' | 'reject' | 'fail' | null>(null);
  const [reason, setReason] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [processingAction, setProcessingAction] = useState(false);

  const fetchWithdrawals = async () => {
    try {
      const r = await api.get('/admin/withdrawals?page_size=50');
      setWithdrawals(r.data.data?.items ?? []);
    } catch (e: any) {
      console.error('Failed to load admin withdrawals', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWithdrawals();
  }, []);

  const openActionModal = (id: string, type: 'approve' | 'processing' | 'complete' | 'reject' | 'fail') => {
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

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold text-white">Withdrawals Management</h1>
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
                </tr>
              ) : (
                withdrawals.map((w) => (
                  <tr key={w.id} className="border-b border-dark-800 hover:bg-dark-800/50 transition-colors">
                    <td className="py-3 text-xs text-gray-400 font-mono" title={w.user_id}>
                      {w.user_id.slice(0, 8)}…
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
      </Card>

      {/* Confirmation Modal */}
      {actionId && actionType && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-dark-900 border border-dark-700 rounded-xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-xl font-bold text-white capitalize">
              Confirm Action: {actionType === 'processing' ? 'Payment Initiated' : actionType}
            </h3>
            <p className="text-sm text-gray-300">
              Are you sure you want to transition this withdrawal to <span className="font-semibold text-white uppercase">{actionType === 'processing' ? 'PROCESSING (Payment Initiated)' : actionType}</span>?
            </p>

            {(actionType === 'reject' || actionType === 'fail') && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Reason (Optional)</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-dark-800 border border-dark-700 rounded p-2 text-sm text-white focus:outline-hidden focus:border-brand-500"
                  placeholder="Enter reason for rejection or failure..."
                  rows={3}
                />
              </div>
            )}

            {errorMsg && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2">{errorMsg}</p>
            )}

            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={processingAction}
                className="px-4 py-2 text-sm font-semibold rounded bg-dark-800 text-gray-300 hover:bg-dark-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                disabled={processingAction}
                className={`px-4 py-2 text-sm font-semibold rounded text-white transition-colors cursor-pointer ${
                  actionType === 'reject' || actionType === 'fail'
                    ? 'bg-red-600 hover:bg-red-500'
                    : 'bg-brand-600 hover:bg-brand-500'
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
