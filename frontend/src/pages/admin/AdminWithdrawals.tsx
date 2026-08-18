import { useEffect, useState } from 'react';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Loader } from '../../components/common/Loader';
import api from '../../services/api';
import type { Withdrawal } from '../../types';

export function AdminWithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.get('/admin/withdrawals?page_size=50').then(r => setWithdrawals(r.data.data?.items ?? [])).finally(() => setLoading(false)); }, []);
  if (loading) return <Loader />;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold text-white">Withdrawals</h1>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-gray-400 border-b border-dark-700 text-left"><th className="pb-3">User</th><th className="pb-3">Amount</th><th className="pb-3">Method</th><th className="pb-3">Status</th><th className="pb-3">Date</th></tr></thead>
            <tbody>{withdrawals.map(w => (<tr key={w.id} className="border-b border-dark-800 hover:bg-dark-800/50 transition-colors"><td className="py-3 text-xs text-gray-500 font-mono">{w.user_id.slice(0,8)}…</td><td className="py-3 font-bold text-gray-100">₹{(w.amount/100).toFixed(2)}</td><td className="py-3 text-gray-400">{w.method ?? '—'}</td><td className="py-3"><Badge label={w.status} variant={w.status === 'APPROVED' ? 'success' : w.status === 'REJECTED' ? 'danger' : 'info'} /></td><td className="py-3 text-gray-400">{new Date(w.created_at).toLocaleString()}</td></tr>))}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
