import { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Card } from '../../components/common/Card';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import api from '../../services/api';

export function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const [name, setName] = useState(user?.name ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const save = async () => {
    setSaving(true); setMsg(''); setErr('');
    try {
      const res = await api.patch('/users/me', { name, username });
      if (res.data.success) { setUser(res.data.data); setMsg('Profile updated!'); }
      else setErr(res.data.error?.message || 'Failed');
    } catch (e: any) { setErr(e.response?.data?.error?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-3xl font-extrabold text-white">Profile</h1>
      <Card>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 bg-linear-to-br from-brand-500 to-gold-500 rounded-full flex items-center justify-center text-2xl font-bold text-white">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">{user?.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge label={user?.role ?? ''} variant="info" />
              <Badge label={user?.status ?? ''} variant={user?.status === 'ACTIVE' ? 'success' : 'danger'} />
            </div>
          </div>
        </div>
        <div className="space-y-4">
          {msg && <div className="p-3 bg-success/10 border border-success/20 rounded-lg text-success text-sm">{msg}</div>}
          {err && <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg text-danger text-sm">{err}</div>}
          <Input id="profile-name" label="Full Name" value={name} onChange={e => setName(e.target.value)} />
          <Input id="profile-username" label="Username" value={username} onChange={e => setUsername(e.target.value)} />
          <Input id="profile-email" label="Email" value={user?.email} disabled className="opacity-50 cursor-not-allowed" />
          <p className="text-xs text-gray-500">Email cannot be changed. Role and status are managed by administrators.</p>
          <Button onClick={save} loading={saving}>Save Changes</Button>
        </div>
      </Card>
    </div>
  );
}
