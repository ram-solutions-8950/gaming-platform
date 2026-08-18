import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { walletService } from '../../services/wallet';
import { Card } from '../../components/common/Card';
import { Loader } from '../../components/common/Loader';
import type { Wallet } from '../../types';

export function DashboardPage() {
  const { user } = useAuthStore();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    walletService.getWallet().then(setWallet).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-1">Welcome back, <span className="text-brand-400 font-semibold">{user?.name}</span></p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="col-span-1">
          <div className="flex justify-between items-start">
            <p className="text-sm text-gray-400 mb-1">Available Balance</p>
            <Link to="/deposit" className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 py-1 rounded">
              Deposit
            </Link>
          </div>
          {loading ? <Loader size="sm" /> : (
            <p className="text-4xl font-extrabold text-white">₹{wallet?.balance_inr ?? '0.00'}</p>
          )}
          <p className="text-xs text-gray-500 mt-2">Gaming wallet balance</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-400 mb-1">Account Status</p>
          <p className="text-xl font-bold text-success">{user?.status}</p>
          <p className="text-xs text-gray-500 mt-2">{user?.role}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-400 mb-1">Games</p>
          <p className="text-xl font-bold text-gray-300">Coming Soon</p>
          <p className="text-xs text-gray-500 mt-2">Poker & Teen Patti launching next phase</p>
        </Card>
      </div>
    </div>
  );
}
