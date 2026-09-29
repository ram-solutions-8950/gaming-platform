import axios from 'axios';
import { authStorage } from './authStorage';
import { isNativePlatform } from '../utils/platform';
import { isInsufficientBalanceMessage, showInsufficientBalance } from '../store/insufficientBalanceStore';

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

const isCapacitor = isNativePlatform();

const isLocalHost =
  !isCapacitor &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1');

const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';

export const API_BASE_URL = (() => {
  if (configuredApiUrl) {
    if (isHttps && configuredApiUrl.startsWith('http://') && !isCapacitor) {
      return '/api/v1';
    }
    return configuredApiUrl;
  }
  if (isCapacitor) return 'http://76.13.177.44:8000/api/v1';
  if (isLocalHost) return 'http://127.0.0.1:8000/api/v1';
  if (isHttps) return '/api/v1';
  if (import.meta.env.PROD) return 'http://76.13.177.44:8000/api/v1';
  return `${window.location.protocol}//${window.location.hostname}${window.location.port === '5173' ? ':8000' : ''}/api/v1`;
})();

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = authStorage.getAccessToken();

  config.headers = config.headers ?? {};

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (isNativePlatform()) {
    config.headers['X-Client-Platform'] = 'apk';
  }

  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    // Intercept 401 only if not retried yet and not the refresh/login endpoint
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !original.url?.includes('/auth/refresh') &&
      !original.url?.includes('/auth/login')
    ) {
      original._retry = true;

      const refresh_token = authStorage.getRefreshToken();

      if (refresh_token) {
        try {
          const res = await axios.post(
            `${api.defaults.baseURL}/auth/refresh`,
            { refresh_token },
            { timeout: 15000 }
          );

          const {
            access_token,
            refresh_token: new_refresh,
          } = res.data.data;

          authStorage.setTokens(access_token, new_refresh || refresh_token);

          original.headers = original.headers ?? {};
          original.headers.Authorization = `Bearer ${access_token}`;

          return api(original);
        } catch (refreshError: any) {
          // CRITICAL: Only clear tokens if the server explicitly confirmed the session is invalid (401 or 403).
          // NEVER clear tokens on network failure, timeout, 5xx server error, or connection refusal.
          if (
            refreshError.response &&
            (refreshError.response.status === 401 || refreshError.response.status === 403)
          ) {
            authStorage.clearTokens();

            if (
              typeof window !== 'undefined' &&
              !window.location.pathname.startsWith('/download') &&
              !window.location.pathname.startsWith('/login')
            ) {
              window.location.href = '/login';
            }
          }
          return Promise.reject(refreshError);
        }
      } else {
        // No refresh token available at all and received 401
        authStorage.clearTokens();
        if (
          typeof window !== 'undefined' &&
          !window.location.pathname.startsWith('/download') &&
          !window.location.pathname.startsWith('/login')
        ) {
          window.location.href = '/login';
        }
      }
    }

    // A bet or table entry the wallet can't cover: tell the player, whichever
    // game it came from. Withdrawals and the admin panel explain it in place.
    const message = error.response?.data?.error?.message ?? error.response?.data?.detail;
    const url: string = original?.url ?? '';
    if (
      isInsufficientBalanceMessage(message) &&
      !url.includes('/admin') &&
      !url.includes('/withdraw') &&
      !window.location.pathname.startsWith('/admin')
    ) {
      showInsufficientBalance();
    }

    return Promise.reject(error);
  },
);

export default api;