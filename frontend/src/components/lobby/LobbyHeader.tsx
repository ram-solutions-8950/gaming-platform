import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { User, Wallet } from '../../types';
import { soundManager } from '../../services/soundManager';
import { authService } from '../../services/auth';
import { useAuthStore } from '../../store/authStore';

interface Props {
  user: User | null;
  wallet: Wallet | null;
}

const headerShortcuts = [
  { label: 'Bonus', emoji: '🎁' },
  { label: 'Free', emoji: '🎯' },
  { label: '7-Days', emoji: '📅' },
];

export const LobbyHeader: React.FC<Props> = ({ user, wallet }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuthStore();
  const isDashboard = location.pathname === '/dashboard';
  const [isMuted, setIsMuted] = useState(() => soundManager.isMuted());

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch {}
    setUser(null);
    navigate('/login');
  };

  return (
    <header
      className="lobby-header flex items-center justify-between px-2 sm:px-3 py-1 bg-gradient-to-r from-[#2d0c61] via-[#1e0744] to-[#12032b] border-b border-[#a855f7]/40 shadow-xl select-none shrink-0 min-h-[40px] z-30 relative overflow-x-auto scrollbar-hide"
      style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 4px)', paddingLeft: 'max(env(safe-area-inset-left, 0px), 8px)', paddingRight: 'max(env(safe-area-inset-right, 0px), 8px)' }}
    >
      {/* Left: Profile / Back Button / ID Logout */}
      <div className="flex items-center gap-1.5 min-w-0">
        {!isDashboard && (
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1 bg-purple-950/80 hover:bg-purple-900/90 text-white font-extrabold text-[10px] px-2 py-1 rounded-lg border border-purple-400/40 transition shadow-md shrink-0 active:scale-95 cursor-pointer"
            title="Back to Dashboard"
          >
            ← Home
          </button>
        )}
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 via-purple-500 to-amber-500 flex items-center justify-center text-xs font-black text-white shrink-0 ring-1.5 ring-amber-400/90 shadow-md">
          {user?.name?.charAt(0).toUpperCase() || 'U'}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-black text-white truncate max-w-[85px] tracking-wide leading-none">{user?.name || 'Player'}</span>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[9px] text-purple-300 font-semibold leading-none">ID: {user?.id?.slice(0, 8) || '---'}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="text-[8px] bg-red-600/90 hover:bg-red-500 text-white font-black px-1.5 py-0.5 rounded border border-red-400/60 shadow-sm active:scale-95 transition cursor-pointer flex items-center gap-0.5"
              title="Logout this Account"
            >
              🚪 Exit
            </button>
          </div>
        </div>
      </div>

      {/* Center: Wallet + Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="bg-[#0f0426]/90 border border-amber-400/60 px-2 py-0.5 rounded-full flex items-center gap-1 text-[11px] font-black shadow-inner">
          <span className="w-3.5 h-3.5 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 flex items-center justify-center text-[9px] text-amber-950 font-black shadow-sm">₹</span>
          <span className="text-white font-mono text-[11px]">{wallet?.balance_inr ?? '0.00'}</span>
        </div>
        <button
          type="button"
          className="bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-purple-950 font-black text-[10px] px-2.5 py-0.5 rounded-full shadow-md border border-yellow-200 active:scale-95 transition cursor-pointer"
          onClick={() => navigate('/deposit')}
        >
          ADD
        </button>
        <button
          type="button"
          className="bg-gradient-to-r from-emerald-500 via-green-600 to-emerald-700 hover:from-emerald-400 hover:to-green-500 text-white font-black text-[10px] px-2.5 py-0.5 rounded-full shadow-md border border-green-300/80 active:scale-95 transition cursor-pointer flex items-center gap-0.5"
          onClick={() => navigate('/withdrawal')}
        >
          <span className="w-3 h-3 rounded-full bg-white/20 flex items-center justify-center text-[8px]">₹</span>
          WITHDRAW
        </button>
      </div>

      {/* Right: Sound Toggle + Bonus, Free, 7-Days */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => {
            const nowMuted = soundManager.toggleMute();
            setIsMuted(nowMuted);
          }}
          className="flex items-center justify-center w-6 h-6 bg-purple-950/60 hover:bg-purple-900/80 rounded-full border border-purple-400/30 text-white active:scale-95 transition cursor-pointer shadow-sm"
          title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
        >
          <span className="text-xs">{isMuted ? '🔇' : '🔊'}</span>
        </button>
        {headerShortcuts.map((s) => (
          <button
            key={s.label}
            type="button"
            className="flex items-center gap-1 bg-purple-950/60 hover:bg-purple-900/80 px-2 py-0.5 rounded-full border border-purple-400/30 text-white active:scale-95 transition cursor-pointer shadow-sm"
          >
            <span className="text-xs">{s.emoji}</span>
            <span className="text-[9px] font-bold tracking-tight">{s.label}</span>
          </button>
        ))}
      </div>
    </header>
  );
};
