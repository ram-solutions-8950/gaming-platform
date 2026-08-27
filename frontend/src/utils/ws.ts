/**
 * WebSocket URL Resolution Helper
 */

export function getWebSocketUrl(path: string, token?: string): string {
  const cleanPath = path.replace(/^\/+/, '');

  const isHttps = window.location.protocol === 'https:';
  const wsProtocol = isHttps ? 'wss:' : 'ws:';

  let wsBase: string;

  // Local development
  const isDev =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  if (isDev) {
    wsBase = `${wsProtocol}//127.0.0.1:8000/api/v1`;
  } else {
    // Production VPS
    //
    // Backend is exposed directly on port 8000.
    wsBase = `${wsProtocol}//${window.location.hostname}:8000/api/v1`;
  }

  wsBase = wsBase.replace(/\/+$/, '');

  let fullUrl = `${wsBase}/${cleanPath}`;

  if (token) {
    fullUrl += `?token=${encodeURIComponent(token)}`;
  }

  return fullUrl;
}