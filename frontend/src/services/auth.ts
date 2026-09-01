import api, { API_BASE_URL } from './api';
import axios from 'axios';
import { authStorage } from './authStorage';
import type { User } from '../types';

export const authService = {
  async register(name: string, username: string, email: string, password: string, referral_code?: string) {
    const res = await api.post('/auth/register', {
      name,
      username,
      email,
      password,
      referral_code: referral_code ? referral_code.trim() : undefined,
    });
    if (res.data?.success && res.data?.data?.access_token) {
      authStorage.setTokens(res.data.data.access_token, res.data.data.refresh_token || '');
      if (res.data.data.user) {
        authStorage.setCachedUser(res.data.data.user);
      }
    }
    return res.data;
  },

  async login(email: string, password: string) {
    const res = await api.post('/auth/login', { email, password });
    if (res.data?.success && res.data?.data?.access_token) {
      authStorage.setTokens(res.data.data.access_token, res.data.data.refresh_token || '');
      if (res.data.data.user) {
        authStorage.setCachedUser(res.data.data.user);
      }
    }
    return res.data;
  },

  async logout() {
    const refresh_token = authStorage.getRefreshToken();
    if (refresh_token) {
      await api.post('/auth/logout', { refresh_token }).catch(() => {});
    }
    authStorage.clearTokens();
    try {
      sessionStorage.removeItem('referral_popup_shown_this_session');
    } catch {}
  },

  async refreshSession(): Promise<boolean> {
    const refresh_token = authStorage.getRefreshToken();
    if (!refresh_token) return false;

    try {
      const res = await axios.post(
        `${API_BASE_URL}/auth/refresh`,
        { refresh_token },
        { timeout: 15000 }
      );
      if (res.data?.success && res.data?.data?.access_token) {
        authStorage.setTokens(
          res.data.data.access_token,
          res.data.data.refresh_token || refresh_token
        );
        return true;
      }
    } catch (e: any) {
      // If server explicitly reports refresh token is invalid or expired
      if (e.response && (e.response.status === 401 || e.response.status === 403)) {
        authStorage.clearTokens();
      }
      return false;
    }
    return false;
  },

  async me(): Promise<User> {
    const res = await api.get('/auth/me');
    const user = res.data.data;
    if (user) {
      authStorage.setCachedUser(user);
    }
    return user;
  },
};
