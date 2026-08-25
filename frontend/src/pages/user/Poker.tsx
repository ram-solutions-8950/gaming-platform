import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePokerSocket } from '../../hooks/usePokerSocket';
import { pokerService, type PokerTableInfo } from '../../services/poker';
import { walletService } from '../../services/wallet';
import { PokerLobby } from '../../components/poker/PokerLobby';
import { PokerTable } from '../../components/poker/PokerTable';
import { PokerResult } from '../../components/poker/PokerResult';
import { RulesModal } from '../../components/poker/RulesModal';
import { soundManager } from '../../services/soundManager';
import '../../styles/poker.css';

export function PokerPage() {
  const { tableId: paramTableId } = useParams<{ tableId?: string }>();
  const navigate = useNavigate();
  const [tables, setTables] = useState<PokerTableInfo[]>([]);
  const [activeTableId, setActiveTableId] = useState<string | null>(paramTableId || null);
  const [walletBalancePaise, setWalletBalancePaise] = useState<number>(0);
  const [showResultModal, setShowResultModal] = useState<boolean>(false);
  const [winnersSummary, setWinnersSummary] = useState<any[]>([]);
  const [showRulesModal, setShowRulesModal] = useState<boolean>(false);
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setActiveTableId(paramTableId || null);
  }, [paramTableId]);

  // Landscape orientation locking on mobile (unlocked on unmount)
  useEffect(() => {
    try {
      if (screen.orientation && (screen.orientation as any).lock) {
        (screen.orientation as any).lock('landscape').catch(() => {});
      }
    } catch {}

    return () => {
      try {
        if (screen.orientation && screen.orientation.unlock) {
          screen.orientation.unlock();
        }
      } catch {}
    };
  }, []);

  const refreshWallet = useCallback(async () => {
    try {
      const w = await walletService.getWallet();
      setWalletBalancePaise(w.balance || 0);
    } catch (e) {
      console.error('Failed to fetch wallet', e);
    }
  }, []);

  const loadTables = useCallback(async () => {
    try {
      const data = await pokerService.getTables();
      setTables(data);
    } catch (e) {
      console.error('Failed to load poker tables', e);
    }
  }, []);

  useEffect(() => {
    refreshWallet();
    loadTables();
  }, [refreshWallet, loadTables]);

  const {
    tableState,
    myHoleCards,
    currentUserId,
    sendAction,
    startHand,
  } = usePokerSocket({
    tableId: activeTableId || '',
    onHandStart: () => {
      soundManager.play('card_deal');
    },
    onShowdown: (winners) => {
      setWinnersSummary(winners);
      setShowResultModal(true);
      refreshWallet();
      const meWon = winners.some((w: any) => w.user_id === currentUserId);
      if (meWon) {
        soundManager.play('win_clap');
      } else {
        soundManager.play('loss');
      }
    },
    onError: (err) => {
      setActionErrorMessage(err);
      setTimeout(() => setActionErrorMessage(null), 3000);
    },
  });

  // Track state transitions for betting_start/stop, card_deal, and bet_coin
  const lastPhaseRef = useRef<string | null>(null);
  const lastCardsCountRef = useRef<number>(0);
  const lastBetRef = useRef<number>(0);

  useEffect(() => {
    if (!tableState || !currentUserId) return;

    // Betting phase starts / stops
    if (tableState.phase && tableState.phase !== lastPhaseRef.current) {
      const p = tableState.phase;
      if (['PRE_FLOP', 'FLOP', 'TURN', 'RIVER'].includes(p)) {
        soundManager.play('betting_start');
      } else if (['SHOWDOWN', 'SETTLEMENT', 'WAITING'].includes(p)) {
        soundManager.play('betting_stop');
      }
      lastPhaseRef.current = p;
    }

    // Community card deal
    const cardsCount = tableState.community_cards?.length || 0;
    if (cardsCount > lastCardsCountRef.current) {
      soundManager.play('card_deal');
    }
    lastCardsCountRef.current = cardsCount;

    // User bet confirmed by backend
    const me = tableState.players?.find((p) => p.user_id === currentUserId);
    const myCurrentBet = me?.total_bet_in_hand || 0;
    if (myCurrentBet > lastBetRef.current) {
      soundManager.play('bet_coin');
    }
    lastBetRef.current = myCurrentBet;
  }, [tableState, currentUserId]);

  const handleSelectTable = async (tableId: string, buyInAmount: number) => {
    try {
      await pokerService.joinTable(tableId, buyInAmount);
      setActiveTableId(tableId);
      navigate(`/games/poker/${tableId}`);
      refreshWallet();
    } catch (e: any) {
      setActionErrorMessage(e.response?.data?.detail || 'Failed to join table');
      setTimeout(() => setActionErrorMessage(null), 3000);
    }
  };

  const handleCreateTable = async (isPractice: boolean) => {
    try {
      const newTable = await pokerService.createTable({
        name: isPractice ? "Practice Hold'em" : "Cash Hold'em Table",
        is_practice: isPractice,
        small_blind: 100,
        big_blind: 200,
        min_buy_in: 2000,
        max_buy_in: 20000,
      });
      await handleSelectTable(newTable.id, newTable.min_buy_in);
      loadTables();
    } catch (e: any) {
      setActionErrorMessage(e.response?.data?.detail || 'Failed to create table');
      setTimeout(() => setActionErrorMessage(null), 3000);
    }
  };

  const handleLeaveTable = async () => {
    if (activeTableId) {
      try {
        await pokerService.leaveTable(activeTableId);
      } catch (e) {}
    }
    setActiveTableId(null);
    navigate('/games/poker');
    refreshWallet();
    loadTables();
  };

  return (
    <div className="poker-game-wrapper">
      {/* Mobile Landscape Orientation Banner */}
      <div className="poker-portrait-reminder">
        <div className="rotate-icon">📱</div>
        <h2 className="text-xl font-bold text-white">Please Rotate Your Phone</h2>
        <p className="text-sm text-gray-400">
          Poker requires landscape mode for high-speed table action.
        </p>
      </div>

      {/* Error Alert Toast */}
      {actionErrorMessage && (
        <div className="bg-red-500/90 text-white text-xs font-bold py-1.5 px-4 text-center z-50 animate-bounce">
          ⚠️ {actionErrorMessage}
        </div>
      )}

      {/* Lobby vs Live Table View */}
      {!activeTableId ? (
        <PokerLobby
          tables={tables}
          onSelectTable={handleSelectTable}
          onCreateTable={handleCreateTable}
          walletBalancePaise={walletBalancePaise}
        />
      ) : (
        <PokerTable
          tableState={tableState}
          myHoleCards={myHoleCards}
          currentUserId={currentUserId}
          onSendAction={sendAction}
          onLeaveTable={handleLeaveTable}
          onStartHand={startHand}
          onOpenRules={() => setShowRulesModal(true)}
        />
      )}

      {/* Showdown Result Modal */}
      {showResultModal && (
        <PokerResult
          winners={winnersSummary}
          onClose={() => setShowResultModal(false)}
        />
      )}

      {/* Rules Modal */}
      {showRulesModal && (
        <RulesModal onClose={() => setShowRulesModal(false)} />
      )}
    </div>
  );
}

export default PokerPage;
