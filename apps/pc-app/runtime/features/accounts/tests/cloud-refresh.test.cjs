const {test}=require('node:test');
const assert=require('node:assert/strict');
const {AccountsService}=require('../service.cjs');
function fixture(companions=async()=>({verified:true}),records=async()=>({pending:0})){
  const events=[],accounts=Object.create(AccountsService.prototype);
  Object.assign(accounts,{ready:Promise.resolve(),current:{authKind:'supabase',ownerAccountId:'cloud-refresh-owner'},epoch:1,cloudObservations:new Map(),
    settings:()=>({document:{sync:{enabled:false}}}),sync:{reconcile(){throw new Error('production must not reconcile a full local save');}},
    services:{get:name=>name==='companions'?{refreshCloud:companions}:name==='conversations'?{refreshCloud:records}:null,events:{emit:(...args)=>events.push(args)}}});
  return {accounts,events};
}
test('cloud refresh ignores the retired full-save switch and reads independent authoritative domains',async()=>{
  const calls=[],{accounts}=fixture(async()=>{calls.push('companions');},async()=>{calls.push('personal-records');return {pending:0};});
  assert.equal((await accounts.runAutomaticSync()).verified,true);assert.deepEqual(calls.sort(),['companions','personal-records']);
  assert.equal(accounts.cloudObservations.get('cloud-refresh-owner').error,null);
});
test('a failed personal-record read does not prevent a successful gameplay read and reports its actual incomplete state',async()=>{
  let gameRead=false;const {accounts}=fixture(async()=>{gameRead=true;},async()=>{throw Object.assign(new Error('offline records'),{code:'RECORD_UNAVAILABLE'});});
  const result=await accounts.runAutomaticSync();assert.equal(gameRead,true);assert.equal(result.verified,false);
  assert.equal(accounts.cloudObservations.get('cloud-refresh-owner').error,'RECORD_UNAVAILABLE');
  assert.equal(accounts.automaticSyncRunning,false);
});
test('a response from the previous account cannot publish a successful refresh after switching',async()=>{
  let release;const pending=new Promise(resolve=>{release=resolve;}),{accounts,events}=fixture(()=>pending,()=>pending);
  const result=accounts.runAutomaticSync();await new Promise(resolve=>setImmediate(resolve));
  accounts.current={authKind:'supabase',ownerAccountId:'new-owner'};accounts.epoch++;release({verified:true});
  assert.deepEqual(await result,{skipped:true});assert.equal(accounts.cloudObservations.size,0);assert.equal(events.length,0);
});

test('logging out immediately removes the previous owner subscription and its pending refresh',async()=>{
  const {accounts}=fixture(),removed=[],channel={id:'original-owner-channel'};
  accounts.cloudChannel={channel,client:{removeChannel:async value=>{removed.push(value);}}};
  let fired=false;accounts.cloudRefreshTimer=setTimeout(()=>{fired=true;},5);
  Object.assign(accounts,{privateSession:()=>({ownerAccountId:'cloud-refresh-owner'}),backups:{previews:new Map()},
    sync:{observations:new Map()},db:{prepare:()=>({run(){}})},vault:{clear(){}},remote:{setCurrentUser(){}},emitSession(){}});
  await accounts.logout();await new Promise(resolve=>setTimeout(resolve,10));
  assert.deepEqual(removed,[channel]);assert.equal(accounts.cloudChannel,null);assert.equal(fired,false);assert.equal(accounts.current,null);
});
