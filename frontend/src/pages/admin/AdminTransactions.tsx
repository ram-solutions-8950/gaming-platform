import { useEffect, useState } from 'react';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Loader } from '../../components/common/Loader';
import api from '../../services/api';
import type { WalletTransaction } from '../../types';

export function AdminTransactionsPage() {
  const [txs, setTxs] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/transactions?page_size=50').then(r => setTxs(r.data.data?.items ?? [])).finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader />;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold text-white">All Transactions</h1>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-dark-700 text-left">
                <th className="pb-3 font-semibold">ID</th>
                <th className="pb-3 font-semibold">Type</th>
                <th className="pb-3 font-semibold">Amount</th>
                <th className="pb-3 font-semibold">Status</th>
                <th className="pb-3 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody>
              {txs.map(tx => (
                <tr key={tx.id} className="border-b border-dark-800 hover:bg-dark-800/50 transition-colors">
                  <td className="py-3 text-xs text-gray-500 font-mono">{tx.id.slice(0, 8)}�</td>
                  <td className="py-3 font-medium text-gray-100">{tx.type}</td>
                  <td className="py-3 font-bold text-gray-100">₹{(tx.amount / 100).toFixed(2)}</td>
                  <td className="py-3"><Badge label={tx.status} variant={tx.status === 'COMPLETED' ? 'success' : tx.status === 'FAILED' ? 'danger' : 'info'} /></td>
                  <td className="py-3 text-gray-400">{new Date(tx.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
