/**
 * Auth Storage Service
 * Persists JWT access and refresh tokens safely across web and Android APK.
 * Primary store is Android SharedPreferences (via NativeAuthBridge) on APK,
 * with localStorage as secondary cache. Never stores raw passwords.
 */
import type { User } from '../types';

declare global {
  interface Window {
    AndroidAuth?: {
      getAccessToken: () => string;
      getRefreshToken: () => string;
      getCachedUser?: () => string;
      setTokens: (access: string, refresh: string) => void;
      setCachedUser?: (userJson: string) => void;
      clearTokens: () => void;
    };
  }
}

export const authStorage = {
  getAccessToken(): string | null {
    let token: string | null = null;
    try {
      token = localStorage.getItem('access_token');
    } catch {}

    // Check native Android SharedPreferences if missing or empty
    if (!token && typeof window !== 'undefined' && window.AndroidAuth?.getAccessToken) {
      try {
        const nativeToken = window.AndroidAuth.getAccessToken();
        if (nativeToken && nativeToken.trim()) {
          token = nativeToken.trim();
          try {
            localStorage.setItem('access_token', token);
          } catch {}
        }
      } catch (e) {
        console.warn('Native getAccessToken failed:', e);
      }
    }
    return token && token.trim() ? token.trim() : null;
  },

  getRefreshToken(): string | null {
    let token: string | null = null;
    try {
      token = localStorage.getItem('refresh_token');
    } catch {}

    // Check native Android SharedPreferences if missing or empty
    if (!token && typeof window !== 'undefined' && window.AndroidAuth?.getRefreshToken) {
      try {
        const nativeToken = window.AndroidAuth.getRefreshToken();
        if (nativeToken && nativeToken.trim()) {
          token = nativeToken.trim();
          try {
            localStorage.setItem('refresh_token', token);
          } catch {}
        }
      } catch (e) {
        console.warn('Native getRefreshToken failed:', e);
      }
    }
    return token && token.trim() ? token.trim() : null;
  },

  getCachedUser(): User | null {
    let userJson: string | null = null;
    try {
      userJson = localStorage.getItem('cached_user');
    } catch {}

    if (!userJson && typeof window !== 'undefined' && window.AndroidAuth?.getCachedUser) {
      try {
        const nativeUser = window.AndroidAuth.getCachedUser();
        if (nativeUser && nativeUser.trim()) {
          userJson = nativeUser.trim();
          try {
            localStorage.setItem('cached_user', userJson);
          } catch {}
        }
      } catch (e) {
        console.warn('Native getCachedUser failed:', e);
      }
    }

    if (userJson) {
      try {
        return JSON.parse(userJson) as User;
      } catch {}
    }
    return null;
  },

  setTokens(accessToken: string, refreshToken: string) {
    if (!accessToken && !refreshToken) return;

    try {
      if (accessToken) localStorage.setItem('access_token', accessToken);
      if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
    } catch {}

    if (typeof window !== 'undefined' && window.AndroidAuth?.setTokens) {
      try {
        window.AndroidAuth.setTokens(accessToken || '', refreshToken || '');
      } catch (e) {
        console.warn('Native setTokens failed:', e);
      }
    }
  },

  setCachedUser(user: User | null) {
    if (!user) return;
    const str = JSON.stringify(user);
    try {
      localStorage.setItem('cached_user', str);
    } catch {}

    if (typeof window !== 'undefined' && window.AndroidAuth?.setCachedUser) {
      try {
        window.AndroidAuth.setCachedUser(str);
      } catch (e) {
        console.warn('Native setCachedUser failed:', e);
      }
    }
  },

  clearTokens() {
    try {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('cached_user');
    } catch {}

    if (typeof window !== 'undefined' && window.AndroidAuth?.clearTokens) {
      try {
        window.AndroidAuth.clearTokens();
      } catch (e) {
        console.warn('Native clearTokens failed:', e);
      }
    }
  },
};
