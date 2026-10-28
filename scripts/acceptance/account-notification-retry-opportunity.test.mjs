// Synthetic domain reads. Exercise the actual constructed 30s timer callback,
// not an injected production clock or a replacement runAutomaticSync method.
import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {mkdtempSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import {DatabaseSync} from 'node:sqlite';
const require=createRequire(import.meta.url),{AccountsService}=require('../../apps/pc-app/runtime/features/accounts/service.cjs'),{migrations}=require('../../apps/pc-app/runtime/features/accounts/schema.cjs');
test('real constructor polling callback retries failed/skipped normal reads without another notification',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'lingjing-notification-retry-')),db=new DatabaseSync(join(dir,'fixture.sqlite'));for(const m of migrations)db.exec(m.sql);
 const calls=[],events=[],timers=[];let fail=true,service;
 const original=setInterval;globalThis.setInterval=(fn,ms,...args)=>{const timer=original(fn,ms,...args);timers.push({fn,ms,timer});return timer;};
 try{service=new AccountsService({services:{db,paths:{userData:dir,legacyDataExisted:false},safeStorage:{isEncryptionAvailable:()=>false},events:{emit:(...args)=>events.push(args)},get:domain=>['companions','garden','conversations'].includes(domain)?{refreshCloud:async owner=>{calls.push({domain,owner});if(fail)throw Object.assign(Error('synthetic offline'),{code:'CLOUD_UNAVAILABLE'});return{initialized:true,pending:0};}}:null},remote:{enabled:false,setCurrentUser(){},async clear(){}},host:{async apply(){},clear(){},dispose(){}}});}finally{globalThis.setInterval=original;}
 try{await service.ready;assert.equal(timers.length,1);assert.equal(timers[0].ms,30000);service.current={authKind:'supabase',ownerAccountId:'synthetic-owner-a'};const tick=async()=>{timers[0].fn();await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));};
 await tick();assert.equal(calls.length,3);assert.equal(service.automaticSyncRunning,false);assert.equal(service.cloudObservations.get('synthetic-owner-a').error,'CLOUD_UNAVAILABLE');
 fail=false;service.settingsBusy=true;await tick();assert.equal(calls.length,3);service.settingsBusy=false;
 await tick();assert.equal(calls.length,6);assert.equal(service.cloudObservations.get('synthetic-owner-a').error,null);assert.equal(service.cloudObservations.get('synthetic-owner-a').domains.every(x=>x.status==='ready'),true);assert.equal(service.automaticSyncRunning,false);
 service.dispose();await tick();assert.equal(calls.length,6,'Disposed process cannot keep refreshing');assert.ok(events.some(x=>x[0]==='accounts:sync-changed'));
 }finally{service?.dispose();for(const t of timers)clearInterval(t.timer);db.close();rmSync(dir,{recursive:true,force:true});}
});
