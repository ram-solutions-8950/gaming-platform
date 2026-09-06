import { registerPlugin } from '@capacitor/core';

interface ScreenOrientationPluginInterface {
  lockPortrait(): Promise<void>;
  lockLandscape(): Promise<void>;
  unlock(): Promise<void>;
}

const NativeScreenOrientation = registerPlugin<ScreenOrientationPluginInterface>('ScreenOrientation');

/**
 * Switch native Android Activity to Portrait orientation.
 * Exclusively used by Triple 777.
 */
export async function setNativePortrait(): Promise<void> {
  // 1. Direct native Android JavascriptInterface on WebView
  try {
    const androidObj = (window as any).AndroidOrientation || (window as any).Android;
    if (androidObj && typeof androidObj.lockPortrait === 'function') {
      androidObj.lockPortrait();
      return;
    }
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
 * Switch & Lock native Android Activity to Landscape orientation.
 * Default orientation for the entire application, dashboard, login, and all normal games.
 */
export async function setNativeLandscape(): Promise<void> {
  // 1. Direct native Android JavascriptInterface on WebView
  try {
    const androidObj = (window as any).AndroidOrientation || (window as any).Android;
    if (androidObj && typeof androidObj.lockLandscape === 'function') {
      androidObj.lockLandscape();
      return;
    }
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
    } else if (window.screen?.orientation && typeof (window.screen.orientation as any).lock === 'function') {
      await (window.screen.orientation as any).lock('landscape-primary');
      return;
    }
  } catch {}
}

/**
 * Aliases matching user-specified orientation management utility
 */
export const lockPortrait = setNativePortrait;
export const lockLandscape = setNativeLandscape;

/**
 * Default fallback reset to application landscape
 */
export async function unlockNativeOrientation(): Promise<void> {
  return setNativeLandscape();
}
