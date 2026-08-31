import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { authService } from '../services/auth';
import { GlitterRain } from '../components/common/GlitterRain';
import { useEffect, useState } from 'react';
import { walletService } from '../services/wallet';
import type { Wallet } from '../types';
import { LobbyHeader } from '../components/lobby/LobbyHeader';
import { LobbyBottomNav } from '../components/lobby/LobbyBottomNav';
import { CasinoLogo } from '../components/common/CasinoLogo';
import { useRewardStore } from '../store/rewardStore';
import { Reward7DaysModal } from '../components/modals/Reward7DaysModal';
import { LuckySpinModal } from '../components/modals/LuckySpinModal';
import { BonusModal } from '../components/modals/BonusModal';
import { JackpotModal } from '../components/modals/JackpotModal';
import { VipBonusModal } from '../components/modals/VipBonusModal';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/games-catalog', label: 'Games', icon: '🎮' },
  { to: '/wallet', label: 'Wallet', icon: '👛' },
  { to: '/profile', label: 'Profile', icon: '👤' },
];

export function UserLayout() {
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const { activeModal, openModal, closeModal } = useRewardStore();

  const isDashboard = location.pathname === '/dashboard';
  const isLudo = location.pathname === '/games/ludo';

  const refreshWallet = () => {
    walletService.getWallet().then(setWallet).catch(() => {});
  };

  useEffect(() => {
    refreshWallet();
  }, []);

  const handleLogout = async () => {
    await authService.logout();
    setUser(null);
    navigate('/login');
  };

  return (
    <div className="h-dvh max-h-dvh min-h-dvh flex flex-col lg:flex-row bg-gradient-to-br from-[#2c085c] via-[#1b053c] to-[#0c021e] relative overflow-x-hidden">
      <GlitterRain />

      {/* ─── DESKTOP SIDEBAR (Large Desktop only) ─── */}
      <aside className="hidden 2xl:flex w-64 shrink-0 bg-dark-900 border-r border-dark-700 flex-col z-10 shadow-2xl">
        <div className="p-6 border-b border-dark-700">
          <CasinoLogo size="md" />
        </div>

        <div className="p-4">
          <div className="bg-dark-800 rounded-xl p-4 border border-dark-700 shadow-inner">
             <p className="text-xs text-gray-400 mb-1">Total Balance</p>
             <div className="flex items-center justify-between">
               <span className="text-2xl font-extrabold text-gold-400">₹{wallet?.balance_inr ?? '0.00'}</span>
               <button onClick={() => navigate('/deposit')} className="bg-gradient-to-br from-green-500 to-green-600 text-white text-xs px-4 py-1.5 rounded-lg font-bold shadow-md shadow-green-500/20 transition-transform active:scale-95">ADD</button>
             </div>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive ? 'bg-gradient-to-r from-brand-500/20 to-transparent text-brand-400 border-l-2 border-brand-500' : 'text-gray-400 hover:bg-dark-800 hover:text-gray-100'
                }`
              }
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
          <NavLink to="/deposit" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${isActive ? 'bg-gradient-to-r from-brand-500/20 to-transparent text-brand-400 border-l-2 border-brand-500' : 'text-gray-400 hover:bg-dark-800 hover:text-gray-100'}`}>
            <span className="text-lg">📥</span> Deposit
          </NavLink>
          <NavLink to="/withdrawal" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${isActive ? 'bg-gradient-to-r from-brand-500/20 to-transparent text-brand-400 border-l-2 border-brand-500' : 'text-gray-400 hover:bg-dark-800 hover:text-gray-100'}`}>
            <span className="text-lg">📤</span> Withdrawal
          </NavLink>
          <NavLink to="/transactions" className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${isActive ? 'bg-gradient-to-r from-brand-500/20 to-transparent text-brand-400 border-l-2 border-brand-500' : 'text-gray-400 hover:bg-dark-800 hover:text-gray-100'}`}>
            <span className="text-lg">💸</span> Transactions
          </NavLink>
          <button
            type="button"
            onClick={() => {
              if (window.location.pathname !== '/dashboard') {
                navigate('/dashboard');
                setTimeout(() => window.dispatchEvent(new CustomEvent('open-refer-popup')), 100);
              } else {
                window.dispatchEvent(new CustomEvent('open-refer-popup'));
              }
            }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-400 hover:bg-dark-800 hover:text-gold-400 transition-all duration-200"
          >
            <span className="text-lg">🎁</span> Refer & Earn
          </button>
        </nav>

        <div className="p-4 border-t border-dark-700">
          <div className="flex items-center gap-3 mb-3 px-2">
            <div className="w-9 h-9 bg-gradient-to-br from-brand-500 to-gold-500 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-inner">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-100 truncate">{user?.name}</p>
              <p className="text-xs text-brand-400 truncate font-medium">{user?.role}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-danger bg-danger/10 hover:bg-danger/20 rounded-xl transition-all duration-200">
            Sign Out
          </button>
        </div>
      </aside>

      {/* ─── MOBILE SHELL & MAIN CONTENT ─── */}
      <div className={`flex-1 min-w-0 min-h-0 flex flex-col overflow-x-hidden z-10 relative h-dvh max-h-dvh ${isLudo ? 'is-ludo-page' : ''}`}>
        {/* Mobile Header */}
        <div className="2xl:hidden shrink-0 z-30">
          <LobbyHeader user={user} wallet={wallet} />
        </div>

        <main className={
          isDashboard || isLudo
            ? "flex-1 min-h-0 min-w-0 relative overflow-hidden flex flex-col"
            : "flex-1 min-h-0 min-w-0 relative overflow-y-auto overflow-x-hidden"
        }>
          <div className={
            isDashboard || isLudo
              ? "h-full w-full p-0 flex flex-col flex-1 min-h-0"
              : "min-h-full w-full max-w-7xl mx-auto p-3 sm:p-5 lg:p-8"
          }>
            <Outlet />
          </div>
        </main>

        {/* Mobile Bottom Navigation */}
        <div className="2xl:hidden shrink-0 z-40 relative">
          <LobbyBottomNav />
        </div>
      </div>

      {/* ─── Global Reward Modals ─── */}
      {activeModal === '7days' && (
        <Reward7DaysModal
          onClose={closeModal}
          onWalletRefresh={refreshWallet}
          onOpenLuckySpin={() => openModal('lucky_spin')}
        />
      )}
      {activeModal === 'lucky_spin' && (
        <LuckySpinModal
          onClose={closeModal}
          onWalletRefresh={refreshWallet}
          onOpen7Days={() => openModal('7days')}
        />
      )}
      {activeModal === 'bonus' && (
        <BonusModal
          onClose={closeModal}
          onWalletRefresh={refreshWallet}
        />
      )}
      {activeModal === 'jackpot' && (
        <JackpotModal
          onClose={closeModal}
          onPlayGame={(path) => {
            closeModal();
            navigate(path);
          }}
        />
      )}
      {activeModal === 'vip' && (
        <VipBonusModal
          onClose={closeModal}
          onWalletRefresh={refreshWallet}
          onDeposit={() => {
            closeModal();
            navigate('/deposit');
          }}
        />
      )}
    </div>
  );
}
