import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, lazy, Suspense, type ComponentType } from 'react';
import './index.css';
import { setNativeLandscape } from './utils/nativeOrientation';
import { AuthLayout } from './layouts/AuthLayout';
import { PublicLayout } from './layouts/PublicLayout';
import { UserLayout } from './layouts/UserLayout';
import { AdminLayout } from './layouts/AdminLayout';
import { LoginPage } from './pages/auth/Login';
import { SignupPage } from './pages/auth/Signup';
import { DownloadPage } from './pages/Download';
import { DashboardPage } from './pages/user/Dashboard';
import { LoadingScreen } from './components/common/LoadingScreen';
import { useAuthStore } from './store/authStore';
import { authService } from './services/auth';
import { authStorage } from './services/authStorage';
import { soundManager } from './services/soundManager';
import { isNativePlatform } from './utils/platform';

// Shown while a page's code loads on its first visit: instant in the app,
// a moment on a slow web connection.
function PageLoading() {
  return (
    <div className="h-full w-full flex items-center justify-center bg-black">
      <div className="w-8 h-8 rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin" />
    </div>
  );
}

// Each page's code is loaded when the page is first opened, so opening one game
// doesn't download, parse and keep every other game (and the admin panel) in memory.
function lazyPage<M extends Record<string, unknown>>(load: () => Promise<M>, exportName: keyof M) {
  const Page = lazy(() => load().then((m) => ({ default: m[exportName] as ComponentType })));
  return function LazyPage() {
    return (
      <Suspense fallback={<PageLoading />}>
        <Page />
      </Suspense>
    );
  };
}

const ProfilePage = lazyPage(() => import('./pages/user/Profile'), 'ProfilePage');
const WalletPage = lazyPage(() => import('./pages/user/Wallet'), 'WalletPage');
const TransactionsPage = lazyPage(() => import('./pages/user/Transactions'), 'TransactionsPage');
const DepositPage = lazyPage(() => import('./pages/user/Deposit'), 'DepositPage');
const WithdrawalPage = lazyPage(() => import('./pages/user/Withdrawal'), 'WithdrawalPage');
const DragonTigerPage = lazyPage(() => import('./pages/user/DragonTiger'), 'DragonTigerPage');
const AndarBaharPage = lazyPage(() => import('./pages/user/AndarBahar'), 'AndarBaharPage');
const RummyPage = lazyPage(() => import('./pages/user/Rummy'), 'RummyPage');
const TeenPatti = lazyPage(() => import('./pages/user/TeenPatti'), 'TeenPatti');
const Ludo = lazyPage(() => import('./pages/user/Ludo'), 'Ludo');
const AviatorPage = lazyPage(() => import('./pages/user/Aviator'), 'AviatorPage');
const PokerPage = lazyPage(() => import('./pages/user/Poker'), 'PokerPage');
const RoulettePage = lazyPage(() => import('./pages/user/Roulette'), 'RoulettePage');
const ChickenRoadPage = lazyPage(() => import('./pages/user/ChickenRoad'), 'ChickenRoadPage');
const Triple777Page = lazyPage(() => import('./pages/user/Triple777'), 'Triple777Page');
const GameCatalogPage = lazyPage(() => import('./pages/user/GameCatalog'), 'GameCatalogPage');
const AdminDashboardPage = lazyPage(() => import('./pages/admin/AdminDashboard'), 'AdminDashboardPage');
const AdminUsersPage = lazyPage(() => import('./pages/admin/AdminUsers'), 'AdminUsersPage');
const AdminTransactionsPage = lazyPage(() => import('./pages/admin/AdminTransactions'), 'AdminTransactionsPage');
const AdminDepositsPage = lazyPage(() => import('./pages/admin/AdminDeposits'), 'AdminDepositsPage');
const AdminWithdrawalsPage = lazyPage(() => import('./pages/admin/AdminWithdrawals'), 'AdminWithdrawalsPage');
const AdminPaymentSettingsPage = lazyPage(() => import('./pages/admin/AdminPaymentSettings'), 'AdminPaymentSettingsPage');
const AdminFeesPage = lazyPage(() => import('./pages/admin/Fees'), 'AdminFeesPage');
const AdminGameControlPage = lazyPage(() => import('./pages/admin/AdminGameControl'), 'AdminGameControlPage');
const AdminGamesPage = lazyPage(() => import('./pages/admin/Games'), 'AdminGamesPage');

function ProtectedRoute({ adminOnly = false }: { adminOnly?: boolean }) {
  const { user, isLoading } = useAuthStore();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (isNativePlatform() && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')) {
    authStorage.clearTokens();
    return <Navigate to="/login" replace />;
  }
  if (adminOnly && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

function GlobalAndroidBackHandler() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleBackPressed = (): boolean => {
      // 1. If an active screen or game has its own handler (e.g. Ludo confirm modal), check it first
      if (typeof (window as any).__gameSpecificBackPressed === 'function') {
        try {
          const handled = (window as any).__gameSpecificBackPressed();
          if (handled) return true;
        } catch {}
      }

      // 2. Check current route
      const path = location.pathname.toLowerCase();
      const isHome = path === '/dashboard' || path === '/' || path === '';
      const isAuth = path === '/login' || path === '/signup';

      // If user is inside any game, catalog, wallet, profile, etc., navigate safely to dashboard
      if (!isHome && !isAuth) {
        setNativeLandscape().catch(() => {});
        navigate('/dashboard');
        return true; // Handled within app, DO NOT exit to Android home screen
      }

      // 3. User is already on Dashboard or Login -> permit system to minimize/exit
      return false;
    };

    (window as any).__onAndroidBackPressed = handleBackPressed;

    const handlePopState = (e: PopStateEvent) => {
      const path = window.location.pathname.toLowerCase();
      const isHome = path === '/dashboard' || path === '/' || path === '';
      const isAuth = path === '/login' || path === '/signup';
      if (!isHome && !isAuth) {
        e.preventDefault();
        setNativeLandscape().catch(() => {});
        navigate('/dashboard');
      }
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      delete (window as any).__onAndroidBackPressed;
      window.removeEventListener('popstate', handlePopState);
    };
  }, [navigate, location]);

  return null;
}

