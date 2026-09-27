import { create } from 'zustand';

interface InsufficientBalanceState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useInsufficientBalanceStore = create<InsufficientBalanceState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));

/** Tells the player a bet was refused for lack of funds. Callable from anywhere, in React or not. */
export function showInsufficientBalance() {
  useInsufficientBalanceStore.getState().open();
}

/**
 * Whether a server message is a bet or entry refused for lack of funds
 * ("Insufficient balance", "Insufficient wallet balance for this entry fee", ...).
 * A poker "Insufficient stack" is about chips on the table, not the wallet.
 */
export function isInsufficientBalanceMessage(message: unknown): boolean {
  return typeof message === 'string' && /insufficient\s+(wallet\s+)?balance/i.test(message);
}
