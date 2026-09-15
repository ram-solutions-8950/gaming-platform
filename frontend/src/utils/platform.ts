import { Capacitor } from '@capacitor/core';

/**
 * Returns true if the client application is running inside a native mobile container
 * (such as the Android APK or iOS build), false if running in a standard web browser.
 */
export const isNativePlatform = (): boolean => {
  if (typeof window === 'undefined') return false;

  // 1. Official Capacitor API check for native runtime (returns true ONLY in Android/iOS native containers)
  try {
    if (typeof Capacitor !== 'undefined') {
      if (typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform()) {
        return true;
      }
      if (typeof Capacitor.getPlatform === 'function') {
        const platform = Capacitor.getPlatform();
        if (platform === 'android' || platform === 'ios') {
          return true;
        }
      }
    }
  } catch {}

  // 2. Direct native Android WebView bridge injected by MainActivity
  if (
    typeof (window as any).AndroidOrientation !== 'undefined' ||
    typeof (window as any).AndroidAuth !== 'undefined'
  ) {
    return true;
  }

  // 3. Custom Capacitor or Cordova native container URL schemes
  if (window.location.protocol === 'capacitor:' || window.location.protocol === 'ionic:') {
    return true;
  }

  // 4. Native custom user agent marker if configured
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  if (ua.includes('Corona888-App')) {
    return true;
  }

  return false;
};
