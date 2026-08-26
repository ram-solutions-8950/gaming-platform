import React, { useEffect, useRef, useState, useCallback } from 'react';
import aviatorImg from '../../assets/aviator-3d.png';
import dragonImg from '../../assets/dragon-hero.png';
import andarBaharHero from '../../assets/andar-bahar-hero.png';
import rouletteHero from '../../assets/roulette-hero.png';
import chickenRoadHero from '../../assets/chicken-road-3d.jpg';
import triple777Logo from '../../assets/triple-777-logo.png';
import pokerHero from '../../assets/poker-hero.jpg';
import teenPattiHero from '../../assets/teen-patti-hero.jpg';
import baccaratHero from '../../assets/baccarat-hero.jpg';
import { AnimatedCasinoGameLogo } from './AnimatedCasinoGameLogo';

/* ─── Types ─── */
interface GameCardData {
  id: string;
  name: string;
  subtitle: string;
  emoji: string;
  gradient: string;
  badge?: 'HOT' | 'NEW' | null;
  path: string;
}

interface CarouselSet {
  games: GameCardData[];
}

interface Props {
  sets: CarouselSet[];
  onGameClick: (path: string) => void;
  autoPlayInterval?: number;
}

/* ─── Helpers ─── */
const isLudoGame = (game: GameCardData) => {
  const value = `${game.id} ${game.name} ${game.path}`.toLowerCase();
  return value.includes('ludo');
};

const isColourPredictionGame = (game: GameCardData) => {
  const value = `${game.id} ${game.name} ${game.path}`.toLowerCase();

  return (
    value.includes('colour') ||
    value.includes('color') ||
    value.includes('prediction')
  );
};

const isAviatorGame = (game: GameCardData) => {
  const value = `${game.id} ${game.name} ${game.path}`.toLowerCase();
  return value.includes('aviator') || value.includes('crash');
};

const isDragonTigerGame = (game: GameCardData) => {
  const value = `${game.id} ${game.name} ${game.path}`.toLowerCase();
  return value.includes('dragon') || value.includes('tiger');
};

const isAndarBaharGame = (game: GameCardData) => {
  const value = `${game.id} ${game.name} ${game.path}`.toLowerCase();
  return value.includes('andar') || value.includes('bahar');
};

const isRouletteGame = (game: GameCardData) => {
  const value = `${game.id} ${game.name} ${game.path}`.toLowerCase();
  return value.includes('roulette');
};

const isChickenRoadGame = (game: GameCardData) => {
  const value = `${game.id} ${game.name} ${game.path}`.toLowerCase();
  return value.includes('chicken') || value.includes('road');
};

const isTriple777Game = (game: GameCardData) => {
  const value = `${game.id} ${game.name} ${game.path}`.toLowerCase();
  return value.includes('triple-777') || value.includes('triple 777') || value.includes('777');
};

const isPokerGame = (game: GameCardData) => {
  const value = `${game.id} ${game.name} ${game.path}`.toLowerCase();
  return value.includes('poker');
};

const isTeenPattiGame = (game: GameCardData) => {
  const value = `${game.id} ${game.name} ${game.path}`.toLowerCase();
  return value.includes('teen') || value.includes('patti');
};

const isBaccaratGame = (game: GameCardData) => {
  const value = `${game.id} ${game.name} ${game.path}`.toLowerCase();
  return value.includes('baccarat');
};

const isCardGame = (game: GameCardData) => {
  const value = `${game.id} ${game.name} ${game.path}`.toLowerCase();
  return (
    value.includes('rummy') ||
    value.includes('teen') ||
    value.includes('patti') ||
    value.includes('poker') ||
    value.includes('baccarat') ||
    value.includes('30 cards')
  );
};

/* ─── Poker Animated Artwork ─── */
const PokerAnimatedArtwork: React.FC = () => {
  return (
    <div className="poker-card-art" aria-hidden="true">
      <div className="poker-card-aura" />
      <img
        className="poker-hero-img"
        src={pokerHero}
        alt="Texas Hold'em Poker"
        loading="lazy"
        decoding="async"
      />
      <div className="poker-dark-overlay" />
      <div className="casino-card-art-sweep" />
    </div>
  );
};

