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
import type { GameRoundAdmin, GameBet, PaginatedResult } from '../../types';
import { RefreshCw, ChevronLeft, ChevronRight, Filter, RotateCcw } from 'lucide-react';

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
  // Filters & Pagination for Rounds
  const [searchRound, setSearchRound] = useState('');
  const debouncedSearchRound = useDebouncedValue(searchRound);
  const [statusFilter, setStatusFilter] = useState('');
  const [roundPage, setRoundPage] = useState(1);
  const roundPageSize = 10;

  // Pagination for Bets
  const [betPage, setBetPage] = useState(1);
  const betPageSize = 20;

  const fetchRounds = useCallback(async () => {
    try {
      const data = await gameService.getAdminRounds(
        roundPage,
        roundPageSize,
        undefined,
        statusFilter || undefined,
        debouncedSearchRound.trim() || undefined
      );
      setRounds(data);
    } catch (err) {
      console.error('Failed to load admin rounds', err);
    } finally {
      setLoadingRounds(false);
    }
  }, [roundPage, statusFilter, debouncedSearchRound]);

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
        fetchRounds(),
        selectedRound ? fetchBets(selectedRound, betPage) : Promise.resolve(),
      ]);
    });

  const filtersActive = Boolean(searchRound || statusFilter);

  const handleResetFilters = () => {
    setSearchRound('');
    setStatusFilter('');
    setRoundPage(1);
  };

  const totalRoundPages = rounds ? Math.max(1, Math.ceil(rounds.total / roundPageSize)) : 1;
  const totalBetPages = bets ? Math.max(1, Math.ceil(bets.total / betPageSize)) : 1;

  const renderResultBadge = (r: GameRoundAdmin) => {
    if (r.status === 'BETTING') {
      return <span className="text-yellow-400 text-xs font-semibold">Active...</span>;
    }
    if (r.status === 'CALCULATING') {
      return <span className="text-blue-400 text-xs font-semibold">Calculating...</span>;
    }
    if (r.result_data && typeof r.result_data === 'object') {
      if (r.result_data.winner) {
        return (
          <span className="px-2 py-0.5 rounded text-xs font-bold bg-purple-900/50 text-purple-300 border border-purple-700/50">
            {r.result_data.winner}
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
