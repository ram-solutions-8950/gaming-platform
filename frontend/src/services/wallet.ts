import api from './api';
import type { Wallet, WalletTransaction } from '../types';

export const walletService = {
  /** Fetch the current user's own wallet. */
  async getWallet(): Promise<Wallet> {
    const res = await api.get('/wallet');
    return res.data.data;
  },

  /** Fetch the current user's own transaction history. */
  async getTransactions(page = 1, page_size = 20) {
    const res = await api.get('/wallet/transactions', { params: { page, page_size } });
    return res.data.data;
  },

  /**
   * SUPER_ADMIN: Adjust any user's wallet balance.
   *
   * @param userId      - UUID of the target user
   * @param amountPaisa - Integer in **paisa**.
   *                      Positive  → credit (add funds)
   *                      Negative  → debit  (deduct funds)
   * @param reason      - Audit reason, min 5 characters
   *
   * The backend expects query parameters, NOT a JSON body.
   * POST /api/v1/admin/wallet-adjustments?user_id=…&amount=…&reason=…
   */
  async adjustUserWallet(
    userId: string,
    amountPaisa: number,
    reason: string,
  ): Promise<WalletTransaction> {
    const res = await api.post('/admin/wallet-adjustments', null, {
      params: { user_id: userId, amount: amountPaisa, reason: reason.trim() },
    });
    return res.data.data as WalletTransaction;
  },
};

