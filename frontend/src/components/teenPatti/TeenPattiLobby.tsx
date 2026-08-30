import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { teenPattiService, type TeenPattiTable } from '../../services/teenPatti';

interface TeenPattiLobbyProps {
  onJoinTable: (tableId: string) => void;
}

const BOOT_TIERS = [
  { name: 'Bronze Club', boot: 100, label: '₹1 Boot', minBuyIn: '₹50' },
  { name: 'Silver Suite', boot: 500, label: '₹5 Boot', minBuyIn: '₹250' },
  { name: 'Gold Royale', boot: 1000, label: '₹10 Boot', minBuyIn: '₹500' },
  { name: 'Platinum Arena', boot: 5000, label: '₹50 Boot', minBuyIn: '₹2,500' },
];

export const TeenPattiLobby: React.FC<TeenPattiLobbyProps> = ({ onJoinTable }) => {
  const navigate = useNavigate();
  const [tables, setTables] = useState<TeenPattiTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinError, setJoinError] = useState('');
  const [creatingTable, setCreatingTable] = useState(false);

  const fetchTables = async () => {
    try {
      setLoading(true);
      const data = await teenPattiService.getTables();
      setTables(data);
    } catch (e) {
      console.error('Failed to load tables', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTables();
  }, []);

  const handleCreateTierTable = async (tier: typeof BOOT_TIERS[0]) => {
    try {
      setJoinError('');
      setCreatingTable(true);
      const tbl = await teenPattiService.quickJoinTable(tier.boot, 'real');
      onJoinTable(tbl.id);
    } catch (e: any) {
      let errorMsg = 'Could not join or create table.';
      const status = e.response?.status;
      const detail = e.response?.data?.detail;
      const message = e.response?.data?.message;

      if (status === 401) {
        errorMsg = 'Authentication failure. Please log in again.';
      } else if (detail && typeof detail === 'string') {
        errorMsg = detail;
      } else if (message && typeof message === 'string') {
        errorMsg = message;
      } else if (status === 404) {
        errorMsg = 'Table unavailable or not found.';
      } else if (status === 409) {
        errorMsg = 'Table is currently full. Please try another stake.';
      } else if (status && status >= 500) {
        errorMsg = 'Game server error. Please try again shortly.';
      } else if (e.code === 'ERR_NETWORK' || !e.response) {
        errorMsg = 'Cannot connect to game server. Please check your connection.';
      } else if (e.message) {
        errorMsg = e.message;
      }
      setJoinError(errorMsg);
    } finally {
      setCreatingTable(false);
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) return;
    try {
      setJoinError('');
      const tbl = await teenPattiService.joinByCode(joinCodeInput.trim().toUpperCase());
      onJoinTable(tbl.id);
    } catch (e: any) {
      const detail = e.response?.data?.detail;
      const status = e.response?.status;
      let msg = 'Invalid or expired room code';
      if (status === 401) {
        msg = 'Authentication failure. Please log in again.';
      } else if (detail) {
        msg = detail;
      }
      setJoinError(msg);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto p-3 sm:p-4 pb-32 text-white space-y-4">
      {/* Sticky Header Bar */}
      <div className="sticky top-0 z-30 bg-[#020617]/95 backdrop-blur-md py-2.5 px-1 border-b border-white/10 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="px-3.5 py-1.5 bg-dark-800 hover:bg-dark-700 text-white font-bold text-xs rounded-xl border border-dark-700 transition shadow-sm flex items-center gap-1.5 active:scale-95 shrink-0"
        >
          ← Exit to Dashboard
        </button>
        <h1 className="text-xl sm:text-2xl font-black text-gold-400 uppercase tracking-wide text-center">
          👑 Royal Teen Patti
        </h1>
        <div className="w-20 hidden sm:block" />
      </div>

      {/* Prominent Error Banner */}
      {joinError && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 text-red-300 text-xs font-semibold flex items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <span>{joinError}</span>
          </div>
          <button
            type="button"
            onClick={() => setJoinError('')}
            className="text-red-300 hover:text-white font-bold text-sm px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Private Room Code Input */}
      <div className="bg-dark-900/90 border border-gold-500/30 rounded-2xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div>
          <div className="font-extrabold text-sm text-slate-100">Private Join Code</div>
          <div className="text-[11px] text-slate-400">Enter room code to play with friends</div>
        </div>
        <form onSubmit={handleJoinByCode} className="flex gap-2 items-center">
          <input
            type="text"
            placeholder="JOIN78"
            maxLength={8}
            value={joinCodeInput}
            onChange={(e) => setJoinCodeInput(e.target.value)}
            className="bg-dark-800 border border-dark-700 rounded-xl px-3 py-1.5 text-white font-mono font-bold text-xs uppercase focus:ring-2 focus:ring-gold-400 w-28 sm:w-36"
          />
          <button
            type="submit"
            className="tp-btn tp-btn-chaal px-4 py-1.5 text-xs font-extrabold rounded-xl"
          >
            Join Room
          </button>
        </form>
      </div>

      {/* Quick Play Stakes Grid */}
      <div>
        <h2 className="text-sm font-extrabold text-slate-200 mb-2">Quick Play Stakes</h2>
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {BOOT_TIERS.map((tier) => (
            <div
              key={tier.name}
              className="bg-gradient-to-br from-dark-800 to-dark-900 border border-gold-500/30 rounded-2xl p-3 flex flex-col justify-between shadow-lg hover:border-gold-400 transition"
            >
              <div>
                <div className="font-extrabold text-gold-400 text-xs">{tier.name}</div>
                <div className="text-lg font-black text-emerald-400 my-0.5">{tier.label}</div>
                <div className="text-[11px] text-slate-400">Min: {tier.minBuyIn}</div>
              </div>
              <button
                className="tp-btn tp-btn-raise mt-2 w-full py-1.5 text-xs font-black rounded-xl active:scale-95"
                onClick={() => handleCreateTierTable(tier)}
                disabled={creatingTable}
              >
                Play Now
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Live Tables */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-sm font-extrabold text-slate-200">Open Live Tables</h2>
          <button onClick={fetchTables} className="text-xs text-sky-400 font-bold hover:underline flex items-center gap-1">
            🔄 Refresh
          </button>
        </div>

        {loading ? (
          <div className="text-center text-slate-400 text-xs py-4">Loading tables...</div>
        ) : tables.length === 0 ? (
          <div className="text-center text-slate-500 text-xs py-4">No open tables. Click any stake tier above to start one instantly!</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {tables.map((t) => (
              <div
                key={t.id}
                className="bg-dark-800 border border-dark-700 rounded-xl p-3 flex justify-between items-center shadow-sm"
              >
                <div>
                  <div className="font-bold text-white text-xs">{t.name}</div>
                  <div className="text-[11px] text-slate-400">
                    Boot: ₹{(t.boot_amount / 100).toFixed(0)} • Players: {t.player_count}/{t.max_players}
                  </div>
                </div>
                <button
                  className="tp-btn tp-btn-chaal px-3 py-1 text-xs font-bold rounded-lg"
                  onClick={() => onJoinTable(t.id)}
                >
                  Join
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
