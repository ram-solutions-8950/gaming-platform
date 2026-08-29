/**
 * WebSocket URL Resolution Helper
 */

export function getWebSocketUrl(path: string, token?: string): string {
  const cleanPath = path.replace(/^\/+/, '');

  const isHttps = window.location.protocol === 'https:';
  const wsProtocol = isHttps ? 'wss:' : 'ws:';

  let wsBase: string;

  const envApiUrl = import.meta.env.VITE_API_URL?.trim() || 'http://76.13.177.44/api/v1';
  const isDevHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const isEnvLocal = envApiUrl.includes('localhost') || envApiUrl.includes('127.0.0.1');

  if (isDevHost && isEnvLocal) {
    wsBase = `${wsProtocol}//127.0.0.1:8000/api/v1`;
  } else {
    try {
      const url = new URL(envApiUrl);
      const targetPort = url.port || '8000'; // Default to 8000 if not specified
      wsBase = `${wsProtocol}//${url.hostname}:${targetPort}/api/v1`;
    } catch (e) {
      wsBase = `${wsProtocol}//76.13.177.44:8000/api/v1`;
    }
  }

  wsBase = wsBase.replace(/\/+$/, '');

  let fullUrl = `${wsBase}/${cleanPath}`;

  if (token) {
    fullUrl += `?token=${encodeURIComponent(token)}`;
  }

  return fullUrl;
}