import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gamestack.app',
  appName: 'GameStack',
  webDir: 'dist',
  server: {
    cleartext: true,
    androidScheme: 'http',
  },
};

export default config;
