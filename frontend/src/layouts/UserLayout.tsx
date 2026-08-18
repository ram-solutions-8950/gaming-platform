import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { authService } from '../services/auth';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '⌂' },
  { to: '/wallet', label: 'Wallet', icon: '◈' },
  { to: '/deposit', label: 'Deposit', icon: '⬇' },
  { to: '/transactions', label: 'Transactions', icon: '⇄' },
  { to: '/profile', label: 'Profile', icon: '◌' },
];

export function UserLayout() {
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await authService.logout();
    setUser(null);
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex bg-dark-950">
      <aside className="w-64 bg-dark-900 border-r border-dark-700 flex flex-col">
        <div className="p-6 border-b border-dark-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-linear-to-br from-brand-500 to-gold-500 rounded-lg flex items-center justify-center text-lg text-white">G</div>
            <span className="text-xl font-extrabold text-white">GameStack</span>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
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
          <div className="flex items-center gap-3 mb-3 px-2">
            <div className="w-9 h-9 bg-dark-700 rounded-full flex items-center justify-center text-sm font-bold text-brand-400">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-100 truncate">{user?.name}</p>
              <p className="text-xs text-gray-500 truncate">{user?.role}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-400 hover:text-danger hover:bg-danger/10 rounded-lg transition-all duration-200">
            ↩ Sign Out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
