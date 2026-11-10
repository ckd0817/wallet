import { registerPlugin } from '@capacitor/core';

export interface RecoveryStatus {
  secureSettingsGranted: boolean;
  accessibilityEnabled: boolean;
  accessibilityConnected: boolean;
  notificationPermissionGranted: boolean;
  batteryOptimizationIgnored: boolean;
  autoStartStatus: 'unknown';
  manufacturer: string;
  grantCommand: string;
}

interface RecoveryPlugin {
  getRecoveryStatus(): Promise<RecoveryStatus>;
  copyRecoveryGrantCommand(): Promise<void>;
  openRecoveryBackgroundSettings(): Promise<{ destination: 'autostart' | 'appDetails' }>;
  openRecoveryDeveloperSettings(): Promise<void>;
  openRecoveryNotificationSettings(): Promise<void>;
}

export const RecoveryAccess = registerPlugin<RecoveryPlugin>('ScreenCaptureBookkeeping');

export const recoveryServiceLabel = (status: RecoveryStatus): string => {
  if (!status.accessibilityEnabled) return '未开启';
  return status.accessibilityConnected ? '已连接' : '已断开';
};

export const recoveryAccessLabel = (status: RecoveryStatus): string => {
  if (!status.secureSettingsGranted) return '未授权';
  if (!status.accessibilityEnabled) return '待开启无障碍';
  return status.accessibilityConnected ? '已开启' : '待重连';
};
