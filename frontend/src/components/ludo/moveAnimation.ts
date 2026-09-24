import type { LudoMatchState } from '../../types/ludo';
import type { ActiveMoveAnimation } from './LudoBoard';

// `data` of a TOKEN_MOVED message (see move_token in backend/app/services/ludo/engine.py)
export interface TokenMovedData {
  token_index?: number;
  new_position?: number;
  is_home?: boolean;
  captured?: { player_id: string; token_index: number } | null;
}

/**
 * Works out which token a TOKEN_MOVED message moved and where it started, by
 * comparing the state this client last knew (`before`) with the server's new
 * state (`after`). The message itself names neither the mover's colour nor the
 * starting square, and by the time it arrives the turn may already belong to
 * the next player.
 *
 * Returns null when the move can't be pinned down, or doesn't look like one
 * legal move (e.g. `before` is stale); the caller should then just show `after`.
 */
export const resolveMoveAnimation = (
  before: LudoMatchState | null,
  after: LudoMatchState,
  data: TokenMovedData | undefined,
  id: string
): ActiveMoveAnimation | null => {
  const tokenIndex = data?.token_index;
  const toPos = data?.new_position;
  if (!before || typeof tokenIndex !== 'number' || typeof toPos !== 'number') return null;

  for (const player of after.players) {
    const now = player.tokens.find((t) => t.token_index === tokenIndex);
    const prev = before.players
      .find((p) => p.id === player.id)
      ?.tokens.find((t) => t.token_index === tokenIndex);
    // The mover's token is the one that is on `new_position` now but wasn't before.
    if (!now || !prev || now.position !== toPos || prev.position === toPos) continue;

    const fromPos = prev.position;
    // One move either leaves the yard onto the start square or goes 1..6 squares forward.
    const isSingleMove = fromPos === -1 ? toPos === 0 : toPos - fromPos >= 1 && toPos - fromPos <= 6;
    if (!isSingleMove) return null;

    return {
      id,
      playerColor: player.color,
      playerId: player.id,
      tokenIndex,
      fromPosition: fromPos,
      toPosition: toPos,
      isCapture: Boolean(data?.captured),
      capturedToken: data?.captured
        ? { playerId: data.captured.player_id, tokenIndex: data.captured.token_index }
        : undefined,
      isHome: Boolean(data?.is_home),
    };
  }

  return null;
};
