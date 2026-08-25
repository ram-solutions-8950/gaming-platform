interface RulesModalProps {
  onClose: () => void;
}

const HAND_RANKS_GUIDE = [
  { rank: 1, name: 'Royal Flush', desc: 'A, K, Q, J, 10 of the same suit' },
  { rank: 2, name: 'Straight Flush', desc: '5 cards of the same suit in numerical sequence' },
  { rank: 3, name: 'Four of a Kind', desc: '4 cards of the same rank' },
  { rank: 4, name: 'Full House', desc: '3 of a kind plus a pair' },
  { rank: 5, name: 'Flush', desc: 'Any 5 cards of the same suit' },
  { rank: 6, name: 'Straight', desc: '5 cards in sequence of any suit (A-2-3-4-5 allowed)' },
  { rank: 7, name: 'Three of a Kind', desc: '3 cards of the same rank' },
  { rank: 8, name: 'Two Pair', desc: '2 different pairs of cards' },
  { rank: 9, name: 'One Pair', desc: '2 cards of the same rank' },
  { rank: 10, name: 'High Card', desc: 'Highest card plays when no combination is made' },
];

export function RulesModal({ onClose }: RulesModalProps) {
  return (
    <div className="poker-modal-overlay z-50">
      <div className="poker-modal-card max-w-md w-full">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-white">📜 Texas Hold'em Hand Hierarchy</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white font-bold text-xl">✕</button>
        </div>
        <div className="space-y-2 text-xs max-h-96 overflow-y-auto pr-1">
          {HAND_RANKS_GUIDE.map((h) => (
            <div key={h.rank} className="flex justify-between items-center p-2 rounded bg-gray-800/80 border border-gray-700">
              <span className="font-bold text-amber-300 w-32">{h.rank}. {h.name}</span>
              <span className="text-gray-300 text-right flex-1">{h.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
