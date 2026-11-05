// Prepared callable case; no top-level execution, registration, coordinates or cloud writes.
import assert from 'node:assert/strict';
import {existsSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {companionIdentity} from '../../apps/pc-app/runtime/features/companions/display-identity.mjs';
export function requireUiBinding(input){
 for(const k of ['bindingDigest','sourceCommit','profilePath','ownerAccountId','authUserId','deviceId','sessionId'])assert.ok(typeof input?.[k]==='string'&&input[k]);
 assert.match(input.bindingDigest,/^[a-f0-9]{64}$/);assert.match(input.sourceCommit,/^[a-f0-9]{40}$/);return input;
}
// The product keeps server-generated points at their original positions while
// recomputing preview distances/range from the current fix. A failed request
// must not stamp that old payload with the new fix's timestamp. The UI may
// still show the previous snapshot, or a genuine subsequent background success.
export function assertNearbyFailureBinding(before,observed){
 const failure=observed.nearbyFailure;
 assert.ok(failure,'The exact before-send failure must have been observed');
 assert.equal(observed.nearbyFailureStage,'refresh-rejected','Observe rejected refresh before any later UI-triggered recovery');
 assert.equal(observed.nearbyFailures,1);assert.equal(observed.armed,null);
 assert.equal(before.location.status,'ready');assert.equal(before.location.fix?.source,'simulated');
 assert.ok(before.remoteCount>0);assert.equal(before.remote?.timestampMs,before.location.fix.timestampMs);
 assert.equal(before.remote.source,before.location.fix.source);assert.equal(before.remote.scenarioId,before.location.fix.scenarioId??null);
 assert.equal(failure.location.status,'ready');assert.equal(failure.location.fix?.source,'simulated');
 assert.ok(failure.location.fix.timestampMs>before.location.fix.timestampMs);
 assert.equal(failure.nearbySuccesses,before.nearbySuccesses,'A success before the fault invalidates this baseline');
 assert.deepEqual(failure.remote,before.remote,'Failure must retain the original timestamp and complete server payload');
 assert.notEqual(failure.remote.timestampMs,failure.location.fix.timestampMs,'Old results are not a new-position success');
 for(const state of [before,failure,observed]){
  assert.equal(state.location.watching,false,'The manual failure case must not race location watch');
  assert.equal(state.view.bindingsSha256,state.remote?.bindingsSha256,'Preview must preserve server IDs, templates and positions');
 }
 assert.equal(observed.location.status,'ready');
 assert.deepEqual(observed.location.fix,failure.location.fix,'Watch is disabled: no unobserved fix may replace the failed attempt');
 assert.ok(observed.nearbySuccesses>=failure.nearbySuccesses);
 let backgroundRecoveryApplied=false;
 if(JSON.stringify(observed.remote)!==JSON.stringify(failure.remote)){
  const response=observed.nearbyResponses.find(value=>value.sequence>failure.nearbySuccesses&&value.sequence<=observed.nearbySuccesses&&value.payloadSha256===observed.remote?.payloadSha256&&value.fixTimestamp===observed.remote?.timestampMs);
  assert.ok(response,'Changed results require a matching authenticated successful nearby response, not just a success counter');
  assert.equal(response.fixTimestamp,failure.location.fix.timestampMs);
  assert.equal(observed.remote.source,failure.location.fix.source);
  assert.equal(observed.remote.scenarioId,failure.location.fix.scenarioId??null);
  backgroundRecoveryApplied=true;
 }
 return {backgroundRecoveryApplied,retainedAtFailure:true,originalPositionBindingsPreserved:true};
}
export function assertNearbyFailureUi(visible,candidates){
 assert.ok(visible.error?.includes('受控附近请求暂时不可用'),'Failure must remain visibly reported');
 assert.equal(visible.retryEnabled,true);assert.ok([100,450].includes(visible.radius));
 assert.equal(new Set(visible.markers.map(marker=>marker.id)).size,visible.markers.length,'Visible pins must not duplicate an identity');
 for(const {origin,state} of candidates){
  const spawns=state.view.spawns.filter(spawn=>spawn.distanceMeters<=visible.radius);
  if(visible.countText!==`${spawns.length} 位伙伴`)continue;
  const selected=visible.selected&&spawns.find(spawn=>{
   const identity=companionIdentity(spawn);
   return visible.selected.name===identity.roleName&&visible.selected.number===`编号 ${identity.instanceNumber}`&&visible.selected.resourceId===spawn.resourceId&&visible.selected.distance===`${spawn.distanceMeters} m · ${spawn.inRange?'可挑战':'前往附近'}`;
  });
  if(spawns.length?!selected:Boolean(visible.selected))continue;
  const rows=spawns.filter(spawn=>spawn.id!==selected?.id).slice(0,3).map(spawn=>({name:spawn.name,resourceId:spawn.resourceId,distance:`${spawn.distanceMeters} m`}));
  if(JSON.stringify(visible.rows)!==JSON.stringify(rows))continue;
  // Map tiles may fail independently. Any rendered pin must still identify a
  // real point with the corresponding distance, never a new locally made one.
  if(visible.markers.some(marker=>!spawns.slice(0,8).some(spawn=>marker.id===spawn.id&&marker.label===`${spawn.name}，距离 ${spawn.distanceMeters} 米`&&marker.selected===(spawn.id===selected?.id))))continue;
  return {origin,count:spawns.length,markerCount:visible.markers.length};
 }
 assert.fail('Visible nearby identities/distances do not match a retained or authenticated recovered snapshot');
}
// DOM-only inspection: no renderer IPC, hidden React state or location mutation.
export function readNearbyFailureUi(){
 const root=document.querySelector('.app-page-motion[data-route-key="/discovery"][data-current-route="true"] .discovery-page');
 // Native visibility includes transparent/hidden ancestors during route fades.
 const shown=el=>Boolean(el&&el.getClientRects().length&&el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}));
 const text=el=>el?.textContent?.trim()??null,hero=root?.querySelector('.discovery-selected-hero'),alert=root?.querySelector('.discovery-alert[role="alert"]'),retry=root?.querySelector('button[aria-label="更新场景位置"]');
 return {error:shown(alert)?text(alert):null,retryEnabled:shown(retry)&&!retry.disabled,radius:Number(root?.querySelector('select[aria-label="附近显示范围"]')?.value),countText:text(root?.querySelector('.discovery-nearby-heading span')),
  selected:shown(hero)?{name:text(hero.querySelector('h2')),number:text(hero.querySelector('.discovery-instance-number')),resourceId:hero.querySelector('[data-resource-id]')?.getAttribute('data-resource-id'),distance:text(hero.querySelector('.discovery-distance'))}:null,
  rows:[...root?.querySelectorAll('.discovery-nearby-row')??[]].filter(shown).map(row=>({name:text(row.querySelector('strong')),resourceId:row.querySelector('[data-resource-id]')?.getAttribute('data-resource-id'),distance:text(row.querySelector(':scope > span:last-of-type'))})),
  markers:[...root?.querySelectorAll('.discovery-pin-button')??[]].filter(shown).map(marker=>({id:marker.getAttribute('data-spawn-id'),label:marker.getAttribute('aria-label'),selected:marker.getAttribute('aria-pressed')==='true'}))};
}
// Serialized into the already-owned main process. Holder alone supplies this private
// context after real authorization/grant verification; it is never an IPC endpoint.
export async function installUiFaultProbe(_electron,binding){
 const fail=code=>{throw Object.assign(Error(code),{code});};
 const h=globalThis.__qaUiCaseContext;
 if(!h?.accounts||!h.locationFixture||h.bindingDigest!==binding.bindingDigest||globalThis.__qaDiscoveryUiFault)fail('UI_FIXTURE_NOT_READY');
 const accounts=h.accounts,services=accounts.services,d=services.get('discovery'),location=d?.location,adapter=location?.adapter,authority=d?.authority;
 const fs=process.getBuiltinModule('node:fs'),path=process.getBuiltinModule('node:path'),crypto=process.getBuiltinModule('node:crypto');
 if(!location||!authority||!d.cloudRuntime||services.get('qaScenario'))fail('NORMAL_CLOUD_REQUIRED');
 const epoch=accounts.epoch,originalPosition=adapter.getPosition,originalActor=authority.requireActor;
 let armed=null,sourceFailures=0,nearbyFailures=0,nearbySuccesses=0,closed=false,nearbyFailure=null,nearbyFailureStage=null;
 const nearbyResponses=[];
 const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
 const bindings=spawns=>spawns.map(({id,templateId,position})=>({id,templateId,position}));
 function observation(){
  const s=location.snapshot(),remote=d.cloudRuntime.nearbyState,spawns=d.nearby().spawns;
  const {timestampMs,...payload}=remote||{};
  return structuredClone({nearbySuccesses,location:s,remoteTimestamp:timestampMs??null,remoteCount:remote?.spawns?.length??0,
   remote:remote?{timestampMs,source:remote.source,scenarioId:remote.scenarioId??null,payloadSha256:digest(payload),bindingsSha256:digest(bindings(remote.spawns))}:null,
   view:{bindingsSha256:digest(bindings(spawns)),spawns:spawns.map(({id,templateId,name,resourceId,globalSerial,distanceMeters,inRange})=>({id,templateId,name,resourceId,globalSerial,distanceMeters,inRange}))}});
 }
 function gate(){
  if(closed||accounts.epoch!==epoch||services.get('discovery')!==d||d.location!==location||location.adapter!==adapter||d.authority!==authority||services.session.getOwnerAccountId()!==binding.ownerAccountId)fail('UI_FIXTURE_CHANGED');
  if(fs.realpathSync(services.paths.userData).toLowerCase()!==fs.realpathSync(binding.profilePath).toLowerCase())fail('PROFILE_MISMATCH');
  const s=h.locationFixture.status();if(!s.active||s.bindingDigest!==binding.bindingDigest||s.normalCloudAuthority!==true)fail('UI_CAPABILITY_REQUIRED');
 }
 function actorExact(context){const a=context.actor||context;for(const k of ['ownerAccountId','authUserId','deviceId','sessionId'])if(a[k]!==binding[k])fail('ACTOR_CHANGED');if(a.authKind!=='supabase'||a.authority!=='live')fail('NORMAL_CLOUD_REQUIRED');}
 gate();actorExact(await originalActor.call(authority));gate();if(adapter.getPosition!==originalPosition||authority.requireActor!==originalActor||globalThis.__qaDiscoveryUiFault)fail('PROBE_INSTALL_CHANGED');
 const position=async function(...args){gate();if(armed==='source'){armed=null;sourceFailures++;throw Object.assign(Error('受控定位来源暂时不可用，请重试'),{code:'LOCATION_UNAVAILABLE'});}return originalPosition.apply(this,args);};
 const actor=async function(...args){gate();const context=await originalActor.apply(this,args);gate();actorExact(context);return {...context,invoke:async(feature,body)=>{
  gate();const nearby=feature==='discovery'&&body?.op==='nearby',fixTimestamp=nearby?location.snapshot().fix?.timestampMs:null;
  if(nearby&&armed==='nearby'){
   armed=null;nearbyFailures++;nearbyFailure=observation();nearbyFailureStage='before-send';
   // Observe the existing task's rejection without replacing refresh, delaying
   // its completion, or changing its rejection. Its already-registered finally
   // runs first; UI catch/retry resumes only after this observation is queued.
   const pending=d.cloudRuntime.pendingRefresh;
   if(pending?.then)void pending.then(()=>{},error=>{
    try{exact();if(error?.code!=='CLOUD_UNAVAILABLE')fail('UNEXPECTED_REFRESH_FAILURE');nearbyFailure=observation();nearbyFailureStage='refresh-rejected';}
    catch{nearbyFailureStage='observation-failed';}
   });
   throw Object.assign(Error('受控附近请求暂时不可用，请重试'),{code:'CLOUD_UNAVAILABLE'});
  }
  const result=await context.invoke(feature,body);gate();if(nearby){nearbySuccesses++;nearbyResponses.push({sequence:nearbySuccesses,fixTimestamp,payloadSha256:digest(result)});}return result;
 }};};
 adapter.getPosition=position;authority.requireActor=actor;
 function exact(){gate();if(adapter.getPosition!==position||authority.requireActor!==actor)fail('PROBE_REPLACED');}
 globalThis.__qaDiscoveryUiFault={
  arm(kind){exact();if(armed||!['source','nearby'].includes(kind))fail('INVALID_FAULT');armed=kind;},
  read(){exact();return structuredClone({armed,sourceFailures,nearbyFailures,...observation(),nearbyFailure,nearbyFailureStage,nearbyResponses});},
  effects(){exact();const req=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json'),db=new(req('better-sqlite3'))(path.join(binding.profilePath,'lingjing.sqlite'),{readonly:true,fileMustExist:true});try{db.pragma('query_only=ON');const result={};for(const table of ['discovery_encounters','discovery_captures','discovery_actions','battle_sessions','battle_reward_receipts','companion_pets']){const rows=db.prepare(`SELECT * FROM ${table} WHERE owner_account_id=?`).all(binding.ownerAccountId).map(r=>JSON.stringify(r)).sort();result[table]={count:rows.length,sha256:crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex')};}return result;}finally{db.close();}},
  restore(){armed=null;const ownPosition=adapter.getPosition===position,ownActor=authority.requireActor===actor;if(ownPosition)adapter.getPosition=originalPosition;if(ownActor)authority.requireActor=originalActor;closed=true;delete globalThis.__qaDiscoveryUiFault;if(!ownPosition||!ownActor)fail('PROBE_REPLACED');}
 };return {installed:true};
}
export async function runCloudLiveQaDiscoveryUiCases({model,binding,assertActive,output,runId}){
 requireUiBinding(binding);assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1');assert.equal(typeof assertActive,'function');
 const file=join(output,'live-discovery-ui-evidence.json');assert.ok(!existsSync(file));
 const proof={runId,scope:'Normal authenticated discovery UI with explicitly simulated QA location. One exact source-adapter before-read failure and one authenticated nearby before-send failure; no forged server response. Tile branch remains separately version-bound.',fullCasePassed:false,passed:false,checks:[],startedAt:new Date().toISOString()};
 const save=()=>writeFileSync(file,JSON.stringify(proof,null,2));save();let installed=false,watchWasOn=false;const deadline=Date.now()+7*60000,page=model.page;
 async function active(){assert.ok(Date.now()<deadline);await assertActive();const session=await model.call('accounts','session');assert.equal(session.currentUser?.id,binding.ownerAccountId);assert.equal(session.currentUser?.authUserId,binding.authUserId);assert.equal(session.currentUser?.authKind,'supabase');assert.equal(session.dataMode,'live');const info=await model.call('app','info');assert.equal(info.build.sourceCommit,binding.sourceCommit);assert.deepEqual(info.build.sourceDirtyFiles,[]);}
 async function until(fn,accept,stage,ms=25000){proof.stage=stage;save();const end=Date.now()+ms;while(Date.now()<end){await active();const value=await fn();const ready=Boolean(accept(value));proof.lastObservation={ready,count:Array.isArray(value)?value.length:null,type:typeof value,...(value&&typeof value==='object'&&value.location?{locationStatus:['idle','ready','unavailable','stale','locating','privacy_disabled'].includes(value.location.status)?value.location.status:'other',hasFix:Boolean(value.location.fix),sourceFailures:value.sourceFailures,nearbyFailures:value.nearbyFailures,nearbySuccesses:value.nearbySuccesses}:{} )};save();if(ready)return value;await new Promise(r=>setTimeout(r,200));}throw Error('UI_STATE_TIMEOUT');}
 async function click(el){await active();assert.equal(await el.count(),1);await el.click({timeout:10000});}
 const probe=()=>model.main(()=>globalThis.__qaDiscoveryUiFault.read());
 const effects=()=>model.main(()=>globalThis.__qaDiscoveryUiFault.effects());
 const button=()=>page.getByRole('button',{name:'更新场景位置',exact:true});
 const alert=()=>page.locator('.discovery-alert[role="alert"]');
 async function readyButton(){await until(()=>button().isEnabled(),Boolean,'manual-button-ready',20000);}
 async function recover(stage){await readyButton();const before=await probe();const priorTimestamp=before.location.fix?.timestampMs||0;await click(button());await until(probe,p=>p.location.status==='ready'&&p.location.fix?.source==='simulated'&&p.location.fix.timestampMs>priorTimestamp&&p.remoteTimestamp===p.location.fix.timestampMs&&p.nearbySuccesses>before.nearbySuccesses,stage);await until(()=>alert().count(),n=>n===0,'visible-error-cleared');await page.screenshot({path:join(output,stage+'.png'),timeout:10000});}
 try{
  await active();await model.main(installUiFaultProbe,binding);installed=true;
  await page.evaluate(()=>{location.hash='#/discovery';});await page.locator('.app-page-motion[data-route-key="/discovery"][data-current-route="true"]').waitFor({timeout:20000});
  await click(page.getByRole('button',{name:'探索设置',exact:true}));const watch=page.getByRole('switch',{name:'探索时持续更新位置',exact:true});await watch.waitFor();watchWasOn=await watch.getAttribute('aria-checked')==='true';if(watchWasOn)await click(watch);await page.keyboard.press('Escape');
  await recover('M07-initial-ready');const baseline=await effects();const initial=await probe();assert.ok(initial.remoteCount>0,'Real results required before a failure');
  await readyButton();await model.main(()=>globalThis.__qaDiscoveryUiFault.arm('source'));await click(button());
  const source=await until(probe,p=>p.sourceFailures===1&&p.location.status==='unavailable'&&p.location.fix===null,'source-error-clears-fix');assert.equal(source.armed,null);
  await until(()=>alert().innerText(),t=>t.includes('暂时无法提供位置'),'source-error-visible');assert.equal(await button().isEnabled(),true);await page.locator('.discovery-empty').filter({hasText:'先获取位置'}).waitFor({timeout:10000});assert.equal(await page.locator('.discovery-selected-hero').count(),0);
  assert.deepEqual(await effects(),baseline);await page.screenshot({path:join(output,'M07-source-error.png'),timeout:10000});await recover('M07-source-recovered');proof.checks.push({id:'source-read-error-and-ui-retry',passed:true,fixCleared:true});save();
  await readyButton();const before=await probe();await model.main(()=>globalThis.__qaDiscoveryUiFault.arm('nearby'));await click(button());
  await until(()=>alert().innerText(),t=>t.includes('受控附近请求暂时不可用'),'nearby-request-error-visible');const failed=await probe();assert.equal(failed.nearbyFailures,1);assert.equal(failed.armed,null);assert.equal(await button().isEnabled(),true);
  assertNearbyFailureBinding(before,failed);
  const visible=await until(async()=>{
   const left=await probe();assertNearbyFailureBinding(before,left);
   const ui=await page.evaluate(readNearbyFailureUi),right=await probe();const bindingCheck=assertNearbyFailureBinding(before,right);
   // The hook's immediate refresh can succeed while the command error remains.
   // Bracket the DOM read, and accept only a complete known presentation, not
   // mixed old/new rows. Polling tolerates a React render in progress.
   try{return {...assertNearbyFailureUi(ui,[{origin:'prior-snapshot',state:before},{origin:'retained-points-current-fix',state:failed.nearbyFailure},{origin:'observed-before-dom',state:left},{origin:'observed-after-dom',state:right}]),bindingCheck,observed:right};}catch{return null;}
  },Boolean,'nearby-error-retains-position-bindings');
  proof.nearbyFailure={visibleError:true,failureStage:failed.nearbyFailureStage,...visible.bindingCheck,visibleViewOrigin:visible.origin,visibleCount:visible.count,visibleMarkerCount:visible.markerCount,priorRemoteTimestamp:before.remoteTimestamp,failureRemoteTimestamp:failed.nearbyFailure.remoteTimestamp,failureFixTimestamp:failed.nearbyFailure.location.fix.timestampMs,observedRemoteTimestamp:visible.observed.remoteTimestamp,observedFixTimestamp:visible.observed.location.fix?.timestampMs??null,backgroundRecoveryAlreadyObserved:visible.bindingCheck.backgroundRecoveryApplied};
  assert.deepEqual(await effects(),baseline);await page.screenshot({path:join(output,'M07-nearby-error.png'),timeout:10000});await recover('M07-nearby-recovered');assert.deepEqual(await effects(),baseline);
  proof.checks.push({id:'authenticated-nearby-before-send-and-ui-retry',passed:true,noBusinessChanges:true});proof.passed=true;
 }catch{proof.errorCode='DISCOVERY_UI_CHECK_FAILED';}
 finally{
  if(installed){try{await model.main(()=>globalThis.__qaDiscoveryUiFault.restore());proof.faultHooksRestored=true;}catch{proof.faultHooksRestored=false;proof.passed=false;}}
  if(watchWasOn){try{await assertActive();const s=await model.call('accounts','session');assert.equal(s.currentUser?.id,binding.ownerAccountId);assert.equal(s.currentUser?.authUserId,binding.authUserId);const context=await model.main(async()=>{const h=globalThis.__qaUiCaseContext;h.locationFixture.status();const c=await h.accounts.requireCloudActor();const a=c.actor||c;return {deviceId:a.deviceId,sessionId:a.sessionId};});assert.equal(context.deviceId,binding.deviceId);assert.equal(context.sessionId,binding.sessionId);await page.getByRole('button',{name:'探索设置',exact:true}).click({timeout:5000});const watch=page.getByRole('switch',{name:'探索时持续更新位置',exact:true});if(await watch.getAttribute('aria-checked')!=='true')await watch.click({timeout:5000});await page.keyboard.press('Escape');proof.watchRestored=true;}catch{proof.watchRestored=false;proof.passed=false;}}
  proof.completedAt=new Date().toISOString();save();
 }
 return proof;
}
