import { PlayerSeat } from './PlayerSeat';
import { CommunityCards } from './CommunityCards';
import { PokerActions } from './PokerActions';
import type { PokerTableState, PokerPlayerInfo } from '../../hooks/usePokerSocket';

interface PokerTableProps {
  tableState: PokerTableState;
  myHoleCards: string[];
  currentUserId: string | null;
  walletBalancePaise?: number;
  onSendAction: (action: string, amount?: number) => void;
  onLeaveTable: () => void;
  onStartHand: () => void;
  onOpenRules: () => void;
  /** Buy-in for taking a seat, when the viewer isn't seated and one is free. */
  seatBuyIn?: number;
  onTakeSeat?: () => void;
}

export function PokerTable({
  tableState,
  myHoleCards,
  currentUserId,
  walletBalancePaise = 0,
  onSendAction,
  onLeaveTable,
  onStartHand,
  onOpenRules,
  seatBuyIn,
  onTakeSeat,
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
  // Same rule the server's start_hand applies: two players who still have chips
  // (practice tables top busted players back up when the hand is dealt).
  const playersWithChips = players.filter((p) => !p.is_sitting_out && (tableState.is_practice || p.stack > 0));
  const canDealHand = phase === 'WAITING' && playersWithChips.length >= 2;

  // Every poker room seats you at the bottom of the screen and deals the table
  // around you, so rotate the six seats until the viewer's own seat is position
  // 0. Spectators keep the table's own order.
  const seatCount = 6;
  const viewerSeat = myPlayer?.seat_index ?? 0;
  const seatsMap: { player: PokerPlayerInfo | null; seatIndex: number; screenPos: number }[] =
    Array.from({ length: seatCount }).map((_, seatIndex) => ({
      player: players.find((p) => p.seat_index === seatIndex) || null,
      seatIndex,
      screenPos: (seatIndex - viewerSeat + seatCount) % seatCount,
    }));

  return (
    <div className="poker-table-view">
      {/* The header answers the two questions a seated player has about the
          table itself: what it costs to play here, and what I have left. */}
      <header className="poker-header">
        <div className="table-identity">
          <span className="table-suit" aria-hidden="true">♠</span>
          <span className="table-name">Hold&rsquo;em</span>
          <span className="table-stakes">
            ₹{(tableState.small_blind / 100).toFixed(0)}/₹{(tableState.big_blind / 100).toFixed(0)}
          </span>
          {tableState.is_practice && <span className="table-tag">Practice</span>}
        </div>

        <div className="table-tools">
          <span className="table-balance">
            <span className="balance-word">Balance</span>
            <span className="balance-amount">₹{(walletBalancePaise / 100).toFixed(2)}</span>
          </span>
          <button type="button" onClick={onOpenRules} className="table-btn">
            Rules
          </button>
          <button type="button" onClick={onLeaveTable} className="table-btn table-btn-leave">
            Leave table
          </button>
        </div>
      </header>

      {/* Main Oval Felt Arena */}
      <div className="poker-felt-table">
        <div className="poker-felt-inner">
          {/* The board and the pot own the middle of the felt; nothing else is
              allowed into this band, which is what used to bury the pot under
              the top seat. */}
          <div className="poker-table-center">
            <CommunityCards cards={community_cards} phase={phase} pot={pot} />
          </div>

          {/* Six seats around the felt, rotated so the viewer sits at the bottom */}
          {seatsMap.map(({ player, seatIndex, screenPos }) => (
            <PlayerSeat
              key={seatIndex}
              player={player}
              screenPos={screenPos}
              isCurrentTurn={current_turn_seat_idx === seatIndex}
              handInProgress={['PRE_FLOP', 'FLOP', 'TURN', 'RIVER', 'SHOWDOWN', 'SETTLEMENT'].includes(phase)}
              isDealer={dealer_seat_idx === seatIndex}
              isCurrentUser={Boolean(currentUserId && player?.user_id === currentUserId)}
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
          phase={phase}
          playerCount={players.length}
          canDealHand={canDealHand}
          onDealHand={onStartHand}
          turnKey={`${tableState.hand_id ?? ''}:${current_turn_seat_idx ?? ''}:${tableState.turn_start_time ?? ''}`}
          turnDurationSeconds={tableState.turn_duration ?? 15}
          seatBuyIn={!myPlayer && players.length < tableState.max_players ? seatBuyIn : undefined}
          onTakeSeat={onTakeSeat}
          currentHighBet={current_high_bet}
          minRaiseAmount={min_raise_amount}
          bigBlind={big_blind}
          onSendAction={onSendAction}
        />
      </footer>
    </div>
  );
}
