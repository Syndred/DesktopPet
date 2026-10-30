// Real React hook; controlled in-memory IPC only. No account or network activity.
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import assert from 'node:assert/strict';
import {useFeatureRequest} from '../src/app/bridge';
export async function runTests() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const checks=[];
  async function run(name, exercise) {
    const pending=[], listeners=new Map();let latest, renders=0;
    window.lingjing={invoke:(feature,command)=>new Promise((resolve,reject)=>pending.push({feature,command,resolve,reject})),subscribe:(name,fn)=>{const set=listeners.get(name)||new Set();set.add(fn);listeners.set(name,set);return()=>set.delete(fn);}};
    const node=document.createElement('div');document.body.append(node);const root=createRoot(node);let mounted=true;
    function Probe({command='first'}) { latest=useFeatureRequest('app',command);renders++;return <div>{JSON.stringify({data:latest.data,error:latest.error,loading:latest.loading})}</div>; }
    const render=async command=>{await act(async()=>root.render(<Probe command={command}/>));};
    const success=async(index,value)=>{await act(async()=>pending[index].resolve({ok:true,data:value}));};
    const failure=async(index)=>{await act(async()=>pending[index].reject(new Error('synthetic failure')));};
    const reload=async()=>{await act(async()=>{void latest.reload();});};
    const unmount=async()=>{await act(async()=>root.unmount());mounted=false;};
    try{await render('first');await exercise({pending,listeners,render,success,failure,reload,unmount,get:()=>latest,renders:()=>renders});checks.push({name,passed:true});}
    finally{if(mounted)await unmount();node.remove();delete window.lingjing;}
  }
  await run('latest response wins despite older late success',async x=>{await x.reload();await x.success(1,'new');await x.success(0,'old');assert.equal(x.get().data,'new');assert.equal(x.get().loading,false);});
  await run('old finally cannot clear current loading',async x=>{await x.reload();await x.success(0,'old');assert.equal(x.get().loading,true);assert.equal(x.get().data,null);await x.success(1,'new');assert.equal(x.get().loading,false);});
  await run('older rejection cannot replace latest success/error',async x=>{await x.reload();await x.success(1,'new');await x.failure(0);assert.equal(x.get().data,'new');assert.equal(x.get().error,'');});
  await run('changed request invalidates old generation',async x=>{await x.render('second');await x.success(1,'second');await x.success(0,'first');assert.equal(x.get().data,'second');assert.equal(x.pending[1].command,'second');});
  await run('session events clear old result and invalidate its in-flight refresh',async x=>{await x.success(0,'old owner');await x.reload();await act(async()=>{for(const fn of x.listeners.get('accounts:session-changed'))fn();});assert.equal(x.get().data,null);assert.equal(x.get().loading,true);await x.success(1,'stale old owner');assert.equal(x.get().data,null);await x.success(2,'new owner');assert.equal(x.get().data,'new owner');await act(async()=>{for(const fn of x.listeners.get('app:session'))fn();});assert.equal(x.get().data,null);await x.failure(3);assert.equal(x.get().data,null);assert.equal(x.get().error,'synthetic failure');assert.equal(x.get().loading,false);});
  await run('unmount unsubscribes and prevents late updates/new reload work',async x=>{const reload=x.get().reload;await x.unmount();const count=x.renders();await x.success(0,'late');await reload();assert.equal(x.renders(),count);assert.equal(x.pending.length,1);for(const set of x.listeners.values())assert.equal(set.size,0);});
  return checks;
}
