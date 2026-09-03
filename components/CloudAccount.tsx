import React, { useEffect, useState } from 'react';
import { Cloud as CloudIcon, RefreshCcw } from 'lucide-react';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Cloud, getCloudStatus, cloudStatusText, type CloudStatus } from '../services/cloudSync';
import { buildBackupPayload } from '../services/dataBackup';

const inputClass='w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-primary';
export default function CloudAccount() {
  const [status,setStatus]=useState<CloudStatus|null>(null);
  const [mode,setMode]=useState<'login'|'register'|'password'>('login');
  const [expanded,setExpanded]=useState(false);
  const [username,setUsername]=useState('');
  const [password,setPassword]=useState('');
  const [nextPassword,setNextPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const refresh=async()=>setStatus(await getCloudStatus());
  useEffect(()=>{
    let disposed=false;
    const update=()=>{if(!disposed)void refresh().catch(()=>{});};
    update();const handle=Cloud.addListener('cloudChanged',update);
    return()=>{disposed=true;void handle.then(h=>h.remove());};
  },[]);
  const run=async(action:()=>Promise<unknown>)=>{
    setBusy(true);setError('');
    try{await action();await refresh();}catch(e){setError(e instanceof Error?e.message:'操作失败');}
    finally{setBusy(false);}
  };
  const submit=()=>run(async()=>{
    if(mode==='password')await Cloud.changePassword({currentPassword:password,newPassword:nextPassword});
    else {
      const current=await getCloudStatus();
      let migrateLocal=false;
      if(current.hasLocalData) {
        migrateLocal=window.confirm('将本机账本关联到“'+username+'”？');
        if(!migrateLocal)return;
      }
      await Cloud.authenticate({action:mode,username,password,migrateLocal});
    }
    setPassword('');setNextPassword('');setExpanded(false);
  });
  return <section>
    <h2 className="mb-4 px-1 text-lg font-bold text-primary">云端账户</h2>
    <div className="rounded-[28px] border border-border bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CloudIcon className="h-5 w-5 text-secondary"/>
          <span className="font-semibold text-primary">{status?.loggedIn?status.username:'账户'}</span>
        </div>
        <span className="text-sm text-secondary">{status?cloudStatusText(status):'加载中'}</span>
      </div>
      {!!status?.lastSyncAt&&<div className="mt-3 text-xs text-secondary">{new Date(status.lastSyncAt).toLocaleString('zh-CN')}</div>}
      {!!status?.pendingCount&&<div className="mt-2 text-sm text-secondary">待同步 {status.pendingCount}</div>}
      {(error||status?.error)&&<p role="alert" className="mt-3 text-sm text-danger">{error||status?.error}</p>}
      {status?.loggedIn?<div className="mt-4 flex flex-wrap gap-3">
        <button disabled={busy||status.syncing||status.recoveryRequired} onClick={()=>run(()=>Cloud.syncNow())} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"><RefreshCcw className="h-4 w-4"/>立即同步</button>
        <button disabled={busy} onClick={()=>{setMode('password');setExpanded(!expanded);setPassword('');}} className="px-2 text-sm text-secondary">修改密码</button>
        <button disabled={busy} onClick={()=>run(async()=>{await Cloud.logout();setExpanded(false);setPassword('');})} className="px-2 text-sm text-secondary">退出登录</button>
      </div>:<div className="mt-4 flex gap-3">
        <button disabled={busy} onClick={()=>{setMode('login');setExpanded(true);}} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white">登录</button>
        <button disabled={busy} onClick={()=>{setMode('register');setExpanded(true);}} className="rounded-xl bg-surface px-5 py-2.5 text-sm font-medium text-primary">注册</button>
      </div>}
      {status?.hasRecovery&&<div className="mt-4 flex gap-3">
        <button disabled={busy} onClick={()=>run(async()=>{
          const snapshot=await Cloud.getRecovery();
          await Filesystem.writeFile({path:'smartwallet_recovery_'+Date.now()+'.json',data:JSON.stringify(buildBackupPayload(snapshot),null,2),directory:Directory.Documents,encoding:Encoding.UTF8});
          alert('恢复副本已导出');
        })} className="rounded-xl bg-surface px-4 py-2 text-sm">导出恢复副本</button>
        {status.recoveryRequired&&<button disabled={busy} onClick={()=>run(async()=>{
          if(window.confirm('本机数据已保留副本。载入云端账本？'))await Cloud.resume();
        })} className="rounded-xl bg-primary px-4 py-2 text-sm text-white">恢复同步</button>}
      </div>}
      {expanded&&<form className="mt-5 space-y-3" onSubmit={event=>{event.preventDefault();void submit();}}>
        {mode!=='password'&&<input aria-label="用户名" placeholder="用户名" value={username} onChange={e=>setUsername(e.target.value)} autoCapitalize="none" autoComplete="username" required minLength={3} maxLength={40} className={inputClass}/>}
        <input aria-label={mode==='password'?'原密码':'密码'} placeholder={mode==='password'?'原密码':'密码'} type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==='register'?'new-password':'current-password'} required minLength={8} maxLength={128} className={inputClass}/>
        {mode==='password'&&<input aria-label="新密码" placeholder="新密码" type="password" value={nextPassword} onChange={e=>setNextPassword(e.target.value)} autoComplete="new-password" required minLength={8} maxLength={128} className={inputClass}/>}
        <button disabled={busy} type="submit" className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white disabled:opacity-40">{busy?'处理中':mode==='register'?'注册':mode==='password'?'保存':'登录'}</button>
      </form>}
    </div>
  </section>;
}
