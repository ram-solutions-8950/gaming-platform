import { useCallback, useEffect, useRef, useState } from 'react';
import { walletService } from '../services/wallet';
import type { Wallet } from '../types';

export type WalletStatus = 'loading' | 'ready' | 'stale' | 'error';

export interface WalletState {
  wallet: Wallet | null;
  /**
   * `loading` — nothing fetched yet.
   * `ready`   — the figure on screen is current.
   * `stale`   — a refresh failed but we still hold an earlier balance.
   * `error`   — we have never managed to read the balance.
   */
  status: WalletStatus;
  refresh: () => void;
}

/**
 * Poll the wallet, keeping failures distinguishable from a zero balance.
 *
 * The previous behaviour swallowed every error and left the balance
 * undefined, which the UI rendered as ₹0.00. During a backend stall that
 * made a funded account look emptied — the single most alarming thing a
 * money app can show, and it was never real. So: a failed refresh never
 * clears a balance we already have, and a balance we have never read is
 * reported as unknown rather than as zero.
 */
export function useWallet(pollMs = 10000): WalletState {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [status, setStatus] = useState<WalletStatus>('loading');
  // Read inside the polling callback without re-subscribing the interval.
  const hasData = useRef(false);
  const cancelled = useRef(false);

  const refresh = useCallback(() => {
    walletService
      .getWallet()
      .then((w) => {
        if (cancelled.current) return;
        hasData.current = true;
        setWallet(w);
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled.current) return;
        // Keep the last known figure; only the freshness changes.
        setStatus(hasData.current ? 'stale' : 'error');
      });
  }, []);

  useEffect(() => {
    cancelled.current = false;
    refresh();

    const onWake = () => refresh();
    window.addEventListener('focus', onWake);
    window.addEventListener('wallet-update', onWake);
    const interval = window.setInterval(refresh, pollMs);

    return () => {
      cancelled.current = true;
      window.removeEventListener('focus', onWake);
      window.removeEventListener('wallet-update', onWake);
      window.clearInterval(interval);
    };
  }, [refresh, pollMs]);

  return { wallet, status, refresh };
}

/**
 * Render a balance without ever inventing a zero.
 *
 * Returns the amount when known, an em dash when it is not. Callers that
 * need to style the unknown case differently should branch on `status`.
 */
export function formatBalance(
  wallet: Wallet | null,
  status: WalletStatus,
): string {
  if (wallet) return wallet.balance_inr;
  return status === 'loading' ? '…' : '—';
}
