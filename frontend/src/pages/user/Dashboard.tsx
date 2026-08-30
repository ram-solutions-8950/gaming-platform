import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { gameService } from '../../services/game';
import { WinningTicker } from '../../components/lobby/WinningTicker';
import { CategoryTabs } from '../../components/lobby/CategoryTabs';
import { AnimatedGameCarousel } from '../../components/lobby/AnimatedGameCarousel';
import { SidePromos } from '../../components/lobby/SidePromos';
import type { CatalogGame } from '../../types';
import '../../styles/lobby.css';
import '../../styles/startup-promotions.css';
import { FreeRewardPopup } from '../../components/modals/FreeRewardPopup';
import { ReferWinPopup } from '../../components/modals/ReferWinPopup';

/* ─── Game card definitions ─── */
interface GameCardDef {
  id: string;
  name: string;
  subtitle: string;
  emoji: string;
  gradient: string;
  badge: 'HOT' | 'NEW' | null;
  path: string;
  category: string[];
}

const GAME_DEFS: GameCardDef[] = [
  { id: 'dragon-tiger', name: 'Dragon Tiger', subtitle: 'Casino', emoji: '🐉', gradient: 'gc-orange', badge: 'HOT', path: '/games/dragon-tiger', category: ['ALL', 'CASINO'] },
  { id: 'andar-bahar', name: 'Andar Bahar', subtitle: 'Cards', emoji: '🎴', gradient: 'gc-emerald', badge: 'NEW', path: '/games/andar-bahar', category: ['ALL', 'CARDS', 'CASINO'] },
  { id: 'rummy', name: 'Indian Rummy', subtitle: 'Cards', emoji: '🃏', gradient: 'gc-teal', badge: 'HOT', path: '/games/rummy', category: ['ALL', 'CARDS'] },
  { id: 'teen-patti', name: 'Teen Patti', subtitle: 'Cards', emoji: '♠️', gradient: 'gc-yellow', badge: 'HOT', path: '/games/teen-patti', category: ['ALL', 'CARDS', 'CASINO'] },
  { id: 'aviator', name: 'Aviator', subtitle: 'Crash', emoji: '✈️', gradient: 'gc-red', badge: 'HOT', path: '/games/aviator', category: ['ALL', 'CASINO'] },
  { id: 'poker', name: "Texas Hold'em Poker", subtitle: 'Cards', emoji: '♠️', gradient: 'gc-indigo', badge: 'NEW', path: '/games/poker', category: ['ALL', 'CARDS'] },
  { id: 'roulette', name: 'Roulette', subtitle: 'Casino', emoji: '🎡', gradient: 'gc-red', badge: 'HOT', path: '/games/roulette', category: ['ALL', 'CASINO'] },
  { id: 'chicken-road', name: 'Chicken Road', subtitle: 'Arcade', emoji: '🐔', gradient: 'gc-amber', badge: 'NEW', path: '/games/chicken-road', category: ['ALL', 'CASINO'] },
  { id: 'triple-777', name: 'Triple 777', subtitle: 'Classic Slots', emoji: '🎰', gradient: 'gc-rose', badge: 'HOT', path: '/games/triple-777', category: ['ALL', 'SLOTS', 'CASINO'] },
];

const FEATURED_GAME = GAME_DEFS[0]; // Dragon Tiger
const PLAYABLE_CATEGORIES = ['ALL', 'CASINO', 'CARDS', 'SLOTS'];

/* ─── Glitter particles ─── */
function LobbyGlitter() {
  const particles = useMemo(() =>
    Array.from({ length: 25 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      width: `${1.5 + Math.random() * 3}px`,
      height: `${3 + Math.random() * 6}px`,
      duration: `${4 + Math.random() * 5}s`,
      delay: `${Math.random() * 6}s`,
      opacity: 0.2 + Math.random() * 0.5,
    })),
  []);

  return (
    <div className="lobby-glitter">
      {particles.map((p) => (
        <div
          key={p.id}
          className="lobby-glitter__particle"
          style={{
            left: p.left,
            width: p.width,
            height: p.height,
            animationDuration: p.duration,
            animationDelay: p.delay,
            opacity: p.opacity,
          }}
        />
      ))}
    </div>
  );
}

const REFERRAL_POPUP_SESSION_KEY = 'referral_popup_shown_this_session';

