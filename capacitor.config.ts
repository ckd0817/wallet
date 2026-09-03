import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.smartwallet.app',
  appName: '记账',
  webDir: 'dist',
  loggingBehavior: 'none',
  plugins: {
    Filesystem: {
      permissions: ['read', 'write']
    }
  }
};

export default config;
