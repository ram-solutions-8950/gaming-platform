import { useEffect, useState } from 'react';
import { useEffect, useState, useCallback } from 'react';
import { useState, useCallback, useEffect } from 'react';
import { Card } from '../../components/common/Card';
import { Loader } from '../../components/common/Loader';
import { gameService } from '../../services/game';
import type { GameRoundAdmin, GameBet, PaginatedResult } from '../../types';
import { RefreshCw, Copy, Check, ChevronLeft, ChevronRight, Search, Filter } from 'lucide-react';

function paiseToRupees(p: number): string {
function paiseToRupees(p: number | undefined | null): string {
  if (typeof p !== 'number') return '0.00';
  return (p / 100).toFixed(2);
}

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
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
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    gameService.getAdminRounds(1, 10).then(setRounds).finally(() => setLoadingRounds(false));
  // Filters & Pagination for Rounds
  const [searchRound, setSearchRound] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roundPage, setRoundPage] = useState(1);
  const roundPageSize = 10;

  // Pagination for Bets
  const [betPage, setBetPage] = useState(1);
  const betPageSize = 20;

  // Copy feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchRounds = useCallback(async () => {
    try {
      const data = await gameService.getAdminRounds(
        roundPage,
        roundPageSize,
        undefined,
        statusFilter || undefined,
        searchRound.trim() || undefined
      );
      setRounds(data);
    } catch (err) {
      console.error('Failed to load admin rounds', err);
    } finally {
      setLoadingRounds(false);
      setRefreshing(false);
    }
  }, [roundPage, statusFilter, searchRound]);

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
      setLoadingBets(true);
      gameService.getAdminBets(selectedRound, 1, 50).then(setBets).finally(() => setLoadingBets(false));
      fetchBets(selectedRound, betPage);
    } else {
      setBets(null);
    }
  }, [selectedRound]);
  }, [selectedRound, betPage, fetchBets]);

  if (loadingRounds) return <div className="flex justify-center py-20"><Loader size="lg" /></div>;
  const handleRefresh = () => {
    setRefreshing(true);
    fetchRounds();
    if (selectedRound) {
      fetchBets(selectedRound, betPage);
    }
  };

  const handleCopy = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
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
      <div>
        <h1 className="text-3xl font-extrabold text-white">Game Management</h1>
        <p className="text-gray-400 mt-1">Monitor rounds and betting activity.</p>
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
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-primary-400' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Recent Rounds">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-dark-700 text-left">
                  <th className="py-2 px-2">Round ID</th>
                  <th className="py-2 px-2">Status</th>
                  <th className="py-2 px-2">Result</th>
                  <th className="py-2 px-2 text-right">Bets</th>
                  <th className="py-2 px-2 text-right">Total Pool</th>
                </tr>
              </thead>
              <tbody>
                {rounds?.items.map(r => (
                  <tr 
                    key={r.id} 
                    className={`border-b border-dark-800 cursor-pointer hover:bg-dark-800/50 ${selectedRound === r.id ? 'bg-dark-800' : ''}`}
                    onClick={() => setSelectedRound(r.id)}
                  >
                    <td className="py-3 px-2 font-mono text-xs">{r.id.slice(0, 8)}...</td>
                    <td className="py-3 px-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        r.status === 'COMPLETED' ? 'bg-gray-800 text-gray-300' : 
                        r.status === 'BETTING' ? 'bg-green-900/50 text-green-400' : 
                        'bg-yellow-900/50 text-yellow-400'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 px-2">
                      {r.result_color ? (
                        <span className="font-bold flex items-center gap-2">
                          <span className={`w-3 h-3 rounded-full inline-block ${
                            r.result_color === 'RED' ? 'bg-red-500' : 
                            r.result_color === 'GREEN' ? 'bg-green-500' : 'bg-violet-500'
                          }`}></span>
                          {r.result_number}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="py-3 px-2 text-right text-gray-300">{r.total_bets}</td>
                    <td className="py-3 px-2 text-right text-gray-300">₹{paiseToRupees(r.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: Recent Rounds (7 columns) */}
        <div className="xl:col-span-7">
          <Card title="Recent Rounds">
            {/* Search & Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by Round ID..."
                  value={searchRound}
                  onChange={(e) => {
                    setSearchRound(e.target.value);
                    setRoundPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
                />
              </div>
              <div className="relative w-full sm:w-44">
                <Filter className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setRoundPage(1);
                  }}
                  className="w-full pl-9 pr-8 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm text-white focus:outline-none focus:border-primary-500 appearance-none"
                >
                  <option value="">All Statuses</option>
                  <option value="BETTING">BETTING</option>
                  <option value="CALCULATING">CALCULATING</option>
                  <option value="COMPLETED">COMPLETED</option>
                </select>
              </div>
            </div>

        <Card title={selectedRound ? `Bets for Round ${selectedRound.slice(0, 8)}` : 'Select a round to view bets'}>
          {loadingBets ? <div className="py-10 flex justify-center"><Loader /></div> : 
           bets ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-dark-700 text-left">
                    <th className="py-2 px-2">User</th>
                    <th className="py-2 px-2">Pred</th>
                    <th className="py-2 px-2 text-right">Bet</th>
                    <th className="py-2 px-2 text-right">Win</th>
                    <th className="py-2 px-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bets.items.length === 0 ? (
                    <tr><td colSpan={5} className="py-4 text-center text-gray-500">No bets for this round.</td></tr>
                  ) : (
                    bets.items.map(b => (
                      <tr key={b.id} className="border-b border-dark-800">
                        <td className="py-2 px-2 font-mono text-xs">{b.user_id.slice(0, 8)}</td>
                        <td className="py-2 px-2 font-bold">{b.prediction}</td>
                        <td className="py-2 px-2 text-right">₹{paiseToRupees(b.amount)}</td>
                        <td className="py-2 px-2 text-right">
                           {b.net_win_amount ? <span className="text-green-400">+₹{paiseToRupees(b.net_win_amount)}</span> : '-'}
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
                          className={`cursor-pointer hover:bg-dark-800/60 transition ${
                            selectedRound === r.id ? 'bg-primary-950/30 border-l-2 border-primary-500' : ''
                          className={`cursor-pointer transition-colors ${
                            selectedRound === r.id ? 'bg-primary-950/40 border-l-2 border-primary-500' : 'hover:bg-dark-800/50'
                          }`}
                          onClick={() => {
                            setSelectedRound(r.id);
                            setSelectedRoundObj(r);
                            setBetPage(1);
                          }}
                        >
                          <td className="py-3 px-2">
                          <td className="py-3 px-2 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 font-mono text-xs text-gray-300">
                              <span title={r.id}>{r.id.slice(0, 8)}...</span>
                              <button
                                onClick={(e) => handleCopy(r.id, e)}
                                title="Copy Full Round ID"
                                className="p-1 hover:bg-dark-700 rounded text-gray-400 hover:text-white transition"
                              >
                                {copiedId === r.id ? (
                                  <Check className="w-3.5 h-3.5 text-green-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-2 font-medium text-gray-200 whitespace-nowrap">
                          <td className="py-3 px-2 text-xs font-semibold text-white whitespace-nowrap">
                            {r.game_name || 'Colour Prediction'}
                          </td>
                          <td className="py-3 px-2 text-xs text-gray-400 whitespace-nowrap">
                            {formatDateTime(r.started_at)}
                          </td>
                          <td className="py-3 px-2">
                          <td className="py-3 px-2 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                r.status === 'COMPLETED'
                                  ? 'bg-gray-800 text-gray-300 border border-gray-700'
                                  ? 'bg-gray-800 text-gray-300'
                                  : r.status === 'BETTING'
                                  ? 'bg-green-900/50 text-green-400 border border-green-700/50'
                                  : 'bg-yellow-900/50 text-yellow-400 border border-yellow-700/50'
                                  : 'bg-blue-900/50 text-blue-400 border border-blue-700/50'
                              }`}
                            >
                              {r.status}
                            </span>
                          </td>
                          <td className="py-3 px-2 whitespace-nowrap">{renderResultBadge(r)}</td>
                          <td className="py-3 px-2 text-right font-medium text-gray-200">
                            {r.total_bets ?? 0}
                          </td>
                          <td className="py-3 px-2 text-right font-semibold text-primary-400 whitespace-nowrap">
                          <td className="py-3 px-2 text-right text-xs text-gray-300 whitespace-nowrap">{r.total_bets}</td>
                          <td className="py-3 px-2 text-right text-xs font-semibold text-white whitespace-nowrap">
                            ₹{paiseToRupees(r.total_amount)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-gray-500">
                          No rounds match your search or filter.
                          No game rounds found matching your filter.
                        </td>
                        <td className="py-2 px-2">
                           <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            b.status === 'WON' ? 'bg-green-900/50 text-green-400' :
                            b.status === 'LOST' ? 'bg-red-900/50 text-red-400' :
                            'bg-yellow-900/50 text-yellow-400'
                          }`}>
                            {b.status}
                          </span>
                        </td>
                      </tr>
                    ))
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

        {/* Right: Bets of Round (5 columns) */}
        <div className="xl:col-span-5">
          <Card
            title={
              selectedRound ? (
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <span>Bets for Round</span>
                    <span className="font-mono text-xs text-primary-400 bg-primary-950/50 px-2 py-0.5 rounded border border-primary-800/60">
                      {selectedRound.slice(0, 8)}...
                    </span>
                    <button
                      onClick={(e) => handleCopy(selectedRound, e)}
                      title="Copy Full Round ID"
                      className="p-1 hover:bg-dark-700 rounded text-gray-400 hover:text-white transition"
                    >
                      {copiedId === selectedRound ? (
                        <Check className="w-3.5 h-3.5 text-green-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  {selectedRoundObj && (
                    <span className="text-xs text-gray-400 font-normal">
                      Pool: <strong className="text-white">₹{paiseToRupees(selectedRoundObj.total_amount)}</strong>
                    </span>
                  )}
                </tbody>
              </table>
            </div>
           ) : (
             <div className="py-10 text-center text-gray-500">Click on a round in the left panel.</div>
           )}
        </Card>
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
