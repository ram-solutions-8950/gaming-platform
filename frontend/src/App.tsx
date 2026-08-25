import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useState, useEffect } from 'react';
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
import { DepositPage } from './pages/user/Deposit';
import { WithdrawalPage } from './pages/user/Withdrawal';
import { GamePlayPage } from './pages/user/GamePlay';
import { DragonTigerPage } from './pages/user/DragonTiger';
import { AndarBaharPage } from './pages/user/AndarBahar';
import { RummyPage } from './pages/user/Rummy';
import { TeenPatti } from './pages/user/TeenPatti';
import { Ludo } from './pages/user/Ludo';
import { AviatorPage } from './pages/user/Aviator';
import { PokerPage } from './pages/user/Poker';
import { RoulettePage } from './pages/user/Roulette';
import { ChickenRoadPage } from './pages/user/ChickenRoad';
import { Triple777Page } from './pages/user/Triple777';
import { GameCatalogPage } from './pages/user/GameCatalog';
import { AdminDashboardPage } from './pages/admin/AdminDashboard';
import { AdminUsersPage } from './pages/admin/AdminUsers';
import { AdminTransactionsPage } from './pages/admin/AdminTransactions';
import { AdminDepositsPage } from './pages/admin/AdminDeposits';
import { AdminWithdrawalsPage } from './pages/admin/AdminWithdrawals';
import { AdminPaymentSettingsPage } from './pages/admin/AdminPaymentSettings';
import { AdminFeesPage } from './pages/admin/Fees';
import { AdminGameControlPage } from './pages/admin/AdminGameControl';
import { AdminGamesPage } from './pages/admin/Games';
import { LoadingScreen } from './components/common/LoadingScreen';
import { useAuthStore } from './store/authStore';
import { authService } from './services/auth';
import { soundManager } from './services/soundManager';

function ProtectedRoute({ adminOnly = false }: { adminOnly?: boolean }) {
  const { user, isLoading } = useAuthStore();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

function App() {
  const { user, setUser, isLoading, setLoading } = useAuthStore();
  const [isSplashDone, setIsSplashDone] = useState(false);

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

  useEffect(() => {
    const handleFirstInteraction = () => {
      soundManager.init();
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };
    document.addEventListener('click', handleFirstInteraction);
    document.addEventListener('keydown', handleFirstInteraction);
    
    return () => {
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      soundManager.stopMusic();
    }
  }, [user]);

  return (
    <>
      {!isSplashDone && (
        <LoadingScreen
          isReady={!isLoading}
          minDurationMs={2400}
          onFinish={() => setIsSplashDone(true)}
        />
      )}
      <BrowserRouter>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute />}>
          {/* Fullscreen games outside the dashboard layout */}
          <Route path="/games/dragon-tiger" element={<DragonTigerPage />} />
          <Route path="/games/andar-bahar" element={<AndarBaharPage />} />
          <Route path="/games/rummy" element={<RummyPage />} />
          <Route path="/games/rummy/:tableId" element={<RummyPage />} />
          <Route path="/games/teen-patti" element={<TeenPatti />} />
          <Route path="/games/teen-patti/:tableId" element={<TeenPatti />} />
          <Route path="/games/aviator" element={<AviatorPage />} />
          <Route path="/games/poker" element={<PokerPage />} />
          <Route path="/games/poker/:tableId" element={<PokerPage />} />
          <Route path="/games/roulette" element={<RoulettePage />} />
          <Route path="/games/chicken-road" element={<ChickenRoadPage />} />
          <Route path="/games/triple-777" element={<Triple777Page />} />
          <Route element={<UserLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/games-catalog" element={<GameCatalogPage />} />
            <Route path="/games" element={<GamePlayPage />} />
            <Route path="/games/colour-prediction" element={<GamePlayPage />} />
            <Route path="/games/ludo" element={<Ludo />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/deposit" element={<DepositPage />} />
            <Route path="/withdrawal" element={<WithdrawalPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute adminOnly />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
            <Route path="/admin/catalog" element={<AdminGamesPage />} />
            <Route path="/admin/games" element={<AdminGameControlPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/transactions" element={<AdminTransactionsPage />} />
            <Route path="/admin/deposits" element={<AdminDepositsPage />} />
            <Route path="/admin/withdrawals" element={<AdminWithdrawalsPage />} />
            <Route path="/admin/payment-settings" element={<AdminPaymentSettingsPage />} />
            <Route path="/admin/fees" element={<AdminFeesPage />} />
          </Route>
        </Route>

        <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
        <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
    </>
  );
}

export default App;
