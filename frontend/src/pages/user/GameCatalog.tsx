import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/common/Card';
import { Loader } from '../../components/common/Loader';
import { gameService } from '../../services/game';
import type { CatalogGame } from '../../types';

export function GameCatalogPage() {
  const [games, setGames] = useState<CatalogGame[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchGames = async () => {
      try {
        const data = await gameService.getCatalog();
        setGames(data.filter((g: any) => g.slug !== 'colour-prediction'));
      } catch (e: any) {
        console.error('Failed to load games', e);
      } finally {
        setLoading(false);
      }
    };
    fetchGames();
  }, []);

  const handlePlay = (slug: string) => {
    navigate(`/games/${slug}`);
  };

  if (loading) return <Loader />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-white">Games</h1>
        <p className="text-gray-400 mt-1">Select a game to start playing</p>
      </div>

      {games.length === 0 ? (
        <Card>
          <div className="text-center py-10 text-gray-400">
            No games currently available. Check back soon!
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
          {games.map((game) =>
            game.slug === 'ludo' ? (
              <LudoKingCard
                key={game.id}
                game={game}
                onPlay={() => handlePlay(game.slug)}
              />
            ) : (
              <div
                key={game.id}
                onClick={() => handlePlay(game.slug)}
                className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden hover:border-brand-500 hover:shadow-[0_0_15px_rgba(239,68,68,0.15)] transition-all duration-300 cursor-pointer group"
              >
                <div className="h-40 bg-dark-800 flex items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-brand-900/40 to-dark-900/80 group-hover:opacity-75 transition-opacity" />
                  <span className="text-6xl z-10 group-hover:scale-110 transition-transform duration-300">
                    {game.icon_url || '🎮'}
                  </span>
                </div>
                <div className="p-5">
                  <h3 className="text-xl font-bold text-white mb-2">{game.name}</h3>
                  <p className="text-sm text-gray-400 mb-4 h-10 overflow-hidden">
                    {game.description || 'Experience the thrill of ' + game.name}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium bg-dark-800 text-gray-300 px-3 py-1 rounded-full">
                      Min: ₹{(game.min_bet / 100).toFixed(0)}
                    </span>
                    <button className="text-brand-500 font-semibold text-sm group-hover:text-brand-400 flex items-center gap-1">
                      Play Now <span>→</span>
                    </button>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function LudoKingCard({ game, onPlay }: { game: CatalogGame; onPlay: () => void }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className="group w-full overflow-hidden rounded-[24px] bg-[#2e7d32] p-[3px] text-left shadow-[0_12px_36px_rgba(0,0,0,0.35)] transition hover:-translate-y-0.5"
    >
      <div className="rounded-[21px] bg-gradient-to-b from-[#66bb6a] via-[#43a047] to-[#1b5e20] p-4 sm:p-5">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl ring-2 ring-white/80 sm:h-24 sm:w-24">
            <div className="grid h-full w-full grid-cols-3 grid-rows-3">
              <div className="bg-[#e53935]" />
              <div className="bg-white" />
              <div className="bg-[#43a047]" />
              <div className="bg-white" />
              <div className="bg-white" />
              <div className="bg-white" />
              <div className="bg-[#1e88e5]" />
              <div className="bg-white" />
              <div className="bg-[#fdd835]" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="flex flex-wrap gap-0.5 font-black leading-none">
              {['L', 'U', 'D', 'O'].map((letter, i) => (
                <span
                  key={letter}
                  className="text-3xl drop-shadow-[0_2px_0_rgba(0,0,0,0.3)] sm:text-4xl"
                  style={{ color: ['#e53935', '#43a047', '#1e88e5', '#fdd835'][i] }}
                >
                  {letter}
                </span>
              ))}
            </h3>
            <p className="mt-1 line-clamp-2 text-xs text-white/85 sm:text-sm">
              {game.description || 'Classic 2 & 4 player board battle'}
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="rounded-full bg-black/25 px-3 py-1 text-xs font-bold text-[#fdd835]">
            Min ₹{(game.min_bet / 100).toFixed(0)}
          </span>
          <span className="rounded-xl bg-gradient-to-b from-[#7cb342] to-[#33691e] px-4 py-2 text-sm font-black uppercase tracking-wider text-white shadow-[0_3px_0_#1b5e20] group-hover:brightness-110">
            Play
          </span>
        </div>
      </div>
    </button>
  );
}
