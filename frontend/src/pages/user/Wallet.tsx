import { useEffect, useState } from 'react';
import { walletService } from '../../services/wallet';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Loader } from '../../components/common/Loader';
import type { Wallet, WalletTransaction, TxType, TxStatus } from '../../types';

const CREDIT_TYPES: TxType[] = ['DEPOSIT', 'GAME_WIN', 'REFUND', 'ADJUSTMENT'];

function txBadgeVariant(status: TxStatus) {
  return status === 'COMPLETED' ? 'success' : status === 'FAILED' ? 'danger' : status === 'REVERSED' ? 'warn' : 'info';
}

export function WalletPage() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [txs, setTxs] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([walletService.getWallet(), walletService.getTransactions()])
      .then(([w, t]) => { setWallet(w); setTxs(t.items); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader />;

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-extrabold text-white">Wallet</h1>
      <Card className="bg-linear-to-br from-brand-600/20 to-gold-500/10 border-brand-500/30">
        <p className="text-sm text-gray-400 mb-2">Available Balance</p>
        <p className="text-5xl font-extrabold text-white">₹{wallet?.balance_inr ?? '0.00'}</p>
        <p className="text-xs text-gray-500 mt-3">Balance in paisa: {wallet?.balance}</p>
      </Card>
      <Card title="Transaction History">
        {txs.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No transactions yet.</p>
        ) : (
          <div className="space-y-3">
            {txs.map(tx => {
              const isCredit = CREDIT_TYPES.includes(tx.type);
              return (
                <div key={tx.id} className="flex items-center justify-between p-4 bg-dark-800 rounded-lg border border-dark-700">
                  <div>
                    <p className="text-sm font-semibold text-gray-100">{tx.type.replace('_', ' ')}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{new Date(tx.created_at).toLocaleString()}</p>
                    {tx.reference_id && <p className="text-xs text-gray-600 mt-0.5">Ref: {tx.reference_id}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-base font-bold text-gray-100">
                      {isCredit ? '+' : '-'}₹{(tx.amount / 100).toFixed(2)}
                    </span>
                    <Badge label={tx.status} variant={txBadgeVariant(tx.status)} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
