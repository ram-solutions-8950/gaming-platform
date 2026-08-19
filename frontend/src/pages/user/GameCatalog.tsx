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
        setGames(data);
      } catch (e: any) {
        console.error('Failed to load games', e);
      } finally {
        setLoading(false);
      }
    };
    fetchGames();
  }, []);

  const handlePlay = (slug: string) => {
    if (slug === 'colour-prediction') {
      navigate('/games');
      return;
    }
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {games.map((game) => (
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
          ))}
        </div>
      )}
    </div>
  );
}
