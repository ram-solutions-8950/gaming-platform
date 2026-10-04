import { API_BASE_URL } from '../services/api';
import { isNativePlatform } from './platform';

/**
 * Normalizes and resolves media URLs (QR codes, avatars, receipts, etc.)
 * across Web (HTTPS/HTTP), localhost, and Native Mobile APK (Capacitor).
 */
export function getMediaUrl(path: string | null | undefined): string {
  if (!path || typeof path !== 'string') return '';
  const trimmed = path.trim();
  if (!trimmed) return '';

  // 1. Data URLs and object Blob URLs pass through directly
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  // 2. Full HTTP/HTTPS URLs
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    // If the browser page is running over HTTPS and URL uses http to our server, upgrade to avoid mixed content
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && !isNativePlatform()) {
      if (trimmed.startsWith('http://') && !trimmed.includes('localhost') && !trimmed.includes('127.0.0.1')) {
        try {
          const urlObj = new URL(trimmed);
          if (urlObj.hostname === window.location.hostname || urlObj.hostname === '76.13.177.44') {
            return `${window.location.origin}${urlObj.pathname}${urlObj.search}`;
          }
        } catch {
          // fallback
        }
      }
    }
    return trimmed;
  }

  // 3. Relative paths (e.g. "/uploads/qr/...", "uploads/qr/...", "/api/v1/uploads/...")
  let normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;

  // Automatically ensure uploaded media routes through /api/v1/uploads so it is guaranteed
  // to be proxied by all web servers, SSL endpoints, and CDNs
  if (normalizedPath.startsWith('/uploads/')) {
    normalizedPath = `/api/v1${normalizedPath}`;
  }

  // If running inside Native Capacitor APK (Android/iOS)
  if (isNativePlatform()) {
    // In Capacitor, origin is localhost or capacitor://, so relative paths will fail.
    // Use API_BASE_URL host without '/api/v1' suffix
    const hostBase = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
    return `${hostBase}${normalizedPath}`;
  }

  // If in web browser
  if (typeof window !== 'undefined') {
    // If API_BASE_URL is localhost / 127.0.0.1:8000 in dev
    if (API_BASE_URL.startsWith('http://') || API_BASE_URL.startsWith('https://')) {
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (isLocal) {
        const hostBase = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
        return `${hostBase}${normalizedPath}`;
      }
    }
    // On production HTTPS web (admin.polandexim.com or polandexim.com),
    // root-relative /api/v1/uploads/... routes directly through the API proxy
    return normalizedPath;
  }

  return normalizedPath;
}
