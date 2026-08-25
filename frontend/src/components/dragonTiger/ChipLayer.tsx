import { useEffect, useState, useRef } from 'react';
import type { GameBet } from '../../types';

interface ChipLayerProps {
  bets: GameBet[];
}

interface ChipData {
  id: string;
  amount: number;
  prediction: string;
  status: string;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  animating: boolean;
}

function paiseToRupees(p: number): string {
  return (p / 100).toFixed(0);
}

export function ChipLayer({ bets }: ChipLayerProps) {
  const [chips, setChips] = useState<ChipData[]>([]);
  const seenBets = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Check for new bets
    const newChips: ChipData[] = [];
    
    bets.forEach((bet) => {
      // PENDING bets are confirmed placed bets that haven't been resolved
      if (!seenBets.current.has(bet.id)) {
        seenBets.current.add(bet.id);
        
        // Find source and target elements based on data attributes
        const amountBtn = document.querySelector(`button[data-amount="${bet.amount}"]`);
        const zoneBtn = document.querySelector(`button[data-zone="${bet.prediction}"]`);
        
        let startX = window.innerWidth / 2;
        let startY = window.innerHeight;
        let targetX = window.innerWidth / 2;
        let targetY = window.innerHeight / 2;

        if (amountBtn) {
          const rect = amountBtn.getBoundingClientRect();
          startX = rect.left + rect.width / 2;
          startY = rect.top + rect.height / 2;
        }

        if (zoneBtn) {
          const rect = zoneBtn.getBoundingClientRect();
          // Add some randomness so chips don't perfectly stack
          const offsetX = (Math.random() - 0.5) * (rect.width * 0.4);
          const offsetY = (Math.random() - 0.5) * (rect.height * 0.4);
          targetX = rect.left + rect.width / 2 + offsetX;
          targetY = rect.top + rect.height / 2 + offsetY;
        }

        newChips.push({
          id: bet.id,
          amount: bet.amount,
          prediction: bet.prediction,
          status: bet.status,
          startX,
          startY,
          targetX,
          targetY,
          animating: true
        });
      }
    });

    if (newChips.length > 0) {
      setChips((prev) => [...prev, ...newChips]);
      
      // Trigger animation after a short delay to allow initial render at startX/Y
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setChips((current) => 
            current.map(c => 
              newChips.find(nc => nc.id === c.id) 
                ? { ...c, animating: false } 
                : c
            )
          );
        });
      });
    }
  }, [bets]);

  // Update statuses or remove bets that no longer exist (e.g. next round)
  useEffect(() => {
    const betIds = new Set(bets.map(b => b.id));
    setChips(prev => {
      let changed = false;
      const next = prev.filter(c => {
        if (!betIds.has(c.id)) {
          changed = true;
          return false;
        }
        return true;
      }).map(c => {
        const bet = bets.find(b => b.id === c.id);
        if (bet && bet.status !== c.status) {
          changed = true;
          return { ...c, status: bet.status };
        }
        return c;
      });
      
      if (changed) {
        seenBets.current.clear();
        next.forEach(c => seenBets.current.add(c.id));
        return next;
      }
      return prev;
    });
  }, [bets]);

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      {chips.map((chip) => {
        const x = chip.animating ? chip.startX : chip.targetX;
        const y = chip.animating ? chip.startY : chip.targetY;
        
        let bgStyle = 'bg-gradient-to-br from-zinc-700 to-zinc-900'; // Default
        if (chip.prediction === 'DRAGON') bgStyle = 'bg-gradient-to-br from-red-600 to-red-900';
        else if (chip.prediction === 'TIGER') bgStyle = 'bg-gradient-to-br from-amber-500 to-yellow-800';
        else if (chip.prediction === 'TIE') bgStyle = 'bg-gradient-to-br from-emerald-500 to-green-900';
        
        return (
          <div
            key={chip.id}
            className={`absolute w-10 h-10 -ml-5 -mt-5 rounded-full shadow-lg border-2 border-dashed border-white/60 flex items-center justify-center font-bold text-[11px] text-white ${bgStyle} shadow-black/80`}
            style={{
              left: x,
              top: y,
              transition: 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
              transform: chip.animating ? 'scale(1.5)' : 'scale(1)',
              opacity: 1
            }}
          >
            ₹{paiseToRupees(chip.amount)}
          </div>
        );
      })}
    </div>
  );
}
