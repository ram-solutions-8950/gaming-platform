import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Wallet, PlusCircle, X } from 'lucide-react';
import { useInsufficientBalanceStore } from '../../store/insufficientBalanceStore';

/** App-wide popup for a bet refused because the wallet can't cover it. */
export function InsufficientBalanceModal() {
  const { isOpen, close, requiredAmount, currentBalance } = useInsufficientBalanceStore();
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleRecharge = () => {
    close();
    try {
      navigate('/deposit');
    } catch {
      window.location.href = '/deposit';
    }
  };

  const formattedRequired =
    requiredAmount !== undefined
      ? `₹${(requiredAmount >= 100 ? requiredAmount / 100 : requiredAmount).toFixed(2)}`
      : null;
  const formattedBalance =
    currentBalance !== undefined
      ? `₹${(currentBalance >= 100 ? currentBalance / 100 : currentBalance).toFixed(2)}`
      : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in select-none"
      onClick={close}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="insufficient-balance-title"
    >
      <div
        className="relative flex flex-col items-center gap-3 p-6 sm:p-7 bg-gradient-to-b from-[#1e1b4b] via-[#0f172a] to-[#020617] border border-amber-500/40 rounded-3xl shadow-[0_0_50px_rgba(245,158,11,0.25)] max-w-sm w-full text-center animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button in corner */}
        <button
          type="button"
          onClick={close}
          className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Golden Glowing Wallet Icon */}
        <div className="relative my-1">
          <div className="absolute inset-0 bg-amber-500/30 rounded-full blur-xl animate-pulse" />
          <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 p-0.5 shadow-lg shadow-amber-500/30 flex items-center justify-center">
            <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center text-amber-400">
              <Wallet size={28} />
            </div>
          </div>
        </div>

        <h2 id="insufficient-balance-title" className="text-xl font-black text-white tracking-wide m-0">
          Insufficient Balance
        </h2>

        <p className="text-sm text-slate-300 m-0 leading-relaxed">
          Your balance is too low to place this bet. Please recharge your account to continue playing.
        </p>

        {(formattedRequired || formattedBalance) && (
          <div className="w-full bg-slate-900/90 border border-white/10 rounded-xl p-3 my-1 flex items-center justify-around text-xs">
            {formattedBalance && (
              <div>
                <span className="text-slate-400 block mb-0.5">Your Balance</span>
                <span className="font-bold text-amber-400 text-sm">{formattedBalance}</span>
              </div>
            )}
            {formattedRequired && (
              <div>
                <span className="text-slate-400 block mb-0.5">Required</span>
                <span className="font-bold text-white text-sm">{formattedRequired}</span>
              </div>
            )}
          </div>
        )}

        <div className="w-full flex flex-col gap-2.5 mt-2">
          {/* Primary Action Button: Sent to payment/recharge page */}
          <button
            type="button"
            onClick={handleRecharge}
            autoFocus
            className="w-full py-3 px-5 rounded-2xl bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-600 hover:from-emerald-400 hover:to-green-500 text-white font-black text-sm tracking-wide transition transform active:scale-95 shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2 cursor-pointer"
          >
            <PlusCircle size={18} />
            <span>Recharge Account Now</span>
          </button>

          <button
            type="button"
            onClick={close}
            className="w-full py-2 px-4 rounded-xl text-slate-400 hover:text-slate-200 text-xs font-bold transition hover:bg-white/5 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