/* ─── Teen Patti Animated Artwork ─── */
const TeenPattiAnimatedArtwork: React.FC = () => {
  return (
    <div className="teen-patti-card-art" aria-hidden="true">
      <div className="teen-patti-card-aura" />
      <img
        className="teen-patti-hero-img"
        src={teenPattiHero}
        alt="Teen Patti (3 Patti)"
        loading="lazy"
        decoding="async"
      />
      <div className="teen-patti-dark-overlay" />
      <div className="casino-card-art-sweep" />
    </div>
  );
};

/* ─── Baccarat Animated Artwork ─── */
const BaccaratAnimatedArtwork: React.FC = () => {
  return (
    <div className="baccarat-card-art" aria-hidden="true">
      <div className="baccarat-card-aura" />
      <img
        className="baccarat-hero-img"
        src={baccaratHero}
        alt="Baccarat (Coming Soon)"
        loading="lazy"
        decoding="async"
      />
      <div className="baccarat-dark-overlay" />
      <div className="casino-card-art-sweep" />
    </div>
  );
};

/* ─── Triple 777 Animated Artwork ─── */
const Triple777AnimatedArtwork: React.FC = () => {
  return (
    <div className="casino-card-art-container triple-777-card-art" aria-hidden="true">
      <div className="casino-card-art-aura triple-777-card-aura" />
      <div className="triple-777-logo-wrap">
        <img
          className="triple-777-hero-img"
          src={triple777Logo}
          alt="Triple 777"
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className="casino-card-art-overlay triple-777-dark-overlay" />
      <div className="casino-card-art-sweep" />
    </div>
  );
};

/* ─── Chicken Road Animated Artwork ─── */
const ChickenRoadAnimatedArtwork: React.FC = () => {
  return (
    <div className="chicken-road-card-art" aria-hidden="true">
      <div className="chicken-road-card-aura" />
      <img
        className="chicken-road-hero-img"
        src={chickenRoadHero}
        alt="Chicken Road"
      />
      <div className="chicken-road-dark-overlay" />
    </div>
  );
};

/* ─── Roulette Animated Artwork ─── */
const RouletteAnimatedArtwork: React.FC = () => {
  return (
    <div className="roulette-card-art" aria-hidden="true">
      <div className="roulette-card-aura" />
      <img
        className="roulette-hero-img"
        src={rouletteHero}
        alt=""
      />
      <div className="roulette-dark-overlay" />
    </div>
  );
};

/* ─── Andar Bahar Animated Artwork ─── */
const AndarBaharAnimatedArtwork: React.FC = () => {
  return (
    <div className="andar-bahar-card-art" aria-hidden="true">
      <div className="andar-bahar-card-aura" />
      <img
        className="andar-bahar-hero-img"
        src={andarBaharHero}
        alt=""
      />
      <div className="andar-bahar-dark-overlay" />
    </div>
  );
};

/* ─── Dragon Tiger Animated Artwork ─── */
const DragonTigerAnimatedArtwork: React.FC = () => {
  return (
    <div className="dragon-tiger-card-art" aria-hidden="true">
      <div className="dragon-tiger-card-aura" />
      <img src={dragonImg} alt="Dragon Tiger Hero" className="dragon-tiger-hero-img" />
      <div className="dragon-tiger-dark-overlay" />
    </div>
  );
};

/* ─── Aviator Animated Artwork ─── */
const AviatorAnimatedArtwork: React.FC = () => {
  return (
    <div className="aviator-card-art" aria-hidden="true">
      <div className="aviator-card-aura" />
      <div className="aviator-motion-trail" />
      <div className="aviator-engine-glow" />
      <div className="aviator-plane-img-wrap">
        <img
          src={aviatorImg}
          alt="Aviator 3D Plane"
          className="aviator-plane-img"
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className="aviator-dark-overlay" />
      <div className="aviator-light-sweep" />
    </div>
  );
};

