import { useState, useCallback, useEffect } from 'react';
import { Card } from '../../components/common/Card';
import { Loader } from '../../components/common/Loader';
import { CopyableId } from '../../components/common/CopyableId';
import { FilterSelect } from '../../components/common/FilterSelect';
import { SearchInput } from '../../components/common/SearchInput';
import { RefreshOverlay } from '../../components/common/RefreshOverlay';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator';
import { gameService } from '../../services/game';
import { adminService } from '../../services/adminService';
import type { GameRoundAdmin, GameBet, PaginatedResult } from '../../types';
import { RefreshCw, ChevronLeft, ChevronRight, Filter, RotateCcw, Flame } from 'lucide-react';

function paiseToRupees(p: number | undefined | null): string {
  if (typeof p !== 'number') return '0.00';
  return (p / 100).toFixed(2);
}

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const time = d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    return `${date} ${time}`;
  } catch {
    return dateStr;
  }
}

export function AdminGameControlPage() {
  const [rounds, setRounds] = useState<PaginatedResult<GameRoundAdmin> | null>(null);
  const [selectedRound, setSelectedRound] = useState<string | null>(null);
  const [selectedRoundObj, setSelectedRoundObj] = useState<GameRoundAdmin | null>(null);
  const [bets, setBets] = useState<PaginatedResult<GameBet> | null>(null);
  const [loadingRounds, setLoadingRounds] = useState(true);
  const [loadingBets, setLoadingBets] = useState(false);
  const { refreshing, runRefresh } = useRefreshIndicator();

  // Live game engines status
  const [liveStatuses, setLiveStatuses] = useState<any>(null);

  // Filters & Pagination for Rounds
  const [searchRound, setSearchRound] = useState('');
  const debouncedSearchRound = useDebouncedValue(searchRound);
  const [statusFilter, setStatusFilter] = useState('');
  const [gameFilter, setGameFilter] = useState('');
  const [roundPage, setRoundPage] = useState(1);
  const roundPageSize = 10;

  // Pagination for Bets
  const [betPage, setBetPage] = useState(1);
  const betPageSize = 20;

  const fetchLiveStatuses = useCallback(async () => {
    try {
      const data = await adminService.getLiveGameStatuses();
      if (data) setLiveStatuses(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchLiveStatuses();
    const interval = setInterval(fetchLiveStatuses, 4000);
    return () => clearInterval(interval);
  }, [fetchLiveStatuses]);

  const fetchRounds = useCallback(async () => {
    try {
      const data = await gameService.getAdminRounds(
        roundPage,
        roundPageSize,
        gameFilter || undefined,
        statusFilter || undefined,
        debouncedSearchRound.trim() || undefined
      );
      setRounds(data);
    } catch (err) {
      console.error('Failed to load admin rounds', err);
    } finally {
      setLoadingRounds(false);
    }
  }, [roundPage, statusFilter, gameFilter, debouncedSearchRound]);

  const fetchBets = useCallback(async (roundId: string, page = 1) => {
    setLoadingBets(true);
    try {
      const data = await gameService.getAdminBets(roundId, page, betPageSize);
      setBets(data);
    } catch (err) {
      console.error('Failed to load bets for round', err);
    } finally {
      setLoadingBets(false);
    }
  }, []);

  useEffect(() => {
    fetchRounds();
  }, [fetchRounds]);

  useEffect(() => {
    if (selectedRound) {
      fetchBets(selectedRound, betPage);
    } else {
      setBets(null);
    }
  }, [selectedRound, betPage, fetchBets]);

  // Keep the selected round's pool figure in step with the refreshed list.
  useEffect(() => {
    if (!selectedRound || !rounds?.items) return;
    const fresh = rounds.items.find((r) => r.id === selectedRound);
    if (fresh) setSelectedRoundObj(fresh);
  }, [rounds, selectedRound]);

  const handleRefresh = () =>
    runRefresh(async () => {
      await Promise.all([
        fetchLiveStatuses(),
        fetchRounds(),
        selectedRound ? fetchBets(selectedRound, betPage) : Promise.resolve(),
      ]);
    });

  const filtersActive = Boolean(searchRound || statusFilter || gameFilter);

  const handleResetFilters = () => {
    setSearchRound('');
    setStatusFilter('');
    setGameFilter('');
    setRoundPage(1);
  };

  const totalRoundPages = rounds ? Math.max(1, Math.ceil(rounds.total / roundPageSize)) : 1;
  const totalBetPages = bets ? Math.max(1, Math.ceil(bets.total / betPageSize)) : 1;

  const renderResultBadge = (r: GameRoundAdmin) => {
    if (r.status === 'BETTING') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
          <span>BETTING</span>
        </span>
      );
    }
    if (r.status === 'CALCULATING') {
      return <span className="text-cyan-400 text-xs font-semibold">Calculating...</span>;
    }

    if (r.result_data && typeof r.result_data === 'object') {
      const winner = r.result_data.result || r.result_data.winner;
      if (winner) {
        const isDragon = winner === 'DRAGON';
        const isTiger = winner === 'TIGER';
        const isTie = winner === 'TIE';
        const badgeClass = isDragon
          ? 'bg-rose-900/60 text-rose-300 border-rose-600/50'
          : isTiger
          ? 'bg-amber-900/60 text-amber-300 border-amber-600/50'
          : isTie
          ? 'bg-emerald-900/60 text-emerald-300 border-emerald-600/50'
          : 'bg-purple-900/50 text-purple-300 border-purple-700/50';

        const icon = isDragon ? '🐉 ' : isTiger ? '🐯 ' : isTie ? '🤝 ' : '';
        const cardDetails =
          r.result_data.dragon_card && r.result_data.tiger_card
            ? ` [${r.result_data.dragon_card.value || ''}${r.result_data.dragon_card.suit || ''} vs ${r.result_data.tiger_card.value || ''}${r.result_data.tiger_card.suit || ''}]`
            : '';

        return (
          <span className={`px-2 py-0.5 rounded text-xs font-bold border ${badgeClass} inline-flex items-center gap-1`}>
            <span>{icon}{winner}{cardDetails}</span>
          </span>
        );
      }
      if (r.result_data.multiplier) {
        return (
          <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-900/50 text-amber-300 border border-amber-700/50">
            {r.result_data.multiplier}x
          </span>
        );
      }
    }
    if (r.result_color || r.result_number !== null) {
      const isSpecialViolet = r.result_number === '0' || r.result_number === '5';
      const colorBg =
        r.result_color === 'RED'
          ? isSpecialViolet ? 'bg-gradient-to-r from-red-600 to-purple-600' : 'bg-red-600'
          : r.result_color === 'GREEN'
          ? isSpecialViolet ? 'bg-gradient-to-r from-green-600 to-purple-600' : 'bg-green-600'
          : 'bg-purple-600';
      const colorText = isSpecialViolet
        ? `${r.result_color}+VIOLET (${r.result_number})`
        : `${r.result_color || ''} (${r.result_number ?? ''})`.trim();

      return (
        <span className={`px-2 py-0.5 rounded text-xs font-bold text-white shadow-sm inline-flex items-center gap-1.5 ${colorBg}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-white/90 inline-block animate-pulse"></span>
          {colorText}
        </span>
      );
    }
    return <span className="text-gray-500 text-xs">-</span>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Live Game Control</h1>
          <p className="text-gray-400 mt-1">Monitor real-time game rounds, pool integrity, and betting outcomes.</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-dark-800 hover:bg-dark-700 text-gray-200 border border-dark-600 rounded-lg text-sm font-medium transition shadow-sm hover:border-gray-500 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-brand-400' : ''}`} />
          <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
        </button>
      </div>

      {/* Real-Time Game Engines Status Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Dragon Tiger */}
        <div className="bg-[#111726] border border-rose-500/30 rounded-2xl p-4 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-rose-400 flex items-center gap-1.5">
              <span>🐉 🐯</span> Dragon vs Tiger
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              liveStatuses?.dragon_tiger?.status === 'BETTING'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse'
                : 'bg-gray-500/20 text-gray-300'
            }`}>
              {liveStatuses?.dragon_tiger?.status || 'ONLINE'}
            </span>
          </div>
          <div className="mt-2.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-gray-400">Current Round:</span>
              <span className="text-sm font-black text-white font-mono">
                #{liveStatuses?.dragon_tiger?.current_round_number ?? '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-[11px] text-gray-400">Last Outcome:</span>
              <span className="text-xs font-bold text-amber-300 font-mono">
                {liveStatuses?.dragon_tiger?.last_result?.winner
                  ? `${liveStatuses.dragon_tiger.last_result.winner} (${liveStatuses.dragon_tiger.last_result.dragon_card?.value || ''} vs ${liveStatuses.dragon_tiger.last_result.tiger_card?.value || ''})`
                  : 'Pending'}
              </span>
            </div>
          </div>
        </div>

        {/* Colour Prediction */}
        <div className="bg-[#111726] border border-cyan-500/30 rounded-2xl p-4 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-cyan-400 flex items-center gap-1.5">
              <span>🔴 🟢</span> Colour Prediction
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              liveStatuses?.colour_prediction?.status === 'BETTING'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse'
                : 'bg-gray-500/20 text-gray-300'
            }`}>
              {liveStatuses?.colour_prediction?.status || 'ONLINE'}
            </span>
          </div>
          <div className="mt-2.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-gray-400">Current Period:</span>
              <span className="text-sm font-black text-white font-mono">
                #{liveStatuses?.colour_prediction?.current_round_number ?? '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-[11px] text-gray-400">Last Color:</span>
              <span className="text-xs font-bold text-emerald-400 font-mono">
                {liveStatuses?.colour_prediction?.last_result?.result_color || 'GREEN (7)'}
              </span>
            </div>
          </div>
        </div>

        {/* Andar Bahar */}
        <div className="bg-[#111726] border border-amber-500/30 rounded-2xl p-4 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-amber-400 flex items-center gap-1.5">
              <span>🃏</span> Andar Bahar
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              liveStatuses?.andar_bahar?.status === 'BETTING'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse'
                : 'bg-gray-500/20 text-gray-300'
            }`}>
              {liveStatuses?.andar_bahar?.status || 'ONLINE'}
            </span>
          </div>
          <div className="mt-2.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-gray-400">Current Round:</span>
              <span className="text-sm font-black text-white font-mono">
                #{liveStatuses?.andar_bahar?.current_round_number ?? '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-[11px] text-gray-400">Last Winner:</span>
              <span className="text-xs font-bold text-purple-300 font-mono">
                {liveStatuses?.andar_bahar?.last_result?.winner || 'ANDAR'}
              </span>
            </div>
          </div>
        </div>

        {/* Aviator */}
        <div className="bg-[#111726] border border-purple-500/30 rounded-2xl p-4 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-purple-400 flex items-center gap-1.5">
              <span>🚀</span> Aviator Crash
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              liveStatuses?.aviator?.status === 'FLYING' || liveStatuses?.aviator?.status === 'BETTING'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse'
                : 'bg-gray-500/20 text-gray-300'
            }`}>
              {liveStatuses?.aviator?.status || 'ONLINE'}
            </span>
          </div>
          <div className="mt-2.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-gray-400">Current Round:</span>
              <span className="text-sm font-black text-white font-mono">
                #{liveStatuses?.aviator?.current_round_number ?? '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-[11px] text-gray-400">Crash Multiplier:</span>
              <span className="text-xs font-bold text-amber-400 font-mono">
                {liveStatuses?.aviator?.last_result?.crash_multiplier
                  ? `${liveStatuses.aviator.last_result.crash_multiplier}x`
                  : '2.45x'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Rounds above, bets for the selected round below — full width each, so the
          complete Round ID and the Bets / Total Pool columns all stay on screen. */}
      <div className="space-y-6">
        <div>
          <Card title="Recent Rounds" className="relative">
            {/* Visible refresh state (BUG-008) */}
            <RefreshOverlay active={refreshing} />
            {/* Search & Filter Bar */}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <SearchInput
                value={searchRound}
                onChange={(value) => {
                  setSearchRound(value);
                  setRoundPage(1);
                }}
                busy={searchRound !== debouncedSearchRound}
                placeholder="Search by Round ID…"
                ariaLabel="Search rounds"
                className="min-w-0 flex-1"
              />
              <FilterSelect
                value={gameFilter}
                onChange={(e) => {
                  setGameFilter(e.target.value);
                  setRoundPage(1);
                }}
                icon={<Flame className="h-4 w-4" />}
                aria-label="Filter by game"
                wrapperClassName="w-full sm:w-48"
              >
                <option value="">All Games</option>
                <option value="dragon-tiger">Dragon vs Tiger</option>
                <option value="colour-prediction">Colour Prediction</option>
                <option value="andar-bahar">Andar Bahar</option>
                <option value="aviator">Aviator</option>
              </FilterSelect>
              <FilterSelect
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setRoundPage(1);
                }}
                icon={<Filter className="h-4 w-4" />}
                aria-label="Filter by status"
                wrapperClassName="w-full sm:w-44"
              >
                <option value="">All Statuses</option>
                <option value="BETTING">BETTING</option>
                <option value="CALCULATING">CALCULATING</option>
                <option value="COMPLETED">COMPLETED</option>
              </FilterSelect>
              <button
                type="button"
                onClick={handleResetFilters}
                disabled={!filtersActive}
                title={filtersActive ? 'Clear the search and all filters' : 'No filters applied'}
                className="flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dark-600 bg-dark-800 px-3 py-2 text-sm font-medium text-gray-200 transition hover:border-gray-500 hover:bg-dark-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Reset</span>
              </button>
            </div>

            {loadingRounds ? (
              <div className="flex justify-center py-16">
                <Loader size="lg" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-dark-700 text-left text-xs uppercase tracking-wider">
                      <th className="py-2.5 px-2">Round ID</th>
                      <th className="py-2.5 px-2">Game Name</th>
                      <th className="py-2.5 px-2">Date & Time</th>
                      <th className="py-2.5 px-2">Status</th>
                      <th className="py-2.5 px-2">Result</th>
                      <th className="py-2.5 px-2 text-right">Bets</th>
                      <th className="py-2.5 px-2 text-right">Total Pool</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-800">
                    {rounds?.items && rounds.items.length > 0 ? (
                      rounds.items.map((r) => (
                        <tr
                          key={r.id}
                          className={`cursor-pointer transition-colors ${
                            selectedRound === r.id ? 'bg-primary-950/40 border-l-2 border-primary-500' : 'hover:bg-dark-800/50'
                          }`}
                          onClick={() => {
                            setSelectedRound(r.id);
                            setSelectedRoundObj(r);
                            setBetPage(1);
                          }}
                        >
                          {/* Full Round ID, no "..." to cut a manual copy short (BUG-014) */}
                          <td className="py-3 px-2">
                            <CopyableId
                              value={r.id}
                              label="Round ID"
                              full
                              valueClassName="whitespace-nowrap text-gray-300"
                            />
                          </td>
                          <td className="py-3 px-2 text-xs font-semibold text-white whitespace-nowrap">
                            {r.game_name || 'Colour Prediction'}
                          </td>
                          <td className="py-3 px-2 text-xs text-gray-400 whitespace-nowrap">
                            {formatDateTime(r.started_at)}
                          </td>
                          <td className="py-3 px-2 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                r.status === 'COMPLETED'
                                  ? 'bg-gray-800 text-gray-300'
                                  : r.status === 'BETTING'
                                  ? 'bg-green-900/50 text-green-400 border border-green-700/50'
                                  : 'bg-yellow-900/50 text-yellow-400 border border-yellow-700/50'
                              }`}
                            >
                              {r.status}
                            </span>
                          </td>
                          <td className="py-3 px-2 whitespace-nowrap">{renderResultBadge(r)}</td>
                          <td className="py-3 px-2 text-right text-xs text-gray-300 whitespace-nowrap">{r.total_bets ?? 0}</td>
                          <td className="py-3 px-2 text-right text-xs font-semibold text-white whitespace-nowrap">
                            ₹{paiseToRupees(r.total_amount)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-gray-500">
                          No game rounds found matching your filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls for Rounds */}
            {rounds && rounds.total > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-3 border-t border-dark-700/60 text-xs text-gray-400">
                <div>
                  Showing {Math.min((roundPage - 1) * roundPageSize + 1, rounds.total)} -{' '}
                  {Math.min(roundPage * roundPageSize, rounds.total)} of {rounds.total} rounds
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRoundPage((p) => Math.max(1, p - 1))}
                    disabled={roundPage === 1}
                    className="p-1.5 rounded bg-dark-800 hover:bg-dark-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-2 text-gray-300 font-medium">
                    Page {roundPage} of {totalRoundPages}
                  </span>
                  <button
                    onClick={() => setRoundPage((p) => Math.min(totalRoundPages, p + 1))}
                    disabled={roundPage >= totalRoundPages}
                    className="p-1.5 rounded bg-dark-800 hover:bg-dark-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300"
                    title="Next Page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Bets for the selected round */}
        <div>
          <Card
            title={
              selectedRound ? (
                <div className="flex items-center justify-between w-full">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold text-white">
                    <span>Bets for Round</span>
                    <CopyableId
                      value={selectedRound}
                      label="Round ID"
                      full
                      valueClassName="rounded border border-brand-500/40 bg-brand-500/10 px-2 py-0.5 text-brand-400"
                    />
                  </div>
                  {selectedRoundObj && (
                    <span className="text-xs text-gray-400 font-normal">
                      Pool: <strong className="text-white">₹{paiseToRupees(selectedRoundObj.total_amount)}</strong>
                    </span>
                  )}
                </div>
              ) : (
                'Bets of Selected Round'
              )
            }
          >
            {loadingBets ? (
              <div className="py-16 flex justify-center">
                <Loader />
              </div>
            ) : !selectedRound ? (
              <div className="py-16 text-center text-gray-500">
                <p className="text-sm">Select any round from the left table to view all player bets and payouts.</p>
              </div>
            ) : bets && bets.items.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 border-b border-dark-700 text-left text-xs uppercase tracking-wider">
                        <th className="py-2.5 px-2">Game</th>
                        <th className="py-2.5 px-2">User</th>
                        <th className="py-2.5 px-2">Pred</th>
                        <th className="py-2.5 px-2 text-right">Bet</th>
                        <th className="py-2.5 px-2 text-right">Win</th>
                        <th className="py-2.5 px-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-800">
                      {bets.items.map((b) => (
                        <tr key={b.id} className="hover:bg-dark-800/40 transition">
                          <td className="py-2.5 px-2 text-xs font-medium text-gray-300 whitespace-nowrap">
                            {b.game_name || 'Colour Prediction'}
                          </td>
                          <td className="py-2.5 px-2">
                            <span
                              className="font-mono text-xs text-gray-200 hover:text-white"
                              title={b.user_name ? `${b.user_name} (${b.user_id})` : b.user_id}
                            >
                              {b.user_name || b.user_id.slice(0, 8)}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 font-bold text-white whitespace-nowrap">
                            {b.prediction}
                          </td>
                          <td className="py-2.5 px-2 text-right font-medium text-gray-200 whitespace-nowrap">
                            ₹{paiseToRupees(b.amount)}
                          </td>
                          <td className="py-2.5 px-2 text-right whitespace-nowrap">
                            {b.net_win_amount && b.net_win_amount > 0 ? (
                              <span className="text-green-400 font-semibold">
                                +₹{paiseToRupees(b.net_win_amount)}
                              </span>
                            ) : (
                              <span className="text-gray-500">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                b.status === 'WON'
                                  ? 'bg-green-900/50 text-green-400 border border-green-700/40'
                                  : b.status === 'LOST'
                                  ? 'bg-red-900/50 text-red-400 border border-red-700/40'
                                  : 'bg-yellow-900/50 text-yellow-400 border border-yellow-700/40'
                              }`}
                            >
                              {b.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls for Bets */}
                {bets.total > betPageSize && (
                  <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-dark-700/60 text-xs text-gray-400">
                    <div>
                      {bets.total} total bet{bets.total > 1 ? 's' : ''}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setBetPage((p) => Math.max(1, p - 1))}
                        disabled={betPage === 1}
                        className="p-1 rounded bg-dark-800 hover:bg-dark-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300"
                        title="Previous Page"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <span>
                        {betPage} / {totalBetPages}
                      </span>
                      <button
                        onClick={() => setBetPage((p) => Math.min(totalBetPages, p + 1))}
                        disabled={betPage >= totalBetPages}
                        className="p-1 rounded bg-dark-800 hover:bg-dark-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300"
                        title="Next Page"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="py-16 text-center text-gray-500">
                <p className="text-sm">No bets placed for this round.</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
