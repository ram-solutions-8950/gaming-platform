import { useEffect, useState } from 'react';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Loader } from '../../components/common/Loader';
import api from '../../services/api';
import type { Deposit } from '../../types';

export function AdminDepositsPage() {
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.get('/admin/deposits?page_size=50').then(r => setDeposits(r.data.data?.items ?? [])).finally(() => setLoading(false)); }, []);
  if (loading) return <Loader />;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold text-white">Deposits</h1>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-gray-400 border-b border-dark-700 text-left"><th className="pb-3">User</th><th className="pb-3">Amount</th><th className="pb-3">Provider</th><th className="pb-3">Status</th><th className="pb-3">Date</th></tr></thead>
            <tbody>{deposits.map(d => (<tr key={d.id} className="border-b border-dark-800 hover:bg-dark-800/50 transition-colors"><td className="py-3 text-xs text-gray-500 font-mono">{d.user_id.slice(0,8)}…</td><td className="py-3 font-bold text-gray-100">₹{(d.amount/100).toFixed(2)}</td><td className="py-3 text-gray-400">{d.provider ?? '—'}</td><td className="py-3"><Badge label={d.status} variant={d.status === 'SUCCESS' ? 'success' : d.status === 'FAILED' ? 'danger' : 'info'} /></td><td className="py-3 text-gray-400">{new Date(d.created_at).toLocaleString()}</td></tr>))}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