/* ─── Ludo Animated Artwork ─── */
const LudoAnimatedArtwork: React.FC = () => {
  return (
    <div className="ludo-card-art" aria-hidden="true">
      <div className="ludo-card-glow" />

      <div className="ludo-pawn ludo-pawn--red">
        <span />
      </div>

      <div className="ludo-pawn ludo-pawn--green">
        <span />
      </div>

      <div className="ludo-pawn ludo-pawn--gold">
        <span />
      </div>

      <div className="ludo-pawn ludo-pawn--blue">
        <span />
      </div>

      <div className="ludo-mini-board">
        <div className="ludo-board-red" />
        <div className="ludo-board-green" />
        <div className="ludo-board-blue" />
        <div className="ludo-board-yellow" />
        <div className="ludo-board-center" />
      </div>

      <div className="ludo-dice">
        <div className="ludo-dice-face">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>

      <span className="ludo-spark ludo-spark--1" />
      <span className="ludo-spark ludo-spark--2" />
      <span className="ludo-spark ludo-spark--3" />
      <span className="ludo-spark ludo-spark--4" />
    </div>
  );
};

/* ─── Colour Prediction Artwork ─── */
const ColourPredictionArtwork: React.FC = () => {
  return (
    <div className="colour-card-art" aria-hidden="true">
      <div className="colour-orbit colour-orbit--outer" />
      <div className="colour-orbit colour-orbit--inner" />

      <div className="colour-ball colour-ball--red" />
      <div className="colour-ball colour-ball--green" />
      <div className="colour-ball colour-ball--yellow" />
      <div className="colour-ball colour-ball--blue" />

      <div className="colour-rainbow">
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
};

/* ─── Component ─── */
export const AnimatedGameCarousel: React.FC<Props> = ({
  sets,
  onGameClick,
  autoPlayInterval = 4000,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [direction, setDirection] = useState<'left' | 'right'>('left');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalSets = sets.length;

  const goToNext = useCallback(() => {
    if (isTransitioning || totalSets <= 1) return;

    setDirection('left');
    setIsTransitioning(true);

    transitionTimerRef.current = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % totalSets);
      setIsTransitioning(false);
    }, 600);
  }, [isTransitioning, totalSets]);

  /* Autoplay */
  useEffect(() => {
    if (totalSets <= 1) return;

    timerRef.current = setInterval(goToNext, autoPlayInterval);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
    };
  }, [goToNext, autoPlayInterval, totalSets]);

  /* Keep index valid if sets change */
  useEffect(() => {
    if (totalSets > 0 && currentIndex >= totalSets) {
      setCurrentIndex(0);
    }
  }, [currentIndex, totalSets]);

  if (!sets.length) {
    return null;
  }

  const currentSet = sets[currentIndex];

  return (
    <div className="game-carousel-container">
      <div
        className={`game-carousel-track ${
          isTransitioning
            ? direction === 'left'
              ? 'slide-out-left'
              : 'slide-out-right'
            : 'slide-in'
        }`}
      >
        <div className="game-carousel-grid">
          {currentSet.games.map((game) => {
            const ludo = isLudoGame(game);
            const colourPrediction = isColourPredictionGame(game);
            const aviator = isAviatorGame(game);
            const dragonTiger = isDragonTigerGame(game);
            const andarBahar = isAndarBaharGame(game);
            const roulette = isRouletteGame(game);
            const chickenRoad = isChickenRoadGame(game);
            const triple777 = isTriple777Game(game);
            const poker = isPokerGame(game);
            const teenPatti = isTeenPattiGame(game);
            const baccarat = isBaccaratGame(game);
            const cardGame = isCardGame(game);

            const cardTypeClass = ludo
              ? 'game-card--ludo'
              : colourPrediction
                ? 'game-card--colour-prediction'
                : aviator
                  ? 'game-card--aviator'
                  : dragonTiger
                    ? 'game-card--dragon-tiger'
                    : andarBahar
                      ? 'game-card--andar-bahar'
                      : roulette
                        ? 'game-card--roulette'
                        : chickenRoad
                          ? 'game-card--chicken-road'
                          : triple777
                            ? 'game-card--triple-777'
                            : poker
                              ? 'game-card--poker'
                              : teenPatti
                                ? 'game-card--teen-patti'
                                : baccarat
                                  ? 'game-card--baccarat'
                                  : cardGame
                                    ? 'game-card--casino-card'
                                    : '';

            const hasCustomArtwork =
              ludo ||
              colourPrediction ||
              aviator ||
              dragonTiger ||
              andarBahar ||
              roulette ||
              chickenRoad ||
              triple777 ||
              poker ||
              teenPatti ||
              baccarat ||
              cardGame;

            return (
              <div
                key={game.id}
                className="game-card-wrapper"
                onClick={() =>
                  game.path !== '#' && onGameClick(game.path)
                }
                onKeyDown={(e) => {
                  if (
                    e.key === 'Enter' &&
                    game.path !== '#'
                  ) {
                    onGameClick(game.path);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div
                  className={[
                    'game-card',
                    game.gradient,
                    cardTypeClass,
                    game.path === '#'
                      ? 'game-card--disabled'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {/* Glossy moving light */}
                  <div className="game-card__shine" />

                  {/* Ludo-specific artwork */}
                  {ludo && <LudoAnimatedArtwork />}

                  {/* Colour Prediction artwork */}
                  {colourPrediction && <ColourPredictionArtwork />}

                  {/* Aviator-specific 3D artwork */}
                  {aviator && <AviatorAnimatedArtwork />}

                  {/* Dragon Tiger full card artwork */}
                  {dragonTiger && <DragonTigerAnimatedArtwork />}

                  {/* Andar Bahar full card artwork */}
                  {andarBahar && <AndarBaharAnimatedArtwork />}

                  {/* Roulette full card artwork */}
                  {roulette && <RouletteAnimatedArtwork />}

                  {/* Chicken Road full card artwork */}
                  {chickenRoad && <ChickenRoadAnimatedArtwork />}

                  {/* Triple 777 full card artwork */}
                  {triple777 && <Triple777AnimatedArtwork />}

                  {/* Poker full card artwork */}
                  {poker && <PokerAnimatedArtwork />}

                  {/* Teen Patti full card artwork */}
                  {teenPatti && <TeenPattiAnimatedArtwork />}

                  {/* Baccarat full card artwork */}
                  {baccarat && <BaccaratAnimatedArtwork />}

                  {/* Universal 3D Casino Card Game Artwork for Rummy etc. */}
                  {cardGame && !dragonTiger && !andarBahar && !chickenRoad && !triple777 && !poker && !teenPatti && !baccarat && (
                    <AnimatedCasinoGameLogo game={game.id} />
                  )}

                  {/* Badge */}
                  {game.badge && (
                    <span
                      className={`game-badge ${
                        game.badge === 'HOT'
                          ? 'game-badge--hot'
                          : 'game-badge--new'
                      }`}
                    >
                      {game.badge}
                    </span>
                  )}

                  {/* Fallback artwork */}
                  {!hasCustomArtwork && (
                    <div className="game-card__icon">
                      {game.emoji}
                    </div>
                  )}

                  {/* Artwork placeholder for title/subtitle spacing */}
                  {hasCustomArtwork && (
                    <div className="game-card__icon game-card__icon--hidden">
                      {game.emoji}
                    </div>
                  )}

                  <div className="game-card__info">
                    <span className="game-card__name">
                      {game.name}
                    </span>

                    <span className="game-card__sub">
                      {game.subtitle}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dots */}
      {sets.length > 1 && (
        <div className="carousel-dots">
          {sets.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`carousel-dot ${
                i === currentIndex
                  ? 'carousel-dot--active'
                  : ''
              }`}
              onClick={() => {
                if (isTransitioning || i === currentIndex) {
                  return;
                }

                setDirection(
                  i > currentIndex ? 'left' : 'right'
                );

                setIsTransitioning(true);

                transitionTimerRef.current = setTimeout(() => {
                  setCurrentIndex(i);
                  setIsTransitioning(false);
                }, 600);
              }}
              aria-label={`Go to set ${i + 1}`}
              aria-current={
                i === currentIndex ? 'true' : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
};