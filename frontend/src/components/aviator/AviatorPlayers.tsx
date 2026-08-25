import React, { useState, useMemo } from 'react';
import type { AviatorLiveBet } from '../../hooks/useAviatorSocket';
import type { AviatorBetHistoryItem } from '../../services/aviator';

interface AviatorPlayersProps {
  bets: AviatorLiveBet[];
  myPastBets: AviatorBetHistoryItem[];
  currentUserId?: string | null;
}

export const AviatorPlayers: React.FC<AviatorPlayersProps> = ({
  bets,
  myPastBets,
  currentUserId,
}) => {
  const [activeTab, setActiveTab] = useState<'ALL' | 'MY'>('ALL');

  const totalBetsCount = bets.length;
  const totalPoolPaise = useMemo(
    () => bets.reduce((sum, b) => sum + (b.amount || 0), 0),
    [bets]
  );

  return (
    <div className="aviator-players-panel">
      {/* Tab Switcher */}
      <div className="aviator-players-tabs">
        <button
          type="button"
          onClick={() => setActiveTab('ALL')}
          className={`tab-btn ${activeTab === 'ALL' ? 'active' : ''}`}
        >
          All Bets ({totalBetsCount})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('MY')}
          className={`tab-btn ${activeTab === 'MY' ? 'active' : ''}`}
        >
          My Bets
        </button>
      </div>

      {/* Summary Row */}
      {activeTab === 'ALL' && (
        <div className="aviator-players-summary">
          <span className="text-xs text-gray-400">Total Pool:</span>
          <span className="text-xs font-bold text-brand-400">
            ₹{(totalPoolPaise / 100).toFixed(0)}
          </span>
        </div>
      )}

      {/* Table / List */}
      <div className="aviator-players-list">
        {activeTab === 'ALL' ? (
          bets.length === 0 ? (
            <div className="empty-players-msg">No bets placed yet</div>
          ) : (
            <div className="players-table">
              <div className="table-header">
                <span>User</span>
                <span>Bet</span>
                <span>Mult</span>
                <span className="text-right">Cash Out</span>
              </div>
              {bets.map((b, i) => {
                const isMe = b.user_id === currentUserId;
                const isCashed = b.status === 'CASHED_OUT';
                return (
                  <div
                    key={`${b.user_id}-${b.slot}-${i}`}
                    className={`player-row ${isMe ? 'my-row' : ''} ${isCashed ? 'cashed-row' : ''}`}
                  >
                    <span className="user-id">
                      {isMe ? 'You' : `Player_${b.user_id.substring(0, 4)}`}
                    </span>
                    <span className="bet-val">
                      {b.amount > 0 ? `₹${(b.amount / 100).toFixed(0)}` : '—'}
                    </span>
                    <span className="mult-val font-mono">
                      {b.cashout_multiplier ? (
                        <span className="badge-mult">{b.cashout_multiplier.toFixed(2)}x</span>
                      ) : (
                        '—'
                      )}
                    </span>
                    <span className="payout-val text-right">
                      {b.payout && b.payout > 0 ? (
                        <span className="text-emerald-400 font-bold">
                          ₹{(b.payout / 100).toFixed(0)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* MY BETS TAB */
          myPastBets.length === 0 ? (
            <div className="empty-players-msg">No past bets found</div>
          ) : (
            <div className="players-table">
              <div className="table-header">
                <span>Time</span>
                <span>Bet</span>
                <span>Mult</span>
                <span className="text-right">Payout</span>
              </div>
              {myPastBets.map((b) => (
                <div
                  key={b.id}
                  className={`player-row ${b.status === 'CASHED_OUT' ? 'cashed-row' : 'lost-row'}`}
                >
                  <span className="user-id text-[11px] text-gray-400">
                    {new Date(b.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="bet-val">₹{(b.amount / 100).toFixed(0)}</span>
                  <span className="mult-val font-mono">
                    {b.cashout_multiplier ? (
                      <span className="badge-mult">{b.cashout_multiplier.toFixed(2)}x</span>
                    ) : (
                      '—'
                    )}
                  </span>
                  <span className="payout-val text-right">
                    {b.payout && b.payout > 0 ? (
                      <span className="text-emerald-400 font-bold">₹{(b.payout / 100).toFixed(0)}</span>
                    ) : (
                      <span className="text-rose-400">0</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
};
