import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useEffect } from 'react';
import './index.css';
import { AuthLayout } from './layouts/AuthLayout';
import { PublicLayout } from './layouts/PublicLayout';
import { UserLayout } from './layouts/UserLayout';
import { AdminLayout } from './layouts/AdminLayout';
import { LoginPage } from './pages/auth/Login';
import { SignupPage } from './pages/auth/Signup';
import { DashboardPage } from './pages/user/Dashboard';
import { ProfilePage } from './pages/user/Profile';
import { WalletPage } from './pages/user/Wallet';
import { TransactionsPage } from './pages/user/Transactions';
import { AdminDashboardPage } from './pages/admin/AdminDashboard';
import { AdminUsersPage } from './pages/admin/AdminUsers';
import { AdminTransactionsPage } from './pages/admin/AdminTransactions';
import { AdminDepositsPage } from './pages/admin/AdminDeposits';
import { AdminWithdrawalsPage } from './pages/admin/AdminWithdrawals';
import { AdminPaymentSettingsPage } from './pages/admin/AdminPaymentSettings';
import { useAuthStore } from './store/authStore';
import { authService } from './services/auth';

function ProtectedRoute({ adminOnly = false }: { adminOnly?: boolean }) {
  const user = useAuthStore((state) => state.user);
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

function App() {
  const { user, setUser, isLoading, setLoading } = useAuthStore();

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    authService.me()
      .then((me) => setUser(me))
      .catch(() => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [setLoading, setUser]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-950 text-gray-100">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-dark-600 border-t-brand-500" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<UserLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute adminOnly />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/transactions" element={<AdminTransactionsPage />} />
            <Route path="/admin/deposits" element={<AdminDepositsPage />} />
            <Route path="/admin/withdrawals" element={<AdminWithdrawalsPage />} />
            <Route path="/admin/payment-settings" element={<AdminPaymentSettingsPage />} />
          </Route>
        </Route>

        <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
        <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
