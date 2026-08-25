import React from 'react';
import { useLudo } from '../../contexts/LudoContext';
import { useAuthStore } from '../../store/authStore';

function paiseToRupees(p: number): string {
  return (p / 100).toFixed(2);
}

export const LudoPlayerPanel: React.FC = () => {
  const { match } = useLudo();
  const { user } = useAuthStore();

  if (!match) return null;

  const bgColors: Record<string, string> = {
    RED: 'bg-red-500',
    GREEN: 'bg-green-500',
    YELLOW: 'bg-yellow-500',
    BLUE: 'bg-blue-500',
  };

  const borderColors: Record<string, string> = {
    RED: 'border-red-500 shadow-red-500/50',
    GREEN: 'border-green-500 shadow-green-500/50',
    YELLOW: 'border-yellow-500 shadow-yellow-500/50',
    BLUE: 'border-blue-500 shadow-blue-500/50',
  };

  return (
    <div className="space-y-4">

      {/* Match Money Information */}
      <div className="rounded-xl border border-yellow-700/50 bg-gradient-to-br from-yellow-950/50 via-amber-950/30 to-gray-900 p-4 shadow-lg">

        <div className="text-center mb-3">
          <div className="text-yellow-400 text-xs font-bold uppercase tracking-wider">
            Match Information
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">

          {/* Entry Fee */}
          <div className="rounded-lg bg-gray-900/70 border border-gray-700 p-3 text-center">
            <div className="text-gray-400 text-xs font-semibold uppercase">
              Entry Fee
            </div>

            <div className="text-white text-xl font-extrabold mt-1">
              ₹{paiseToRupees(match.entry_fee)}
            </div>
          </div>

          {/* Players */}
          <div className="rounded-lg bg-gray-900/70 border border-gray-700 p-3 text-center">
            <div className="text-gray-400 text-xs font-semibold uppercase">
              Players
            </div>

            <div className="text-white text-xl font-extrabold mt-1">
              {match.players.length}
            </div>
          </div>

        </div>

        {/* Prize Pool */}
        {match.prize_pool > 0 && (
          <div className="mt-3 rounded-lg bg-yellow-900/30 border border-yellow-600/50 p-3 text-center">

            <div className="text-yellow-400 text-xs font-bold uppercase tracking-wider">
              🏆 Prize Pool
            </div>

            <div className="text-white text-2xl font-black mt-1">
              ₹{paiseToRupees(match.prize_pool)}
            </div>

          </div>
        )}

      </div>

      {/* Players */}
      <div className="grid grid-cols-2 gap-4">

        {match.players.map((p, idx) => {

          const isMyTurn = match.current_turn_color === p.color;
          const isMe = p.user_id === user?.id;
          const isWinner = p.rank === 1;

          return (
            <div
              key={p.id}
              className={`p-4 rounded-xl border-2 transition-all ${
                isWinner && match.is_settled
                  ? 'border-yellow-400 shadow-[0_0_20px_rgba(234,179,8,0.4)] bg-gradient-to-br from-yellow-900/30 to-gray-900'
                  : isMyTurn
                    ? `${borderColors[p.color]} shadow-[0_0_15px_rgba(0,0,0,0.5)] scale-105`
                    : 'border-gray-700 bg-gray-800'
              }`}
            >

              {/* Player Header */}
              <div className="flex items-center space-x-3 mb-2">

                <div
                  className={`w-6 h-6 rounded-full ${bgColors[p.color]}`}
                />

                <span className="font-bold text-white">
                  Player {idx + 1} {isMe && '(You)'}
                </span>

              </div>

              {/* Player Status */}
              <div className="flex justify-between items-center text-sm">

                <span className="text-gray-400">
                  Tokens home: {p.tokens.filter(t => t.is_home).length}/4
                </span>

                {p.rank && (
                  <span
                    className={`px-2 py-1 font-bold rounded text-xs ${
                      p.rank === 1
                        ? 'bg-yellow-500 text-yellow-900'
                        : 'bg-gray-600 text-gray-200'
                    }`}
                  >
                    {p.rank === 1
                      ? '🥇 Winner'
                      : `Rank #${p.rank}`}
                  </span>
                )}

              </div>

              {/* Winner Prize */}
              {isWinner &&
                match.is_settled &&
                match.prize_pool > 0 && (
                  <div className="mt-2 text-center py-1 bg-green-900/50 rounded text-green-400 text-sm font-semibold">
                    Won ₹{paiseToRupees(match.prize_pool)}
                  </div>
                )}

            </div>
          );
        })}

      </div>

    </div>
  );
};