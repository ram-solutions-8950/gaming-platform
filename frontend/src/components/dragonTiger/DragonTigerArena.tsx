import './DragonTigerArena.css';

const SUIT_GLYPH: Record<string, string> = { S: '\u2660', H: '\u2665', D: '\u2666', C: '\u2663' };

export type ArenaPhase = 'waiting' | 'revealing' | 'dragon-winning' | 'tiger-winning' | 'tie-result';

export function parseDtCard(code?: string | null) {
  if (!code || typeof code !== 'string') return null;
  const [rank, suit] = code.split('-');
  if (!rank || !suit) return null;
  return { rank, suit, red: suit === 'H' || suit === 'D' };
}

function PlayingCard({
  card,
  flipped,
  backMark,
}: {
  card?: string | null;
  flipped: boolean;
  backMark: string;
}) {
  const parsed = parseDtCard(card);

  return (
    <div className="dvt-card-holder">
      <div className={`dvt-card ${flipped ? 'flipped' : ''}`}>
        <div className="dvt-card-inner">
          <div className="dvt-card-face dvt-card-back">
            <div className="dvt-card-back-mark">
              {backMark}
            </div>
          </div>
          <div
            className={`dvt-card-face dvt-card-front ${
              parsed?.red ? 'red' : ''
            }`}
          >
            {parsed ? (
              <>
                <div>
                  <div className="dvt-rank">{parsed.rank}</div>
                  <div className="dvt-suit-sm">
                    {SUIT_GLYPH[parsed.suit] || parsed.suit}
                  </div>
                </div>

                <div className="dvt-suit-lg">
                  {SUIT_GLYPH[parsed.suit] || parsed.suit}
                </div>

                <div className="dvt-corner-br">
                  <div className="dvt-rank">{parsed.rank}</div>
                  <div className="dvt-suit-sm">
                    {SUIT_GLYPH[parsed.suit] || parsed.suit}
                  </div>
                </div>
              </>
            ) : (
              <div className="dvt-card-loading">?</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


function Side({
  kind,
  card,
  flipped,
}: {
  kind: 'dragon' | 'tiger';
  card?: string | null;
  flipped: boolean;
}) {
  const isDragon = kind === 'dragon';
  return (
    <div className={`dvt-side dvt-side-${kind}`}>
      <PlayingCard card={card} flipped={flipped} backMark={isDragon ? '\uD83D\uDC09' : '\uD83D\uDC2F'} />
    </div>
  );
}

export function DragonTigerArena({
  phase,
  dragonCard,
  tigerCard,
  dragonFlipped,
  tigerFlipped,
  showPlayer,
  playerWon,
  playerAmountLabel,
}: {
  phase: ArenaPhase;
  dragonCard?: string | null;
  tigerCard?: string | null;
  dragonFlipped: boolean;
  tigerFlipped: boolean;
  showPlayer: boolean;
  playerWon: boolean | null;
  playerAmountLabel?: string;
}) {
  const classes = ['dvt-arena', phase];
  if (showPlayer) classes.push('show-player');

  return (
    <div className={classes.join(' ')}>
      <div className="dvt-stage">
        <Side kind="dragon" card={dragonCard} flipped={dragonFlipped} />
        <div className="dvt-vs">VS</div>
        <Side kind="tiger" card={tigerCard} flipped={tigerFlipped} />
      </div>
      <div className="dvt-banner">
        {phase === 'tie-result' && <div className="dvt-tie-banner">✨ TIE ✨</div>}
        {showPlayer && playerWon === true && (
          <div className="dvt-player-banner dvt-player-win">🎉 YOU WON {playerAmountLabel}</div>
        )}
        {showPlayer && playerWon === false && (
          <div className="dvt-player-banner dvt-player-loss">BET LOST</div>
        )}
      </div>
    </div>
  );
}
