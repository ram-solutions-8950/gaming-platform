import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet as WalletIcon,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  ChevronRight,
  Sparkles,
  Gamepad2,
  Receipt,
  RotateCcw,
  Coins,
} from 'lucide-react';
import { walletService } from '../../services/wallet';
import { Loader } from '../../components/common/Loader';
import type { Wallet, WalletTransaction, TxType, TxStatus } from '../../types';
import '../../styles/wallet-page.css';

const CREDIT_TYPES: TxType[] = ['DEPOSIT', 'GAME_WIN', 'REFUND', 'ADJUSTMENT'];

type FilterTab = 'ALL' | 'DEPOSITS' | 'WITHDRAWALS' | 'GAMES';

function formatTxDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();

    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) {
      return `Today, ${timeStr}`;
    }
    const dateFormatted = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `${dateFormatted}, ${timeStr}`;
  } catch {
    return dateStr;
  }
}

function getTxIcon(type: TxType) {
  switch (type) {
    case 'DEPOSIT':
      return <ArrowDownToLine size={16} strokeWidth={2.5} />;
    case 'WITHDRAWAL':
      return <ArrowUpFromLine size={16} strokeWidth={2.5} />;
    case 'GAME_ENTRY':
    case 'GAME_WIN':
    case 'GAME_LOSS':
      return <Gamepad2 size={16} strokeWidth={2.5} />;
    case 'REFUND':
    case 'ADJUSTMENT':
      return <RotateCcw size={16} strokeWidth={2.5} />;
    default:
      return <Receipt size={16} strokeWidth={2.5} />;
  }
}

function getTxTypeClass(type: TxType): string {
  switch (type) {
    case 'DEPOSIT':
      return 'casino-tx-type-icon--deposit';
    case 'WITHDRAWAL':
      return 'casino-tx-type-icon--withdrawal';
    case 'GAME_ENTRY':
    case 'GAME_WIN':
    case 'GAME_LOSS':
      return 'casino-tx-type-icon--game';
    default:
      return 'casino-tx-type-icon--refund';
  }
}

function formatTxTitle(tx: WalletTransaction): string {
  switch (tx.type) {
    case 'DEPOSIT':
      return 'Deposit';
    case 'WITHDRAWAL':
      return 'Withdrawal';
    case 'GAME_ENTRY':
      return 'Game Entry';
    case 'GAME_WIN':
      return 'Game Winning';
    case 'GAME_LOSS':
      return 'Game Bet';
    case 'REFUND':
      return 'Refund';
    case 'ADJUSTMENT':
      return 'Balance Adjustment';
    default:
      return String((tx as any).type || 'Transaction').replace('_', ' ');
  }
}

function getStatusBadgeClass(status: TxStatus): string {
  switch (status) {
    case 'COMPLETED':
      return 'casino-status-badge--completed';
    case 'PENDING':
      return 'casino-status-badge--pending';
    case 'FAILED':
      return 'casino-status-badge--failed';
    case 'REVERSED':
      return 'casino-status-badge--reversed';
    default:
      return 'casino-status-badge--pending';
  }
}

