import React, { useEffect, useRef, useState } from 'react';
import type { LudoToken as TokenSchema } from '../../types/ludo';
import { getLogicalCellCoord } from './utils';
import { useLudo } from '../../contexts/LudoContext';
import { useAuthStore } from '../../store/authStore';
import './ludo-king.css';

interface LudoTokenProps {
  token: TokenSchema;
  color: string;
}

const TOKEN_FILL: Record<string, string> = {
  RED: 'radial-gradient(circle at 32% 28%, #ffcdd2 0%, #e53935 42%, #7f0000 100%)',
  GREEN: 'radial-gradient(circle at 32% 28%, #c8e6c9 0%, #43a047 42%, #1b5e20 100%)',
  YELLOW: 'radial-gradient(circle at 32% 28%, #fff9c4 0%, #fdd835 42%, #f57f17 100%)',
  BLUE: 'radial-gradient(circle at 32% 28%, #bbdefb 0%, #1e88e5 42%, #0d47a1 100%)',
};

export const LudoToken: React.FC<LudoTokenProps> = ({ token, color }) => {
  const { match, moveToken } = useLudo();
  const { user } = useAuthStore();
  const [hop, setHop] = useState(false);
  const prevPos = useRef(token.position);

  const coord = getLogicalCellCoord(color, token.position, token.token_index);

  useEffect(() => {
    if (prevPos.current !== token.position) {
      prevPos.current = token.position;
      setHop(true);
      const t = window.setTimeout(() => setHop(false), 500);
      return () => window.clearTimeout(t);
    }
  }, [token.position]);

  const me = match?.players.find(p => p.user_id === user?.id);
  const isMyToken = me?.color === color && token.player_id === me.id;
  const isMyTurn = match?.current_turn_color === color;
  const alreadyRolled = match?.last_dice_roll !== null && match?.last_dice_roll !== undefined;
  const isSelectable =
    isMyToken && isMyTurn && alreadyRolled && match?.status === 'IN_PROGRESS';

  const left = `${(coord.col * 100) / 15}%`;
  const top = `${(coord.row * 100) / 15}%`;

  return (
    <div
      onClick={() => {
        if (isSelectable) moveToken(token.token_index);
      }}
      className={`ludo-token-wrap absolute z-30 h-[6.66%] w-[6.66%] p-[0.45%] ${
        hop ? 'ludo-token-hop' : ''
      } ${isSelectable ? 'ludo-token-selectable cursor-pointer' : 'pointer-events-none'}`}
      style={{ left, top }}
    >
      {isSelectable && (
        <div className="absolute inset-0 animate-ping rounded-full bg-white/40" />
      )}
      <div
        className="ludo-token-body relative flex h-full w-full items-center justify-center rounded-full border-2 border-white shadow-[0_4px_10px_rgba(0,0,0,0.45)]"
        style={{ background: TOKEN_FILL[color] }}
      >
        <div className="h-[38%] w-[38%] rounded-full bg-white/35" />
        <div className="absolute top-[14%] left-[18%] h-[18%] w-[22%] rounded-full bg-white/75" />
      </div>
    </div>
  );
};
