/**
 * WebSocket URL Resolution Helper
 */

export function getWebSocketUrl(path: string, token?: string): string {
  const cleanPath = path.replace(/^\/+/, '');
  const configuredWsUrl = import.meta.env.VITE_WS_URL?.trim();
  const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

  let wsBase = '';
  if (configuredWsUrl) {
    wsBase = configuredWsUrl;
  } else if (configuredApiUrl) {
    try {
      const url = new URL(configuredApiUrl);
      const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const targetPort = url.port || '8000';
      wsBase = `${wsProtocol}//${url.hostname}:${targetPort}/api/v1`;
    } catch {
      wsBase = import.meta.env.PROD ? 'ws://76.13.177.44:8000/api/v1' : 'ws://127.0.0.1:8000/api/v1';
    }
  } else {
    wsBase = import.meta.env.PROD ? 'ws://76.13.177.44:8000/api/v1' : 'ws://127.0.0.1:8000/api/v1';
  }

  wsBase = wsBase.replace(/\/+$/, '');
  let fullUrl = `${wsBase}/${cleanPath}`;

  if (token) {
    fullUrl += (fullUrl.includes('?') ? '&' : '?') + `token=${encodeURIComponent(token)}`;
  }

  return fullUrl;
}