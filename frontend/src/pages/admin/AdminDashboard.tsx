import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader } from '../../components/common/Loader';
import { adminService, type DashboardStats } from '../../services/adminService';
import {
  Users,
  Gamepad2,
  Coins,
  TrendingUp,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  BarChart2,
  Headphones,
  Shield,
  X,
  RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';


const GAME_ICONS: Record<string, string> = {
  'colour-prediction': '🎨',
  'rummy': '🃏',
  'teen-patti': '🂮',
  'aviator': '✈️',
  'poker': '♠️',
  'andar-bahar': '🎴',
  'dragon-tiger': '🐉',
  'roulette': '🎡',
  'triple-777': '🎰',
  'chicken-road': '🐔',
  'ludo': '🎲',
};

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Game Analytics Modal state (Loads on demand to keep initial dashboard instant)
  const [analyticsModalOpen, setAnalyticsModalOpen] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsPeriod, setAnalyticsPeriod] = useState<'weekly' | 'monthly'>('weekly');
  const [analyticsGame] = useState('all');

  const fetchStats = useCallback(async () => {
    try {
      const data = await adminService.getDashboardStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load dashboard stats:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  const openAnalyticsModal = async (period = analyticsPeriod, game = analyticsGame) => {
    setAnalyticsModalOpen(true);
    setAnalyticsLoading(true);
    try {
      const data = await adminService.getDashboardAnalytics(period, game);
      setAnalyticsData(data);
    } catch (err) {
      console.error('Failed to load game analytics:', err);
      toast.error('Failed to load deep game analytics');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const handleApproveWithdrawal = async (id?: string) => {
    if (!id) return;
    try {
      await adminService.approveWithdrawal(id);
      toast.success('Withdrawal approved successfully');
      fetchStats();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to approve withdrawal');
    }
  };

  const handleRejectWithdrawal = async (id?: string) => {
    if (!id) return;
    try {
      await adminService.rejectWithdrawal(id);
      toast.success('Withdrawal rejected');
      fetchStats();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to reject withdrawal');
    }
  };

  if (loading) {
    return (
      <div className="h-[80vh] flex items-center justify-center">
        <Loader size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-full">
      {/* Top Welcome / Header Banner with View Game Analytics & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <span>Executive Dashboard</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              LIVE SYSTEM
            </span>
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Real-time player stakes, revenue circulation, and game operations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => openAnalyticsModal()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-600/20 transition cursor-pointer border border-blue-400/30"
          >
            <BarChart2 size={15} />
            <span>View Game Analytics</span>
          </button>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#141b2d] hover:bg-[#1a233a] text-gray-300 border border-[#222c44] transition disabled:opacity-50"
            title="Refresh Data"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-cyan-400' : ''} />
            <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Row 1: Top 5 KPI Cards matching Image 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Total Users (Blue) */}
        <div className="bg-[#121929] border border-blue-500/20 hover:border-blue-500/40 rounded-2xl p-4 transition-all duration-200 shadow-lg relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Total Users</span>
              <h2 className="text-2xl font-black text-white mt-1.5 font-mono">
                {(stats?.total_players ?? 0).toLocaleString()}
              </h2>
              <div className="flex items-center gap-1 mt-2 text-[10px] font-bold text-emerald-400">
                <ArrowUpRight size={12} />
                <span>Registered Players</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Users size={20} />
            </div>
          </div>
          <div className="absolute -bottom-6 -right-6 w-20 h-20 bg-blue-500/10 rounded-full blur-xl pointer-events-none group-hover:bg-blue-500/20 transition"></div>
        </div>

        {/* Card 2: Active Players / Admins (Green) */}
        <div className="bg-[#121929] border border-emerald-500/20 hover:border-emerald-500/40 rounded-2xl p-4 transition-all duration-200 shadow-lg relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Active Players</span>
              <h2 className="text-2xl font-black text-white mt-1.5 font-mono">
                {(stats?.active_players ?? 0).toLocaleString()}
              </h2>
              <div className="flex items-center gap-1 mt-2 text-[10px] font-bold text-emerald-400">
                <ArrowUpRight size={12} />
                <span>Active in Last 24h</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Gamepad2 size={20} />
            </div>
          </div>
          <div className="absolute -bottom-6 -right-6 w-20 h-20 bg-emerald-500/10 rounded-full blur-xl pointer-events-none group-hover:bg-emerald-500/20 transition"></div>
        </div>

        {/* Card 3: Total Coin Circulation / Total Deposit (Purple) */}
        <div className="bg-[#121929] border border-purple-500/20 hover:border-purple-500/40 rounded-2xl p-4 transition-all duration-200 shadow-lg relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Total Deposits</span>
              <h2 className="text-2xl font-black text-white mt-1.5 font-mono">
                ₹{(stats?.total_deposits_inr ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </h2>
              <div className="flex items-center gap-1 mt-2 text-[10px] font-bold text-emerald-400">
                <ArrowUpRight size={12} />
                <span>Verified Inflow ({stats?.total_deposits_count ?? 0})</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Coins size={20} />
            </div>
          </div>
          <div className="absolute -bottom-6 -right-6 w-20 h-20 bg-purple-500/10 rounded-full blur-xl pointer-events-none group-hover:bg-purple-500/20 transition"></div>
        </div>

        {/* Card 4: Total Revenue / Profit (Orange) */}
        <div className="bg-[#121929] border border-amber-500/20 hover:border-amber-500/40 rounded-2xl p-4 transition-all duration-200 shadow-lg relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Total Revenue</span>
              <h2 className="text-2xl font-black text-white mt-1.5 font-mono">
                ₹{(stats?.total_revenue_inr ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </h2>
              <div className="flex items-center gap-1 mt-2 text-[10px] font-bold text-emerald-400">
                <ArrowUpRight size={12} />
                <span>Platform Net Margin</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-600/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <TrendingUp size={20} />
            </div>
          </div>
          <div className="absolute -bottom-6 -right-6 w-20 h-20 bg-amber-500/10 rounded-full blur-xl pointer-events-none group-hover:bg-amber-500/20 transition"></div>
        </div>

        {/* Card 5: Pending Withdrawals (Red) */}
        <div className="bg-[#121929] border border-rose-500/20 hover:border-rose-500/40 rounded-2xl p-4 transition-all duration-200 shadow-lg relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Pending Withdrawals</span>
              <h2 className="text-2xl font-black text-rose-400 mt-1.5 font-mono">
                {(stats?.pending_withdrawals ?? 0).toLocaleString()}
              </h2>
              <div className="flex items-center gap-1 mt-2 text-[10px] font-bold text-rose-400">
                <ArrowDownRight size={12} />
                <span>Requires Approval</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-600/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <Clock size={20} />
            </div>
          </div>
          <div className="absolute -bottom-6 -right-6 w-20 h-20 bg-rose-500/10 rounded-full blur-xl pointer-events-none group-hover:bg-rose-500/20 transition"></div>
        </div>
      </div>

      {/* Row 2: Games Overview (Left 9 cols) + Live Players (Right 3 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Games Overview Cards (9 cols) */}
        <div className="lg:col-span-8 xl:col-span-9 bg-[#111726] border border-[#1d273d] rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">Games Overview</h2>
              <p className="text-[11px] text-gray-400">Live status and active player count.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => openAnalyticsModal()}
                className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition"
              >
                View Game Analytics &rarr;
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {stats?.games_overview && stats.games_overview.length > 0 ? (
              stats.games_overview.map((game) => (
                <div
                  key={game.id || game.slug}
                  className="bg-[#161f33] border border-[#23304d] hover:border-cyan-500/50 rounded-xl p-4 flex flex-col justify-between transition-all group shadow-sm"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-extrabold text-white text-sm truncate max-w-[130px]">{game.name}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] font-bold border flex items-center gap-1 ${
                        game.is_live
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          : 'bg-gray-500/20 text-gray-400 border-gray-500/30'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${game.is_live ? 'bg-emerald-400 animate-pulse' : 'bg-gray-400'}`}></span>
                      {game.is_live ? 'LIVE' : 'OFFLINE'}
                    </span>
                  </div>
                  <div className="h-14 flex items-center justify-center text-3xl select-none group-hover:scale-105 transition-transform">
                    {GAME_ICONS[game.slug] || '🎮'}
                  </div>
                  <div className="mt-3 pt-3 border-t border-[#23304d] flex items-center justify-between">
                    <span className="text-[11px] text-gray-400 font-medium">👤 {game.active_players.toLocaleString()} Active</span>
                    <button
                      onClick={() => navigate('/admin/winning-control')}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-cyan-600/30 text-cyan-300 hover:bg-cyan-600 hover:text-white transition"
                    >
                      Controls
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-8 text-center text-xs text-gray-400">
                No games loaded in catalog.
              </div>
            )}
          </div>
        </div>

        {/* Live Players Panel (Right 3-4 cols) matching Image 2 */}
        <div className="lg:col-span-4 xl:col-span-3 bg-[#111726] border border-[#1d273d] rounded-2xl p-5 shadow-xl flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-white">Live Players</h2>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              Real-time
            </span>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto max-h-[220px] pr-1 custom-scrollbar">
            {stats?.live_players && stats.live_players.length > 0 ? (
              stats.live_players.map((p, idx) => (
                <div
                  key={p.user_id + idx}
                  className="flex items-center justify-between p-2 rounded-xl bg-[#161f33] border border-[#202c46] text-xs hover:border-[#2b3a5c] transition"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-[10px] font-bold shrink-0">
                      {p.display_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <span className="font-mono text-gray-200 truncate block text-xs">{p.display_name}</span>
                      <span className="text-[10px] text-gray-400 font-mono">₹{p.amount_inr} • {p.time}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 text-right">
                    <span className="text-[10px] text-emerald-400 font-semibold">{p.action}</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center py-8 text-gray-500">
                <Users size={24} className="mb-2 opacity-40" />
                <p className="text-xs">No active bets in 24h.</p>
                <p className="text-[10px] text-gray-600">Player actions stream here live.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Real Database Metrics (User Distribution, Revenue Inflow/Outflow, Platform Distribution) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Metric 1: User Base Distribution */}
        <div className="bg-[#111726] border border-[#1d273d] rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-white">User Base Distribution</h3>
              <p className="text-[10px] text-gray-400">Registered Players vs Staff</p>
            </div>
            <span className="text-[10px] font-bold text-cyan-400 bg-cyan-950/60 px-2.5 py-1 rounded-lg border border-cyan-800/40">
              Verified Accounts
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-3 my-auto">
            <div className="bg-[#141b2d] border border-[#222c44] rounded-xl p-3.5 text-center">
              <span className="text-[10px] text-gray-400 font-semibold block uppercase">Total Players</span>
              <span className="text-2xl font-black text-white font-mono mt-1 block">
                {(stats?.total_players ?? 0).toLocaleString()}
              </span>
              <span className="text-[10px] text-blue-400 font-medium">Standard Users</span>
            </div>
            <div className="bg-[#141b2d] border border-[#222c44] rounded-xl p-3.5 text-center">
              <span className="text-[10px] text-gray-400 font-semibold block uppercase">Active in 24h</span>
              <span className="text-2xl font-black text-emerald-400 font-mono mt-1 block">
                {(stats?.active_players ?? 0).toLocaleString()}
              </span>
              <span className="text-[10px] text-emerald-400 font-medium">Recent Activity</span>
            </div>
            <div className="bg-[#141b2d] border border-[#222c44] rounded-xl p-3.5 text-center">
              <span className="text-[10px] text-gray-400 font-semibold block uppercase">Admin Staff</span>
              <span className="text-2xl font-black text-purple-400 font-mono mt-1 block">
                {stats?.total_admin_users ?? 0}
              </span>
              <span className="text-[10px] text-purple-400 font-medium">Management</span>
            </div>
            <div className="bg-[#141b2d] border border-[#222c44] rounded-xl p-3.5 text-center">
              <span className="text-[10px] text-gray-400 font-semibold block uppercase">Coin Circulation</span>
              <span className="text-xl font-black text-amber-400 font-mono mt-1 block truncate">
                ₹{(stats?.coin_circulation ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-amber-400 font-medium">In User Wallets</span>
            </div>
          </div>

          <div className="pt-2 border-t border-[#1d273d] text-[10px] text-gray-500 flex justify-between mt-3">
            <span>Database Status</span>
            <span className="text-emerald-400 font-semibold">● Connected</span>
          </div>
        </div>

        {/* Metric 2: Revenue Flow */}
        <div className="bg-[#111726] border border-[#1d273d] rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-white">Revenue Overview</h3>
              <p className="text-[10px] text-gray-400">Total Deposits vs Completed Withdrawals</p>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-bold">
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Deposits
              </span>
              <span className="flex items-center gap-1 text-rose-400">
                <span className="w-2 h-2 rounded-full bg-rose-400"></span> Withdrawals
              </span>
            </div>
          </div>
          
          <div className="space-y-4 my-auto">
            <div>
              <div className="flex justify-between text-xs mb-1 font-semibold">
                <span className="text-emerald-400">Total Inflow (Deposits)</span>
                <span className="text-white font-mono">₹{(stats?.total_deposits_inr ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="w-full bg-[#182238] rounded-full h-3 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(5, ((stats?.total_deposits_inr ?? 0) / Math.max(1, (stats?.total_deposits_inr ?? 0) + (stats?.total_withdrawals_inr ?? 0))) * 100))}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1 font-semibold">
                <span className="text-rose-400">Total Outflow (Withdrawals)</span>
                <span className="text-white font-mono">₹{(stats?.total_withdrawals_inr ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="w-full bg-[#182238] rounded-full h-3 overflow-hidden">
                <div
                  className="bg-rose-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, ((stats?.total_withdrawals_inr ?? 0) / Math.max(1, (stats?.total_deposits_inr ?? 0) + (stats?.total_withdrawals_inr ?? 0))) * 100))}%` }}
                ></div>
              </div>
            </div>

            <div className="pt-2 border-t border-[#1d273d] flex items-center justify-between text-xs">
              <span className="text-gray-400 font-semibold">Net Platform Revenue:</span>
              <span className={`font-mono font-black text-sm ${(stats?.total_revenue_inr ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                ₹{(stats?.total_revenue_inr ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-[#1d273d] text-[10px] text-gray-500 flex justify-between mt-3">
            <span>Verified Transactions</span>
            <span>Real-time Ledger</span>
          </div>
        </div>

        {/* Metric 3: Device Distribution Donut */}
        <div className="bg-[#111726] border border-[#1d273d] rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-white">Device Distribution</h3>
              <p className="text-[10px] text-gray-400">Active Platform Clients</p>
            </div>
          </div>
          {(() => {
            const dev = stats?.device_distribution || { android: 0, ios: 0, web: 0, others: 0 };
            const total = (dev.android + dev.ios + dev.web + dev.others) || 1;
            const androidPct = Math.round((dev.android / total) * 100);
            const webPct = Math.round((dev.web / total) * 100);
            const iosPct = Math.round((dev.ios / total) * 100);

            return (
              <div className="flex items-center justify-around h-44">
                <div className="relative w-28 h-28 flex items-center justify-center">
                  <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#1d273d" strokeWidth="4" />
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="4"
                      strokeDasharray={`${androidPct} 100`}
                      strokeDashoffset="0"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="#a855f7"
                      strokeWidth="4"
                      strokeDasharray={`${webPct} 100`}
                      strokeDashoffset={`-${androidPct}`}
                    />
                  </svg>
                  <div className="absolute text-center">
                    <span className="text-xs font-black text-white font-mono">{stats?.total_players ?? 0}</span>
                    <span className="text-[8px] text-gray-400 block font-bold">USERS</span>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <span className="text-gray-300 font-medium">Android (App)</span>
                    <span className="font-bold text-white ml-auto">{dev.android} ({androidPct}%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
                    <span className="text-gray-300 font-medium">Web Portal</span>
                    <span className="font-bold text-white ml-auto">{dev.web} ({webPct}%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                    <span className="text-gray-300 font-medium">iOS</span>
                    <span className="font-bold text-white ml-auto">{dev.ios} ({iosPct}%)</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Row 4: Tables (Recent Transactions, Top Agents, Withdrawal Requests, Quick Actions) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Recent Transactions (6 cols) */}
        <div className="lg:col-span-6 bg-[#111726] border border-[#1d273d] rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white">Recent Transactions</h3>
            <button
              onClick={() => navigate('/admin/transactions')}
              className="text-xs font-semibold text-cyan-400 hover:text-cyan-300"
            >
              View All &rarr;
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="text-gray-500 border-b border-[#1d273d] uppercase text-[10px]">
                  <th className="pb-2">ID</th>
                  <th className="pb-2">User</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2 text-right">Amount</th>
                  <th className="pb-2 text-center">Status</th>
                  <th className="pb-2 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#182136]">
                {stats?.recent_transactions && stats.recent_transactions.length > 0 ? (
                  stats.recent_transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-[#161f33] transition-colors">
                      <td className="py-2.5 font-mono text-gray-400 text-[11px]">{tx.id}</td>
                      <td className="py-2.5 font-semibold text-gray-200">{tx.user_name}</td>
                      <td className="py-2.5 text-gray-400">{tx.type}</td>
                      <td className="py-2.5 text-right font-mono font-bold text-white">₹{tx.amount_inr}</td>
                      <td className="py-2.5 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          {tx.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-right text-gray-500 font-mono text-[10px]">{tx.date}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-xs text-gray-500">
                      No recent transactions recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Pending Withdrawal Requests (6 cols) */}
        <div className="lg:col-span-6 bg-[#111726] border border-[#1d273d] rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Withdrawal Requests</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                {stats?.pending_withdrawals ?? 0} Pending
              </span>
            </h3>
            <button
              onClick={() => navigate('/admin/withdrawals')}
              className="text-xs font-semibold text-cyan-400 hover:text-cyan-300"
            >
              View All &rarr;
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="text-gray-500 border-b border-[#1d273d] uppercase text-[10px]">
                  <th className="pb-2">ID</th>
                  <th className="pb-2">User</th>
                  <th className="pb-2 text-right">Amount</th>
                  <th className="pb-2">Mode</th>
                  <th className="pb-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#182136]">
                {stats?.withdrawal_requests && stats.withdrawal_requests.length > 0 ? (
                  stats.withdrawal_requests.map((wd) => (
                    <tr key={wd.id} className="hover:bg-[#161f33] transition-colors">
                      <td className="py-2.5 font-mono text-gray-400 text-[11px]">{wd.id}</td>
                      <td className="py-2.5 font-semibold text-gray-200">{wd.user_name}</td>
                      <td className="py-2.5 text-right font-mono font-bold text-amber-400">₹{wd.amount_inr}</td>
                      <td className="py-2.5 text-gray-400">{wd.payment_mode}</td>
                      <td className="py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleApproveWithdrawal(wd.full_id)}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleRejectWithdrawal(wd.full_id)}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-rose-600/30 text-rose-400 hover:bg-rose-600 hover:text-white transition cursor-pointer"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-gray-500">
                      No pending withdrawal requests.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Row 5: Quick Actions Panel matching Image 2 */}
      <div className="bg-[#111726] border border-[#1d273d] rounded-2xl p-5 shadow-xl">
        <h3 className="text-sm font-bold text-white mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <button
            onClick={() => navigate('/admin/rbac')}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 font-semibold text-xs gap-1.5 transition"
          >
            <Shield size={18} />
            <span>+ Add Admin</span>
          </button>
          <button
            onClick={() => navigate('/admin/users')}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 font-semibold text-xs gap-1.5 transition"
          >
            <Users size={18} />
            <span>+ Add Agent</span>
          </button>
          <button
            onClick={() => navigate('/admin/users')}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 font-semibold text-xs gap-1.5 transition"
          >
            <Users size={18} />
            <span>+ Add Player</span>
          </button>
          <button
            onClick={() => navigate('/admin/games')}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 text-amber-300 font-semibold text-xs gap-1.5 transition"
          >
            <Gamepad2 size={18} />
            <span>Manage Games</span>
          </button>
          <button
            onClick={() => navigate('/admin/wagers')}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 font-semibold text-xs gap-1.5 transition"
          >
            <Coins size={18} />
            <span>Wager Settings</span>
          </button>
          <button
            onClick={() => navigate('/admin/winning-control')}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-300 font-semibold text-xs gap-1.5 transition"
          >
            <TrendingUp size={18} />
            <span>Winning Controls</span>
          </button>
          <button
            onClick={() => openAnalyticsModal()}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 text-cyan-300 font-semibold text-xs gap-1.5 transition"
          >
            <BarChart2 size={18} />
            <span>View Reports</span>
          </button>
          <button
            onClick={() => navigate('/admin/support')}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/30 text-teal-300 font-semibold text-xs gap-1.5 transition"
          >
            <Headphones size={18} />
            <span>Support Tickets</span>
          </button>
        </div>
      </div>

      {/* Modal: View Game Analytics (On-Demand) */}
      {analyticsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#0f1422] border border-[#222c44] rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 custom-scrollbar">
            <div className="flex items-center justify-between pb-4 border-b border-[#222c44]">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <BarChart2 className="text-cyan-400" size={20} />
                  <span>Deep Game Analytics & Performance</span>
                </h2>
                <p className="text-xs text-gray-400">Loaded on-demand for maximum dashboard speed.</p>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex bg-[#141b2d] p-1 rounded-xl border border-[#222c44] text-xs font-bold">
                  <button
                    onClick={() => {
                      setAnalyticsPeriod('weekly');
                      openAnalyticsModal('weekly', analyticsGame);
                    }}
                    className={`px-3 py-1 rounded-lg transition ${
                      analyticsPeriod === 'weekly' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Weekly (7D)
                  </button>
                  <button
                    onClick={() => {
                      setAnalyticsPeriod('monthly');
                      openAnalyticsModal('monthly', analyticsGame);
                    }}
                    className={`px-3 py-1 rounded-lg transition ${
                      analyticsPeriod === 'monthly' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Monthly (30D)
                  </button>
                </div>

                <button
                  onClick={() => setAnalyticsModalOpen(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1c2438] transition"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {analyticsLoading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3">
                <Loader size="lg" />
                <span className="text-xs text-gray-400">Loading deep analytics...</span>
              </div>
            ) : analyticsData ? (
              <div className="space-y-6 pt-5">
                {/* Aggregate Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-[#141b2d] border border-[#222c44] rounded-xl p-3">
                    <span className="text-[10px] text-gray-400 font-bold uppercase">Total Bets Placed</span>
                    <p className="text-xl font-black text-white mt-1">
                      {analyticsData.summary.total_bets.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-[#141b2d] border border-[#222c44] rounded-xl p-3">
                    <span className="text-[10px] text-gray-400 font-bold uppercase">Total Turnover</span>
                    <p className="text-xl font-black text-emerald-400 mt-1">
                      ₹{analyticsData.summary.total_volume_inr.toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div className="bg-[#141b2d] border border-[#222c44] rounded-xl p-3">
                    <span className="text-[10px] text-gray-400 font-bold uppercase">Player Payouts</span>
                    <p className="text-xl font-black text-amber-400 mt-1">
                      ₹{analyticsData.summary.total_wins_inr.toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div className="bg-[#141b2d] border border-[#222c44] rounded-xl p-3">
                    <span className="text-[10px] text-gray-400 font-bold uppercase">Active Bettors</span>
                    <p className="text-xl font-black text-blue-400 mt-1">
                      {analyticsData.summary.active_players.toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Game Breakdown Comparison */}
                <div>
                  <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-3">
                    Per-Game Turnover & Performance
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {analyticsData.game_comparison.map((g: any) => (
                      <div
                        key={g.slug}
                        className="bg-[#141b2d] border border-[#222c44] rounded-xl p-4 flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-sm">{g.name}</span>
                          <span className="text-xs font-mono font-bold text-emerald-400">
                            ₹{g.total_volume_inr.toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-gray-400 mt-2">
                          <span>{g.total_bets} bets</span>
                          <span>{g.active_players} players</span>
                          <span>{g.total_rounds} rounds</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
