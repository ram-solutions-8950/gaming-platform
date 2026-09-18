import { useEffect, useState } from 'react';
import { Card } from '../../components/common/Card';
import { useEffect, useState, useCallback } from 'react';
import { Loader } from '../../components/common/Loader';
import {
  Users,
  ArrowDownCircle,
  ArrowUpCircle,
  Receipt,
  RefreshCw,
  TrendingUp,
  Gamepad2,
  Trophy,
  Activity,
  Layers,
} from 'lucide-react';
import api from '../../services/api';

interface Stats { users: number; deposits: number; withdrawals: number; transactions: number; }
interface Stats {
  users: number;
  deposits: number;
  withdrawals: number;
  transactions: number;
}

interface TimeSeriesPoint {
  date: string;
  label: string;
  total_bets: number;
  total_volume: number;
  total_volume_inr: number;
  total_wins: number;
  total_wins_inr: number;
  total_rounds: number;
  active_players: number;
}

interface GameComparisonItem {
  game_id: string;
  name: string;
  slug: string;
  total_rounds: number;
  total_bets: number;
  total_volume: number;
  total_volume_inr: number;
  total_wins_inr: number;
  active_players: number;
}

interface AnalyticsData {
  period: 'weekly' | 'monthly';
  days: number;
  selected_game: string;
  time_series: TimeSeriesPoint[];
  game_comparison: GameComparisonItem[];
  summary: {
    total_games_played: number;
    total_bets: number;
    total_volume_inr: number;
    total_wins_inr: number;
    active_players: number;
  };
  available_games: { name: string; slug: string }[];
}

