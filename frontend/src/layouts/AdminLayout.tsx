import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { authService } from '../services/auth';
import { CasinoLogo } from '../components/common/CasinoLogo';

const adminNav = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/admin/catalog', label: 'Games Catalog', icon: '🎮' },
  { to: '/admin/games', label: 'Live Game Control', icon: '🎲' },
  { to: '/admin/users', label: 'User Management', icon: '👥' },
  { to: '/admin/transactions', label: 'Transactions', icon: '💸' },
  { to: '/admin/deposits', label: 'Deposits', icon: '📥' },
  { to: '/admin/withdrawals', label: 'Withdrawals', icon: '📤' },
  { to: '/admin/payment-settings', label: 'Payment Settings', icon: '⚙️' },
  { to: '/admin/fees', label: 'Fee Configuration', icon: '🏷️' },
];

export function AdminLayout() {
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();
  const handleLogout = async () => { await authService.logout(); setUser(null); navigate('/login'); };

  return (
    <div className="min-h-screen flex bg-dark-950">
      <aside className="w-64 bg-dark-900 border-r border-dark-700 flex flex-col">
        <div className="p-6 border-b border-dark-700">
          <CasinoLogo size="md" subtitleText="ADMIN PANEL" />
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {adminNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive ? 'bg-dark-800 text-white' : 'text-gray-400 hover:bg-dark-800 hover:text-gray-100'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-dark-700">
          <div className="px-2 mb-2 text-xs font-bold text-gold-400 uppercase tracking-wider">{user?.role}</div>
          <button onClick={handleLogout} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-400 hover:text-danger hover:bg-danger/10 rounded-lg transition-all duration-200">↩ Sign Out</button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-8"><Outlet /></div>
      </main>
    </div>
  );
}
