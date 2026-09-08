import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.corona888.app',
  appName: 'Corona 888',
  webDir: 'dist',
  server: {
    cleartext: true,
    androidScheme: 'http',
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
