import { registerPlugin } from '@capacitor/core';

interface ScreenOrientationPluginInterface {
  lockPortrait(): Promise<void>;
  lockLandscape(): Promise<void>;
}

const NativeScreenOrientation = registerPlugin<ScreenOrientationPluginInterface>('ScreenOrientation');

/**
 * Switch native Android Activity to Portrait orientation.
 * Operates at the native Android Activity level via direct JavascriptInterface
 * or Capacitor ScreenOrientationPlugin, with standard browser fallback.
 */
export async function setNativePortrait(): Promise<void> {
  // 1. Direct native Android JavascriptInterface on WebView
  try {
    const androidObj = (window as any).AndroidOrientation || (window as any).Android;
    if (androidObj && typeof androidObj.setPortrait === 'function') {
      androidObj.setPortrait();
      return;
    }
  } catch {}

  // 2. Capacitor custom native plugin
  try {
    await NativeScreenOrientation.lockPortrait();
    return;
  } catch {}

  // 3. Fallback to browser Screen Orientation API
  try {
    if (window.screen?.orientation && typeof (window.screen.orientation as any).lock === 'function') {
      await (window.screen.orientation as any).lock('portrait');
      return;
    }
  } catch {
    try {
      if (window.screen?.orientation && typeof (window.screen.orientation as any).lock === 'function') {
        await (window.screen.orientation as any).lock('portrait-primary');
        return;
      }
    } catch {}
  }
}

/**
 * Restore native Android Activity to Landscape orientation.
 * Operates at the native Android Activity level via direct JavascriptInterface
 * or Capacitor ScreenOrientationPlugin, with standard browser fallback.
 */
export async function setNativeLandscape(): Promise<void> {
  // 1. Direct native Android JavascriptInterface on WebView
  try {
    const androidObj = (window as any).AndroidOrientation || (window as any).Android;
    if (androidObj && typeof androidObj.setLandscape === 'function') {
      androidObj.setLandscape();
      return;
    }
  } catch {}

  // 2. Capacitor custom native plugin
  try {
    await NativeScreenOrientation.lockLandscape();
    return;
  } catch {}

  // 3. Fallback to browser Screen Orientation API
  try {
    if (window.screen?.orientation && typeof (window.screen.orientation as any).lock === 'function') {
      await (window.screen.orientation as any).lock('landscape');
      return;
    } else if (window.screen?.orientation && typeof window.screen.orientation.unlock === 'function') {
      window.screen.orientation.unlock();
      return;
    }
  } catch {}
}