export function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<'weekly' | 'monthly'>('weekly');
  const [selectedGame, setSelectedGame] = useState<string>('all');
  const [activeMetric, setActiveMetric] = useState<'volume' | 'bets' | 'players' | 'rounds'>('volume');
  const [hoveredPoint, setHoveredPoint] = useState<TimeSeriesPoint | null>(null);

  useEffect(() => {
    Promise.all([
      api.get('/admin/users?page_size=1').catch(() => ({ data: { data: { total: 0 } } })),
      api.get('/admin/deposits?page_size=1').catch(() => ({ data: { data: { total: 0 } } })),
      api.get('/admin/withdrawals?page_size=1').catch(() => ({ data: { data: { total: 0 } } })),
      api.get('/admin/transactions?page_size=1').catch(() => ({ data: { data: { total: 0 } } })),
    ]).then(([u, d, w, t]) => {
  const fetchDashboardData = useCallback(async (showRefreshingState = false) => {
    if (showRefreshingState) setRefreshing(true);
    try {
      const [u, d, w, t, a] = await Promise.all([
        api.get('/admin/users?page_size=1').catch(() => ({ data: { data: { total: 0 } } })),
        api.get('/admin/deposits?page_size=1').catch(() => ({ data: { data: { total: 0 } } })),
        api.get('/admin/withdrawals?page_size=1').catch(() => ({ data: { data: { total: 0 } } })),
        api.get('/admin/transactions?page_size=1').catch(() => ({ data: { data: { total: 0 } } })),
        api.get(`/admin/dashboard/analytics?period=${period}&game_slug=${selectedGame}`).catch(() => ({ data: { data: null } })),
      ]);

      setStats({
        users: u.data.data?.total ?? 0,
        deposits: d.data.data?.total ?? 0,
        withdrawals: w.data.data?.total ?? 0,
        transactions: t.data.data?.total ?? 0,
      });
    }).finally(() => setLoading(false));
  }, []);

      if (a.data.data) {
        setAnalytics(a.data.data);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, selectedGame]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  if (loading) return <Loader />;

  const statCards = [
    { label: 'Total Users', value: stats?.users, icon: '?', color: 'text-brand-400' },
    { label: 'Total Deposits', value: stats?.deposits, icon: '?', color: 'text-success' },
    { label: 'Total Withdrawals', value: stats?.withdrawals, icon: '?', color: 'text-warn' },
    { label: 'Total Transactions', value: stats?.transactions, icon: '?', color: 'text-gold-400' },
    {
      label: 'Total Users',
      value: stats?.users ?? 0,
      icon: <Users className="w-8 h-8 text-blue-400" />,
      bg: 'bg-blue-500/10 border-blue-500/20',
      badge: 'Players Registered',
    },
    {
      label: 'Total Deposits',
      value: stats?.deposits ?? 0,
      icon: <ArrowDownCircle className="w-8 h-8 text-emerald-400" />,
      bg: 'bg-emerald-500/10 border-emerald-500/20',
      badge: 'Funding Requests',
    },
    {
      label: 'Total Withdrawals',
      value: stats?.withdrawals ?? 0,
      icon: <ArrowUpCircle className="w-8 h-8 text-amber-400" />,
      bg: 'bg-amber-500/10 border-amber-500/20',
      badge: 'Payout Requests',
    },
    {
      label: 'Total Transactions',
      value: stats?.transactions ?? 0,
      icon: <Receipt className="w-8 h-8 text-purple-400" />,
      bg: 'bg-purple-500/10 border-purple-500/20',
      badge: 'Ledger Entries',
    },
  ];

  // SVG Chart Calculations
  const series = analytics?.time_series || [];
  const chartHeight = 220;
  const chartWidth = 720;
  const paddingX = 40;
  const paddingY = 30;

  const getMetricValue = (point: TimeSeriesPoint) => {
    switch (activeMetric) {
      case 'volume':
        return point.total_volume_inr;
      case 'bets':
        return point.total_bets;
      case 'players':
        return point.active_players;
      case 'rounds':
        return point.total_rounds;
    }
  };

  const getMetricLabel = () => {
    switch (activeMetric) {
      case 'volume':
        return 'Total Bets (₹)';
      case 'bets':
        return 'Bets Placed';
      case 'players':
        return 'Active Players';
      case 'rounds':
        return 'Rounds Played';
    }
  };

  const values = series.map(getMetricValue);
  const maxValue = Math.max(...values, 10);
  const minValue = 0;

  const pointsCoordinates = series.map((point, index) => {
    const x = paddingX + (index / Math.max(series.length - 1, 1)) * (chartWidth - paddingX * 2);
    const normalizedY = (getMetricValue(point) - minValue) / (maxValue - minValue || 1);
    const y = chartHeight - paddingY - normalizedY * (chartHeight - paddingY * 2);
    return { x, y, point };
  });

  const pathD = pointsCoordinates.length > 0
    ? pointsCoordinates.reduce((acc, curr, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${curr.x},${curr.y}`, '')
    : '';

  const areaD = pointsCoordinates.length > 0
    ? `${pathD} L ${pointsCoordinates[pointsCoordinates.length - 1].x},${chartHeight - paddingY} L ${pointsCoordinates[0].x},${chartHeight - paddingY} Z`
    : '';

  const maxGameVolume = Math.max(...(analytics?.game_comparison || []).map(g => g.total_volume_inr), 1);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-white">Admin Dashboard</h1>
        <p className="text-gray-400 mt-1">Platform overview</p>
      {/* Header with Title and Refresh Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Admin Dashboard</h1>
          <p className="text-gray-400 mt-1">Platform overview and live game performance metrics.</p>
        </div>
        <button
          type="button"
          onClick={() => fetchDashboardData(true)}
          disabled={refreshing}
          className="flex items-center justify-center gap-2 bg-dark-800 hover:bg-dark-700 text-gray-200 font-semibold px-4 py-2.5 rounded-xl border border-dark-600 transition-all cursor-pointer disabled:opacity-50 shadow-sm"
          title="Refresh Dashboard"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin text-brand-400' : 'text-gray-300'} />
          <span>{refreshing ? 'Refreshing...' : 'Refresh Data'}</span>
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map(s => (
          <Card key={s.label}>

      {/* Summary Stat Cards with Proper Icons (Bug-002) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {statCards.map((s) => (
          <div
            key={s.label}
            className={`p-5 rounded-2xl border transition-all duration-200 hover:scale-[1.01] ${s.bg} backdrop-blur-md`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-400">{s.label}</p>
                <p className="text-4xl font-extrabold mt-2 text-white">{s.value}</p>
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{s.label}</span>
                <p className="text-3xl font-black mt-2 text-white">{s.value.toLocaleString()}</p>
                <span className="text-[11px] text-gray-400 mt-1 block">{s.badge}</span>
              </div>
              <span className="text-3xl">{s.icon}</span>
              <div className="p-2.5 rounded-xl bg-dark-900/60 border border-white/5 shadow-inner">
                {s.icon}
              </div>
            </div>
          </Card>
          </div>
        ))}
      </div>

      {/* Live Game Performance Analytics Section (BUG-003) */}
      <div className="bg-dark-900 border border-dark-700/80 rounded-2xl p-6 shadow-xl space-y-6">
        {/* Controls and Filters */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-dark-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/20">
              <TrendingUp size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Live Game Progress & Performance</h2>
              <p className="text-xs text-gray-400">Track real-time player bets, turnover, and game comparisons.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Game Selector Filter */}
            <div className="flex items-center gap-2 bg-dark-800 border border-dark-700 rounded-xl px-3 py-1.5">
              <Gamepad2 size={16} className="text-gray-400" />
              <select
                value={selectedGame}
                onChange={(e) => setSelectedGame(e.target.value)}
                className="bg-transparent text-white text-xs font-semibold focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-dark-900 text-white">All Games</option>
                {analytics?.available_games.map((g) => (
                  <option key={g.slug} value={g.slug} className="bg-dark-900 text-white">
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Time Period Filter (Weekly / Monthly) */}
            <div className="flex bg-dark-800 p-1 rounded-xl border border-dark-700 text-xs font-bold">
              <button
                type="button"
                onClick={() => setPeriod('weekly')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  period === 'weekly' ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                Weekly (7D)
              </button>
              <button
                type="button"
                onClick={() => setPeriod('monthly')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  period === 'monthly' ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                Monthly (30D)
              </button>
            </div>
          </div>
        </div>

        {/* Metric Selector Tabs */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveMetric('volume')}
            className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeMetric === 'volume'
                ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                : 'bg-dark-800 text-gray-400 hover:text-white border border-dark-700'
            }`}
          >
            <span>💰</span>
            <span>Total Turnover (₹)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveMetric('bets')}
            className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeMetric === 'bets'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                : 'bg-dark-800 text-gray-400 hover:text-white border border-dark-700'
            }`}
          >
            <Activity size={14} />
            <span>Total Bets</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveMetric('players')}
            className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeMetric === 'players'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                : 'bg-dark-800 text-gray-400 hover:text-white border border-dark-700'
            }`}
          >
            <Users size={14} />
            <span>Active Players</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveMetric('rounds')}
            className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeMetric === 'rounds'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-dark-800 text-gray-400 hover:text-white border border-dark-700'
            }`}
          >
            <Layers size={14} />
            <span>Rounds Played</span>
          </button>
        </div>

        {/* Live SVG Progress Graph / Interactive Trend Chart */}
        <div className="relative bg-dark-950/70 border border-dark-800 rounded-xl p-4 overflow-hidden">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-2 px-2">
            <span className="font-semibold text-gray-300">{getMetricLabel()} — {period === 'weekly' ? 'Last 7 Days' : 'Last 30 Days'}</span>
            {hoveredPoint && (
              <span className="text-brand-300 font-mono font-bold bg-brand-950/80 px-2.5 py-1 rounded border border-brand-800/50">
                {hoveredPoint.label}: {getMetricValue(hoveredPoint).toLocaleString()} {activeMetric === 'volume' ? '₹' : ''}
              </span>
            )}
          </div>

          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-56 min-w-[550px] overflow-visible"
            >
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Horizontal Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = paddingY + ratio * (chartHeight - paddingY * 2);
                const val = Math.round(maxValue * (1 - ratio));
                return (
                  <g key={ratio}>
                    <line
                      x1={paddingX}
                      y1={y}
                      x2={chartWidth - paddingX}
                      y2={y}
                      stroke="rgba(255,255,255,0.08)"
                      strokeDasharray="4 4"
                    />
                    <text
                      x={paddingX - 8}
                      y={y + 4}
                      textAnchor="end"
                      fill="#64748b"
                      fontSize="10"
                      fontFamily="monospace"
                    >
                      {activeMetric === 'volume' ? `₹${val}` : val}
                    </text>
                  </g>
                );
              })}

              {/* Area Fill */}
              {areaD && <path d={areaD} fill="url(#chartGradient)" />}

              {/* Trend Line */}
              {pathD && (
                <path
                  d={pathD}
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Data points */}
              {pointsCoordinates.map(({ x, y, point }) => (
                <g
                  key={point.date}
                  className="cursor-pointer group"
                  onMouseEnter={() => setHoveredPoint(point)}
                  onMouseLeave={() => setHoveredPoint(null)}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r={hoveredPoint?.date === point.date ? 6 : 4}
                    fill={hoveredPoint?.date === point.date ? '#ec4899' : '#c084fc'}
                    stroke="#1e1b4b"
                    strokeWidth="2"
                    className="transition-all"
                  />
                  <text
                    x={x}
                    y={chartHeight - 10}
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize="10"
                    fontFamily="sans-serif"
                  >
                    {point.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </div>

        {/* Live Aggregated Metrics Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-dark-800/80 border border-dark-700 rounded-xl p-3.5">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Games / Rounds</span>
            <p className="text-xl font-extrabold text-white mt-1">
              {(analytics?.summary.total_games_played ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-dark-800/80 border border-dark-700 rounded-xl p-3.5">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Active Bettors</span>
            <p className="text-xl font-extrabold text-blue-400 mt-1">
              {(analytics?.summary.active_players ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-dark-800/80 border border-dark-700 rounded-xl p-3.5">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Total Stakes</span>
            <p className="text-xl font-extrabold text-emerald-400 mt-1">
              ₹{(analytics?.summary.total_volume_inr ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-dark-800/80 border border-dark-700 rounded-xl p-3.5">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Player Wins</span>
            <p className="text-xl font-extrabold text-amber-400 mt-1">
              ₹{(analytics?.summary.total_wins_inr ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Game-Wise Performance Comparison (BUG-003) */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={16} className="text-gold-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Game Performance Comparison ({period === 'weekly' ? 'Weekly' : 'Monthly'})
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(analytics?.game_comparison || []).map((game) => {
              const pct = maxGameVolume > 0 ? Math.round((game.total_volume_inr / maxGameVolume) * 100) : 0;
              return (
                <div
                  key={game.slug}
                  className="bg-dark-800/70 border border-dark-700 rounded-xl p-4 hover:border-dark-600 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-white text-sm">{game.name}</span>
                    <span className="text-xs font-mono text-gray-400">{game.total_rounds} rds</span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-dark-900 rounded-full h-2 mb-3 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-brand-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(pct, 4)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-300">
                    <div>
                      <span className="text-gray-500 text-[10px] block">BETS / PLAYERS</span>
                      <span className="font-semibold">{game.total_bets} bets ({game.active_players} players)</span>
                    </div>
                    <div className="text-right">
                      <span className="text-gray-500 text-[10px] block">TOTAL TURNOVER</span>
                      <span className="font-bold text-emerald-400">₹{game.total_volume_inr.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
