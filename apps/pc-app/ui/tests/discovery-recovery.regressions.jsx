import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useDiscovery } from '../src/features/discovery/use-discovery';
window.IS_REACT_ACT_ENVIRONMENT = true;
const check = (ok, label) => { if (!ok) throw Error(label); };
window.runRecoveryTests = async () => {
  let current, snapshot = {ok:true,data:{position:'old'}}, pendingRead;
  const commands=[];
  const listeners = new Map();
  window.lingjing = { invoke: async (_, command) => {
    if(command==='setExploring') return {ok:true};
    if(command==='snapshot') return pendingRead ? pendingRead.promise : snapshot;
    if(commands.length) return commands.shift();
    return {ok:false,message:'动作被拒绝',code:'ACTION_REJECTED'};
  }, subscribe: (name, fn) => { listeners.set(name, fn); return () => listeners.delete(name); } };
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  function View(){current=useDiscovery();return <><p role="alert">{current.error}</p><p data-position>{current.data?.position}</p></>;}
  const cases=[];
  try {
    await act(async()=>root.render(<View/>));
    snapshot={ok:false,message:'网络不可用',code:'NETWORK_UNAVAILABLE'};
    await act(async()=>current.refresh());
    check(current.error==='网络不可用' && current.data.position==='old','failed read explicitly retains old snapshot, not new location');
    snapshot={ok:true,data:{position:'new'}};
    await act(async()=>current.refresh());
    check(current.error==='' && current.data.position==='new','successful snapshot clears prior read error');cases.push('snapshot-recovery');
    await act(async()=>current.run('observe'));
    check(current.error==='动作被拒绝','successful follow-up snapshot does not erase command rejection');cases.push('command-error-preserved');
    let resolve; pendingRead={promise:new Promise(r=>{resolve=r;})};
    let oldRead; await act(async()=>{oldRead=current.refresh();});
    pendingRead=null; snapshot={ok:true,data:{position:'other-session'}};
    await act(async()=>listeners.get('accounts:session-changed')());
    await act(async()=>{resolve({ok:false,message:'旧会话错误'});await oldRead;});
    check(current.error===''&&current.data.position==='other-session','late old read cannot restore session error');cases.push('session-late-read');
    await act(async()=>{current.run('observe');});
    check(current.error==='动作被拒绝','command error before reset');
    await act(async()=>listeners.get('app:session')());
    check(current.error==='','session reset clears command error');cases.push('session-error-reset');
    let resolveOld, resolveNew;
    commands.push(new Promise(r=>{resolveOld=r;}));
    let oldCommand; await act(async()=>{oldCommand=current.run('observe');});
    check(current.pending,'old command pending');
    await act(async()=>listeners.get('app:session')());
    commands.push(new Promise(r=>{resolveNew=r;}));
    let newCommand; await act(async()=>{newCommand=current.run('observe');});
    await act(async()=>{resolveOld({ok:false,message:'旧动作错误'});await oldCommand;});
    check(current.pending&&current.error==='','old command finally does not unlock new session operation');
    await act(async()=>{resolveNew({ok:true,data:{done:true}});await newCommand;});
    check(!current.pending&&current.error==='','new command owns final pending state');cases.push('old-finally-new-session-pending');
    return {passed:true,boundary:'real React hook with controlled IPC; not native/network acceptance',cases};
  } finally {await act(async()=>root.unmount());host.remove();}
};
