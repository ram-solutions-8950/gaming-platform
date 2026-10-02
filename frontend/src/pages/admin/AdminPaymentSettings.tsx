import { useEffect, useState, useRef, useCallback } from 'react';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Loader } from '../../components/common/Loader';
import api, { API_BASE_URL } from '../../services/api';
import { adminService } from '../../services/adminService';
import toast from 'react-hot-toast';
import {
  CreditCard,
  QrCode,
  Zap,
  Save,
  Key,
} from 'lucide-react';

interface PaymentConfig {
  id: string;
  provider: string;
  display_name: string;
  upi_id: string | null;
  qr_code_reference: string | null;
  minimum_deposit: number;
  maximum_deposit: number;
  enabled: boolean;
  deposit_instructions: string | null;
}

interface PaymentGatewayConfigItem {
  id: string;
  gateway_name: string;
  display_name: string;
  is_active: boolean;
  has_key: boolean;
  has_secret: boolean;
  has_webhook_secret: boolean;
  api_key?: string;
  api_key_masked: string | null;
  is_sandbox: boolean;
  updated_at: string | null;
}

export function AdminPaymentSettingsPage() {
  const [activeTab, setActiveTab] = useState<'gateways' | 'manual'>('gateways');

  // Automated Gateways State
  const [gateways, setGateways] = useState<PaymentGatewayConfigItem[]>([]);
  const [gatewaysLoading, setGatewaysLoading] = useState(true);
  const [activating, setActivating] = useState<string | null>(null);

  // Gateway form edits
  const [editingGateway, setEditingGateway] = useState<string | null>(null);
  const [gwApiKey, setGwApiKey] = useState('');
  const [gwApiSecret, setGwApiSecret] = useState('');
  const [gwWebhookSecret, setGwWebhookSecret] = useState('');
  const [gwIsSandbox, setGwIsSandbox] = useState(true);
  const [savingGateway, setSavingGateway] = useState(false);

  // Manual UPI Settings State
  const [configs, setConfigs] = useState<PaymentConfig[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<Partial<PaymentConfig>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const fetchGateways = useCallback(async () => {
    setGatewaysLoading(true);
    try {
      const data = await adminService.getPaymentGateways();
      setGateways(data || []);
    } catch (err: any) {
      toast.error('Failed to load payment gateway configurations');
    } finally {
      setGatewaysLoading(false);
    }
  }, []);

  const fetchManualConfigs = useCallback(() => {
    api
      .get('/admin/payment-settings')
      .then((r) => setConfigs(r.data.data ?? []))
      .catch((e) => setErrorMsg('Failed to load configs: ' + e.message));
  }, []);

  useEffect(() => {
    fetchGateways();
    fetchManualConfigs();
  }, [fetchGateways, fetchManualConfigs]);

  const handleActivateGateway = async (gatewayName: string) => {
    if (!window.confirm(`Activate ${gatewayName.toUpperCase()} as the platform's primary payment gateway? All new player deposits will route through it.`)) return;
    setActivating(gatewayName);
    try {
      await adminService.activatePaymentGateway(gatewayName);
      toast.success(`${gatewayName.toUpperCase()} is now the ACTIVE payment gateway!`);
      fetchGateways();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to activate gateway');
    } finally {
      setActivating(null);
    }
  };

  const handleOpenGatewayEdit = (gw: PaymentGatewayConfigItem) => {
    setEditingGateway(gw.gateway_name);
    setGwApiKey(gw.api_key || '');
    setGwApiSecret('');
    setGwWebhookSecret('');
    setGwIsSandbox(gw.is_sandbox);
  };

  const handleSaveGateway = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGateway) return;
    setSavingGateway(true);
    try {
      const payload: any = {
        is_sandbox: gwIsSandbox,
      };
      if (gwApiKey.trim()) payload.api_key = gwApiKey.trim();
      if (gwApiSecret.trim()) payload.api_secret = gwApiSecret.trim();
      if (gwWebhookSecret.trim()) payload.webhook_secret = gwWebhookSecret.trim();

      await adminService.updatePaymentGateway(editingGateway, payload);
      toast.success(`${editingGateway.toUpperCase()} credentials updated successfully!`);
      setEditingGateway(null);
      fetchGateways();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update gateway credentials');
    } finally {
      setSavingGateway(false);
    }
  };

  // Manual UPI handlers
  const handleEdit = (c: PaymentConfig) => {
    setEditingId(c.id);
    setIsCreating(false);
    setFormData({
      provider: c.provider,
      display_name: c.display_name,
      upi_id: c.upi_id,
      minimum_deposit: c.minimum_deposit / 100,
      maximum_deposit: c.maximum_deposit / 100,
      enabled: c.enabled,
      deposit_instructions: c.deposit_instructions,
    });
    setQrFile(null);
    setErrorMsg('');
  };

  const handleCreateNew = () => {
    setIsCreating(true);
    setEditingId(null);
    setFormData({
      provider: 'upi',
      display_name: 'UPI Direct Deposit',
      upi_id: '',
      minimum_deposit: 100,
      maximum_deposit: 50000,
      enabled: true,
      deposit_instructions: 'Scan the QR code or send payment to the UPI ID above. Enter the 12-digit UTR transaction reference number to credit wallet instantly.',
    });
    setQrFile(null);
    setErrorMsg('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsCreating(false);
    setQrFile(null);
    setErrorMsg('');
  };

  const saveManualConfig = async () => {
    try {
      const payload = {
        provider: formData.provider,
        display_name: formData.display_name,
        upi_id: formData.upi_id || null,
        minimum_deposit: (formData.minimum_deposit || 0) * 100,
        maximum_deposit: (formData.maximum_deposit || 0) * 100,
        enabled: formData.enabled || false,
        deposit_instructions: formData.deposit_instructions || null,
      };

      let configId = editingId;
      if (isCreating) {
        const res = await api.post('/admin/payment-settings', payload);
        configId = res.data.data.id;
      } else if (editingId) {
        await api.patch(`/admin/payment-settings/${editingId}`, payload);
      }

      if (qrFile && configId) {
        const fd = new FormData();
        fd.append('file', qrFile);
        await api.post(`/admin/payment-settings/${configId}/qr-upload`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      fetchManualConfigs();
      cancelEdit();
      toast.success('Manual payment configuration saved successfully');
    } catch (e: any) {
      setErrorMsg(e.response?.data?.error?.message || e.message);
    }
  };

  const deleteConfig = async (id: string) => {
    if (!confirm('Are you sure you want to delete this configuration?')) return;
    try {
      await api.delete(`/admin/payment-settings/${id}`);
      fetchManualConfigs();
      toast.success('Configuration deleted');
    } catch (e: any) {
      setErrorMsg(e.response?.data?.error?.message || e.message);
    }
  };

  const activeGateway = gateways.find((g) => g.is_active);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <CreditCard className="text-brand-400" size={28} />
            <span>Payment Gateway & Banking Controls</span>
          </h1>
          <p className="text-gray-400 text-xs mt-1">
            Toggle switchable payment providers (Cashfree &amp; Razorpay), configure API credentials, and manage manual UPI QR codes.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 p-1 bg-[#111726] border border-[#1d273d] rounded-xl">
          <button
            onClick={() => setActiveTab('gateways')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'gateways'
                ? 'bg-brand-500 text-black shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Zap size={14} />
            <span>Switchable Gateways</span>
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'manual'
                ? 'bg-brand-500 text-black shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <QrCode size={14} />
            <span>Manual UPI &amp; QR</span>
          </button>
        </div>
      </div>

      {/* TAB 1: AUTOMATED GATEWAYS (CASHFREE & RAZORPAY) */}
      {activeTab === 'gateways' && (
        <div className="space-y-6 animate-fade-in">
          {/* Active Gateway Status Banner */}
          <div className="bg-gradient-to-r from-[#111726] via-[#162035] to-[#111726] border-2 border-brand-500/40 rounded-2xl p-5 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-brand-500/20 border border-brand-500/40 flex items-center justify-center text-brand-400 shrink-0 text-2xl">
                  ⚡
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Currently Active Gateway:</span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                      {activeGateway ? activeGateway.display_name.toUpperCase() : 'NONE CONFIGURED'}
                    </span>
                    {activeGateway && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        activeGateway.is_sandbox ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
                      }`}>
                        {activeGateway.is_sandbox ? 'SANDBOX (TEST)' : 'PRODUCTION (LIVE)'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-300 mt-1">
                    All player deposit requests on the APK and web portal are automatically processed and verified through this active gateway.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Gateways Cards Grid */}
          {gatewaysLoading ? (
            <div className="py-20 flex justify-center">
              <Loader size="lg" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {gateways.map((gw) => {
                const isCashfree = gw.gateway_name === 'cashfree';
                const borderColor = gw.is_active
                  ? 'border-brand-500/80 shadow-[0_0_30px_rgba(234,179,8,0.15)]'
                  : 'border-[#1d273d]';

                return (
                  <div
                    key={gw.id}
                    className={`bg-[#0f1422] border-2 ${borderColor} rounded-2xl p-5 flex flex-col justify-between transition relative overflow-hidden`}
                  >
                    {/* Header */}
                    <div>
                      <div className="flex items-center justify-between pb-3 border-b border-[#1d273d]">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm ${
                            isCashfree ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40' : 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                          }`}>
                            {isCashfree ? 'CF' : 'RZ'}
                          </div>
                          <div>
                            <h3 className="font-bold text-white text-base">{gw.display_name}</h3>
                            <span className="text-[11px] text-gray-400 font-mono">provider: {gw.gateway_name}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {gw.is_active ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Active Gateway
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-gray-500/20 text-gray-400 border border-gray-500/30">
                              Standby
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Details & Config Status */}
                      <div className="py-4 space-y-2.5 text-xs">
                        <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#141b2d] border border-[#1d273d]">
                          <span className="text-gray-400">Environment Mode:</span>
                          <span className={`font-bold font-mono px-2 py-0.5 rounded text-[11px] ${
                            gw.is_sandbox ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
                          }`}>
                            {gw.is_sandbox ? 'Sandbox (Test)' : 'Production (Live)'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#141b2d] border border-[#1d273d]">
                          <span className="text-gray-400">API Key / App ID:</span>
                          <span className="font-mono text-gray-200">
                            {gw.api_key_masked || ((gw.has_key || gw.api_key) ? '••••••••••••••••' : 'Not configured')}
                          </span>
                        </div>

                        <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#141b2d] border border-[#1d273d]">
                          <span className="text-gray-400">API Secret Key:</span>
                          <span className="font-mono text-gray-200">
                            {gw.has_secret ? '•••••••••••••••• (Configured)' : 'Missing'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#141b2d] border border-[#1d273d]">
                          <span className="text-gray-400">Webhook Secret:</span>
                          <span className="font-mono text-gray-200">
                            {gw.has_webhook_secret ? '•••••••• (Configured)' : 'Optional'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-3 border-t border-[#1d273d] flex items-center justify-between gap-3">
                      <button
                        onClick={() => handleOpenGatewayEdit(gw)}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#1a233a] hover:bg-[#232f4e] text-cyan-300 border border-cyan-500/30 transition cursor-pointer flex items-center gap-1.5"
                      >
                        <Key size={14} />
                        <span>Edit Credentials</span>
                      </button>

                      {!gw.is_active && (
                        <button
                          onClick={() => handleActivateGateway(gw.gateway_name)}
                          disabled={activating === gw.gateway_name}
                          className="px-4 py-2 rounded-xl text-xs font-black bg-brand-500 hover:bg-brand-400 text-black shadow-lg shadow-brand-500/20 active:scale-95 transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                        >
                          <Zap size={14} />
                          <span>{activating === gw.gateway_name ? 'Switching...' : 'Switch to this Gateway'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Edit Gateway Credentials Modal */}
          {editingGateway && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
              <div className="bg-[#0f1422] border border-[#222c44] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#222c44]">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Key className="text-brand-400" size={18} />
                    <span>Configure {editingGateway.toUpperCase()}</span>
                  </h3>
                  <button
                    onClick={() => setEditingGateway(null)}
                    className="p-1 rounded-lg text-gray-400 hover:text-white"
                  >
                    ×
                  </button>
                </div>

                <form onSubmit={handleSaveGateway} className="space-y-4 text-xs">
                  <div>
                    <label className="block font-semibold text-gray-300 mb-1">
                      {editingGateway === 'cashfree' ? 'Cashfree App ID (Client ID)' : 'Razorpay Key ID'}
                    </label>
                    <input
                      type="text"
                      placeholder={editingGateway === 'cashfree' ? 'e.g. TEST10048...' : 'e.g. rzp_test_... or rzp_live_...'}
                      value={gwApiKey}
                      onChange={(e) => setGwApiKey(e.target.value)}
                      className="w-full bg-[#141b2d] border border-[#222c44] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-brand-500 font-mono"
                    />
                    <span className="text-[10px] text-gray-500 mt-0.5 block">Leave empty to keep existing key</span>
                  </div>

                  <div>
                    <label className="block font-semibold text-gray-300 mb-1">
                      {editingGateway === 'cashfree' ? 'Cashfree Secret Key' : 'Razorpay Key Secret'}
                    </label>
                    <input
                      type="password"
                      placeholder="Enter secret key..."
                      value={gwApiSecret}
                      onChange={(e) => setGwApiSecret(e.target.value)}
                      className="w-full bg-[#141b2d] border border-[#222c44] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-brand-500 font-mono"
                    />
                    <span className="text-[10px] text-gray-500 mt-0.5 block">Leave empty to keep existing secret</span>
                  </div>

                  <div>
                    <label className="block font-semibold text-gray-300 mb-1">
                      Webhook Secret (Optional)
                    </label>
                    <input
                      type="password"
                      placeholder="Webhook verification signature key..."
                      value={gwWebhookSecret}
                      onChange={(e) => setGwWebhookSecret(e.target.value)}
                      className="w-full bg-[#141b2d] border border-[#222c44] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-brand-500 font-mono"
                    />
                  </div>

                  <div className="p-3 bg-[#141b2d] rounded-xl border border-[#222c44] flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white block">Sandbox / Test Mode</span>
                      <span className="text-[10px] text-gray-400">
                        {gwIsSandbox ? 'Uses test API endpoint' : 'Uses LIVE production payment gateway'}
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={gwIsSandbox}
                        onChange={(e) => setGwIsSandbox(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#222c44]">
                    <button
                      type="button"
                      onClick={() => setEditingGateway(null)}
                      className="px-4 py-2 rounded-xl text-xs text-gray-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingGateway}
                      className="px-5 py-2 rounded-xl text-xs font-bold bg-brand-500 hover:bg-brand-400 text-black transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Save size={14} />
                      <span>{savingGateway ? 'Saving...' : 'Save Credentials'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MANUAL UPI & QR CODE CONFIGURATION */}
      {activeTab === 'manual' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-white">Manual UPI &amp; QR Settings</h2>
              <p className="text-gray-400 text-xs mt-0.5">Players can transfer directly via UPI ID or QR code and submit their UTR.</p>
            </div>
            {!isCreating && !editingId && (
              <button
                onClick={handleCreateNew}
                className="bg-brand-500 hover:bg-brand-400 text-black font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
              >
                + Add Manual UPI Channel
              </button>
            )}
          </div>

          {errorMsg && <div className="bg-red-900/50 text-red-200 p-3 rounded-xl text-xs">{errorMsg}</div>}

          {(isCreating || editingId) && (
            <Card title={isCreating ? 'New Manual UPI Config' : 'Edit UPI Configuration'}>
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-400 mb-1 font-semibold">Payment Method Code</label>
                    <input
                      disabled={!isCreating}
                      type="text"
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl p-2.5 text-white"
                      value={formData.provider || ''}
                      onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1 font-semibold">Display Name</label>
                    <input
                      type="text"
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl p-2.5 text-white"
                      value={formData.display_name || ''}
                      onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1 font-semibold">Official UPI ID</label>
                    <input
                      type="text"
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl p-2.5 text-white font-mono"
                      value={formData.upi_id || ''}
                      onChange={(e) => setFormData({ ...formData, upi_id: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1 font-semibold">Status</label>
                    <div className="mt-2 flex items-center">
                      <input
                        type="checkbox"
                        className="mr-2 rounded cursor-pointer"
                        checked={formData.enabled || false}
                        onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                      />
                      <span className="text-white font-semibold">Enabled</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1 font-semibold">Min Deposit (₹)</label>
                    <input
                      type="number"
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl p-2.5 text-white"
                      value={formData.minimum_deposit || ''}
                      onChange={(e) => setFormData({ ...formData, minimum_deposit: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1 font-semibold">Max Deposit (₹)</label>
                    <input
                      type="number"
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl p-2.5 text-white"
                      value={formData.maximum_deposit || ''}
                      onChange={(e) => setFormData({ ...formData, maximum_deposit: Number(e.target.value) })}
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <label className="block text-gray-400 mb-1 font-semibold">Deposit Instructions</label>
                    <textarea
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl p-2.5 text-white h-20 resize-none"
                      value={formData.deposit_instructions || ''}
                      onChange={(e) => setFormData({ ...formData, deposit_instructions: e.target.value })}
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <label className="block text-gray-400 mb-1 font-semibold">QR Code Image</label>
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept=".png,.jpg,.jpeg,.webp"
                      className="block w-full text-white file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-gray-700 file:text-gray-200 hover:file:bg-gray-600"
                      onChange={(e) => setQrFile(e.target.files ? e.target.files[0] : null)}
                    />
                  </div>
                </div>
                <div className="flex space-x-3 pt-4 border-t border-gray-700">
                  <button onClick={saveManualConfig} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl cursor-pointer">
                    Save Configuration
                  </button>
                  <button onClick={cancelEdit} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-xl cursor-pointer">
                    Cancel
                  </button>
                </div>
              </div>
            </Card>
          )}

          {!isCreating && !editingId && configs.length === 0 && (
            <Card>
              <p className="text-gray-500 text-center py-8">No manual payment providers configured yet.</p>
            </Card>
          )}

          {!isCreating && !editingId && configs.map((c) => (
            <Card key={c.id} title={c.display_name}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="text-gray-400">Payment Method</p>
                    <p className="font-semibold text-gray-100 uppercase">{c.provider}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Status</p>
                    <Badge label={c.enabled ? 'Enabled' : 'Disabled'} variant={c.enabled ? 'success' : 'danger'} />
                  </div>
                  <div>
                    <p className="text-gray-400">UPI ID</p>
                    <p className="font-semibold text-gray-100 font-mono">{c.upi_id ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Deposit Range</p>
                    <p className="font-semibold text-gray-100">
                      ₹{(c.minimum_deposit / 100).toFixed(2)} - ₹{(c.maximum_deposit / 100).toFixed(2)}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-gray-400">Instructions</p>
                    <p className="text-gray-300 mt-1 whitespace-pre-wrap">{c.deposit_instructions || 'None'}</p>
                  </div>
                </div>
                <div className="flex flex-col items-center justify-center border border-gray-700 rounded-xl p-4 bg-gray-800">
                  <p className="text-gray-400 text-xs mb-2">QR Code Preview</p>
                  {c.qr_code_reference ? (
                    <img
                      src={`${API_BASE_URL.replace(/\/api\/v1\/?$/, '')}${c.qr_code_reference}`}
                      alt="QR Code"
                      className="max-h-32 object-contain"
                    />
                  ) : (
                    <p className="text-gray-500 italic text-xs">No QR code uploaded</p>
                  )}
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-700 flex space-x-3">
                <button
                  onClick={() => handleEdit(c)}
                  className="bg-cyan-600/30 hover:bg-cyan-600 text-cyan-200 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteConfig(c.id)}
                  className="bg-red-600/30 hover:bg-red-600 text-red-200 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
