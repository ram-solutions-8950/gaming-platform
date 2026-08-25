import { useEffect, useState, useMemo } from 'react';
import {
  History,
  ArrowDownToLine,
  ArrowUpFromLine,
  Gamepad2,
  Trophy,
  RotateCcw,
  Receipt,
  Copy,
  Check,
  X,
  Coins,
  Sparkles,
} from 'lucide-react';
import { walletService } from '../../services/wallet';
import type { WalletTransaction, TxType, TxStatus } from '../../types';
import '../../styles/transactions-page.css';

const CREDIT_TYPES: TxType[] = ['DEPOSIT', 'GAME_WIN', 'REFUND', 'ADJUSTMENT'];

type FilterTab = 'ALL' | 'DEPOSITS' | 'WITHDRAWALS' | 'GAMES';

function formatTxDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${day} • ${time}`;
  } catch {
    return dateStr;
  }
}

function formatAmount(amountInPaisa: number): string {
  const inr = amountInPaisa / 100;
  return inr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function truncateRef(ref: string | null): string {
  if (!ref) return '—';
  if (ref.length <= 16) return ref;
  return `${ref.slice(0, 8)}...${ref.slice(-6)}`;
}

function getTxIcon(type: TxType) {
  switch (type) {
    case 'GAME_WIN':
      return <Trophy size={17} strokeWidth={2.4} />;
    case 'GAME_ENTRY':
    case 'GAME_LOSS':
      return <Gamepad2 size={17} strokeWidth={2.4} />;
    case 'DEPOSIT':
      return <ArrowDownToLine size={17} strokeWidth={2.6} />;
    case 'WITHDRAWAL':
      return <ArrowUpFromLine size={17} strokeWidth={2.6} />;
    case 'REFUND':
    case 'ADJUSTMENT':
      return <RotateCcw size={17} strokeWidth={2.4} />;
    default:
      return <Receipt size={17} strokeWidth={2.4} />;
  }
}

function getTxIconBoxClass(type: TxType): string {
  switch (type) {
    case 'GAME_WIN':
      return 'casino-tx-icon-box--win';
    case 'GAME_ENTRY':
    case 'GAME_LOSS':
      return 'casino-tx-icon-box--game';
    case 'DEPOSIT':
      return 'casino-tx-icon-box--deposit';
    case 'WITHDRAWAL':
      return 'casino-tx-icon-box--withdraw';
    default:
      return 'casino-tx-icon-box--default';
  }
}

function formatTxTitle(tx: WalletTransaction): string {
  switch (tx.type) {
    case 'GAME_WIN':
      return 'Game Win';
    case 'GAME_ENTRY':
      return 'Game Entry';
    case 'GAME_LOSS':
      return 'Game Bet';
    case 'DEPOSIT':
      return 'Deposit';
    case 'WITHDRAWAL':
      return 'Withdrawal';
    case 'REFUND':
      return 'Refund';
    case 'ADJUSTMENT':
      return 'Balance Adjustment';
    default:
      return String((tx as any).type || 'Transaction').replace('_', ' ');
  }
}

function getStatusPillClass(status: TxStatus): string {
  switch (status) {
    case 'COMPLETED':
      return 'casino-status-pill--completed';
    case 'PENDING':
      return 'casino-status-pill--pending';
    case 'FAILED':
      return 'casino-status-pill--failed';
    case 'REVERSED':
      return 'casino-status-pill--reversed';
    default:
      return 'casino-status-pill--pending';
  }
}

export function TransactionsPage() {
  const [txs, setTxs] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedTx, setSelectedTx] = useState<WalletTransaction | null>(null);

  const fetchTransactions = () => {
    setLoading(true);
    setError(null);
    walletService
      .getTransactions(1, 50)
      .then((t) => setTxs(t.items || []))
      .catch((err) => {
        console.error('Failed to fetch transactions:', err);
        setError('Unable to load transactions. Please try again.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const handleCopyRef = (e: React.MouseEvent, refId: string) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(refId);
    setCopiedId(refId);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  const filteredTxs = useMemo(() => {
    return txs.filter((tx) => {
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
  }, [txs, activeFilter]);

  return (
    <div className="casino-tx-page">
      <div className="casino-tx-ambient-glow" />

      {/* Title Bar */}
      <div className="casino-tx-title-bar">
        <div className="casino-tx-title-group">
          <h1 className="casino-tx-main-heading">
            <History size={24} className="casino-tx-heading-icon" />
            Transactions
          </h1>
          <p className="casino-tx-subheading">Your recent wallet and game activity</p>
        </div>

        <div className="casino-tx-count-chip">
          <Sparkles size={12} className="inline mr-1 text-gold-400" />
          <span>{filteredTxs.length} records</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="casino-tx-filter-bar">
        <div className="casino-tx-filter-pills" role="tablist">
          {(['ALL', 'DEPOSITS', 'WITHDRAWALS', 'GAMES'] as FilterTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeFilter === tab}
              onClick={() => setActiveFilter(tab)}
              className={`casino-tx-pill ${activeFilter === tab ? 'active' : ''}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions Container */}
      <div className="casino-tx-card-container">
        {/* Loading Skeletons */}
        {loading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="casino-tx-skeleton-row">
                <div className="casino-tx-skeleton-box" />
                <div className="casino-tx-skeleton-lines">
                  <div className="casino-tx-skeleton-line" style={{ width: '40%' }} />
                  <div className="casino-tx-skeleton-line" style={{ width: '65%' }} />
                </div>
                <div className="casino-tx-skeleton-shimmer" />
              </div>
            ))}
          </div>
        ) : error ? (
          /* Error State */
          <div className="casino-tx-error-box">
            <p className="casino-tx-error-title">{error}</p>
            <button
              type="button"
              onClick={fetchTransactions}
              className="casino-tx-retry-btn"
            >
              Try Again
            </button>
          </div>
        ) : filteredTxs.length === 0 ? (
          /* Empty State */
          <div className="casino-tx-empty-state">
            <div className="casino-tx-empty-icon">
              <Coins size={26} />
            </div>
            <h3 className="casino-tx-empty-title">No Transactions Yet</h3>
            <p className="casino-tx-empty-sub">
              Your wallet and game activity will appear here.
            </p>
          </div>
        ) : (
          /* Transaction Item List */
          filteredTxs.map((tx) => {
            const isCredit = CREDIT_TYPES.includes(tx.type);
            const formatted = formatAmount(tx.amount);
            const refStr = tx.reference_id || tx.id;

            return (
              <div
                key={tx.id}
                className="casino-tx-item"
                onClick={() => setSelectedTx(tx)}
                role="button"
                tabIndex={0}
              >
                {/* Left Icon */}
                <div className={`casino-tx-icon-box ${getTxIconBoxClass(tx.type)}`}>
                  {getTxIcon(tx.type)}
                </div>

                {/* Middle Description */}
                <div className="casino-tx-info">
                  <div className="casino-tx-title-row">
                    <span className="casino-tx-type-name">{formatTxTitle(tx)}</span>
                  </div>
                  <div className="casino-tx-meta-row">
                    <span>{formatTxDate(tx.created_at)}</span>
                    {refStr && (
                      <span
                        className="casino-tx-ref-pill"
                        title="Click to copy Reference ID"
                        onClick={(e) => handleCopyRef(e, refStr)}
                      >
                        {copiedId === refStr ? (
                          <>
                            <Check size={10} className="text-green-400" /> Copied
                          </>
                        ) : (
                          <>
                            Ref: {truncateRef(refStr)} <Copy size={9} />
                          </>
                        )}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right Amount & Status */}
                <div className="casino-tx-right">
                  <span
                    className={`casino-tx-amount-text ${
                      isCredit
                        ? 'casino-tx-amount-text--credit'
                        : 'casino-tx-amount-text--debit'
                    }`}
                  >
                    {isCredit ? '+' : '-'}₹{formatted}
                  </span>
                  <span className={`casino-status-pill ${getStatusPillClass(tx.status)}`}>
                    {tx.status}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Transaction Details Modal */}
      {selectedTx && (
        <div
          className="casino-tx-modal-overlay"
          onClick={() => setSelectedTx(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="casino-tx-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="casino-tx-modal-header">
              <h3 className="casino-tx-modal-title">Transaction Details</h3>
              <button
                type="button"
                className="casino-tx-modal-close-btn"
                onClick={() => setSelectedTx(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Hero Amount */}
            <div className="casino-tx-modal-amount-hero">
              <span className="text-xs font-semibold uppercase tracking-wider text-purple-300">
                {formatTxTitle(selectedTx)}
              </span>
              <span
                className={`casino-tx-modal-amount ${
                  CREDIT_TYPES.includes(selectedTx.type)
                    ? 'text-emerald-400'
                    : 'text-rose-400'
                }`}
              >
                {CREDIT_TYPES.includes(selectedTx.type) ? '+' : '-'}₹
                {formatAmount(selectedTx.amount)}
              </span>
            </div>

            {/* Detail Rows */}
            <div className="casino-tx-modal-rows">
              <div className="casino-tx-modal-row">
                <span className="casino-tx-modal-row-label">Status</span>
                <span className={`casino-status-pill ${getStatusPillClass(selectedTx.status)}`}>
                  {selectedTx.status}
                </span>
              </div>

              <div className="casino-tx-modal-row">
                <span className="casino-tx-modal-row-label">Date & Time</span>
                <span className="casino-tx-modal-row-val font-sans text-xs">
                  {formatTxDate(selectedTx.created_at)}
                </span>
              </div>

              <div className="casino-tx-modal-row">
                <span className="casino-tx-modal-row-label">Type</span>
                <span className="casino-tx-modal-row-val font-sans text-xs">
                  {selectedTx.type}
                </span>
              </div>

              {selectedTx.reference_id && (
                <div className="casino-tx-modal-row">
                  <span className="casino-tx-modal-row-label">Reference ID</span>
                  <div className="flex items-center gap-1.5">
                    <span className="casino-tx-modal-row-val text-[11px] select-all">
                      {selectedTx.reference_id}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleCopyRef(e, selectedTx.reference_id!)}
                      className="p-1 hover:text-gold-300 text-gold-400"
                      title="Copy Reference ID"
                    >
                      {copiedId === selectedTx.reference_id ? (
                        <Check size={13} className="text-green-400" />
                      ) : (
                        <Copy size={13} />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {selectedTx.balance_after !== undefined && (
                <div className="casino-tx-modal-row">
                  <span className="casino-tx-modal-row-label">Balance After</span>
                  <span className="casino-tx-modal-row-val text-white">
                    ₹{formatAmount(selectedTx.balance_after)}
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              className="casino-tx-modal-close-action-btn"
              onClick={() => setSelectedTx(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
