import api from './api';

export const walletService = {
  async getWallet() {
    const res = await api.get('/wallet');
    return res.data.data;
  },
  async getTransactions(page = 1, page_size = 20) {
    const res = await api.get('/wallet/transactions', { params: { page, page_size } });
    return res.data.data;
  },
};
