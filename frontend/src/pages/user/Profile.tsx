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
    <div className="profile-page w-full max-w-4xl mx-auto space-y-4">
      <div className="profile-header flex items-center justify-between">
        <h1 className="profile-title text-xl sm:text-2xl font-extrabold text-white">My Profile</h1>
        <span className="profile-id text-xs text-gray-400 font-mono">ID: {user?.id?.slice(0, 8)}...</span>
      </div>

      <Card className="profile-card">
        <div className="profile-inner-grid grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* Left Column: Avatar & Summary */}
          <div className="profile-summary md:col-span-4 flex flex-col items-center justify-center p-4 bg-dark-800/60 rounded-2xl border border-dark-700 text-center">
            <div className="profile-avatar w-20 h-20 bg-gradient-to-br from-brand-500 to-gold-500 rounded-full flex items-center justify-center text-3xl font-extrabold text-white shadow-xl shadow-brand-500/20 mb-3 border-2 border-white/20">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <h3 className="profile-name-text text-base font-extrabold text-white truncate max-w-full">{user?.name}</h3>
            <p className="profile-email-text text-xs text-gray-400 font-mono mt-0.5 truncate max-w-full">{user?.email}</p>

            <div className="profile-badges flex flex-wrap items-center justify-center gap-1.5 mt-3">
              <Badge label={user?.role ?? 'USER'} variant="info" />
              <Badge label={user?.status ?? 'ACTIVE'} variant={user?.status === 'ACTIVE' ? 'success' : 'danger'} />
            </div>
          </div>

          {/* Right Column: Account Details & Editing */}
          <div className="profile-form md:col-span-8 space-y-3.5">
            {msg && <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs font-semibold">{msg}</div>}
            {err && <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-semibold">{err}</div>}

            <div className="profile-fields-row grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input id="profile-name" label="Full Name" value={name} onChange={e => setName(e.target.value)} className="profile-input-field" />
              <Input id="profile-username" label="Username" value={username} onChange={e => setUsername(e.target.value)} className="profile-input-field" />
            </div>

            <Input id="profile-email" label="Email Address" value={user?.email} disabled className="profile-input-field opacity-50 cursor-not-allowed font-mono text-xs" />

            <p className="text-[11px] text-gray-500">Email, Role, and Status are managed by administrators.</p>

            <div className="profile-save-container pt-1">
              <Button onClick={save} loading={saving} className="profile-save-btn w-full sm:w-auto px-6 py-2.5 text-xs font-extrabold">Save Profile Changes</Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
