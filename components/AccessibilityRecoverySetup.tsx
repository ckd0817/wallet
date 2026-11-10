import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, RefreshCcw } from 'lucide-react';
import { RecoveryAccess, RecoveryStatus, recoveryServiceLabel } from '../services/accessibilityRecovery';
import { requestNativeIgnoreBatteryOptimization } from '../services/walletStore';

interface Props {
  onOpenAccessibilitySettings: () => Promise<void> | void;
}

const AccessibilityRecoverySetup = ({ onOpenAccessibilitySettings }: Props) => {
  const [status, setStatus] = useState<RecoveryStatus | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');
  const requestId = useRef(0);
  const mounted = useRef(false);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    setChecking(true);
    try {
      const current = await RecoveryAccess.getRecoveryStatus();
      if (!mounted.current || id !== requestId.current) return;
      setStatus(current);
      setFailed(false);
    } catch {
      if (mounted.current && id === requestId.current) {
        setStatus(null);
        setFailed(true);
      }
    } finally {
      if (mounted.current && id === requestId.current) setChecking(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    return () => {
      mounted.current = false;
      requestId.current++;
      window.removeEventListener('focus', visible);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const run = async (action: () => Promise<unknown> | void) => {
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败，请重试');
    } finally {
      if (mounted.current) {
        setBusy(false);
        await refresh();
      }
    }
  };

  const buttonStyle = 'shrink-0 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-primary disabled:opacity-40';
  return (
    <div className="space-y-4">
        {status && <div className="divide-y divide-zinc-100">
          <div className="flex items-center justify-between gap-3 py-3">
            <div><p className="text-sm font-medium text-primary">无障碍服务</p><p className="mt-1 text-xs text-secondary">{recoveryServiceLabel(status)}</p></div>
            <button type="button" disabled={busy} onClick={() => void run(onOpenAccessibilitySettings)} className={buttonStyle}>去设置</button>
          </div>
          <div className="flex items-center justify-between gap-3 py-3">
            <div><p className="text-sm font-medium text-primary">通知权限</p><p className="mt-1 text-xs text-secondary">{status.notificationPermissionGranted ? '已允许' : '未允许'}</p></div>
            <button type="button" disabled={busy} onClick={() => void run(() => RecoveryAccess.openRecoveryNotificationSettings())} className={buttonStyle}>去设置</button>
          </div>
          <div className="flex items-center justify-between gap-3 py-3">
            <div><p className="text-sm font-medium text-primary">自动恢复</p><p className="mt-1 text-xs text-secondary">{status.secureSettingsGranted ? '已授权' : '未授权'}</p></div>
            <button type="button" aria-expanded={showGuide} onClick={() => setShowGuide(value => !value)} className={buttonStyle}>{showGuide ? '收起步骤' : '授权步骤'}</button>
          </div>
          <div className="flex items-center justify-between gap-3 py-3">
            <div><p className="text-sm font-medium text-primary">电池优化</p><p className="mt-1 text-xs text-secondary">{status.batteryOptimizationIgnored ? '已豁免' : '未豁免'}</p></div>
            <button type="button" disabled={busy || status.batteryOptimizationIgnored} onClick={() => void run(requestNativeIgnoreBatteryOptimization)} className={buttonStyle}>去设置</button>
          </div>
          <div className="flex items-center justify-between gap-3 py-3">
            <div><p className="text-sm font-medium text-primary">后台自启动</p><p className="mt-1 text-xs text-secondary">需在系统设置确认</p></div>
            <button type="button" disabled={busy} onClick={() => void run(async () => {
              const result = await RecoveryAccess.openRecoveryBackgroundSettings();
              if (result.destination === 'appDetails') setMessage('请在应用信息中允许自启动或后台运行。');
            })} className={buttonStyle}>去设置</button>
          </div>
        </div>}

        {status && showGuide && <div className="space-y-3 rounded-2xl bg-surface/60 p-4 text-sm text-secondary">
          <p className="font-semibold text-primary">电脑授权 · 仅需一次</p>
          <p className="text-xs leading-5">此授权允许修改系统安全设置，记账仅用于重连自身无障碍服务。</p>
          <ol className="list-decimal space-y-3 pl-5 text-xs leading-5">
            <li>电脑下载并解压 <a className="font-medium text-primary underline" href="https://developer.android.com/tools/releases/platform-tools" target="_blank" rel="noreferrer">Android Platform Tools</a>，将该目录加入 PATH。</li>
            <li>手机开启“开发者选项 → USB 调试”，连接电脑并允许调试。
              <button type="button" disabled={busy} onClick={() => void run(() => RecoveryAccess.openRecoveryDeveloperSettings())} className="ml-2 font-semibold text-primary underline disabled:opacity-40">打开设置</button>
            </li>
            <li>在电脑终端执行授权命令，再返回本页检测。</li>
          </ol>
          <code className="block select-text break-all rounded-xl border border-border bg-white p-3 text-xs leading-5 text-primary">{status.grantCommand}</code>
          <button type="button" disabled={busy} onClick={() => void run(async () => {
            await RecoveryAccess.copyRecoveryGrantCommand();
            setCopied(true);
          })} className={`${buttonStyle} inline-flex items-center gap-2`}><Copy className="h-3.5 w-3.5" />{copied ? '已复制' : '复制命令'}</button>
          <details className="text-xs leading-5">
            <summary className="cursor-pointer font-medium text-primary">授权遇到问题</summary>
            <ul className="mt-2 list-disc space-y-2 pl-4">
              <li>提示找不到 adb：确认 Platform Tools 已加入 PATH，并重新打开终端。</li>
              <li>提示 unauthorized：解锁手机，允许电脑的 USB 调试请求。</li>
              <li>提示 no devices：检查数据线、USB 调试和电脑驱动；连接多台手机时先断开其他设备。</li>
              <li>小米提示权限不足：在开发者选项开启“USB 调试（安全设置）”后重试。</li>
              <li>尚未开启开发者选项：在手机“关于手机”中连续点击版本号，按系统提示开启。</li>
            </ul>
          </details>
          <p className="text-xs leading-5">授权后可关闭 USB 调试。卸载重装后需重新授权。</p>
        </div>}
        {message && <p role="alert" className="text-xs leading-5 text-amber-700">{message}</p>}
        {failed && <p role="alert" className="text-xs text-amber-700">授权状态检测失败</p>}
        {!status && !failed && <p role="status" className="text-xs text-secondary">检测中</p>}
        <button type="button" disabled={checking || busy} onClick={() => void refresh()} className={`${buttonStyle} inline-flex items-center gap-2`}><RefreshCcw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} />{checking ? '检测中' : '重新检测'}</button>
    </div>
  );
};

export default AccessibilityRecoverySetup;
