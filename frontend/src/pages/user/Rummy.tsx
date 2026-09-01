import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Trophy, Play, Plus, Key, ArrowLeft, RotateCcw,
  BookOpen, History, Flame, Zap
} from "lucide-react";
import GameTable from "../../components/rummy/RummyTable";
import MatchSearchOverlay from "../../components/rummy/MatchSearchOverlay";
import RulesModal from "../../components/rummy/RulesModal";
import { useRummyMatchmaking } from "../../hooks/useRummyMatchmaking";
import { RummyApi, type RummyTableOut, type RummyTableCreate } from "../../services/rummy";
import api from "../../services/api";
import "../../styles/rummy.css";

type Mode = "real_money" | "free" | "pool";
type PlayerFilter = "all" | 2 | 4;
type PoolLimit = 101 | 201;

interface Tier {
  id: string;
  name: string;
  pointValue: number | null;
  entryFeePaise: number;
  maxPlayers: 2 | 4;
  numDeals: number;
  poolLimit: PoolLimit | null;
}

const POINT_TIERS: { pointValue: number; entryFeePaise: number }[] = [
  { pointValue: 0.1, entryFeePaise: 800 },    // ₹8 entry (80 pts * ₹0.1)
  { pointValue: 0.5, entryFeePaise: 4000 },   // ₹40 entry
  { pointValue: 1.0, entryFeePaise: 8000 },   // ₹80 entry
  { pointValue: 5.0, entryFeePaise: 40000 },  // ₹400 entry
];

