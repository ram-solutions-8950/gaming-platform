import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check, ShieldCheck } from 'lucide-react';

export interface BaseTransaction {
  id: string;
  type: string;
  amount: number;
  status: string;
  created_at: string;
  reference_id?: string | null;
  reference_type?: string | null;
  balance_after?: number | null;
  metadata?: Record<string, any> | null;
}

interface TransactionDetailsModalProps {
  tx: BaseTransaction | null;
  onClose: () => void;
}

const CREDIT_TYPES = ['DEPOSIT', 'REFUND', 'GAME_WIN', 'BONUS'];

export const TransactionDetailsModal: React.FC<TransactionDetailsModalProps> = ({
  tx,
  onClose,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!tx) return null;

  const isCredit = CREDIT_TYPES.includes(tx.type);
  const amountInRupees = (tx.amount / 100).toFixed(2);

  const handleCopyRef = (e: React.MouseEvent, refId: string) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(refId);
    setCopiedId(refId);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  const formatTxTitle = (type: string) => {
    switch (type) {
      case 'DEPOSIT':
        return 'Deposit';
      case 'WITHDRAWAL':
        return 'Withdrawal';
      case 'GAME_ENTRY':
        return 'Game Bet';
      case 'GAME_WIN':
        return 'Game Win';
      case 'GAME_LOSS':
        return 'Game Loss';
      case 'REFUND':
        return 'Refund';
      case 'BONUS':
        return 'Bonus Credited';
      default:
        return type.replace(/_/g, ' ');
    }
  };

  const formatTxDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return isoStr;
    }
  };

  const getStatusBadge = (status: string) => {
    const s = (status || '').toUpperCase();
    if (s === 'COMPLETED' || s === 'SUCCESS') {
      return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40';
    }
    if (s === 'PENDING') {
      return 'bg-amber-500/20 text-amber-400 border border-amber-500/40';
    }
    return 'bg-rose-500/20 text-rose-400 border border-rose-500/40';
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fadeIn select-none"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm sm:max-w-md bg-gradient-to-b from-[#1c0836] via-[#120324] to-[#0a0117] border-2 border-amber-500/40 rounded-3xl p-5 sm:p-6 shadow-2xl text-white flex flex-col gap-4 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} className="text-amber-400" />
            <h3 className="font-bold text-base sm:text-lg text-white">Transaction Details</h3>
          </div>
          <button
            type="button"
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center text-sm font-bold transition cursor-pointer"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Hero Amount */}
        <div className="flex flex-col items-center justify-center p-4 bg-black/40 rounded-2xl border border-white/10 text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-purple-300 mb-1">
            {formatTxTitle(tx.type)}
          </span>
          <span
            className={`text-2xl sm:text-3xl font-black ${
              isCredit ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {isCredit ? '+' : '-'}₹{amountInRupees}
          </span>
        </div>

        {/* Details Rows */}
        <div className="space-y-2.5 text-xs sm:text-sm">
          <div className="flex items-center justify-between py-1.5 border-b border-white/5">
            <span className="text-slate-400 font-medium">Status</span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${getStatusBadge(tx.status)}`}>
              {tx.status}
            </span>
          </div>

          <div className="flex items-center justify-between py-1.5 border-b border-white/5">
            <span className="text-slate-400 font-medium">Date & Time</span>
            <span className="text-slate-200 font-semibold">{formatTxDate(tx.created_at)}</span>
          </div>

          <div className="flex items-center justify-between py-1.5 border-b border-white/5">
            <span className="text-slate-400 font-medium">Type</span>
            <span className="text-amber-300 font-mono font-bold uppercase">{tx.type}</span>
          </div>

          {tx.reference_id && (
            <div className="flex items-center justify-between py-1.5 border-b border-white/5">
              <span className="text-slate-400 font-medium">Reference ID</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-slate-300 text-xs select-all">
                  {tx.reference_id}
                </span>
                <button
                  type="button"
                  onClick={(e) => handleCopyRef(e, tx.reference_id!)}
                  className="p-1 text-amber-400 hover:text-amber-300 transition cursor-pointer"
                  title="Copy Reference ID"
                >
                  {copiedId === tx.reference_id ? (
                    <Check size={14} className="text-emerald-400" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </div>
            </div>
          )}

          {tx.reference_type && (
            <div className="flex items-center justify-between py-1.5 border-b border-white/5">
              <span className="text-slate-400 font-medium">Reference Type</span>
              <span className="text-slate-200 font-mono text-xs">{tx.reference_type}</span>
            </div>
          )}

          {tx.balance_after != null && (
            <div className="flex items-center justify-between py-1.5 border-b border-white/5">
              <span className="text-slate-400 font-medium">Balance After</span>
              <span className="text-white font-bold">
                ₹{(tx.balance_after / 100).toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {/* Action Button */}
        <button
          type="button"
          className="w-full mt-2 py-2.5 px-4 rounded-xl font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 active:scale-95 shadow-lg shadow-amber-500/25 transition cursor-pointer"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
