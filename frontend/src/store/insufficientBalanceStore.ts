import { create } from 'zustand';

interface InsufficientBalanceState {
  isOpen: boolean;
  requiredAmount?: number;
  currentBalance?: number;
  open: (opts?: { requiredAmount?: number; currentBalance?: number }) => void;
  close: () => void;
}

export const useInsufficientBalanceStore = create<InsufficientBalanceState>((set) => ({
  isOpen: false,
  requiredAmount: undefined,
  currentBalance: undefined,
  open: (opts) =>
    set({
      isOpen: true,
      requiredAmount: opts?.requiredAmount,
      currentBalance: opts?.currentBalance,
    }),
  close: () => set({ isOpen: false, requiredAmount: undefined, currentBalance: undefined }),
}));

/** Tells the player a bet was refused for lack of funds. Callable from anywhere, in React or not. */
export function showInsufficientBalance(opts?: { requiredAmount?: number; currentBalance?: number }) {
  useInsufficientBalanceStore.getState().open(opts);
}

/**
 * Whether a server message is a bet or entry refused for lack of funds
 * ("Insufficient balance", "Insufficient wallet balance for this entry fee", ...).
 * A poker "Insufficient stack" is about chips on the table, not the wallet.
 */
export function isInsufficientBalanceMessage(message: unknown): boolean {
  return typeof message === 'string' && /insufficient\s+(wallet\s+)?balance/i.test(message);
}
