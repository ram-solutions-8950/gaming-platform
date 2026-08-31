/**
 * Auth Storage Service
 * Persists JWT access and refresh tokens safely across web and Android APK.
 * Never stores passwords.
 */

declare global {
  interface Window {
    AndroidAuth?: {
      getAccessToken: () => string;
      getRefreshToken: () => string;
      setTokens: (access: string, refresh: string) => void;
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

    // If missing in localStorage, check native Android SharedPreferences
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
    return token;
  },

  getRefreshToken(): string | null {
    let token: string | null = null;
    try {
      token = localStorage.getItem('refresh_token');
    } catch {}

    // If missing in localStorage, check native Android SharedPreferences
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
    return token;
  },

  setTokens(accessToken: string, refreshToken: string) {
    try {
      localStorage.setItem('access_token', accessToken);
      localStorage.setItem('refresh_token', refreshToken);
    } catch {}

    if (typeof window !== 'undefined' && window.AndroidAuth?.setTokens) {
      try {
        window.AndroidAuth.setTokens(accessToken, refreshToken);
      } catch (e) {
        console.warn('Native setTokens failed:', e);
      }
    }
  },

  clearTokens() {
    try {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
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
