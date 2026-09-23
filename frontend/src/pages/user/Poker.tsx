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
import { setNativeLandscape } from '../../utils/nativeOrientation';
import '../../styles/poker.css';
import { getApiErrorMessage } from '../../utils/apiError';

export function PokerPage() {
  const { tableId: paramTableId } = useParams<{ tableId?: string }>();
  const navigate = useNavigate();
  const [tables, setTables] = useState<PokerTableInfo[]>([]);
  const [activeTableId, setActiveTableId] = useState<string | null>(paramTableId || null);
  const [walletBalancePaise, setWalletBalancePaise] = useState<number>(0);
  const [showResultModal, setShowResultModal] = useState<boolean>(false);
  const [winnersSummary, setWinnersSummary] = useState<any[]>([]);
  const [showRulesModal, setShowRulesModal] = useState<boolean>(false);
  const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null);

  const activeTableIdRef = useRef<string | null>(activeTableId);
  activeTableIdRef.current = activeTableId;

  useEffect(() => {
    return () => {
      const tid = activeTableIdRef.current;
      if (tid) {
        pokerService.leaveTable(tid).catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    setActiveTableId(paramTableId || null);
  }, [paramTableId]);

  // Landscape orientation locking on mobile
  useEffect(() => {
    setNativeLandscape().catch(() => {});
  }, []);

  useEffect(() => {
    const handleBackPressed = (): boolean => {
      if (showRulesModal) {
        setShowRulesModal(false);
        return true;
      }
      if (showResultModal) {
        setShowResultModal(false);
        return true;
      }
      if (showExitConfirm) {
        setShowExitConfirm(false);
        return true;
      }
      if (activeTableId) {
        setShowExitConfirm(true);
        return true;
      }
      navigate('/dashboard');
      return true;
    };

    (window as any).__gameSpecificBackPressed = handleBackPressed;
    return () => {
      delete (window as any).__gameSpecificBackPressed;
    };
  }, [showRulesModal, showResultModal, showExitConfirm, activeTableId, navigate]);

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

  // Always clear previous game result and session state when activeTableId changes (BUG-021)
  useEffect(() => {
    setShowResultModal(false);
    setWinnersSummary([]);
  }, [activeTableId]);

  const handleSelectTable = async (tableId: string, buyInAmount: number) => {
    setShowResultModal(false);
    setWinnersSummary([]);
    try {
      await pokerService.joinTable(tableId, buyInAmount);
      setActiveTableId(tableId);
      navigate(`/games/poker/${tableId}`);
      refreshWallet();
    } catch (e: any) {
      setActionErrorMessage(getApiErrorMessage(e, 'Failed to join table'));
      setTimeout(() => setActionErrorMessage(null), 3000);
    }
  };

  const handleCreateTable = async (isPractice: boolean) => {
    setShowResultModal(false);
    setWinnersSummary([]);
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
      setActionErrorMessage(getApiErrorMessage(e, 'Failed to create table'));
      setTimeout(() => setActionErrorMessage(null), 3000);
    }
  };

  const handleLeaveTable = async () => {
    setShowResultModal(false);
    setWinnersSummary([]);
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
      {/* Mobile Landscape Orientation Banner (only when seated at table) */}
      {activeTableId && (
        <div className="poker-portrait-reminder">
          <div className="rotate-icon">📱</div>
          <h2 className="text-xl font-bold text-white">Please Rotate Your Phone</h2>
          <p className="text-sm text-gray-400">
            Poker table requires landscape mode for optimal play.
          </p>
        </div>
      )}

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
          walletBalancePaise={walletBalancePaise}
          onSendAction={sendAction}
          onLeaveTable={() => setShowExitConfirm(true)}
          onStartHand={startHand}
          onOpenRules={() => setShowRulesModal(true)}
        />
      )}

      {/* Showdown Result Modal */}
      {showResultModal && (
        <PokerResult
          winners={winnersSummary}
          currentUserId={currentUserId}
          myBetPaise={tableState.players?.find((p) => p.user_id === currentUserId)?.total_bet_in_hand || 0}
          onClose={() => setShowResultModal(false)}
        />
      )}

      {/* Rules Modal */}
      {showRulesModal && (
        <RulesModal onClose={() => setShowRulesModal(false)} />
      )}

      {/* Leave Table Confirmation Modal */}
      {showExitConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in select-none"
          onClick={() => setShowExitConfirm(false)}
        >
          <div
            className="w-full max-w-sm bg-gradient-to-b from-[#240505] via-[#1a0404] to-[#0d0202] border-2 border-red-500/60 rounded-3xl p-6 text-center shadow-[0_0_40px_rgba(0,0,0,0.9)] text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-gradient-to-br from-red-600/30 via-red-950/40 to-slate-900 border-2 border-red-500/50 flex items-center justify-center text-3xl shadow-inner">
              🚪
            </div>
            <h2 className="font-display text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-red-300 via-rose-200 to-amber-400 uppercase tracking-wide mb-1.5">
              Leave Poker Table?
            </h2>
            <p className="text-xs text-slate-300 mb-5 leading-relaxed">
              Are you sure you want to leave? Your remaining stack will be returned directly to your wallet.
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 transition active:scale-95 cursor-pointer"
                onClick={() => setShowExitConfirm(false)}
              >
                Stay
              </button>
              <button
                type="button"
                className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:brightness-110 text-xs font-black text-white shadow-lg shadow-red-900/40 border border-red-400/50 transition active:scale-95 cursor-pointer uppercase tracking-wider"
                onClick={async () => {
                  setShowExitConfirm(false);
                  await handleLeaveTable();
                }}
              >
                Leave Table
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PokerPage;
