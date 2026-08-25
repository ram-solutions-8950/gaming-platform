import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PokerTableInfo } from '../../services/poker';

interface PokerLobbyProps {
  tables: PokerTableInfo[];
  onSelectTable: (tableId: string, buyInAmount: number) => void;
  onCreateTable: (isPractice: boolean) => void;
  walletBalancePaise: number;
}

export function PokerLobby({
  tables,
  onSelectTable,
  onCreateTable,
}: PokerLobbyProps) {
  const navigate = useNavigate();
  const [selectedTable, setSelectedTable] = useState<PokerTableInfo | null>(null);

  return (
    <div className="poker-lobby-container">
      <div className="poker-lobby-header">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-lg border border-slate-700 transition shadow-sm flex items-center gap-1 active:scale-95"
          >
            ← Exit
          </button>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <span>♠️</span> Texas Hold'em Poker Lobby
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onCreateTable(false)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold shadow-lg transition-transform active:scale-95"
          >
            + Create Real Money Table
          </button>
          <button
            type="button"
            onClick={() => onCreateTable(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-bold shadow-lg transition-transform active:scale-95"
          >
            🎮 Practice Mode
          </button>
        </div>
      </div>

      <div className="poker-table-grid">
        {tables.map((table) => (
          <div
            key={table.id}
            className={`poker-lobby-card ${selectedTable?.id === table.id ? 'border-amber-400 ring-2 ring-amber-400/50' : ''}`}
            onClick={() => {
              setSelectedTable(table);
            }}
          >
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-bold text-white text-lg truncate">{table.name}</h3>
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${table.is_practice ? 'bg-purple-500/30 text-purple-300' : 'bg-emerald-500/30 text-emerald-300'}`}>
                {table.is_practice ? 'PRACTICE' : 'REAL MONEY'}
              </span>
            </div>

            <div className="text-xs text-gray-300 space-y-1 mb-4">
              <div className="flex justify-between">
                <span>Blinds:</span>
                <span className="font-semibold text-amber-300">₹{(table.small_blind/100).toFixed(0)} / ₹{(table.big_blind/100).toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Buy-in Range:</span>
                <span className="font-semibold">₹{(table.min_buy_in/100).toFixed(0)} - ₹{(table.max_buy_in/100).toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Players:</span>
                <span className="font-semibold">{table.player_count} / {table.max_players}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectTable(table.id, table.min_buy_in);
              }}
              className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold rounded-md text-sm shadow transition"
            >
              Join Table
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
