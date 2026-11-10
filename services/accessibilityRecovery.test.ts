import { describe, expect, it } from 'vitest';
import { RecoveryStatus, recoveryAccessLabel, recoveryServiceLabel } from './accessibilityRecovery';

const ready: RecoveryStatus = {
  secureSettingsGranted: true,
  accessibilityEnabled: true,
  accessibilityConnected: true,
  notificationPermissionGranted: true,
  batteryOptimizationIgnored: true,
  autoStartStatus: 'unknown',
  manufacturer: 'Xiaomi',
  grantCommand: 'adb shell pm grant com.smartwallet.app android.permission.WRITE_SECURE_SETTINGS',
};

describe('自动恢复设备状态', () => {
  it('无授权时不显示已开启', () => {
    expect(recoveryAccessLabel({ ...ready, secureSettingsGranted: false })).toBe('未授权');
  });
  it('区分开关开启与服务实际连接', () => {
    const disconnected = { ...ready, accessibilityConnected: false };
    expect(recoveryServiceLabel(disconnected)).toBe('已断开');
    expect(recoveryAccessLabel(disconnected)).toBe('待重连');
    expect(recoveryServiceLabel(ready)).toBe('已连接');
    expect(recoveryAccessLabel(ready)).toBe('已开启');
  });
  it('主动关闭无障碍时不显示待重连或已开启', () => {
    const disabled = { ...ready, accessibilityEnabled: false };
    expect(recoveryServiceLabel(disabled)).toBe('未开启');
    expect(recoveryAccessLabel(disabled)).toBe('待开启无障碍');
  });
});
