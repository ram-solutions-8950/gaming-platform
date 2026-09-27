import { createPortal } from 'react-dom';
import { Wallet } from 'lucide-react';
import { useInsufficientBalanceStore } from '../../store/insufficientBalanceStore';

/** App-wide popup for a bet refused because the wallet can't cover it. */
export function InsufficientBalanceModal() {
  const { isOpen, close } = useInsufficientBalanceStore();
  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in select-none"
      onClick={close}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="insufficient-balance-title"
    >
      <div
        className="flex flex-col items-center gap-3 p-5 sm:p-6 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 border border-amber-500/50 rounded-2xl shadow-2xl max-w-xs w-full text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-12 rounded-full bg-amber-500/15 border border-amber-500/50 flex items-center justify-center text-amber-400">
          <Wallet size={22} />
        </div>
        <h2 id="insufficient-balance-title" className="text-lg font-black text-white uppercase tracking-wider m-0">
          Insufficient Balance
        </h2>
        <p className="text-sm text-slate-300 m-0">
          Your balance is too low for this bet. Please refill your account.
        </p>
        <button
          type="button"
          onClick={close}
          autoFocus
          className="w-full mt-1 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm transition active:scale-95 cursor-pointer shadow"
        >
          OK
        </button>
      </div>
    </div>,
    document.body,
  );
}
