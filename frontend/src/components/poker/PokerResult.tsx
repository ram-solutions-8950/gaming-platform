import { PokerCard } from './PokerCard';

interface WinnerSummary {
  user_id: string;
  username: string;
  amount: number;
  hand_description: string;
  best_five: string[];
}

interface PokerResultProps {
  winners: WinnerSummary[];
  onClose: () => void;
}

export function PokerResult({ winners, onClose }: PokerResultProps) {
  if (!winners || winners.length === 0) return null;

  return (
    <div className="poker-modal-overlay">
      <div className="poker-modal-card">
        <h2 className="text-xl font-bold text-amber-400 text-center mb-4">🏆 Showdown Winnings</h2>
        <div className="space-y-4 max-h-80 overflow-y-auto">
          {winners.map((w, idx) => (
            <div key={idx} className="bg-gray-800/80 p-3 rounded-lg border border-amber-500/30">
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-white text-base">{w.username}</span>
                <span className="font-extrabold text-emerald-400 text-lg">+₹{(w.amount / 100).toFixed(2)}</span>
              </div>
              <p className="text-xs text-amber-300 mb-2 font-medium">{w.hand_description}</p>
              {w.best_five && w.best_five.length > 0 && (
                <div className="flex gap-1 justify-center">
                  {w.best_five.map((card, cIdx) => (
                    <PokerCard key={cIdx} card={card} size="sm" />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-4 py-2 bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold rounded-lg text-sm transition shadow"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
