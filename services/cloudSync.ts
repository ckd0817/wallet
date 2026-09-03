import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type { WalletBackupData, WalletSnapshot } from '../types';
import { setNativeAccountId } from './nativeScope';

export interface CloudStatus {
  accountId: string;
  username: string;
  loggedIn: boolean;
  pendingCount: number;
  lastSyncAt: number;
  syncing: boolean;
  recoveryRequired: boolean;
  hasRecovery: boolean;
  hasLocalData: boolean;
  error: string;
}
export interface RestoreTicket {
  id: string; epoch: number; revision: number; localRevision: number; accountId: string;
}
interface CloudPlugin {
  getStatus(): Promise<CloudStatus>;
  testConnection(): Promise<{ok:boolean;protocolVersion:number}>;
  authenticate(options: {action:'login'|'register'; username:string; password:string; migrateLocal:boolean}): Promise<CloudStatus>;
  logout(): Promise<CloudStatus>;
  syncNow(): Promise<CloudStatus>;
  changePassword(options:{currentPassword:string;newPassword:string}): Promise<CloudStatus>;
  prepareRestore(): Promise<RestoreTicket>;
  restore(options:{ticket:RestoreTicket;data:WalletBackupData}): Promise<CloudStatus>;
  getRecovery(): Promise<WalletSnapshot>;
  resume(): Promise<CloudStatus>;
  addListener(name:'cloudChanged',listener:(event:{dataChanged:boolean})=>void): Promise<PluginListenerHandle>;
}
export const Cloud = registerPlugin<CloudPlugin>('CloudSync');
export async function getCloudStatus() {
  const result=await Cloud.getStatus();
  setNativeAccountId(result.accountId);
  return result;
}
export function cloudStatusText(status:CloudStatus) {
  if (!status.loggedIn) return '未登录';
  if (status.recoveryRequired) return '待恢复';
  if (status.syncing) return '同步中';
  if (status.error) return '同步失败';
  if (status.pendingCount) return '待同步';
  return status.lastSyncAt ? '已同步' : '待同步';
}
