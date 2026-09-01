import axios from 'axios';
import { authStorage } from './authStorage';

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

const isLocalHost =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

export const API_BASE_URL =
  configuredApiUrl ||
  (isLocalHost
    ? 'http://127.0.0.1:8000/api/v1'
    : `${window.location.protocol}//${window.location.hostname}/api/v1`);

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = authStorage.getAccessToken();

  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
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

    return Promise.reject(error);
  },
);

export default api;