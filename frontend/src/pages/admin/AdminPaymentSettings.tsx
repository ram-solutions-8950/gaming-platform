import { useEffect, useState } from 'react';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Loader } from '../../components/common/Loader';
import api from '../../services/api';

interface PaymentConfig {
  id: string; provider: string; display_name: string; upi_id: string | null;
  qr_code_reference: string | null; minimum_deposit: number; maximum_deposit: number; enabled: boolean;
}

export function AdminPaymentSettingsPage() {
  const [configs, setConfigs] = useState<PaymentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.get('/admin/payment-settings').then(r => setConfigs(r.data.data ?? [])).finally(() => setLoading(false)); }, []);
  if (loading) return <Loader />;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold text-white">Payment Settings</h1>
      <p className="text-gray-400 text-sm">Provider secrets are managed server-side only. This view shows safe configuration.</p>
      {configs.length === 0 ? (
        <Card><p className="text-gray-500 text-center py-8">No payment providers configured yet.</p></Card>
      ) : configs.map(c => (
        <Card key={c.id} title={c.display_name}>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-gray-400">Provider</p><p className="font-semibold text-gray-100">{c.provider}</p></div>
            <div><p className="text-gray-400">Status</p><Badge label={c.enabled ? 'Enabled' : 'Disabled'} variant={c.enabled ? 'success' : 'danger'} /></div>
            <div><p className="text-gray-400">UPI ID</p><p className="font-semibold text-gray-100">{c.upi_id ?? '—'}</p></div>
            <div><p className="text-gray-400">Min Deposit</p><p className="font-semibold text-gray-100">₹{(c.minimum_deposit/100).toFixed(2)}</p></div>
            <div><p className="text-gray-400">Max Deposit</p><p className="font-semibold text-gray-100">₹{(c.maximum_deposit/100).toFixed(2)}</p></div>
          </div>
        </Card>
      ))}
    </div>
  );
}