export function RummyPage() {
  const { tableId: routeTableId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryTableId = searchParams.get("tableId");
  const effectiveTableId = routeTableId || queryTableId || null;
  const [activeTableId, setActiveTableId] = useState<string | null>(effectiveTableId);
  const [balance, setBalance] = useState<number>(0);
  const [openTables, setOpenTables] = useState<RummyTableOut[]>([]);
  const [mode, setMode] = useState<Mode>("real_money");
  const [poolLimit, setPoolLimit] = useState<PoolLimit>(101);
  const [playerFilter, setPlayerFilter] = useState<PlayerFilter>("all");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const [createForm, setCreateForm] = useState<RummyTableCreate>({
    name: "VIP Table",
    mode: "real_money",
    max_players: 2,
    num_deals: 2,
    entry_fee_paise: 8000,
    pool_limit: null,
    is_private: true,
  });

  const token = localStorage.getItem("access_token");
  const navigate = useNavigate();

  const matchmaking = useRummyMatchmaking(token);

  // Sync activeTableId with route and URL query params
  useEffect(() => {
    setActiveTableId(routeTableId || queryTableId || null);
  }, [routeTableId, queryTableId]);

  // Fetch real balance from /wallet
  const fetchBalance = async () => {
    try {
      const res = await api.get("/wallet");
      if (res.data?.data?.balance !== undefined) {
        setBalance(res.data.data.balance / 100);
      }
    } catch {
      // ignore
    }
  };

  const fetchTables = async () => {
    try {
      const tables = await RummyApi.listTables();
      setOpenTables(tables);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchBalance();
    fetchTables();
    const timer = setInterval(() => {
      if (!activeTableId) {
        fetchTables();
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [activeTableId]);

  const loadHistory = async () => {
    try {
      const data = await RummyApi.getHistory();
      setHistory(data);
      setHistoryOpen(true);
    } catch {
      // ignore
    }
  };

  // Matchmaking success callback
  useEffect(() => {
    if (matchmaking.status === "matched" && matchmaking.tableId) {
      const tid = matchmaking.tableId;
      setSearchParams({ tableId: tid });
      setActiveTableId(tid);
    }
  }, [matchmaking.status, matchmaking.tableId, setSearchParams]);

  const tiers: Tier[] = useMemo(() => {
    if (mode === "free") {
      return [
        { id: "free-2", name: "2-Player Practice", pointValue: null, entryFeePaise: 0, maxPlayers: 2, numDeals: 2, poolLimit: null },
        { id: "free-4", name: "4-Player Practice", pointValue: null, entryFeePaise: 0, maxPlayers: 4, numDeals: 2, poolLimit: null },
      ];
    }
    if (mode === "pool") {
      return [
        { id: `pool-${poolLimit}-2`, name: `2-Player ${poolLimit} Pool`, pointValue: 1.0, entryFeePaise: 8000, maxPlayers: 2, numDeals: 1, poolLimit },
        { id: `pool-${poolLimit}-4`, name: `4-Player ${poolLimit} Pool`, pointValue: 1.0, entryFeePaise: 8000, maxPlayers: 4, numDeals: 1, poolLimit },
      ];
    }
    return POINT_TIERS.flatMap((pt) => [
      {
        id: `pts-${pt.pointValue}-2`,
        name: `2 Players (₹${pt.pointValue}/pt)`,
        pointValue: pt.pointValue,
        entryFeePaise: pt.entryFeePaise,
        maxPlayers: 2,
        numDeals: 2,
        poolLimit: null,
      },
      {
        id: `pts-${pt.pointValue}-4`,
        name: `4 Players (₹${pt.pointValue}/pt)`,
        pointValue: pt.pointValue,
        entryFeePaise: pt.entryFeePaise,
        maxPlayers: 4,
        numDeals: 2,
        poolLimit: null,
      },
    ]);
  }, [mode, poolLimit]);

  const filteredTiers = useMemo(() => {
    return tiers.filter((t) => playerFilter === "all" || t.maxPlayers === playerFilter);
  }, [tiers, playerFilter]);

  const handleStartMatch = (tier: Tier) => {
    matchmaking.start({
      name: tier.name,
      mode: tier.pointValue === null ? "free" : "real_money",
      entry_fee_paise: tier.entryFeePaise,
      max_players: tier.maxPlayers,
      num_deals: tier.numDeals,
      pool_limit: tier.poolLimit,
      turn_seconds: 30,
      starting_chips: 160,
    });
  };

  const handleCreatePrivateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setJoinError(null);
    try {
      const created = await RummyApi.createTable(createForm);
      setCreateModalOpen(false);
      setSearchParams({ tableId: created.id });
      setActiveTableId(created.id);
    } catch (err: any) {
      setJoinError(err.response?.data?.detail || "Failed to create private table");
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);
    setIsJoining(true);
    try {
      const table = await RummyApi.joinByCode(joinCodeInput.trim().toUpperCase());
      setJoinModalOpen(false);
      setSearchParams({ tableId: table.id });
      setActiveTableId(table.id);
    } catch (err: any) {
      setJoinError(err.response?.data?.detail || "Invalid or expired table code");
    } finally {
      setIsJoining(false);
    }
  };

  const handleLeaveTable = () => {
    setActiveTableId(null);
    setSearchParams({});
    if (routeTableId) {
      navigate("/games/rummy");
    }
    fetchBalance();
    fetchTables();
  };

  // If inside a game table, render GameTable
  if (activeTableId) {
    return <GameTable customTableId={activeTableId} onBack={handleLeaveTable} />;
  }

  return (
    <div className="rummy-page w-full min-h-full bg-[#07050f] text-slate-100 select-none pb-4">
      {/* Top Banner */}
      <div className="rummy-header bg-gradient-to-r from-amber-900/40 via-purple-900/40 to-slate-900/60 border-b border-amber-500/20 backdrop-blur-md px-3 sm:px-6 py-2.5">
        <div className="rummy-header-inner max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => navigate("/dashboard")}
              className="rummy-exit-btn px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 transition flex items-center gap-1 active:scale-95"
              title="Back to Dashboard"
            >
              <ArrowLeft size={14} />
              Exit
            </button>
            <div className="rummy-title-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xl">🃏</span>
                <h1 className="rummy-title text-base sm:text-lg font-bold bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent">
                  Indian Rummy
                </h1>
                <span className="rummy-badge px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full">
                  13 Cards
                </span>
              </div>
              <p className="rummy-subtitle text-xs text-slate-400">Pure Deals & Pool Rummy with Server-Side Fair Play</p>
            </div>
          </div>

          <div className="rummy-header-right flex items-center gap-3">
            <div className="rummy-balance-box bg-slate-900/80 border border-amber-500/30 rounded-xl px-4 py-1.5 flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Balance:</span>
              <span className="text-base font-bold text-amber-400 font-mono">₹{balance.toFixed(2)}</span>
            </div>
            <button
              onClick={() => setRulesOpen(true)}
              className="rummy-rules-btn px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-200 border border-white/10 flex items-center gap-1.5 transition-all"
            >
              <BookOpen size={14} className="text-amber-400" />
              Rules
            </button>
            <button
              onClick={loadHistory}
              className="rummy-history-btn px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-200 border border-white/10 flex items-center gap-1.5 transition-all"
            >
              <History size={14} className="text-amber-400" />
              History
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="rummy-content max-w-7xl mx-auto px-3 sm:px-6 py-3 space-y-4">
        {/* Game Mode Tabs & Action Buttons */}
        <div className="rummy-controls-bar flex items-center justify-between flex-wrap gap-4">
          <div className="rummy-mode-tabs flex p-1 bg-slate-900/90 border border-white/10 rounded-2xl gap-1">
            <button
              onClick={() => setMode("real_money")}
              className={`rummy-mode-tab px-5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                mode === "real_money"
                  ? "bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 shadow-lg shadow-amber-500/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Flame size={16} />
              Points Rummy
            </button>
            <button
              onClick={() => setMode("pool")}
              className={`rummy-mode-tab px-5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                mode === "pool"
                  ? "bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 shadow-lg shadow-amber-500/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Trophy size={16} />
              Pool Rummy
            </button>
            <button
              onClick={() => setMode("free")}
              className={`rummy-mode-tab px-5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                mode === "free"
                  ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-lg shadow-emerald-500/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Zap size={16} />
              Practice (Free)
            </button>
          </div>

          <div className="rummy-actions-group flex items-center gap-3">
            <button
              onClick={() => setJoinModalOpen(true)}
              disabled={joinModalOpen || isJoining}
              className="rummy-join-btn px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-white/10 flex items-center gap-2 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Key size={14} className="text-amber-400" />
              Join Private Table
            </button>
            <button
              onClick={() => setCreateModalOpen(true)}
              disabled={createModalOpen || isCreating}
              className="rummy-create-btn px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-xs font-bold text-white flex items-center gap-2 transition-all shadow-lg shadow-purple-600/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={14} />
              Create Custom Table
            </button>
          </div>
        </div>

        {/* Sub Filters for Pool Mode or Players */}
        <div className="rummy-filter-bar flex items-center justify-between flex-wrap gap-4 border-b border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <span className="rummy-filter-label text-xs font-semibold text-slate-400 uppercase tracking-wider">Players:</span>
            <div className="rummy-filter-group flex gap-1.5">
              {(["all", 2, 4] as PlayerFilter[]).map((pf) => (
                <button
                  key={pf}
                  onClick={() => setPlayerFilter(pf)}
                  className={`rummy-filter-chip px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    playerFilter === pf
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/50"
                      : "bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-white/5"
                  }`}
                >
                  {pf === "all" ? "All Sizes" : `${pf} Players`}
                </button>
              ))}
            </div>
          </div>

          {mode === "pool" && (
            <div className="flex items-center gap-3">
              <span className="rummy-filter-label text-xs font-semibold text-slate-400 uppercase tracking-wider">Pool Target:</span>
              <div className="rummy-filter-group flex gap-1.5">
                {([101, 201] as PoolLimit[]).map((pl) => (
                  <button
                    key={pl}
                    onClick={() => setPoolLimit(pl)}
                    className={`rummy-filter-chip px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      poolLimit === pl
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/50"
                        : "bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-white/5"
                    }`}
                  >
                    {pl} Pool
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Scrollable Table List Container */}
        <div className="rummy-table-list space-y-4">
          {/* Tiers Grid (Matchmaking Cards) */}
          <div className="rummy-tiers-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredTiers.map((t) => (
              <div
                key={t.id}
                className="rummy-tier-card bg-gradient-to-b from-slate-900/90 via-slate-900/70 to-slate-950/90 border border-amber-500/20 hover:border-amber-500/50 rounded-2xl p-5 flex flex-col justify-between gap-4 transition-all duration-300 hover:shadow-xl hover:shadow-amber-500/10 group"
              >
                <div>
                  <div className="rummy-card-top flex items-center justify-between mb-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/5 text-slate-300 border border-white/10">
                      {t.maxPlayers} Players
                    </span>
                    {t.poolLimit && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                        {t.poolLimit} Pool
                      </span>
                    )}
                    {t.pointValue !== null && !t.poolLimit && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        ₹{t.pointValue}/pt
                      </span>
                    )}
                  </div>

                  <h3 className="rummy-card-title text-base font-bold text-slate-100 group-hover:text-amber-300 transition-colors">
                    {t.name}
                  </h3>
                  <p className="rummy-card-desc text-xs text-slate-400 mt-1">
                    {t.pointValue === null
                      ? "Practice against bots & real players. No stake required."
                      : `Max loss capped at 80 pts (₹${((t.pointValue || 1) * 80).toFixed(0)}).`}
                  </p>
                </div>

                <div className="rummy-card-bottom border-t border-white/5 pt-4 flex items-center justify-between">
                  <div>
                    <span className="rummy-card-fee-label text-[10px] text-slate-400 block uppercase font-medium">Entry Fee</span>
                    <span className="rummy-card-fee text-base font-bold text-amber-400 font-mono">
                      {t.entryFeePaise === 0 ? "FREE" : `₹${(t.entryFeePaise / 100).toFixed(0)}`}
                    </span>
                  </div>
                  <button
                    onClick={() => handleStartMatch(t)}
                    className="rummy-card-play-btn px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all active:scale-95"
                  >
                    <Play size={13} fill="currentColor" />
                    Play Now
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Live Active Tables Table */}
          <div className="rummy-active-tables bg-slate-900/60 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <h2 className="text-base font-bold text-slate-200">Open Public Tables</h2>
              </div>
              <button
                onClick={fetchTables}
                className="text-xs text-slate-400 hover:text-amber-300 flex items-center gap-1 transition-colors"
              >
                <RotateCcw size={12} /> Refresh
              </button>
            </div>

            {openTables.length === 0 ? (
              <div className="py-10 text-center text-slate-500 text-sm">
                No open public tables right now. Click <strong>Play Now</strong> on any tier above to instantly create or join a matchmaking table!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 px-3">Table Name</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Seats</th>
                      <th className="py-2.5 px-3">Entry Fee</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {openTables.map((t) => (
                      <tr key={t.id} className="hover:bg-white/5 transition-colors">
                        <td className="py-3 px-3 font-semibold text-slate-200">{t.name}</td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                            t.mode === "real_money" ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300"
                          }`}>
                            {t.mode === "real_money" ? "Real Money" : "Practice"}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-300">
                          {t.online_players} / {t.max_players}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-amber-400">
                          {t.entry_fee_paise === 0 ? "FREE" : `₹${(t.entry_fee_paise / 100).toFixed(0)}`}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => {
                              setSearchParams({ tableId: t.id });
                              setActiveTableId(t.id);
                            }}
                            className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all shadow-sm"
                          >
                            Join Table
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Rules Modal */}
      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}

      {/* History Modal */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg p-6 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
              <h2 className="text-lg font-bold text-amber-400 flex items-center gap-2">
                <History size={18} /> Rummy Game History
              </h2>
              <button onClick={() => setHistoryOpen(false)} className="text-slate-400 hover:text-white text-lg">✕</button>
            </div>
            <div className="overflow-y-auto space-y-2 flex-1">
              {history.length === 0 ? (
                <p className="text-slate-500 text-center py-8 text-sm">No finished games recorded yet.</p>
              ) : (
                history.map((h) => (
                  <div key={h.id} className="p-3 rounded-xl bg-slate-800/60 border border-white/5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-slate-200">Table: {h.table_id?.substring(0, 8)}</p>
                      <p className="text-slate-400 text-[10px]">Deals played: {h.deals_played}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-bold text-emerald-400">
                        {h.prize_pool_paise > 0 ? `₹${(h.prize_pool_paise / 100).toFixed(2)}` : "FREE"}
                      </p>
                      <p className="text-slate-500 text-[10px]">
                        {h.created_at ? new Date(h.created_at).toLocaleTimeString() : ""}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Private Table Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-amber-500/30 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-amber-400 mb-4 flex items-center gap-2">
              <Plus size={18} /> Create Private Table
            </h2>
            {joinError && <p className="text-xs text-red-400 mb-3">{joinError}</p>}
            <form onSubmit={handleCreatePrivateTable} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Table Name</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Mode</label>
                  <select
                    value={createForm.mode}
                    onChange={(e) => setCreateForm({ ...createForm, mode: e.target.value as any })}
                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="real_money">Real Money</option>
                    <option value="free">Practice</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Max Players</label>
                  <select
                    value={createForm.max_players}
                    onChange={(e) => setCreateForm({ ...createForm, max_players: parseInt(e.target.value) })}
                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="2">2 Players</option>
                    <option value="4">4 Players</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Entry Fee (INR)</label>
                <input
                  type="number"
                  value={createForm.entry_fee_paise / 100}
                  onChange={(e) => setCreateForm({ ...createForm, entry_fee_paise: Math.max(0, parseInt(e.target.value || "0") * 100) })}
                  className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
                  min="0"
                  disabled={createForm.mode === "free"}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex-1 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 text-slate-950 font-bold flex-1"
                >
                  {isCreating ? "Creating..." : "Create Table"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join Private Table Modal */}
      {joinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-amber-500/30 rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center">
            <h2 className="text-lg font-bold text-amber-400 mb-2 flex items-center justify-center gap-2">
              <Key size={18} /> Join Private Table
            </h2>
            <p className="text-xs text-slate-400 mb-4">Enter the 6-character room code shared by your friend</p>
            {joinError && <p className="text-xs text-red-400 mb-3">{joinError}</p>}
            <form onSubmit={handleJoinByCode} className="space-y-4">
              <input
                type="text"
                placeholder="e.g. ABC123"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                maxLength={8}
                className="w-full text-center tracking-widest text-lg font-mono font-bold bg-slate-800 border border-white/10 rounded-xl px-4 py-2 text-amber-400 focus:outline-none focus:border-amber-500 uppercase"
                required
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setJoinModalOpen(false); setJoinError(null); }}
                  disabled={isJoining}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex-1 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isJoining}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 text-slate-950 text-xs font-bold flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isJoining ? "Joining..." : "Join Room"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Matchmaking Overlay */}
      {matchmaking.status !== "idle" && (
        <MatchSearchOverlay
          status={matchmaking.status}
          elapsedSeconds={matchmaking.elapsedSeconds}
          solo={matchmaking.solo}
          errorMessage={matchmaking.errorMessage}
          onCancel={matchmaking.cancel}
          onTryAgain={() => matchmaking.reset()}
          onBackToLobby={() => matchmaking.reset()}
          onCountdownDone={() => {
            if (matchmaking.tableId) {
              setSearchParams({ tableId: matchmaking.tableId });
              setActiveTableId(matchmaking.tableId);
            }
          }}
        />
      )}
    </div>
  );
}

export default RummyPage;