/* ─── Main Component ─── */
export function DashboardPage() {
  const navigate = useNavigate();
  const [catalogGames, setCatalogGames] = useState<CatalogGame[]>([]);
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [activePopup, setActivePopup] = useState<'free' | 'refer' | null>(null);

  useEffect(() => {
    try {
      const alreadyShown = sessionStorage.getItem(REFERRAL_POPUP_SESSION_KEY);
      if (!alreadyShown) {
        sessionStorage.setItem(REFERRAL_POPUP_SESSION_KEY, 'true');
        const timer1 = setTimeout(() => {
          setActivePopup('free');
        }, 650);
        return () => clearTimeout(timer1);
      }
    } catch {
      // Graceful fallback if sessionStorage is inaccessible
    }
  }, []);

  useEffect(() => {
    const handleOpenRefer = () => {
      setActivePopup('refer');
    };
    window.addEventListener('open-refer-popup', handleOpenRefer);
    return () => window.removeEventListener('open-refer-popup', handleOpenRefer);
  }, []);

  const handleCloseFree = () => {
    setActivePopup(null);
    setTimeout(() => {
      setActivePopup('refer');
    }, 220);
  };

  const handleCloseRefer = () => {
    setActivePopup(null);
  };

  useEffect(() => {
    gameService.getCatalog().then(setCatalogGames).catch(() => {});
  }, []);

  const enrichedGames = useMemo(() => {
    return GAME_DEFS.map((def) => {
      const catalogMatch = catalogGames.find((g) => g.slug === def.id);
      if (catalogMatch) {
        return { ...def, name: catalogMatch.name || def.name, path: def.path };
      }
      return def;
    });
  }, [catalogGames]);

  const filteredGames = useMemo(() => {
    if (activeCategory === 'ALL') return enrichedGames;
    return enrichedGames.filter((g) => g.category.includes(activeCategory));
  }, [enrichedGames, activeCategory]);

  const carouselSets = useMemo(() => {
    if (filteredGames.length === 0) return [{ games: [] }];
    return [{ games: filteredGames }];
  }, [filteredGames]);

  const handleGameClick = (path: string) => {
    if (path === '#') return;
    navigate(path);
  };

  return (
    <div className="game-lobby">
      <LobbyGlitter />

      <div className="game-lobby__content">
        <div className="lobby-header-ticker-area">
          <WinningTicker />
          <CategoryTabs categories={PLAYABLE_CATEGORIES} activeCategory={activeCategory} onCategoryChange={setActiveCategory} />
        </div>
<div className="lobby-main-grid">

  {/* LEFT PROMO / FEATURED */}
  <aside className="lobby-sidebar-promos">
    <SidePromos />

    <div className="lobby-featured-card">
      <div className="featured-game__content">
        <div className="featured-game__text">
          <span className="featured-game__badge">
            FEATURED
          </span>

          <h3>{FEATURED_GAME.name}</h3>

          <p>Play & Win Grand Prizes</p>

          <button
            className="featured-game__btn"
            onClick={() => handleGameClick(FEATURED_GAME.path)}
          >
            Play Now
          </button>
        </div>

        <div className="featured-game__emoji">
          {FEATURED_GAME.emoji}
        </div>
      </div>
    </div>

    {/* Portrait banner */}
    <div className="promo-banner portrait-only">
      <div className="promo-banner__bg" />

      <div className="promo-banner__content">
        <div className="promo-banner__text">
          <h3>PLAY & WIN</h3>
          <p>Grand Cash Prizes Daily!</p>
        </div>

        <div className="promo-banner__emoji">
          🎁
        </div>
      </div>
    </div>
  </aside>


  {/* GAME GRID */}
  <section className="lobby-games-area">

    <div className="lobby-section-title portrait-only">
      Popular Games
    </div>

    <div className="lobby-carousel-container">
      <AnimatedGameCarousel
        sets={carouselSets}
        onGameClick={handleGameClick}
        autoPlayInterval={4000}
      />
    </div>

  </section>

</div>
      </div>

      {activePopup === 'free' && <FreeRewardPopup onClose={handleCloseFree} />}
      {activePopup === 'refer' && <ReferWinPopup onClose={handleCloseRefer} />}
    </div>
  );
}
