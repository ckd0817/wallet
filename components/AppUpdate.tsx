import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { AppUpdater, UpdateCheck } from '../services/appUpdate';

const AppUpdate = () => {
  const [check, setCheck] = useState<UpdateCheck | null>(null);
  const [visible, setVisible] = useState(false);
  const [stage, setStage] = useState<'idle' | 'checking' | 'downloading' | 'ready' | 'installing'>('idle');
  const [percent, setPercent] = useState(0);
  const [message, setMessage] = useState('');
  const busy = useRef(false);
  const manualRequested = useRef(false);
  const stageRef = useRef(stage);
  stageRef.current = stage;

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let disposed = false;
    const listeners: PluginListenerHandle[] = [];
    const retain = (listener: PluginListenerHandle) => { if (disposed) void listener.remove(); else listeners.push(listener); };
    void AppUpdater.addListener('downloadProgress', event => setPercent(event.percent)).then(retain);
    void AppUpdater.addListener('installStatus', event => {
      setStage('ready'); busy.current = false;
      setMessage(event.status === 'permissionDenied' ? '请允许安装应用' : event.status === 'failed' ? '无法打开安装程序' : '');
    }).then(retain);
    const checkForUpdate = async (manual: boolean) => {
      if (busy.current) {
        if (manual && stageRef.current === 'checking') { manualRequested.current = true; setVisible(true); }
        return;
      }
      if (stageRef.current === 'ready' || stageRef.current === 'installing') { if (manual) setVisible(true); return; }
      busy.current = true;
      manualRequested.current = manual;
      setMessage(''); setCheck(null); setStage('checking');
      if (manual) setVisible(true);
      try {
        const result = await AppUpdater.checkUpdate();
        if (disposed) return;
        setCheck(result); setMessage(result.available ? '' : '已是最新版本');
        setVisible(manualRequested.current || result.available);
      } catch (error) {
        if (!disposed && manualRequested.current) { setCheck(null); setMessage(error instanceof Error ? error.message : '检查更新失败'); }
      } finally { busy.current = false; if (!disposed) setStage('idle'); }
    };
    const manualCheck = () => { void checkForUpdate(true); };
    window.addEventListener('wallet-check-update', manualCheck);
    const startup = window.setTimeout(() => void checkForUpdate(false), 0);
    return () => { disposed = true; window.clearTimeout(startup); window.removeEventListener('wallet-check-update', manualCheck); listeners.forEach(listener => void listener.remove()); };
  }, []);

  const install = async () => {
    if (busy.current) return;
    busy.current = true; setMessage(''); setStage('installing');
    try {
      const result = await AppUpdater.installUpdate();
      setMessage(result.permissionRequired ? '请允许安装应用' : '');
    } catch (error) { setMessage(error instanceof Error ? error.message : '安装失败'); }
    finally { busy.current = false; setStage('ready'); }
  };
  const download = async () => {
    if (busy.current) return;
    busy.current = true; setMessage(''); setPercent(0); setStage('downloading');
    try {
      await AppUpdater.downloadUpdate();
      setStage('ready'); busy.current = false;
      await install();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '下载失败'); setStage('idle'); busy.current = false;
    }
  };
  if (!visible) return null;
  const working = stage === 'checking' || stage === 'downloading' || stage === 'installing';
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-6">
      <div role="dialog" aria-modal="true" aria-labelledby="app-update-title" className="w-full max-w-sm rounded-2xl bg-white p-6">
        <h3 id="app-update-title" className="text-lg font-semibold text-primary">{check?.available ? '发现新版本' : '检查更新'}</h3>
        {check && <p className="mt-3 text-sm text-secondary">{check.available ? `${check.currentVersion} → ${check.release?.versionName}` : check.currentVersion}</p>}
        {check?.release && <p className="mt-2 text-xs text-secondary">{(check.release.size / 1024 / 1024).toFixed(1)} MB</p>}
        {stage === 'checking' && <p role="status" className="mt-4 text-sm text-secondary">正在检查</p>}
        {stage === 'downloading' && <div className="mt-4 space-y-2">
          <p role="status" className="text-sm text-secondary">正在下载 {percent}%</p>
          <div role="progressbar" aria-label="下载进度" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
        </div>}
        {message && <p role="status" className="mt-4 text-sm text-secondary">{message}</p>}
        <div className="mt-6 flex gap-3">
          <button type="button" disabled={working} onClick={() => setVisible(false)} className="h-11 flex-1 rounded-xl border border-border disabled:opacity-50">{check?.available ? '稍后' : '关闭'}</button>
          {check?.available && <button type="button" disabled={working} onClick={() => void (stage === 'ready' ? install() : download())} className="h-11 flex-1 rounded-xl bg-primary text-white disabled:opacity-50">{stage === 'downloading' ? '正在下载' : stage === 'installing' ? '正在安装' : stage === 'ready' ? '安装更新' : '立即更新'}</button>}
        </div>
      </div>
    </div>, document.body,
  );
};
export default AppUpdate;
