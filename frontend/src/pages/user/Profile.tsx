import { useState, useEffect, useRef } from 'react';
import { Camera } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { Card } from '../../components/common/Card';
import { Input } from '../../components/common/Input';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { referralService, type ReferralStats, type ReferralHistoryItem } from '../../services/referral';
import api from '../../services/api';

const AVATAR_PRESETS = ['👑', '🐉', '🐅', '🦁', '💎', '🃏', '🎲', '🎯'];

export function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState(user?.name ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [refStats, setRefStats] = useState<ReferralStats | null>(null);
  const [refHistory, setRefHistory] = useState<ReferralHistoryItem[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    referralService.getStats().then(setRefStats).catch(() => {});
    referralService.getHistory().then(setRefHistory).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true); setMsg(''); setErr('');
    try {
      const res = await api.patch('/users/me', { name, username });
      if (res.data.success) { setUser(res.data.data); setMsg('Profile updated!'); }
      else setErr(res.data.error?.message || 'Failed');
    } catch (e: any) { setErr(e.response?.data?.error?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErr('Please select a valid image file (JPEG, PNG, WebP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErr('Image file must be less than 5MB.');
      return;
    }

    setUploading(true);
    setErr('');
    setMsg('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/users/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data.success) {
        setUser(res.data.data);
        setMsg('Profile photo updated successfully!');
      } else {
        setErr(res.data.error?.message || 'Failed to upload photo');
      }
    } catch (err: any) {
      setErr(err.response?.data?.error?.message || 'Failed to upload photo');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePresetSelect = async (preset: string) => {
    setUploading(true);
    setErr('');
    setMsg('');
    try {
      const res = await api.patch('/users/me', { avatar_url: preset });
      if (res.data.success) {
        setUser(res.data.data);
        setMsg('Profile avatar updated!');
      } else {
        setErr(res.data.error?.message || 'Failed to update avatar');
      }
    } catch (err: any) {
      setErr(err.response?.data?.error?.message || 'Failed to update avatar');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    setUploading(true);
    setErr('');
    setMsg('');
    try {
      const res = await api.patch('/users/me', { avatar_url: '' });
      if (res.data.success) {
        setUser(res.data.data);
        setMsg('Profile photo removed.');
      }
    } catch (err: any) {
      setErr('Failed to remove photo');
    } finally {
      setUploading(false);
    }
  };

  const referralLink = refStats?.referral_code
    ? `${window.location.origin}/signup?ref=${refStats.referral_code}`
    : `${window.location.origin}/signup`;

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
            {/* Avatar with Camera Overlay */}
            <div className="relative group mb-3">
              <div className="profile-avatar w-24 h-24 bg-gradient-to-br from-brand-500 via-purple-600 to-gold-500 rounded-full flex items-center justify-center text-4xl font-extrabold text-white shadow-xl shadow-brand-500/20 border-2 border-white/30 overflow-hidden">
                {user?.avatar_url && (user.avatar_url.startsWith('http') || user.avatar_url.startsWith('/uploads')) ? (
                  <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" />
                ) : user?.avatar_url ? (
                  <span className="text-4xl leading-none">{user.avatar_url}</span>
                ) : (
                  user?.name?.charAt(0).toUpperCase() || 'U'
                )}
              </div>

              {/* Upload trigger button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute bottom-0 right-0 p-2 rounded-full bg-gold-500 hover:bg-gold-400 text-black shadow-lg border-2 border-dark-900 cursor-pointer active:scale-95 transition"
                title="Upload Profile Photo"
                aria-label="Upload Profile Photo"
              >
                <Camera size={14} className="font-bold" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>

            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-[11px] font-bold text-gold-400 hover:text-gold-300 underline cursor-pointer"
              >
                {uploading ? 'Uploading...' : 'Change Photo'}
              </button>
              {user?.avatar_url && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  disabled={uploading}
                  className="text-[11px] font-bold text-rose-400 hover:text-rose-300 underline cursor-pointer"
                >
                  Remove
                </button>
              )}
            </div>

            {/* Casino Avatar Presets */}
            <div className="w-full pt-2 border-t border-dark-700/60 mt-1 mb-3">
              <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block mb-1.5">
                Choose VIP Avatar
              </span>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {AVATAR_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handlePresetSelect(p)}
                    disabled={uploading}
                    className={`w-7 h-7 rounded-lg bg-dark-900 border flex items-center justify-center text-sm cursor-pointer hover:scale-110 active:scale-95 transition ${
                      user?.avatar_url === p
                        ? 'border-gold-400 bg-gold-500/20 shadow-md shadow-gold-500/30'
                        : 'border-dark-700 hover:border-gray-500'
                    }`}
                    title={`Select ${p}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
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

      {/* Refer & Earn Section */}
      <Card title="🎁 Refer & Earn Rewards" className="refer-earn-card">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-dark-800/80 border border-dark-700 p-3 rounded-xl text-center">
              <span className="text-gray-400 text-xs font-medium">Earn Per Friend</span>
              <div className="text-xl font-extrabold text-gold-400 mt-1">₹{refStats?.reward_amount ?? 100}</div>
            </div>
            <div className="bg-dark-800/80 border border-dark-700 p-3 rounded-xl text-center">
              <span className="text-gray-400 text-xs font-medium">Successful Referrals</span>
              <div className="text-xl font-extrabold text-emerald-400 mt-1">{refStats?.successful_referrals ?? 0}</div>
            </div>
            <div className="bg-dark-800/80 border border-dark-700 p-3 rounded-xl text-center">
              <span className="text-gray-400 text-xs font-medium">Total Rewards Earned</span>
              <div className="text-xl font-extrabold text-brand-400 mt-1">₹{(refStats?.total_earnings ?? 0).toFixed(2)}</div>
            </div>
          </div>

          {refStats?.referral_code && (
            <div className="p-3 bg-gradient-to-r from-gold-500/10 via-dark-800/80 to-gold-500/10 border border-gold-500/30 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex flex-col text-center sm:text-left">
                <span className="text-xs text-gray-400">Your Referral Code</span>
                <span className="text-lg font-black text-gold-400 font-mono tracking-wider">{refStats.referral_code}</span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  readOnly
                  value={referralLink}
                  className="bg-dark-900 border border-dark-700 px-3 py-2 rounded-lg text-xs font-mono text-gray-300 flex-1 sm:w-64 select-all"
                />
                <Button onClick={copyLink} className="text-xs px-4 py-2 bg-gold-500 hover:bg-gold-400 text-black font-extrabold shrink-0">
                  {copied ? '✓ Copied' : 'Copy Link'}
                </Button>
              </div>
            </div>
          )}

          {/* Referral History */}
          {refHistory.length > 0 && (
            <div className="pt-2">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Referral History ({refHistory.length})</h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {refHistory.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 bg-dark-800/40 rounded-lg border border-dark-700/60 text-xs">
                    <div>
                      <span className="font-bold text-white mr-2">{item.name || item.username}</span>
                      <span className="text-[10px] text-gray-400 font-mono">@{item.username}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${item.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'}`}>
                        {item.status === 'COMPLETED' ? `+₹${item.reward_amount.toFixed(0)} Rewarded` : 'Pending Deposit'}
                      </span>
                      <span className="text-[10px] text-gray-500">{new Date(item.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
