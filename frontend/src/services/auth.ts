import api from './api';
import type { User } from '../types';

export const authService = {
  async register(name: string, username: string, email: string, password: string) {
    const res = await api.post('/auth/register', { name, username, email, password });
    return res.data;
  },
  async login(email: string, password: string) {
    const res = await api.post('/auth/login', { email, password });
    if (res.data.success) {
      localStorage.setItem('access_token', res.data.data.access_token);
      localStorage.setItem('refresh_token', res.data.data.refresh_token);
    }
    return res.data;
  },
  async logout() {
    const refresh_token = localStorage.getItem('refresh_token');
    if (refresh_token) {
      await api.post('/auth/logout', { refresh_token }).catch(() => {});
    }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  },
  async me(): Promise<User> {
    const res = await api.get('/auth/me');
    return res.data.data;
  },
};
