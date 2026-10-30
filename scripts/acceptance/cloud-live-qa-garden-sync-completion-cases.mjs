// Prepared follow-on module only: importing performs no remote operation.
// Uses the holder's already verified A/A2 identities, never creates credentials.
// G07 chooses the original allowed "offline write then recover" branch. S06's
// historical metadata-warning priority remains explicitly unverified unless a
// genuine pre-existing warning is observed; this module never invents one.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {existsSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const quantities=s=>Object.fromEntries(s.items.map(x=>[x.id,x.quantity]));
// Self-contained for Electron main serialization; never overwrite another hook.
export function restoreGardenCompletionWrapper(_electron,kind){
 const spec=kind==='fault'?['__gardenCompletionFault','request']:kind==='context'?['__gardenCompletionContext','cloudContext']:null;
 if(!spec)throw Error('Unknown garden wrapper kind');
 const [slot,method]=spec,state=globalThis[slot];if(!state)return;
 if(typeof state.original!=='function'||typeof state.wrapper!=='function')throw Error('Missing owned garden wrapper identity');
 const current=state.prototype[method];
 if(current!==state.wrapper&&current!==state.original)throw Error('Foreign garden wrapper preserved');
 if(current===state.wrapper)state.prototype[method]=state.original;
 delete globalThis[slot];
}
export function requireFreshGarden(value,owner){
 assert.equal(value.ownerAccountId,owner);assert.equal(value.sync?.mode,'cloud');
 assert.equal(value.sync.pending,0);assert.equal(value.sync.conflicts,0);return value;
}
export function requireGardenPending(status,count){
 assert.equal(status.mode,'cloud-authority');const domains=status.domainStates;
 assert.ok(Array.isArray(domains));assert.equal(domains.filter(x=>x.domain==='garden').length,1);
 const garden=domains.find(x=>x.domain==='garden');assert.equal(garden.pending,count);
 assert.equal(status.pending,domains.reduce((n,x)=>n+(x.pending||0),0));
 assert.notEqual(status.status,'ready');assert.equal(garden.error,'CLOUD_UNAVAILABLE');
 assert.equal(status.lastError,'CLOUD_UNAVAILABLE');return garden;
}
export function hasGenuineS06Metadata(status){return status?.domainStates?.some(x=>x.domain==='companions'&&x.metadataWarning===true&&x.error==='GLOBAL_SERIAL_SCOPE_REVOKED')===true;}
export async function runCloudLiveQaGardenSyncCompletionCases({models,expectedActors,relaunch,assertActive,scenario,runId,output,requireGenuineMetadataWarning=false}){
 assert.equal(typeof requireGenuineMetadataWarning,'boolean');
 const file=join(output,'live-garden-sync-completion-evidence.json'),intentFile=join(output,'live-garden-sync-completion-intent.json');
 assert.ok(!existsSync(intentFile),'Reconcile original intentions before any new run');
 assert.equal(expectedActors.a.ownerAccountId,expectedActors.a2.ownerAccountId);
 const owner=expectedActors.a.ownerAccountId,start=Date.now(),deadline=start+8*60_000;
 const intent={runId,scenario,phase:'preflight',command:null};
 const proof={runId,scenario,scope:'Actual authorized cloud A/A2; one pre-server plant outage, normal UI original-intent retry, fresh authoritative readback, and one documented genuine stale-revision CAS negative. No account/password/grant/OS or SQL changes.',passed:false,fullCasePassed:false,cases:[],startedAt:new Date(start).toISOString(),uncovered:['Post-server committed reply loss','Metadata warning precedence unless actual existing warning observed','Natural Realtime-only battle propagation']};
 const write=(path,value)=>{writeFileSync(path+'.tmp',JSON.stringify(value,null,2),{mode:0o600});renameSync(path+'.tmp',path);};
 const save=()=>write(file,proof),persist=()=>write(intentFile,intent);persist();save();
 let faultInstalled=false,contextInstalled=false,currentRow=null;
 const mark=(substage,lastSafe={})=>{if(currentRow){currentRow.substage=substage;currentRow.lastSafe=lastSafe;currentRow.observedAt=new Date().toISOString();save();}};
 const codes=new Set(['ERR_ASSERTION','READBACK_TIMEOUT','BUDGET_EXCEEDED','QA_SCOPE_DENIED','QA_GRANT_EXPIRED','QA_GRANT_REQUIRED','SESSION_CHANGED','GARDEN_CLOUD_UNAVAILABLE','CLOUD_UNAVAILABLE','NO_SAFE_PLANT_FIXTURE']);
 async function active(){assert.ok(Date.now()<deadline,'BUDGET_EXCEEDED');await assertActive();for(const role of['a','a2']){const s=await models[role].call('accounts','session');assert.equal(s.currentUser?.id,owner);assert.equal(s.currentUser?.authUserId,expectedActors[role].authUserId);assert.equal(s.currentUser?.authKind,'supabase');}await assertActive();}
 async function call(role,feature,command,payload={}){await active();return models[role].call(feature,command,payload);}
 async function raw(role,feature,command,payload={}){await active();return models[role].page.evaluate(x=>window.lingjing.invoke(x.feature,x.command,x.payload),{feature,command,payload});}
 async function until(stage,read,accept,scalar,timeout=30000){mark(stage);const end=Math.min(deadline,Date.now()+timeout);while(Date.now()<end){const value=await read();mark(stage,scalar(value));if(accept(value))return value;await new Promise(r=>setTimeout(r,350));}throw Object.assign(Error(),{code:'READBACK_TIMEOUT'});}
 async function route(role,path){await active();await models[role].page.evaluate(p=>{location.hash='#'+p;},path);await models[role].page.locator(`.app-page-motion[data-current-route="true"][data-route-key="${path}"]`).waitFor({timeout:15000});}
 async function step(id,work){const row={id,status:'running',fullCasePassed:false};proof.cases.push(row);currentRow=row;save();try{await active();Object.assign(row,await work());row.status='passed-scoped';}catch(e){row.status='failed';row.errorCode=codes.has(e?.code)?e.code:'SCOPED_ASSERTION_FAILED';throw e;}finally{save();}}
 async function local(role='a'){await active();return models[role].main(({app},profile,owner)=>{
  const fs=process.getBuiltinModule('node:fs'),path=process.getBuiltinModule('node:path'),crypto=process.getBuiltinModule('node:crypto');
  if(fs.realpathSync.native(app.getPath('userData'))!==fs.realpathSync.native(profile))throw Error('Owned profile mismatch');
  const req=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json'),db=new(req('better-sqlite3'))(path.join(profile,'lingjing.sqlite'),{readonly:true,fileMustExist:true});
  try{db.pragma('query_only=ON');return {
   requests:db.prepare('SELECT action_id actionId,endpoint,op,kind,input_json inputJson,logical_hash logicalHash,request_hash requestHash,status,error_code errorCode FROM garden_cloud_requests WHERE owner_account_id=? ORDER BY action_id').all(owner),
   actions:db.prepare('SELECT action_id actionId,kind,request_hash requestHash,result_json resultJson FROM garden_actions WHERE owner_account_id=? ORDER BY action_id').all(owner),
   items:db.prepare('SELECT item_id id,quantity FROM garden_items WHERE owner_account_id=? ORDER BY item_id').all(owner),
   plots:db.prepare('SELECT * FROM garden_plots WHERE owner_account_id=? ORDER BY plot_id').all(owner),
   businessDigest:crypto.createHash('sha256').update(JSON.stringify(['garden_accounts','garden_items','garden_plots','garden_actions','garden_events','garden_reward_receipts'].map(name=>[name,db.prepare(`SELECT * FROM ${name} WHERE owner_account_id=? ORDER BY rowid`).all(owner)]))).digest('hex')
  };}finally{db.close();}
 },models[role].profile,owner);}
 async function faultState(){await active();return models.a.main(()=>{const f=globalThis.__gardenCompletionFault;if(!f)throw Error('Missing own fault');return {enabled:f.enabled,target:f.target,commands:f.commands,reads:f.reads};});}
 async function authorityRead(actionId){await active();return models.a2.main(async(_electron,owner,actionId)=>{
  const p=globalThis.__gardenCompletionContext,c=p?.context;if(!c||c.ownerAccountId!==owner)throw Error('Exact own SDK context unavailable');
  const remote=await c.invoke('garden-sync',{op:'snapshot'}),env=remote.envelope;
  if(env?.ownerAccountId!==owner||env.identity?.subjectId!==owner||env.provenance?.mode!=='live')throw Error('Authority mismatch');
  const crypto=process.getBuiltinModule('node:crypto'),tables=env.data.modules.garden.data.tables;
  const stable=Object.fromEntries(Object.keys(tables).sort().map(k=>[k,tables[k]]));
  return {owner,accountRevision:remote.accountRevision,gardenRevision:remote.snapshot.revision,source:'normal-live-A2-SDK-garden-sync',gardenSha256:crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex'),
   items:remote.snapshot.items.map(x=>({id:x.id,quantity:x.quantity})),plots:remote.snapshot.plots,
   actions:tables.garden_actions.filter(x=>x.action_id===actionId),events:tables.garden_events.filter(x=>x.action_id===actionId),receipts:tables.garden_reward_receipts.filter(x=>x.action_id===actionId)};
 },owner,actionId);}
 let baseline,original,selected,a2OriginalRevision;
 try{
  await step('fixture-current-cloud-empty-plot',async()=>{
   baseline=requireFreshGarden(await call('a','garden','snapshot'),owner);const a2Original=await raw('a2','garden','snapshot');assert.equal(a2Original.ok,true);requireFreshGarden(a2Original.data,owner);assert.ok(Number.isSafeInteger(a2Original.revision));a2OriginalRevision=a2Original.revision;
   const statuses=await call('a','accounts','syncStatus');assert.equal(statuses.pending,0);assert.equal(statuses.conflicts,0);
   proof.actualMetadataWarningObserved=hasGenuineS06Metadata(statuses);if(requireGenuineMetadataWarning&&!proof.actualMetadataWarningObserved){proof.s06BlockedReason='GENUINE_METADATA_WARNING_NO_LONGER_PRESENT';throw Object.assign(Error(),{code:'S06_GENUINE_METADATA_MISSING'});}
   const crops=baseline.crops.filter(c=>baseline.items.some(i=>i.id===c.seedItemId&&i.quantity>0));const plot=baseline.plots.find(p=>!p.cropType);
   if(!plot||!crops.length)throw Object.assign(Error(),{code:'NO_SAFE_PLANT_FIXTURE'});selected={plotId:plot.plotId,cropId:crops[0].id,seedId:crops[0].seedItemId};intent.selection=selected;persist();
   // Capture only this already logged-in A2's normal SDK context, never its token.
   await models.a2.main((_electron,owner)=>{const req=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json'),p=req('./apps/pc-app/runtime/features/accounts/supabase-remote.cjs').SupabaseRemote.prototype;if(globalThis.__gardenCompletionContext)throw Error('Existing own context');const s={prototype:p,original:p.cloudContext,context:null};globalThis.__gardenCompletionContext=s;s.wrapper=async function(...args){const c=await s.original.apply(this,args);if(c.ownerAccountId===owner){if(p.cloudContext!==s.wrapper)throw Error('Foreign garden wrapper preserved');s.context=c;p.cloudContext=s.original;}return c;};p.cloudContext=s.wrapper;},owner);contextInstalled=true;
   await call('a2','garden','snapshot');return {plotId:selected.plotId,cropId:selected.cropId,metadataWarningObserved:proof.actualMetadataWarningObserved};
  });
  await step('G07-S06-durable-pending-cache-and-no-storm',async()=>{
   await route('a','/garden/plots');const page=models.a.page;
   await page.locator(`.garden-plot[data-plot-id="${selected.plotId}"]`).click();await page.locator('.garden-seeds button').filter({has:page.locator('strong',{hasText:baseline.crops.find(c=>c.id===selected.cropId).name})}).click();
   await until('plot-selection-dom-ready',()=>page.locator(`.garden-plot[data-plot-id="${selected.plotId}"]`).getAttribute('aria-pressed'),x=>x==='true',x=>({selected:x==='true'}));
   const before=await local();assert.equal(before.requests.filter(x=>x.status==='pending').length,0);intent.before=before;intent.phase='ui-plant-intent';persist();
   await models.a.main((_electron,target)=>{
    const req=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json'),p=req('./apps/pc-app/runtime/features/accounts/supabase-remote.cjs').SupabaseRemote.prototype;
    if(globalThis.__gardenCompletionFault)throw Error('Existing garden fault');const f={prototype:p,original:p.request,enabled:true,target,commands:[],reads:0};globalThis.__gardenCompletionFault=f;
    f.wrapper=async function(name,body,...opaque){
     if(this.deviceId===target.deviceId&&f.enabled){
      if(name==='garden-sync'&&body?.op==='command'&&body.command==='plant'&&body.input?.plotId===target.plotId&&body.input.cropType===target.cropId){
       if(target.actionId&&target.actionId!==body.input.actionId)throw Error('Replacement action refused');target.actionId=body.input.actionId;
       if(f.commands.length>=8)throw Error('Bounded original action attempts exceeded');f.commands.push({actionId:body.input.actionId,blockedBeforeSend:true});
       throw Object.assign(Error('Owned transport unavailable'),{code:'CLOUD_UNAVAILABLE'});
      }
      if((name==='garden-sync'||name==='territory-sync')&&body?.op==='snapshot'){f.reads++;if(f.reads>60)throw Error('Read bound exceeded');throw Object.assign(Error('Owned read unavailable'),{code:'CLOUD_UNAVAILABLE'});}
     }
     return f.original.call(this,name,body,...opaque);
    };p.request=f.wrapper;
   },{deviceId:expectedActors.a.deviceId,...selected,actionId:null});faultInstalled=true;
   await active();const immediatelyBefore=await call('a','accounts','syncStatus');if(requireGenuineMetadataWarning&&!hasGenuineS06Metadata(immediatelyBefore)){proof.s06BlockedReason='GENUINE_METADATA_WARNING_NO_LONGER_PRESENT';throw Object.assign(Error(),{code:'S06_GENUINE_METADATA_MISSING'});}proof.metadataWarningPresentImmediatelyBeforePlant=hasGenuineS06Metadata(immediatelyBefore);proof.originalPlantUiSubmitted=true;save();await page.locator('.garden-plot-detail').getByRole('button',{name:'播种',exact:true}).click();
   await page.locator('.garden-notice-pending').getByRole('button',{name:'重试',exact:true}).waitFor({timeout:20000});
   await until('garden-ui-not-busy',()=>page.locator('.garden-feature').getAttribute('aria-busy'),x=>x==='false',x=>({busy:x==='true'}));
   const pending=await until('original-journal-one-pending',local,x=>x.requests.filter(r=>r.status==='pending').length===1,x=>({pending:x.requests.filter(r=>r.status==='pending').length}));original=pending.requests.find(r=>r.status==='pending');
   assert.equal(original.kind,'plant');assert.equal(original.endpoint,'garden-sync');assert.equal(original.actionId,(await faultState()).target.actionId);assert.equal(pending.businessDigest,before.businessDigest);intent.command=original;intent.phase='durable-before-send-pending';persist();
   const cache=await call('a','garden','snapshot');assert.equal(cache.sync.mode,'cached');assert.equal(cache.sync.pending,1);assert.deepEqual(quantities(cache),quantities(baseline));
   await route('a','/account');const refresh=page.getByRole('button',{name:'刷新云端数据',exact:true});await active();await refresh.click();
   await until('account-refresh-ended',async()=>({status:await call('a','accounts','syncStatus'),enabled:await refresh.isEnabled()}),x=>!x.status.running&&x.enabled,x=>({running:!!x.status.running,enabled:x.enabled,pending:x.status.pending}));
   const current=await call('a','accounts','syncStatus');requireGardenPending(current,1);await page.getByText('待确认 1',{exact:true}).waitFor({timeout:15000});
   const quietStart=await faultState();await new Promise(r=>setTimeout(r,10000));await active();const quietEnd=await faultState();
   assert.equal(quietEnd.commands.length,quietStart.commands.length);assert.ok(quietEnd.reads-quietStart.reads<=2,'No spontaneous high-frequency read storm');
   for(let n=0;n<3;n++){requireGardenPending(await call('a','accounts','syncStatus'),1);const again=await local();assert.equal(again.businessDigest,before.businessDigest);assert.equal(again.requests.filter(x=>x.status==='pending').length,1);assert.equal(again.requests.find(x=>x.actionId===original.actionId).logicalHash,original.logicalHash);}
   proof.metadataPriorityNativeCovered=proof.actualMetadataWarningObserved===true&&proof.metadataWarningPresentImmediatelyBeforePlant===true&&hasGenuineS06Metadata(current)&&current.lastError==='CLOUD_UNAVAILABLE';if(requireGenuineMetadataWarning&&!proof.metadataPriorityNativeCovered)proof.s06BlockedReason='GENUINE_METADATA_NOT_RETAINED_AT_FAILURE_AGGREGATION';
   return {actionId:original.actionId,pending:1,cachedMode:'cached',exactGardenCount:1,totalCount:current.pending,busyEnded:true,quietWindowMs:10000,spontaneousCommandAttempts:0,spontaneousSnapshotAttempts:quietEnd.reads-quietStart.reads,metadataPriorityNativeCovered:proof.metadataPriorityNativeCovered};
  });
  await step('G07-S06-original-ui-retry-and-independent-live-receipt',async()=>{
   await route('a','/garden/plots');const page=models.a.page;await page.locator('.garden-notice-pending').getByRole('button',{name:'重试',exact:true}).waitFor({timeout:15000});
   await models.a.main(()=>{globalThis.__gardenCompletionFault.enabled=false;});await active();await page.locator('.garden-notice-pending').getByRole('button',{name:'重试',exact:true}).click();
   const recovered=await until('original-retry-fresh-cloud-committed',()=>call('a','garden','snapshot'),x=>x.sync?.mode==='cloud'&&x.sync.pending===0&&x.plots.find(p=>p.plotId===selected.plotId)?.cropType===selected.cropId,x=>({source:['cloud','cached'].includes(x.sync?.mode)?x.sync.mode:'other',pending:x.sync?.pending??null,originalCropPresent:x.plots.some(p=>p.plotId===selected.plotId&&p.cropType===selected.cropId)}));requireFreshGarden(recovered,owner);
   await until('original-pending-banner-cleared',()=>page.locator('.garden-notice-pending').count(),x=>x===0,x=>({pendingBannerCount:x}));await until('garden-ui-not-busy',()=>page.locator('.garden-feature').getAttribute('aria-busy'),x=>x==='false',x=>({busy:x==='true'}));
   const localAfter=await local(),row=localAfter.requests.find(x=>x.actionId===original.actionId);assert.equal(row.status,'committed');assert.equal(row.logicalHash,original.logicalHash);assert.equal(row.requestHash,original.requestHash);assert.equal(localAfter.actions.filter(x=>x.actionId===original.actionId).length,1);
   const expected={...quantities(baseline),[selected.seedId]:quantities(baseline)[selected.seedId]-1};assert.deepEqual(quantities(recovered),expected);
   const a2=requireFreshGarden(await call('a2','garden','snapshot'),owner);assert.deepEqual(quantities(a2),expected);assert.deepEqual(a2.plots,recovered.plots);
   const remote=await authorityRead(original.actionId);assert.equal(remote.actions.length,1);assert.equal(remote.actions[0].request_hash,original.requestHash);assert.deepEqual(Object.fromEntries(remote.items.map(x=>[x.id,x.quantity])),expected);assert.equal(remote.events.filter(x=>x.item_id===selected.seedId&&x.delta===-1).length,1);
   const input=JSON.parse(original.inputJson);intent.phase='replay-original-committed-intent';persist();const replay=await raw('a','garden','plant',input);assert.equal(replay.ok,true);assert.equal(replay.replayed,true);
   const remoteAgain=await authorityRead(original.actionId);assert.equal(remoteAgain.gardenSha256,remote.gardenSha256);assert.deepEqual(remoteAgain.actions,remote.actions);assert.deepEqual(remoteAgain.events,remote.events);
   await route('a','/account');await models.a.page.getByRole('button',{name:'刷新云端数据',exact:true}).click();const status=await until('account-a-pending-cleared',()=>call('a','accounts','syncStatus'),x=>!x.running&&x.pending===0,x=>({running:!!x.running,pending:x.pending,conflicts:x.conflicts}));assert.equal(status.domainStates.find(x=>x.domain==='garden').pending,0);
   intent.phase='committed-and-independently-read';persist();return {actionId:original.actionId,normalUiRetry:true,oneAction:1,oneSeedDebit:1,independentSource:remote.source,accountRevision:remote.accountRevision,originalRequestHash:original.requestHash,replayNoChange:true};
  });
  await step('G07-S06-real-stale-revision-definitive-conflict-not-pending',async()=>{
   // A genuinely earlier A2 snapshot is the CAS precondition. This is a new,
   // explicitly documented conflicting intent, never replacement of unknown work.
   const before=await authorityRead(original.actionId),localBefore=await local('a2');
   assert.ok(before.gardenRevision>a2OriginalRevision);assert.equal(localBefore.requests.filter(x=>x.status==='pending').length,0);
   const input={actionId:randomUUID(),sessionOwnerAccountId:owner,expectedRevision:a2OriginalRevision,plotId:selected.plotId,cropType:selected.cropId};
   intent.conflictingIntent={kind:'plant',input};intent.phase='documented-stale-cas-intent';persist();
   const rejected=await raw('a2','garden','plant',input);assert.equal(rejected.ok,false);assert.equal(rejected.code,'REVISION_CONFLICT');
   const after=await local('a2'),conflict=after.requests.find(x=>x.actionId===input.actionId);
   assert.ok(conflict);assert.equal(conflict.status,'conflict');assert.equal(conflict.errorCode,'REVISION_CONFLICT');assert.equal(after.requests.filter(x=>x.status==='pending').length,0);
   assert.equal(after.businessDigest,localBefore.businessDigest);assert.equal(after.actions.filter(x=>x.actionId===input.actionId).length,0);
   const replay=await raw('a2','garden','plant',input);assert.equal(replay.ok,false);assert.equal(replay.code,'REVISION_CONFLICT');
   const replayLocal=await local('a2');assert.equal(replayLocal.businessDigest,localBefore.businessDigest);assert.equal(replayLocal.requests.filter(x=>x.actionId===input.actionId).length,1);assert.equal(replayLocal.requests.find(x=>x.actionId===input.actionId).logicalHash,conflict.logicalHash);
   const independent=await authorityRead(original.actionId);assert.equal(independent.gardenSha256,before.gardenSha256);assert.deepEqual(independent.actions,before.actions);assert.deepEqual(independent.events,before.events);
   await route('a2','/account');await active();await models.a2.page.getByRole('button',{name:'刷新云端数据',exact:true}).click();
   const status=await until('account-a2-pending-cleared',()=>call('a2','accounts','syncStatus'),x=>!x.running&&x.pending===0,x=>({running:!!x.running,pending:x.pending,conflicts:x.conflicts}));const domain=status.domainStates.find(x=>x.domain==='garden');assert.equal(domain.pending,0);assert.ok(domain.conflicts>=1);assert.notEqual(status.status,'ready');
   intent.phase='terminal-conflict-observed-no-economic-change';persist();return {negativePath:'Normal domain CAS request, not stale UI click',expectedRevision:a2OriginalRevision,actualRevision:before.gardenRevision,errorCode:'REVISION_CONFLICT',sameConflictIntentReplay:true,pending:0,conflictRetained:true,independentNoEconomicChange:true};
  });
  proof.finalPendingByRole={};for(const role of ['a','a2']){const status=await call(role,'accounts','syncStatus');assert.equal(status.pending,0);assert.equal(status.running,false);proof.finalPendingByRole[role]=0;}
  proof.g07Passed=proof.cases.length===4&&proof.cases.every(x=>x.status==='passed-scoped');proof.s06Status=proof.metadataPriorityNativeCovered===true&&proof.g07Passed?'passed-scoped':requireGenuineMetadataWarning?'blocked':'unselected';proof.passed=proof.g07Passed&&(!requireGenuineMetadataWarning||proof.metadataPriorityNativeCovered===true);
  proof.scopeConclusions={G07:'Offline-write/recovery plus normal stale-snapshot garden CAS; no concurrent territory takeover',S06:proof.metadataPriorityNativeCovered?'Persistent garden pending and actual metadata/network priority observed':'Persistent garden pending/error/retry observed; genuine stale metadata-warning priority remains separate'};
 }catch(e){if(e?.code==='S06_GENUINE_METADATA_MISSING'&&proof.originalPlantUiSubmitted!==true&&!intent.command)proof.beforeAnyBusinessWrite=true;proof.errorCode=e?.code==='S06_GENUINE_METADATA_MISSING'?e.code:codes.has(e?.code)?e.code:'SCOPED_ASSERTION_FAILED';}
 finally{
  proof.cleanup={faultRemoved:!faultInstalled,contextRemoved:!contextInstalled};
  if(faultInstalled)try{await models.a.main(restoreGardenCompletionWrapper,'fault');proof.cleanup.faultRemoved=true;}catch{proof.passed=false;}
  if(contextInstalled)try{await models.a2.main(restoreGardenCompletionWrapper,'context');proof.cleanup.contextRemoved=true;}catch{proof.passed=false;}
  proof.metadataFailureContinuation=requireGenuineMetadataWarning&&proof.g07Passed===true&&proof.s06Status==='blocked'&&proof.s06BlockedReason==='GENUINE_METADATA_NOT_RETAINED_AT_FAILURE_AGGREGATION'&&!proof.errorCode&&proof.finalPendingByRole?.a===0&&proof.finalPendingByRole?.a2===0&&Object.values(proof.cleanup).every(x=>x===true)?{onlyOriginalMetadataObservationMissing:true,originalPlantCommittedAndIndependentlyVerified:true,staleIntentDefinitivelyRejected:true,bothOriginalPendingZero:true,ownFaultAndContextCleaned:true}:null;
  proof.completedAt=new Date().toISOString();save();
 }
 return proof;
}
