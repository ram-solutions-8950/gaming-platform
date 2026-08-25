import React from 'react';
import { LudoProvider, useLudo } from '../../contexts/LudoContext';
import { LudoWaitingRoom } from '../../components/ludo/LudoWaitingRoom';
import { LudoBoard } from '../../components/ludo/LudoBoard';
import { LudoDice } from '../../components/ludo/LudoDice';
import { LudoPlayerPanel } from '../../components/ludo/LudoPlayerPanel';
import { LudoTurnIndicator } from '../../components/ludo/LudoTurnIndicator';
import '../../components/ludo/ludo-king.css';

import { useNavigate } from 'react-router-dom';

const LudoGame: React.FC = () => {
  const navigate = useNavigate();
  const { match, connectionStatus, error, clearError, resetMatch, joinMatchmaking, matchmakingStatus } = useLudo();

  if (!match || match.status === 'WAITING') {
    return (
      <div className="w-full h-full min-h-0 flex-1 flex flex-col items-center justify-center bg-transparent px-2 py-1 overflow-hidden select-none">
        <div className="w-full max-w-sm sm:max-w-md landscape:max-w-xl my-auto flex items-center justify-center">
          <LudoWaitingRoom />
        </div>
      </div>
    );
  }

  return (
    <div className="ludo-felt ludo-game-page h-full w-full overflow-y-auto overflow-x-hidden text-white flex flex-col">
      {connectionStatus === 'RECONNECTING' && (
        <div className="fixed left-0 right-0 top-0 z-[100] bg-yellow-500 py-2 text-center text-sm font-bold text-black">
          Connection lost — reconnecting...
        </div>
      )}

      {error && (
        <div
          onClick={clearError}
          className="fixed left-1/2 top-5 z-[100] max-w-md -translate-x-1/2 cursor-pointer rounded-xl bg-red-600/95 px-5 py-3 text-center shadow-2xl"
        >
          {error}
          <span className="ml-3 opacity-70">×</span>
        </div>
      )}

      <div className="ludo-game-container mx-auto w-full max-w-7xl">
        <header className="ludo-game-header">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="px-3 py-1.5 bg-black/40 hover:bg-black/60 text-white font-bold text-xs rounded-xl border border-white/20 transition shadow-sm flex items-center gap-1 active:scale-95"
            >
              ← Exit
            </button>
            <h1 className="ludo-logo" aria-label="Ludo">
              {['L', 'U', 'D', 'O'].map((letter, i) => (
                <span key={letter} style={{ color: ['#e53935', '#43a047', '#1e88e5', '#fdd835'][i] }}>
                  {letter}
                </span>
              ))}
            </h1>
          </div>

          <div className="ludo-header-stats">
            <div className="ludo-stat-card">
              <span>ENTRY</span>
              <strong className="entry">₹{(match.entry_fee / 100).toFixed(0)}</strong>
            </div>
            <div className="ludo-stat-card">
              <span>PRIZE</span>
              <strong className="prize">₹{(match.prize_pool / 100).toFixed(0)}</strong>
            </div>
            <div className="ludo-live-pill">
              <i /> LIVE
            </div>
          </div>
        </header>

        <main className="ludo-game-layout">
          <section className="ludo-board-column" aria-label="Ludo board">
            <LudoTurnIndicator />
            <div className="ludo-board-stage">
              <LudoBoard />
            </div>
            <div className="ludo-dice-below-board">
              <LudoDice />
            </div>
          </section>

          <aside className="ludo-side-column" aria-label="Match information">
            <LudoPlayerPanel />
          </aside>
        </main>
      </div>

      {match.status === 'COMPLETED' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm">
          <div className="w-full max-w-sm max-h-[82dvh] overflow-y-auto rounded-2xl border border-yellow-500/30 bg-[#1b5e20] p-4 text-center shadow-2xl flex flex-col justify-between">
            <div>
              <div className="mb-1 text-4xl">🏆</div>
              <h2 className="text-xl font-black text-white">Game Over</h2>
              <p className="mb-3 text-xs text-white/70">Final standings</p>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {(() => {
                  // Prepare standings with unique ranks
                  const players = match.players;
                  const withRank = players.filter(p => p.rank != null) as any[];
                  const withoutRank = players.filter(p => p.rank == null);
                  // sort by existing rank
                  withRank.sort((a, b) => (a.rank || 0) - (b.rank || 0));
                  const used = new Set<number>();
                  let nextRank = 1;
                  const final: any[] = [];
                  // assign ranks for players that already have a rank, fixing duplicates
                  withRank.forEach(p => {
                    let rank = p.rank as number;
                    if (used.has(rank)) {
                      rank = nextRank;
                    }
                    used.add(rank);
                    nextRank = Math.max(nextRank, rank + 1);
                    final.push({ ...p, displayRank: rank });
                  });
                  // assign ranks for players without a rank (e.g., forfeited)
                  withoutRank.forEach(p => {
                    const rank = nextRank;
                    nextRank += 1;
                    final.push({ ...p, displayRank: rank });
                  });
                  // sort by the displayRank for rendering
                  final.sort((a, b) => (a.displayRank || 0) - (b.displayRank || 0));
                  return final.map(p => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg bg-black/40 px-3 py-2 text-xs">
                      <span className="font-bold text-white capitalize">{p.color} Player</span>
                      <span className="font-extrabold text-gold-400">#{p.displayRank}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>

            <div className="mt-4 space-y-2 shrink-0">
              <button
                type="button"
                onClick={async () => {
                  const playerCount = matchmakingStatus?.player_count ?? 2;
                  const entryFee = matchmakingStatus?.entry_fee ?? 0;
                  await resetMatch();
                  await joinMatchmaking(playerCount, entryFee);
                }}
                className="w-full rounded-xl bg-gradient-to-b from-[#7cb342] to-[#33691e] py-2.5 font-bold text-xs text-white shadow-md active:scale-95 transition"
              >
                Play Again 🔄
              </button>
              <button
                type="button"
                onClick={() => {
                  resetMatch();
                  navigate('/dashboard', { replace: true });
                }}
                className="w-full rounded-xl bg-dark-800 hover:bg-dark-700 border border-dark-700 py-2.5 font-bold text-xs text-white transition active:scale-95"
              >
                ← Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const Ludo: React.FC = () => (
  <LudoProvider>
    <LudoGame />
  </LudoProvider>
);
