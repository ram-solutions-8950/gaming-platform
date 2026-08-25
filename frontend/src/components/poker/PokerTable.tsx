import { PlayerSeat } from './PlayerSeat';
import { CommunityCards } from './CommunityCards';
import { PotDisplay } from './PotDisplay';
import { PokerActions } from './PokerActions';
import type { PokerTableState, PokerPlayerInfo } from '../../hooks/usePokerSocket';

interface PokerTableProps {
  tableState: PokerTableState;
  myHoleCards: string[];
  currentUserId: string | null;
  onSendAction: (action: string, amount?: number) => void;
  onLeaveTable: () => void;
  onStartHand: () => void;
  onOpenRules: () => void;
}

export function PokerTable({
  tableState,
  myHoleCards,
  currentUserId,
  onSendAction,
  onLeaveTable,
  onStartHand,
  onOpenRules,
}: PokerTableProps) {
  const {
    players,
    community_cards,
    pot,
    phase,
    dealer_seat_idx,
    current_turn_seat_idx,
    current_high_bet,
    min_raise_amount,
    big_blind,
  } = tableState;

  const myPlayer = players.find((p) => p.user_id === currentUserId);
  const isMyTurn = myPlayer ? current_turn_seat_idx === myPlayer.seat_index : false;

  // Map 6 seats around the oval felt table
  const seatsMap: (PokerPlayerInfo | null)[] = Array.from({ length: 6 }).map((_, idx) => {
    return players.find((p) => p.seat_index === idx) || null;
  });

  return (
    <div className="poker-table-view">
      {/* Top Header Bar */}
      <header className="poker-header">
        <div className="flex items-center gap-2">
          <span className="text-xl">♠️</span>
          <span className="font-extrabold text-white text-lg tracking-wide">POKER</span>
          <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded">
            {tableState.is_practice ? 'PRACTICE' : 'REAL MONEY'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenRules}
            className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-bold rounded border border-gray-700 transition"
          >
            Rules 📜
          </button>
          <button
            type="button"
            onClick={onLeaveTable}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded shadow transition"
          >
            Leave Table
          </button>
        </div>
      </header>

      {/* Main Oval Felt Arena */}
      <div className="poker-felt-table">
        <div className="poker-felt-inner">
          {/* Center Community Cards & Pot */}
          <div className="poker-table-center">
            <PotDisplay pot={pot} />
            <CommunityCards cards={community_cards} phase={phase} />

            {phase === 'WAITING' && players.length >= 2 && (
              <button
                type="button"
                onClick={onStartHand}
                className="mt-4 px-6 py-2 bg-amber-500 hover:bg-amber-400 text-gray-950 font-extrabold rounded-full shadow-lg text-sm transition animate-bounce"
              >
                Deal Hand 🃏
              </button>
            )}
          </div>

          {/* 6 Seating Positions */}
          {seatsMap.map((p, seatIdx) => (
            <PlayerSeat
              key={seatIdx}
              player={p}
              seatIndex={seatIdx}
              isCurrentTurn={current_turn_seat_idx === seatIdx}
              isDealer={dealer_seat_idx === seatIdx}
              isCurrentUser={Boolean(currentUserId && p?.user_id === currentUserId)}
              myHoleCards={myHoleCards}
            />
          ))}
        </div>
      </div>

      {/* Bottom Action Controls Dock */}
      <footer className="poker-footer">
        <PokerActions
          isMyTurn={isMyTurn}
          myPlayer={myPlayer}
          currentHighBet={current_high_bet}
          minRaiseAmount={min_raise_amount}
          bigBlind={big_blind}
          onSendAction={onSendAction}
        />
      </footer>
    </div>
  );
}
