/**
 * WebSocket URL Resolution Helper
 * Works consistently across:
 * 1. Localhost Dev Server (Vite port 5173/5174/3000 -> 127.0.0.1:8000)
 * 2. Deployed Production Web on Hostinger/Custom Domain (HTTP and HTTPS -> ws/wss)
 * 3. Capacitor Android APK (WebView localhost -> Production backend server IP)
 */

export function getWebSocketUrl(path: string, token?: string): string {
  const envWs = import.meta.env.VITE_WS_URL ? import.meta.env.VITE_WS_URL.trim() : '';
  const envApi = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.trim() : '';

  // Clean path: ensure no leading slash for joining
  const cleanPath = path.replace(/^\/+/, '');

  let wsBase = '';

  // 1. Direct explicit VITE_WS_URL override
  if (envWs) {
    let cleanWs = envWs.replace(/\/+$/, '');
    if (window.location.protocol === 'https:' && cleanWs.startsWith('ws://')) {
      cleanWs = cleanWs.replace(/^ws:\/\//, 'wss://');
    }
    wsBase = cleanWs;
  }
  // 2. Derive from VITE_API_URL
  else if (envApi) {
    const cleanApi = envApi.replace(/\/+$/, '');
    if (cleanApi.startsWith('http://') || cleanApi.startsWith('https://')) {
      const isHttpsPage = window.location.protocol === 'https:';
      const wsProto = isHttpsPage || cleanApi.startsWith('https://') ? 'wss:' : 'ws:';
      wsBase = cleanApi.replace(/^https?:/, wsProto);
    } else {
      // Relative API path like '/api/v1'
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const apiPrefix = cleanApi.startsWith('/') ? cleanApi : '/' + cleanApi;
      wsBase = `${wsProto}//${host}${apiPrefix}`;
    }
  }
  // 3. Runtime environment detection
  else {
    const isDevPort = window.location.port === '5173' || window.location.port === '3000' || window.location.port === '5174';
    const isCapacitor = Boolean(
      (window as any).Capacitor?.isNativePlatform?.() ||
      ((window.location.protocol === 'http:' || window.location.protocol === 'capacitor:') &&
        window.location.hostname === 'localhost' &&
        !isDevPort)
    );

    if (isCapacitor) {
      // Android APK WebView running locally -> route to production server
      wsBase = 'ws://76.13.177.44/api/v1';
    } else if (isDevPort && !import.meta.env.PROD) {
      // Local dev machine
      wsBase = 'ws://127.0.0.1:8000/api/v1';
    } else {
      // Production web browser (Hostinger / custom domain)
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      wsBase = `${wsProto}//${host}/api/v1`;
    }
  }

  // Ensure base has no trailing slash and does not duplicate path
  wsBase = wsBase.replace(/\/+$/, '');

  let fullUrl: string;
  if (wsBase.endsWith('/' + cleanPath) || wsBase.endsWith(cleanPath)) {
    fullUrl = wsBase;
  } else {
    fullUrl = `${wsBase}/${cleanPath}`;
  }

  if (token) {
    const separator = fullUrl.includes('?') ? '&' : '?';
    fullUrl = `${fullUrl}${separator}token=${encodeURIComponent(token)}`;
  }

  return fullUrl;
}
