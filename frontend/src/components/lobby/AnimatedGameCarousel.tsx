import React, { useEffect, useRef, useState, useCallback } from 'react';
import aviatorImg from '../../assets/aviator-3d.png';
import dragonImg from '../../assets/dragon-hero.png';
import andarBaharHero from '../../assets/andar-bahar-hero.png';
import chickenRoadHero from '../../assets/chicken-road-3d.jpg';
import triple777Logo from '../../assets/triple-777-logo.png';
import pokerHero from '../../assets/poker-hero.jpg';
import teenPattiHero from '../../assets/teen-patti-hero.jpg';
import rummyHero from '../../assets/casino-cards-3d-emblem.png';
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

const isRummyGame = (game: GameCardData) => {
  const value = `${game.id} ${game.name} ${game.path}`.toLowerCase();
  return value.includes('rummy');
};

const isRouletteGame = (game: GameCardData) => {
  const value = `${game.id} ${game.name} ${game.path}`.toLowerCase();
  return value.includes('roulette');
};

const isCardGame = (game: GameCardData) => {
  const value = `${game.id} ${game.name} ${game.path}`.toLowerCase();
  return (
    value.includes('rummy') ||
    value.includes('teen') ||
    value.includes('patti') ||
    value.includes('poker') ||
    value.includes('30 cards')
  );
};

/* ─── Roulette Animated Artwork ─── */
const RouletteAnimatedArtwork: React.FC = () => {
  return (
    <div className="roulette-card-art" aria-hidden="true">
      <div className="roulette-card-felt-glow" />
      <div className="roulette-card-wheel-wrap">
        <div className="roulette-card-wheel-glow" />
        <div className="roulette-card-wheel-inner">
          <span className="roulette-card-num-green">0</span>
          <span className="roulette-card-num-red">32</span>
          <span className="roulette-card-num-black">15</span>
          <span className="roulette-card-num-red">19</span>
          <span className="roulette-card-num-black">4</span>
          <span className="roulette-card-num-red">21</span>
        </div>
        <div className="roulette-card-ball" />
      </div>
      <div className="roulette-dark-overlay" />
    </div>
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

/* ─── Indian Rummy Animated Artwork ─── */
const RummyAnimatedArtwork: React.FC = () => {
  return (
    <div className="rummy-card-art" aria-hidden="true">
      <div className="rummy-card-aura" />
      <img
        className="rummy-hero-img"
        src={rummyHero}
        alt="Indian Rummy"
        loading="lazy"
        decoding="async"
      />
      <div className="rummy-dark-overlay" />
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
            const aviator = isAviatorGame(game);
            const dragonTiger = isDragonTigerGame(game);
            const andarBahar = isAndarBaharGame(game);
            const rummy = isRummyGame(game);
            const roulette = isRouletteGame(game);
            const chickenRoad = isChickenRoadGame(game);
            const triple777 = isTriple777Game(game);
            const poker = isPokerGame(game);
            const teenPatti = isTeenPattiGame(game);
            const cardGame = isCardGame(game);

            const cardTypeClass = aviator
              ? 'game-card--aviator'
              : dragonTiger
                ? 'game-card--dragon-tiger'
                : andarBahar
                  ? 'game-card--andar-bahar'
                  : rummy
                    ? 'game-card--rummy'
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
                              : cardGame
                                ? 'game-card--casino-card'
                                : '';

            const hasCustomArtwork =
              aviator ||
              dragonTiger ||
              andarBahar ||
              rummy ||
              roulette ||
              chickenRoad ||
              triple777 ||
              poker ||
              teenPatti ||
              cardGame;

            return (
              <div
                key={game.id}
                className="game-card-wrapper"
                onClick={() => onGameClick(game.path)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
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
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {/* Glossy moving light */}
                  <div className="game-card__shine" />

                  {/* Aviator-specific 3D artwork */}
                  {aviator && <AviatorAnimatedArtwork />}

                  {/* Dragon Tiger full card artwork */}
                  {dragonTiger && <DragonTigerAnimatedArtwork />}

                  {/* Andar Bahar full card artwork */}
                  {andarBahar && <AndarBaharAnimatedArtwork />}

                  {/* Indian Rummy full card artwork */}
                  {rummy && <RummyAnimatedArtwork />}

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

                  {/* Universal 3D Casino Card Game Artwork for other cards */}
                  {cardGame && !rummy && !dragonTiger && !andarBahar && !chickenRoad && !triple777 && !poker && !teenPatti && (
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