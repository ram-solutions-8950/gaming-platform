import { useEffect, useState } from 'react';
import { Card } from '../../components/common/Card';
import { Loader } from '../../components/common/Loader';
import { gameService } from '../../services/game';
import type { CatalogGame } from '../../types';

export function AdminGamesPage() {
  const [games, setGames] = useState<CatalogGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingGame, setEditingGame] = useState<CatalogGame | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [gameType, setGameType] = useState('');
  const [description, setDescription] = useState('');
  const [minBet, setMinBet] = useState('1000');
  const [maxBet, setMaxBet] = useState('100000');
  const [configText, setConfigText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchGames = async () => {
    try {
      setLoading(true);
      const data = await gameService.getAdminCatalog();
      setGames(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGames();
  }, []);

  const openModal = (game?: CatalogGame) => {
    setErrorMsg('');
    if (game) {
      setEditingGame(game);
      setName(game.name);
      setSlug(game.slug);
      setGameType(game.game_type);
      setDescription(game.description || '');
      setMinBet(game.min_bet.toString());
      setMaxBet(game.max_bet.toString());
      setConfigText(game.config ? JSON.stringify(game.config, null, 2) : '');
    } else {
      setEditingGame(null);
      setName('');
      setSlug('');
      setGameType('');
      setDescription('');
      setMinBet('1000');
      setMaxBet('100000');
      setConfigText('');
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingGame(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);
    
    const payload: Record<string, unknown> = {
      name,
      slug,
      game_type: gameType,
      description,
      min_bet: parseInt(minBet, 10),
      max_bet: parseInt(maxBet, 10),
    };
    if (configText.trim()) {
      try {
        payload.config = JSON.parse(configText);
      } catch {
        setErrorMsg('Config must be valid JSON');
        setSubmitting(false);
        return;
      }
    }

    try {
      if (editingGame) {
        await gameService.updateCatalogGame(editingGame.id, payload);
      } else {
        await gameService.createCatalogGame(payload);
      }
      closeModal();
      fetchGames();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error?.message || 'Failed to save game');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (game: CatalogGame) => {
    if (game.status === 'ACTIVE') {
      if (!window.confirm(`Are you sure you want to deactivate ${game.name}?`)) return;
      await gameService.deactivateCatalogGame(game.id);
    } else {
      await gameService.activateCatalogGame(game.id);
    }
    fetchGames();
  };

  if (loading) return <Loader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-white">Game Catalog</h1>
          <p className="text-gray-400 mt-1">Manage platform games and availability.</p>
        </div>
        <button
          onClick={() => openModal()}
          className="bg-brand-600 hover:bg-brand-500 text-white font-bold py-2 px-4 rounded-lg transition-colors cursor-pointer"
        >
          + Add Game
        </button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-dark-700">
                <th className="text-left py-3 px-4 font-semibold">Name</th>
                <th className="text-left py-3 px-4 font-semibold">Slug</th>
                <th className="text-left py-3 px-4 font-semibold">Type</th>
                <th className="text-right py-3 px-4 font-semibold">Limits (Min-Max)</th>
                <th className="text-center py-3 px-4 font-semibold">Status</th>
                <th className="text-right py-3 px-4 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {games.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-500">No games found in the catalog.</td>
                </tr>
              ) : (
                games.map((game) => (
                  <tr key={game.id} className="border-b border-dark-800 hover:bg-dark-800/50 transition-colors">
                    <td className="py-4 px-4 text-gray-100 font-medium">{game.name}</td>
                    <td className="py-4 px-4 text-gray-400 font-mono text-xs">{game.slug}</td>
                    <td className="py-4 px-4 text-gray-400">{game.game_type}</td>
                    <td className="py-4 px-4 text-gray-300 text-right">
                      {game.min_bet} - {game.max_bet}
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          game.status === 'ACTIVE'
                            ? 'bg-green-900/50 text-green-400'
                            : 'bg-red-900/50 text-red-400'
                        }`}
                      >
                        {game.status}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right space-x-3">
                      <button
                        onClick={() => openModal(game)}
                        className="text-brand-400 hover:text-brand-300 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleStatus(game)}
                        className={
                          game.status === 'ACTIVE'
                            ? 'text-red-400 hover:text-red-300 transition-colors'
                            : 'text-green-400 hover:text-green-300 transition-colors'
                        }
                      >
                        {game.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-sm">
          <div className="bg-dark-900 border border-dark-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-4">
              {editingGame ? 'Edit Game' : 'Add New Game'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-dark-800 border border-dark-700 text-white rounded-md px-4 py-2 w-full focus:ring-brand-500 focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Slug</label>
                <input
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="bg-dark-800 border border-dark-700 text-white rounded-md px-4 py-2 w-full focus:ring-brand-500 focus:border-brand-500 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Game Type</label>
                <input
                  type="text"
                  required
                  value={gameType}
                  onChange={(e) => setGameType(e.target.value)}
                  className="bg-dark-800 border border-dark-700 text-white rounded-md px-4 py-2 w-full focus:ring-brand-500 focus:border-brand-500 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="bg-dark-800 border border-dark-700 text-white rounded-md px-4 py-2 w-full focus:ring-brand-500 focus:border-brand-500 h-20"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Min Bet (paisa)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={minBet}
                    onChange={(e) => setMinBet(e.target.value)}
                    className="bg-dark-800 border border-dark-700 text-white rounded-md px-4 py-2 w-full focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Max Bet (paisa)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={maxBet}
                    onChange={(e) => setMaxBet(e.target.value)}
                    className="bg-dark-800 border border-dark-700 text-white rounded-md px-4 py-2 w-full focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Config JSON (rules, payouts, durations)</label>
                <textarea
                  value={configText}
                  onChange={(e) => setConfigText(e.target.value)}
                  placeholder='{"round_duration_seconds":60,"payouts":{"dragon":2.0,"tiger":2.0,"tie":10.0}}'
                  className="bg-dark-800 border border-dark-700 text-white rounded-md px-4 py-2 w-full focus:ring-brand-500 focus:border-brand-500 h-28 font-mono text-xs"
                />
              </div>

              {errorMsg && <p className="text-sm text-red-500">{errorMsg}</p>}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-brand-600 hover:bg-brand-500 text-white px-6 py-2 rounded-lg font-bold transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