export function WalletPage() {
  const navigate = useNavigate();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [txs, setTxs] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('ALL');

  useEffect(() => {
    Promise.all([walletService.getWallet(), walletService.getTransactions(1, 50)])
      .then(([w, t]) => {
        setWallet(w);
        setTxs(t.items || []);
      })
      .catch((err) => {
        console.error('Failed to load wallet data:', err);
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredTxs = txs.filter((tx) => {
    if (activeFilter === 'DEPOSITS') {
      return tx.type === 'DEPOSIT' || tx.type === 'REFUND';
    }
    if (activeFilter === 'WITHDRAWALS') {
      return tx.type === 'WITHDRAWAL';
    }
    if (activeFilter === 'GAMES') {
      return (
        tx.type === 'GAME_ENTRY' ||
        tx.type === 'GAME_WIN' ||
        tx.type === 'GAME_LOSS'
      );
    }
    return true;
  });

  const handleTransactionsClick = () => {
    const el = document.getElementById('transaction-history');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    } else {
      navigate('/transactions');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader />
      </div>
    );
  }

  return (
    <div className="casino-wallet-page">
      {/* Title Bar */}
      <div className="casino-wallet-title-bar">
        <h1 className="casino-wallet-heading">
          <WalletIcon size={24} className="casino-wallet-heading-icon" />
          Wallet
        </h1>
        <div className="casino-wallet-badge">
          <Sparkles size={13} />
          <span>777 Secure Wallet</span>
        </div>
      </div>

      {/* Hero Top Grid: Balance Card + Quick Actions */}
      <div className="casino-wallet-hero-grid">
        {/* Available Balance Card */}
        <div className="casino-balance-card">
          <div className="casino-balance-card-glow" />
          
          <div className="casino-balance-label-row">
            <p className="casino-balance-label">Available Balance</p>
            <Coins size={16} className="text-gold-400 opacity-80" />
          </div>

          <div className="casino-balance-amount-row">
            <span className="casino-balance-currency">₹</span>
            <span className="casino-balance-number">
              {wallet?.balance_inr ?? '0.00'}
            </span>
          </div>

          <p className="casino-balance-paisa">
            Balance in paisa: {wallet?.balance ?? 0}
          </p>
        </div>

        {/* Quick Actions (Deposit, Withdraw, Transactions) */}
        <div className="casino-quick-actions-grid">
          {/* Deposit Button */}
          <button
            type="button"
            onClick={() => navigate('/deposit')}
            className="casino-action-btn casino-action-btn--deposit"
          >
            <div className="casino-action-btn-left">
              <div className="casino-action-icon-box">
                <ArrowDownToLine size={20} strokeWidth={2.6} />
              </div>
              <div className="casino-action-info">
                <span className="casino-action-title">Deposit</span>
                <span className="casino-action-sub">Instant Add Cash</span>
              </div>
            </div>
            <ChevronRight size={18} strokeWidth={2.8} className="casino-action-arrow" />
          </button>

          {/* Withdraw Button */}
          <button
            type="button"
            onClick={() => navigate('/withdrawal')}
            className="casino-action-btn casino-action-btn--withdraw"
          >
            <div className="casino-action-btn-left">
              <div className="casino-action-icon-box">
                <ArrowUpFromLine size={20} strokeWidth={2.6} />
              </div>
              <div className="casino-action-info">
                <span className="casino-action-title">Withdraw</span>
                <span className="casino-action-sub">Fast Payouts</span>
              </div>
            </div>
            <ChevronRight size={18} strokeWidth={2.8} className="casino-action-arrow" />
          </button>

          {/* Transactions Button */}
          <button
            type="button"
            onClick={handleTransactionsClick}
            className="casino-action-btn casino-action-btn--txs"
          >
            <div className="casino-action-btn-left">
              <div className="casino-action-icon-box">
                <History size={20} strokeWidth={2.4} />
              </div>
              <div className="casino-action-info">
                <span className="casino-action-title">Transactions</span>
                <span className="casino-action-sub">View History</span>
              </div>
            </div>
            <ChevronRight size={18} strokeWidth={2.6} className="casino-action-arrow" />
          </button>
        </div>
      </div>

      {/* Transaction History Section */}
      <div id="transaction-history" className="casino-tx-section">
        <div className="casino-tx-header-row">
          <h2 className="casino-tx-heading">
            <History size={18} className="casino-tx-heading-icon" />
            Transaction History
          </h2>

          {/* Filter Tabs */}
          <div className="casino-tx-filters" role="tablist">
            {(['ALL', 'DEPOSITS', 'WITHDRAWALS', 'GAMES'] as FilterTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeFilter === tab}
                onClick={() => setActiveFilter(tab)}
                className={`casino-filter-pill ${activeFilter === tab ? 'active' : ''}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Transactions List */}
        {filteredTxs.length === 0 ? (
          <div className="casino-tx-empty">
            <div className="casino-tx-empty-icon">
              <Coins size={24} />
            </div>
            <h3 className="casino-tx-empty-title">No Transactions Yet</h3>
            <p className="casino-tx-empty-sub">
              Your wallet activity will appear here.
            </p>
          </div>
        ) : (
          <div className="casino-tx-list">
            {filteredTxs.map((tx) => {
              const isCredit = CREDIT_TYPES.includes(tx.type);
              const amountInRupees = (tx.amount / 100).toFixed(2);
              return (
                <div key={tx.id} className="casino-tx-row">
                  <div className="casino-tx-row-left">
                    <div
                      className={`casino-tx-type-icon ${getTxTypeClass(tx.type)}`}
                    >
                      {getTxIcon(tx.type)}
                    </div>
                    <div className="casino-tx-details">
                      <p className="casino-tx-title">{formatTxTitle(tx)}</p>
                      <p className="casino-tx-meta">
                        <span>{formatTxDate(tx.created_at)}</span>
                        {tx.reference_id && (
                          <span className="casino-tx-ref">
                            • Ref: {tx.reference_id.slice(-8)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="casino-tx-row-right">
                    <span
                      className={`casino-tx-amount ${
                        isCredit
                          ? 'casino-tx-amount--credit'
                          : 'casino-tx-amount--debit'
                      }`}
                    >
                      {isCredit ? '+' : '-'}₹{amountInRupees}
                    </span>
                    <span
                      className={`casino-status-badge ${getStatusBadgeClass(
                        tx.status
                      )}`}
                    >
                      {tx.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
