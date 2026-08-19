import { useEffect, useState } from 'react';
import { Card } from '../../components/common/Card';
import { Loader } from '../../components/common/Loader';
import { gameService } from '../../services/game';
import type { GameRoundAdmin, GameBet, PaginatedResult } from '../../types';

function paiseToRupees(p: number): string {
  return (p / 100).toFixed(2);
}

export function AdminGameControlPage() {
  const [rounds, setRounds] = useState<PaginatedResult<GameRoundAdmin> | null>(null);
  const [selectedRound, setSelectedRound] = useState<string | null>(null);
  const [bets, setBets] = useState<PaginatedResult<GameBet> | null>(null);
  const [loadingRounds, setLoadingRounds] = useState(true);
  const [loadingBets, setLoadingBets] = useState(false);

  useEffect(() => {
    gameService.getAdminRounds(1, 10).then(setRounds).finally(() => setLoadingRounds(false));
  }, []);

  useEffect(() => {
    if (selectedRound) {
      setLoadingBets(true);
      gameService.getAdminBets(selectedRound, 1, 50).then(setBets).finally(() => setLoadingBets(false));
    } else {
      setBets(null);
    }
  }, [selectedRound]);

  if (loadingRounds) return <div className="flex justify-center py-20"><Loader size="lg" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-white">Game Management</h1>
        <p className="text-gray-400 mt-1">Monitor rounds and betting activity.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Recent Rounds">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-dark-700 text-left">
                  <th className="py-2 px-2">Round ID</th>
                  <th className="py-2 px-2">Status</th>
                  <th className="py-2 px-2">Result</th>
                  <th className="py-2 px-2 text-right">Bets</th>
                  <th className="py-2 px-2 text-right">Total Pool</th>
                </tr>
              </thead>
              <tbody>
                {rounds?.items.map(r => (
                  <tr 
                    key={r.id} 
                    className={`border-b border-dark-800 cursor-pointer hover:bg-dark-800/50 ${selectedRound === r.id ? 'bg-dark-800' : ''}`}
                    onClick={() => setSelectedRound(r.id)}
                  >
                    <td className="py-3 px-2 font-mono text-xs">{r.id.slice(0, 8)}...</td>
                    <td className="py-3 px-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        r.status === 'COMPLETED' ? 'bg-gray-800 text-gray-300' : 
                        r.status === 'BETTING' ? 'bg-green-900/50 text-green-400' : 
                        'bg-yellow-900/50 text-yellow-400'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 px-2">
                      {r.result_color ? (
                        <span className="font-bold flex items-center gap-2">
                          <span className={`w-3 h-3 rounded-full inline-block ${
                            r.result_color === 'RED' ? 'bg-red-500' : 
                            r.result_color === 'GREEN' ? 'bg-green-500' : 'bg-violet-500'
                          }`}></span>
                          {r.result_number}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="py-3 px-2 text-right text-gray-300">{r.total_bets}</td>
                    <td className="py-3 px-2 text-right text-gray-300">₹{paiseToRupees(r.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title={selectedRound ? `Bets for Round ${selectedRound.slice(0, 8)}` : 'Select a round to view bets'}>
          {loadingBets ? <div className="py-10 flex justify-center"><Loader /></div> : 
           bets ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-dark-700 text-left">
                    <th className="py-2 px-2">User</th>
                    <th className="py-2 px-2">Pred</th>
                    <th className="py-2 px-2 text-right">Bet</th>
                    <th className="py-2 px-2 text-right">Win</th>
                    <th className="py-2 px-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bets.items.length === 0 ? (
                    <tr><td colSpan={5} className="py-4 text-center text-gray-500">No bets for this round.</td></tr>
                  ) : (
                    bets.items.map(b => (
                      <tr key={b.id} className="border-b border-dark-800">
                        <td className="py-2 px-2 font-mono text-xs">{b.user_id.slice(0, 8)}</td>
                        <td className="py-2 px-2 font-bold">{b.prediction}</td>
                        <td className="py-2 px-2 text-right">₹{paiseToRupees(b.amount)}</td>
                        <td className="py-2 px-2 text-right">
                           {b.net_win_amount ? <span className="text-green-400">+₹{paiseToRupees(b.net_win_amount)}</span> : '-'}
                        </td>
                        <td className="py-2 px-2">
                           <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            b.status === 'WON' ? 'bg-green-900/50 text-green-400' :
                            b.status === 'LOST' ? 'bg-red-900/50 text-red-400' :
                            'bg-yellow-900/50 text-yellow-400'
                          }`}>
                            {b.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
           ) : (
             <div className="py-10 text-center text-gray-500">Click on a round in the left panel.</div>
           )}
        </Card>
      </div>
    </div>
  );
}
