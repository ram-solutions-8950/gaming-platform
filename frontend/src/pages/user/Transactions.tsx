import { useEffect, useState } from 'react';
import { walletService } from '../../services/wallet';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Loader } from '../../components/common/Loader';
import type { WalletTransaction } from '../../types';

export function TransactionsPage() {
  const [txs, setTxs] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    walletService.getTransactions(1, 50).then(t => setTxs(t.items)).finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader />;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold text-white">Transactions</h1>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-dark-700 text-left">
                <th className="pb-3 font-semibold">Type</th>
                <th className="pb-3 font-semibold">Amount</th>
                <th className="pb-3 font-semibold">Status</th>
                <th className="pb-3 font-semibold">Date</th>
                <th className="pb-3 font-semibold">Reference</th>
              </tr>
            </thead>
            <tbody className="space-y-2">
              {txs.map(tx => (
                <tr key={tx.id} className="border-b border-dark-800 hover:bg-dark-800/50 transition-colors">
                  <td className="py-3 font-medium text-gray-100">{tx.type}</td>
                  <td className="py-3 font-bold text-gray-100">₹{(tx.amount / 100).toFixed(2)}</td>
                  <td className="py-3"><Badge label={tx.status} variant={tx.status === 'COMPLETED' ? 'success' : tx.status === 'FAILED' ? 'danger' : 'info'} /></td>
                  <td className="py-3 text-gray-400">{new Date(tx.created_at).toLocaleDateString()}</td>
                  <td className="py-3 text-gray-500 text-xs">{tx.reference_id ?? '�'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
