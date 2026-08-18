import { useEffect, useState, useRef } from 'react';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Loader } from '../../components/common/Loader';
import api from '../../services/api';

interface PaymentConfig {
  id: string; provider: string; display_name: string; upi_id: string | null;
  qr_code_reference: string | null; minimum_deposit: number; maximum_deposit: number; enabled: boolean; deposit_instructions: string | null;
}

export function AdminPaymentSettingsPage() {
  const [configs, setConfigs] = useState<PaymentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  
  const [formData, setFormData] = useState<Partial<PaymentConfig>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const fetchConfigs = () => {
    setLoading(true);
    api.get('/admin/payment-settings')
       .then(r => setConfigs(r.data.data ?? []))
       .catch(e => setErrorMsg('Failed to load configs: ' + e.message))
       .finally(() => setLoading(false));
  };

  useEffect(() => { fetchConfigs(); }, []);

  const handleEdit = (c: PaymentConfig) => {
    setEditingId(c.id);
    setIsCreating(false);
    setFormData({
      provider: c.provider, display_name: c.display_name, upi_id: c.upi_id,
      minimum_deposit: c.minimum_deposit / 100, maximum_deposit: c.maximum_deposit / 100,
      enabled: c.enabled, deposit_instructions: c.deposit_instructions
    });
    setQrFile(null);
    setErrorMsg('');
  };

  const handleCreateNew = () => {
    setIsCreating(true);
    setEditingId(null);
    setFormData({
      provider: 'upi', display_name: 'UPI Payment', upi_id: '',
      minimum_deposit: 100, maximum_deposit: 10000, enabled: false, deposit_instructions: 'Please transfer exactly the amount requested to the UPI ID above.'
    });
    setQrFile(null);
    setErrorMsg('');
  };

  const cancelEdit = () => {
    setEditingId(null); setIsCreating(false); setQrFile(null); setErrorMsg('');
  };

  const saveConfig = async () => {
    try {
      const payload = {
        provider: formData.provider,
        display_name: formData.display_name,
        upi_id: formData.upi_id || null,
        minimum_deposit: (formData.minimum_deposit || 0) * 100,
        maximum_deposit: (formData.maximum_deposit || 0) * 100,
        enabled: formData.enabled || false,
        deposit_instructions: formData.deposit_instructions || null
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
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }

      fetchConfigs();
      cancelEdit();
    } catch (e: any) {
      setErrorMsg(e.response?.data?.error?.message || e.message);
    }
  };

  const deleteConfig = async (id: string) => {
    if (!confirm('Are you sure you want to delete this configuration?')) return;
    try {
      await api.delete(`/admin/payment-settings/${id}`);
      fetchConfigs();
    } catch (e: any) {
      setErrorMsg(e.response?.data?.error?.message || e.message);
    }
  };

  if (loading && !configs.length) return <Loader />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold text-white">Payment Settings</h1>
          <p className="text-gray-400 text-sm">Provider secrets are managed server-side only. Manage safe config below.</p>
        </div>
        {!isCreating && !editingId && (
          <button onClick={handleCreateNew} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded">
            Add Configuration
          </button>
        )}
      </div>

      {errorMsg && <div className="bg-red-900/50 text-red-200 p-3 rounded">{errorMsg}</div>}

      {(isCreating || editingId) && (
        <Card title={isCreating ? "New Configuration" : "Edit Configuration"}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400">Payment Method (Internal Code)</label>
                <input disabled={!isCreating} type="text" className="mt-1 w-full bg-gray-800 border border-gray-700 rounded p-2 text-white" 
                  value={formData.provider || ''} onChange={e => setFormData({...formData, provider: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm text-gray-400">Display Name</label>
                <input type="text" className="mt-1 w-full bg-gray-800 border border-gray-700 rounded p-2 text-white" 
                  value={formData.display_name || ''} onChange={e => setFormData({...formData, display_name: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm text-gray-400">UPI ID</label>
                <input type="text" className="mt-1 w-full bg-gray-800 border border-gray-700 rounded p-2 text-white" 
                  value={formData.upi_id || ''} onChange={e => setFormData({...formData, upi_id: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm text-gray-400">Status</label>
                <div className="mt-2 flex items-center">
                  <input type="checkbox" className="mr-2" checked={formData.enabled || false} onChange={e => setFormData({...formData, enabled: e.target.checked})} />
                  <span className="text-white">Enabled</span>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400">Min Deposit (₹)</label>
                <input type="number" className="mt-1 w-full bg-gray-800 border border-gray-700 rounded p-2 text-white" 
                  value={formData.minimum_deposit || ''} onChange={e => setFormData({...formData, minimum_deposit: Number(e.target.value)})} />
              </div>
              <div>
                <label className="block text-sm text-gray-400">Max Deposit (₹)</label>
                <input type="number" className="mt-1 w-full bg-gray-800 border border-gray-700 rounded p-2 text-white" 
                  value={formData.maximum_deposit || ''} onChange={e => setFormData({...formData, maximum_deposit: Number(e.target.value)})} />
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-gray-400">Deposit Instructions</label>
                <textarea className="mt-1 w-full bg-gray-800 border border-gray-700 rounded p-2 text-white h-24" 
                  value={formData.deposit_instructions || ''} onChange={e => setFormData({...formData, deposit_instructions: e.target.value})} />
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-gray-400">QR Code Image</label>
                <input type="file" ref={fileInputRef} accept=".png,.jpg,.jpeg,.webp" className="mt-1 block w-full text-white" 
                  onChange={e => setQrFile(e.target.files ? e.target.files[0] : null)} />
                {!qrFile && editingId && configs.find(c => c.id === editingId)?.qr_code_reference && (
                  <p className="text-xs text-gray-500 mt-1">Leave empty to keep current QR code.</p>
                )}
              </div>
            </div>
            <div className="flex space-x-3 pt-4 border-t border-gray-700">
              <button onClick={saveConfig} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded">Save</button>
              <button onClick={cancelEdit} className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded">Cancel</button>
            </div>
          </div>
        </Card>
      )}

      {!isCreating && !editingId && configs.length === 0 && (
        <Card><p className="text-gray-500 text-center py-8">No payment providers configured yet.</p></Card>
      )}

      {!isCreating && !editingId && configs.map(c => (
        <Card key={c.id} title={c.display_name}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-gray-400">Payment Method</p><p className="font-semibold text-gray-100">UPI</p></div>
              <div><p className="text-gray-400">Status</p><Badge label={c.enabled ? 'Enabled' : 'Disabled'} variant={c.enabled ? 'success' : 'danger'} /></div>
              <div><p className="text-gray-400">UPI ID</p><p className="font-semibold text-gray-100">{c.upi_id ?? '—'}</p></div>
              <div><p className="text-gray-400">Deposit Range</p><p className="font-semibold text-gray-100">₹{(c.minimum_deposit/100).toFixed(2)} - ₹{(c.maximum_deposit/100).toFixed(2)}</p></div>
              <div className="col-span-2"><p className="text-gray-400">Instructions</p><p className="text-gray-300 mt-1 whitespace-pre-wrap">{c.deposit_instructions || 'None'}</p></div>
            </div>
            <div className="flex flex-col items-center justify-center border border-gray-700 rounded-lg p-4 bg-gray-800">
              <p className="text-gray-400 text-sm mb-2">QR Code Preview</p>
              {c.qr_code_reference ? (
                <img src={`http://localhost:8000${c.qr_code_reference}`} alt="QR Code" className="max-h-32 object-contain" />
              ) : (
                <p className="text-gray-500 italic text-sm">No QR code uploaded</p>
              )}
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-700 flex space-x-3">
            <button onClick={() => handleEdit(c)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded text-sm">Edit</button>
            <button onClick={() => deleteConfig(c.id)} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm">Delete</button>
          </div>
        </Card>
      ))}
    </div>
  );
}