function App() {
  const { user, setUser, isLoading, setLoading } = useAuthStore();
  const [isSplashDone, setIsSplashDone] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    const restoreSession = async () => {
      // 1. First restore persisted authentication tokens and cached user
      const token = authStorage.getAccessToken();
      const refreshToken = authStorage.getRefreshToken();
      const cachedUser = authStorage.getCachedUser();

      if (!token && !refreshToken) {
        if (!isCancelled) {
          setUser(null);
          setLoading(false);
        }
        return;
      }

      // If cached user exists from a previous session, restore it immediately so ProtectedRoute
      // doesn't flash login while the network request is completing
      if (cachedUser && !isCancelled) {
        if (isNativePlatform() && cachedUser.role !== 'USER') {
          authStorage.clearTokens();
          setUser(null);
          setLoading(false);
          return;
        }
        setUser(cachedUser);
      }

      // 2. Validate/refresh session with backend
      try {
        const me = await authService.me();
        if (!isCancelled) {
          if (isNativePlatform() && me.role !== 'USER') {
            authStorage.clearTokens();
            setUser(null);
            setLoading(false);
            return;
          }
          setUser(me);
          setLoading(false);
        }
      } catch (err: any) {
        if (isCancelled) return;

        // If backend explicitly rejected the token with 401 or 403
        if (err.response && (err.response.status === 401 || err.response.status === 403)) {
          // Attempt silent token refresh using refreshToken
          if (refreshToken) {
            try {
              const refreshOk = await authService.refreshSession();
              if (refreshOk) {
                const refreshedMe = await authService.me();
                if (isNativePlatform() && refreshedMe.role !== 'USER') {
                  authStorage.clearTokens();
                  setUser(null);
                  setLoading(false);
                  return;
                }
                setUser(refreshedMe);
                setLoading(false);
                return;
              }
            } catch (refreshErr: any) {
              if (refreshErr.response && (refreshErr.response.status === 401 || refreshErr.response.status === 403)) {
                // Backend definitively confirmed the session is invalid
                authStorage.clearTokens();
                setUser(null);
                setLoading(false);
                return;
              }
            }
          }
          // Definitively invalid session
          authStorage.clearTokens();
          setUser(null);
          setLoading(false);
        } else {
          // Network error, timeout, server unreachable, or offline:
          // CRITICAL: DO NOT clear saved tokens! Keep session active
          console.warn('Network issue during session validation. Preserving authenticated state.');
          if (cachedUser) {
            setUser(cachedUser);
          } else if (token || refreshToken) {
            // Keep minimal user object so ProtectedRoute stays on protected content
            setUser({ id: 'persisted_user', name: 'Player' } as any);
          }
          setLoading(false);
        }
      }
    };

    restoreSession();

    return () => {
      isCancelled = true;
    };
  }, [setLoading, setUser]);

  const isDownloadPath = typeof window !== 'undefined' && window.location.pathname.toLowerCase().includes('download');
  const isAdminPath = typeof window !== 'undefined' && window.location.pathname.toLowerCase().startsWith('/admin');
  const isAuthPath = typeof window !== 'undefined' && (window.location.pathname.toLowerCase().includes('login') || window.location.pathname.toLowerCase().includes('signup'));

  useEffect(() => {
    if (isDownloadPath || isAdminPath || isAuthPath) {
      soundManager.stopAll();
      return;
    }

    const handleFirstInteraction = () => {
      const path = typeof window !== 'undefined' ? window.location.pathname.toLowerCase() : '';
      if (path.startsWith('/admin') || path.includes('download') || path.includes('login') || path.includes('signup')) return;

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
  }, [isDownloadPath, isAdminPath, isAuthPath]);

  useEffect(() => {
    if (!user || isDownloadPath || isAdminPath || isAuthPath) {
      soundManager.stopAll();
    }
  }, [user, isDownloadPath, isAdminPath, isAuthPath]);

  return (
    <>
      {!isSplashDone && !isDownloadPath && (
        <LoadingScreen
          isReady={!isLoading}
          minDurationMs={2400}
          onFinish={() => setIsSplashDone(true)}
        />
      )}
      <BrowserRouter>
        <GlobalAndroidBackHandler />
        <Routes>
        {/* Dedicated standalone APK download routes - completely separate from game/dashboard layouts */}
        <Route path="/download-apk" element={<DownloadPage />} />
        <Route path="/download" element={<DownloadPage />} />

        <Route element={<PublicLayout />}>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/admin/login" element={<LoginPage />} />
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
          <Route path="/games/ludo" element={<Ludo />} />
          <Route element={<UserLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/games-catalog" element={<GameCatalogPage />} />
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
