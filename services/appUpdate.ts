import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export interface AppRelease {
  versionCode: number;
  versionName: string;
  size: number;
  sha256: string;
  publishedAt: string;
}
export interface UpdateCheck {
  currentVersion: string;
  available: boolean;
  release: AppRelease | null;
}
interface AppUpdatePlugin {
  checkUpdate(): Promise<UpdateCheck>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<{ permissionRequired: boolean }>;
  addListener(event: 'downloadProgress', listener: (event: { percent: number }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'installStatus', listener: (event: { status: 'opened' | 'permissionDenied' | 'failed' }) => void): Promise<PluginListenerHandle>;
}
export const AppUpdater = registerPlugin<AppUpdatePlugin>('AppUpdate');
export const requestUpdateCheck = () => window.dispatchEvent(new Event('wallet-check-update'));
