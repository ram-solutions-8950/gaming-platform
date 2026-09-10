import { Capacitor } from '@capacitor/core';

/**
 * Returns true if the client application is running inside a native mobile container
 * (such as the Android APK or iOS build), false if running in a standard web browser.
 */
export const isNativePlatform = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    if (Capacitor.isNativePlatform()) return true;
    const platform = Capacitor.getPlatform();
    if (platform === 'android' || platform === 'ios') return true;
  } catch {}
  if (typeof (window as any).Capacitor !== 'undefined') return true;
  if (window.location.protocol === 'capacitor:' || window.location.protocol === 'ionic:') return true;
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  if (ua.includes('Corona888-App') || ua.includes('Capacitor')) return true;
  return false;
};
