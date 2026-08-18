import { useEffect, useState } from 'react';
import { Card } from '../../components/common/Card';
import { Loader } from '../../components/common/Loader';
import api from '../../services/api';

interface Stats { users: number; deposits: number; withdrawals: number; transactions: number; }

export function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/admin/users?page_size=1').catch(() => ({ data: { data: { total: 0 } } })),
      api.get('/admin/deposits?page_size=1').catch(() => ({ data: { data: { total: 0 } } })),
      api.get('/admin/withdrawals?page_size=1').catch(() => ({ data: { data: { total: 0 } } })),
      api.get('/admin/transactions?page_size=1').catch(() => ({ data: { data: { total: 0 } } })),
    ]).then(([u, d, w, t]) => {
      setStats({
        users: u.data.data?.total ?? 0,
        deposits: d.data.data?.total ?? 0,
        withdrawals: w.data.data?.total ?? 0,
        transactions: t.data.data?.total ?? 0,
      });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader />;

  const statCards = [
    { label: 'Total Users', value: stats?.users, icon: '?', color: 'text-brand-400' },
    { label: 'Total Deposits', value: stats?.deposits, icon: '?', color: 'text-success' },
    { label: 'Total Withdrawals', value: stats?.withdrawals, icon: '?', color: 'text-warn' },
    { label: 'Total Transactions', value: stats?.transactions, icon: '?', color: 'text-gold-400' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-white">Admin Dashboard</h1>
        <p className="text-gray-400 mt-1">Platform overview</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map(s => (
          <Card key={s.label}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-400">{s.label}</p>
                <p className="text-4xl font-extrabold mt-2 text-white">{s.value}</p>
              </div>
              <span className="text-3xl">{s.icon}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
