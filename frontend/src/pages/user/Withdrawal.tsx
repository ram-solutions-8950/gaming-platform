import { useEffect, useState } from 'react';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Loader } from '../../components/common/Loader';
import api from '../../services/api';
import { walletService } from '../../services/wallet';
import type { Wallet, Withdrawal, WithdrawalStatus } from '../../types';

interface FeeConfig {
  withdrawal_fee_percent: number;
}

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

export function WithdrawalPage() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [feeConfig, setFeeConfig] = useState<FeeConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Form State
  const [method, setMethod] = useState<'upi' | 'bank'>('upi');
  const [amount, setAmount] = useState<string>('');
  const [upiId, setUpiId] = useState<string>('');
  const [accountHolder, setAccountHolder] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [ifscCode, setIfscCode] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  const fetchData = async () => {
    try {
      const [w, res, feeRes] = await Promise.all([
        walletService.getWallet(),
        api.get('/withdrawals?page_size=20'),
        api.get('/fees'),
      ]);
      setWallet(w);
      setWithdrawals(res.data.data?.items ?? []);
      setFeeConfig(feeRes.data.data);
    } catch (e: any) {
      console.error('Failed to load withdrawal data', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) return <Loader />;

  const handleWithdrawalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSuccessMsg('');

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setFormError('Please enter a valid withdrawal amount greater than ₹0.');
      return;
    }

    const amountInPaisa = Math.round(numAmount * 100);
    if (wallet && amountInPaisa > wallet.balance) {
      setFormError(`Insufficient wallet balance. Available: ₹${wallet.balance_inr}`);
      return;
    }

    let destination = '';
    if (method === 'upi') {
      const cleanUpi = upiId.trim();
      if (!cleanUpi) {
        setFormError('Please enter a valid UPI ID.');
        return;
      }
      destination = cleanUpi;
    } else {
      const cleanHolder = accountHolder.trim();
      const cleanAcc = accountNumber.trim();
      const cleanIfsc = ifscCode.trim().toUpperCase();
      if (!cleanHolder || !cleanAcc || !cleanIfsc) {
        setFormError('Please complete all bank account details (Name, A/C No, IFSC).');
        return;
      }
      destination = `Name: ${cleanHolder}, A/C: ${cleanAcc}, IFSC: ${cleanIfsc}`;
    }

    setSubmitting(true);
    try {
      await api.post('/withdrawals', {
        amount: amountInPaisa,
        method,
        destination,
      });

      setSuccessMsg('Withdrawal request submitted successfully!');
      setAmount('');
      setUpiId('');
      setAccountHolder('');
      setAccountNumber('');
      setIfscCode('');
      await fetchData();
    } catch (e: any) {
      setFormError(e.response?.data?.error?.message || 'Failed to submit withdrawal request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold text-white">Request Withdrawal</h1>
        <div className="bg-dark-900 border border-dark-700 px-4 py-2 rounded-xl text-right">
          <p className="text-xs text-gray-400">Available Balance</p>
          <p className="text-xl font-extrabold text-white">₹{wallet?.balance_inr ?? '0.00'}</p>
        </div>
      </div>

      <Card title="Withdrawal Details">
        <form onSubmit={handleWithdrawalSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Select Payment Method</label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setMethod('upi')}
                className={`py-3 px-4 rounded-lg font-semibold text-sm border transition-all ${
                  method === 'upi'
                    ? 'bg-brand-600/20 border-brand-500 text-white'
                    : 'bg-dark-800 border-dark-700 text-gray-400 hover:text-white'
                }`}
              >
                UPI Transfer
              </button>
              <button
                type="button"
                onClick={() => setMethod('bank')}
                className={`py-3 px-4 rounded-lg font-semibold text-sm border transition-all ${
                  method === 'bank'
                    ? 'bg-brand-600/20 border-brand-500 text-white'
                    : 'bg-dark-800 border-dark-700 text-gray-400 hover:text-white'
                }`}
              >
                Bank Account
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Withdrawal Amount (₹)</label>
            <div className="relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-500 sm:text-lg">₹</span>
              </div>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="bg-dark-800 border border-dark-700 text-white rounded-md pl-8 py-3 w-full focus:ring-brand-500 focus:border-brand-500 text-lg"
                placeholder="Enter amount"
                disabled={submitting}
              />
            </div>
          </div>

          {method === 'upi' ? (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">UPI ID</label>
              <input
                type="text"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                className="bg-dark-800 border border-dark-700 text-white rounded-md px-4 py-3 w-full focus:ring-brand-500 focus:border-brand-500 text-sm font-mono"
                placeholder="e.g. mobile@upi"
                disabled={submitting}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Account Holder Name</label>
                <input
                  type="text"
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  className="bg-dark-800 border border-dark-700 text-white rounded-md px-4 py-2.5 w-full focus:ring-brand-500 focus:border-brand-500 text-sm"
                  placeholder="Full name as in bank account"
                  disabled={submitting}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Account Number</label>
                  <input
                    type="text"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    className="bg-dark-800 border border-dark-700 text-white rounded-md px-4 py-2.5 w-full focus:ring-brand-500 focus:border-brand-500 text-sm font-mono"
                    placeholder="Bank account number"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">IFSC Code</label>
                  <input
                    type="text"
                    value={ifscCode}
                    onChange={(e) => setIfscCode(e.target.value)}
                    className="bg-dark-800 border border-dark-700 text-white rounded-md px-4 py-2.5 w-full focus:ring-brand-500 focus:border-brand-500 text-sm font-mono uppercase"
                    placeholder="e.g. SBIN0001234"
                    disabled={submitting}
                  />
                </div>
              </div>
            </div>
          )}

          {formError && <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded p-3">{formError}</p>}
          {successMsg && <p className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded p-3">{successMsg}</p>}

          {feeConfig && amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0 && (
            <div className="bg-dark-800 border border-dark-700 p-4 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Withdrawal Amount</span>
                <span className="text-white font-medium">₹{parseFloat(amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Withdrawal Fee ({feeConfig.withdrawal_fee_percent}%)</span>
                <span className="text-danger font-medium">- ₹{(parseFloat(amount) * (feeConfig.withdrawal_fee_percent / 100)).toFixed(2)}</span>
              </div>
              <div className="pt-2 border-t border-dark-700 flex justify-between text-base">
                <span className="text-gray-300 font-medium">You'll Receive</span>
                <span className="text-emerald-400 font-bold">
                  ₹{(parseFloat(amount) - parseFloat(amount) * (feeConfig.withdrawal_fee_percent / 100)).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !amount}
            className="w-full bg-brand-600 hover:bg-brand-500 disabled:bg-dark-700 disabled:text-gray-500 text-white font-bold py-3 px-4 rounded-lg transition-colors cursor-pointer"
          >
            {submitting ? 'Submitting Request...' : 'Submit Withdrawal Request'}
          </button>
        </form>
      </Card>

      <Card title="Withdrawal History">
        {withdrawals.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No withdrawal requests found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-dark-700 text-left">
                  <th className="pb-3">Date</th>
                  <th className="pb-3">Gross Amount</th>
                  <th className="pb-3">Fee</th>
                  <th className="pb-3">Net Payout</th>
                  <th className="pb-3">Method</th>
                  <th className="pb-3">Destination</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w) => (
                  <tr key={w.id} className="border-b border-dark-800 hover:bg-dark-800/50 transition-colors">
                    <td className="py-3 text-gray-400 text-xs">{new Date(w.created_at).toLocaleString()}</td>
                    <td className="py-3 font-bold text-white">₹{(w.amount / 100).toFixed(2)}</td>
                    <td className="py-3 font-medium text-danger">₹{((w as any).fee_amount / 100).toFixed(2)}</td>
                    <td className="py-3 font-bold text-emerald-400">₹{((w as any).net_amount / 100).toFixed(2)}</td>
                    <td className="py-3 text-gray-300 capitalize">{w.method ?? '—'}</td>
                    <td className="py-3 text-gray-400 text-xs font-mono max-w-xs truncate">{w.destination ?? '—'}</td>
                    <td className="py-3">
                      <Badge label={getStatusDisplay(w.status)} variant={getStatusBadgeVariant(w.status)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
