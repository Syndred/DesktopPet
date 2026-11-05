// PREPARED ONLY. No top-level credential access, registration or mutation.
// This module cannot run until the real holder authorization/custody bridge exists.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {existsSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {plannedCAccount} from './cloud-new-c-lifecycle-preconditions.mjs';
// Read-only assertions: these values are observations, never authorization.
export function assertCVisibleAuthError({code,text,visible,buttonEnabled}){
 const messages={INVALID_CREDENTIALS:'账号或密码不正确。',INVALID_OLD_PASSWORD:'当前密码不正确。',PASSWORD_MISMATCH:'两次输入的新密码不一致。'};
 assert.ok(Object.hasOwn(messages,code));assert.equal(visible,true);assert.equal(text,messages[code]);assert.equal(buttonEnabled,true);return true;
}
export function assertCCompanionGuidance({snapshot,notice,accountStatus,accountText,refresh}){
 assert.equal(snapshot?.sync?.status,'ready');assert.equal(snapshot.sync.pending,0);assert.ok(Array.isArray(snapshot.pets)&&snapshot.pets.length===1);
 assert.ok(Array.isArray(notice)&&notice.length<=1);
 const difference=snapshot.sync.sharedSavePending===true;
 if(difference){assert.equal(snapshot.sync.sharedSaveReason,'local-difference');assert.equal(notice.length,1);assert.equal(notice[0].text,'伙伴已保存，其他存档仍有待同步差异。请到账号页查看同步详情。');assert.equal(notice[0].button,'查看同步详情');assert.equal(notice[0].enabled,true);}
 else{assert.equal(snapshot.sync.sharedSavePending,false);assert.equal(notice.length,0);}
 if(refresh){
  assert.equal(refresh.count,1);assert.equal(refresh.ok,true);assert.equal(refresh.settled,true);assert.equal(accountStatus?.running,false);assert.equal(accountStatus.lastError,null);
  if(difference){assert.ok(accountStatus.localChanged===true||accountStatus.preservedLocalRecords>0);assert.match(accountText,/待同步差异|已保留 [1-9]\d* 条本机记录/);}
 }
 return {notice: difference?'explained-local-difference':'none',sameReviewLoop:false};
}
export function assertCSignedoutPrivacy(observation){
 assert.equal(observation?.currentUser,null);assert.equal(observation.authVisible,true);
 for(const key of ['sidebarCount','privateContentCount','visibleDesktopCount'])assert.equal(observation[key],0,key);
 return {signedout:true,privateRoutesHidden:true,visibleDesktopCount:0,priorVisibleDesktopNotEstablished:true};
}
const desktopBindingKeys=['runId','stageIntentId','ownerAccountId','authUserId','deviceId','sessionId','petId','resourceId'];
// These helpers validate observations only. They cannot grant execution authority.
export function assertCDesktopPositive(binding,observation){
 for(const key of desktopBindingKeys)assert.ok(typeof binding?.[key]==='string'&&binding[key],`C_DESKTOP_BINDING_${key}`);
 assert.match(binding.petId,/^[A-Za-z0-9:_-]+$/);
 const {actor,session,host,renderer}=observation;
 for(const key of ['ownerAccountId','authUserId','deviceId','sessionId'])assert.equal(actor?.[key],binding[key],`C_DESKTOP_ACTOR_${key}`);
 assert.equal(session?.currentUser?.id,binding.ownerAccountId);assert.equal(session.currentUser.authUserId,binding.authUserId);assert.equal(session.currentUser.account,plannedCAccount);assert.equal(session.currentUser.authKind,'supabase');assert.equal(session.dataMode,'live');
 assert.equal(host?.currentOwnerAccountId,binding.ownerAccountId);assert.equal(host.pet?.ownerAccountId,binding.ownerAccountId);assert.equal(host.pet.petId,binding.petId);assert.equal(host.pet.resourceId,binding.resourceId);assert.equal(host.pet.desktopVisible,true);
 assert.equal(host.windows?.length,1);assert.equal(host.nativeWindows?.length,1);const owned=host.windows[0],native=host.nativeWindows[0];
 assert.equal(owned.ownerAccountId,binding.ownerAccountId);assert.equal(owned.petId,binding.petId);assert.equal(owned.visible,true);assert.ok(Number.isSafeInteger(owned.windowId)&&owned.windowId>0);assert.equal(native.id,owned.windowId);
 const url=new URL(native.url);assert.equal(url.protocol,'file:');assert.ok(url.pathname.includes('/app.asar/')&&url.pathname.endsWith('/ui/desktop.html'));assert.equal(url.hash,'#/desktop/'+encodeURIComponent(binding.petId));
 assert.equal(native.visible,true);assert.equal(native.destroyed,false);assert.equal(native.minimized,false);assert.equal(native.onDisplay,true);
 assert.equal(renderer?.pageCount,1);assert.equal(renderer.url,native.url);assert.equal(renderer.surfaceCount,1);assert.equal(renderer.petId,binding.petId);assert.equal(renderer.resourceId,binding.resourceId);assert.equal(renderer.visible,true);
 assert.equal(renderer.stageCount,1);assert.equal(renderer.stagePetId,binding.petId);assert.equal(renderer.stageResourceId,binding.resourceId);assert.equal(renderer.status,'ready');assert.equal(renderer.canvasCount,1);assert.equal(renderer.canvasVisible,true);
 // Keep the verified route classification, never the machine's installation path.
 return {...Object.fromEntries(desktopBindingKeys.map(key=>[key,binding[key]])),windowId:owned.windowId,packagedDesktopVerified:true,nativeVisible:true,rendererReady:true,observedAt:new Date().toISOString()};
}
export function assertCDesktopRemoved(binding,positive,observation){
 assert.ok(positive,'C_DESKTOP_POSITIVE_REQUIRED');for(const key of desktopBindingKeys){assert.ok(typeof binding?.[key]==='string'&&binding[key]);assert.equal(positive[key],binding[key],`C_DESKTOP_POSITIVE_${key}`);}
 assert.ok(Number.isSafeInteger(positive.windowId)&&positive.windowId>0);assert.equal(positive.packagedDesktopVerified,true);assert.equal(positive.nativeVisible,true);assert.equal(positive.rendererReady,true);assert.ok(Number.isFinite(Date.parse(positive.observedAt)));
 assert.equal(observation?.windowId,positive.windowId);assert.equal(observation.oldWindowDestroyed,true);assert.equal(observation.visibleDesktopCount,0);
 return {priorVisibleDesktopEstablished:true,oldDesktopWindowDestroyed:true,priorDesktopWindowId:positive.windowId};
}
export function readCDesktopHost({BrowserWindow,screen},binding){
 const h=globalThis.__qaUiCaseContext,services=h?.accounts?.services;
 if(h?.binding?.role!=='c'||!services||services.session.getOwnerAccountId()!==binding.ownerAccountId)throw Error('C_DESKTOP_OWNER_CHANGED');
 const companions=services.get('companions'),pet=companions.readIdentityPet(binding.ownerAccountId,binding.petId),displays=screen.getAllDisplays();
 return {currentOwnerAccountId:services.session.getOwnerAccountId(),pet:{ownerAccountId:pet.ownerAccountId,petId:pet.petId,resourceId:pet.resource.resourceId,desktopVisible:pet.desktop.visible},
  windows:companions.getDesktopWindows().map(w=>({ownerAccountId:w.ownerAccountId,petId:w.petId,windowId:w.windowId,visible:w.visible})),
  nativeWindows:BrowserWindow.getAllWindows().filter(w=>!w.isDestroyed()&&w.webContents.getURL().split('#')[0].endsWith('/desktop.html')).map(w=>{const bounds=w.getBounds();return {id:w.id,url:w.webContents.getURL(),visible:w.isVisible(),destroyed:w.isDestroyed(),minimized:w.isMinimized(),onDisplay:bounds.width>0&&bounds.height>0&&displays.some(d=>bounds.x<d.workArea.x+d.workArea.width&&bounds.x+bounds.width>d.workArea.x&&bounds.y<d.workArea.y+d.workArea.height&&bounds.y+bounds.height>d.workArea.y)};})};
}
export function readCDesktopRenderer(){
 const shown=node=>{if(!node||!node.getClientRects().length)return false;for(let p=node;p;p=p.parentElement){const style=getComputedStyle(p);if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||Number(style.opacity)===0)return false;}const r=node.getBoundingClientRect();return r.width>0&&r.height>0;};
 const surfaces=document.querySelectorAll('.cp-desktop-surface'),surface=surfaces[0],stages=surface?.querySelectorAll('.resource-stage')||[],stage=stages[0],canvases=stage?.querySelectorAll('canvas')||[];
 return {surfaceCount:surfaces.length,petId:surface?.getAttribute('data-pet-id'),resourceId:surface?.getAttribute('data-resource-id'),visible:shown(surface),stageCount:stages.length,stagePetId:stage?.getAttribute('data-pet-id'),stageResourceId:stage?.getAttribute('data-resource-id'),status:stage?.getAttribute('data-status'),canvasCount:canvases.length,canvasVisible:shown(canvases[0])};
}
export function readCSignedoutDesktop({BrowserWindow},windowId){
 const old=windowId===null?null:BrowserWindow.fromId(windowId);
 return {windowId,oldWindowDestroyed:windowId!==null&&(!old||old.isDestroyed()),visibleDesktopCount:BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().includes('/desktop.html')&&w.isVisible()).length};
}
export function assertCExecutionDependencies(deps){
 for(const key of ['assertAuthorization','assertPreloginHold','assertExactAbsence','awaitGrantAndRelease','assertGrant','verifyIdentity','relaunch','assertPersistentProfile','assertExactRevokeTarget','freezeCLogin','prepareNextCredential','beginAuthenticationTransition','assertAuthenticationTransition','finishAuthenticationTransition'])assert.equal(typeof deps?.[key],'function',`C_NOT_READY_${key}`);
 assert.equal(deps.accountKey,plannedCAccount);assert.equal(deps.role,'c');return true;
}
export async function createNewCUiLifecycle({models,dependencies:deps,initialCredential,nextCredential,output,runId}){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1');assertCExecutionDependencies(deps);
 // The holder supplies this verifier from its reviewed module, not from renderer.
 // It MUST verify opaque WeakMap-backed authorization/custody; plain facts are not accepted.
 const custodyModule=await import('./dpapi/authorized-vault-client.mjs');custodyModule.assertCompletionAuthorization(deps.authorization,{permissions:['register-C','login-C','remember-C','password-change-C','revoke-C','business'],caseIds:['A06','A13','A15','A12']});custodyModule.assertAuthorizedVault(deps.vault);const vault=deps.vault;await deps.assertAuthorization('c-lifecycle-prepare');
 const file=join(output,'new-c-ui-lifecycle-evidence.json');assert.ok(!existsSync(file),'NO_UNCERTAIN_REPLAY');
 const proof={runId,scope:'Only approved new C, normal UI register/login/change password, original secure-session vault/restart, exact own-device normal SDK revoke. Not A/B or admin/global signout.',fullCasePassed:false,passed:false,stages:[],startedAt:new Date().toISOString()};
 const save=()=>writeFileSync(file,JSON.stringify(proof,null,2));save();let stopped=false,registered=false,granted=false,changed=false,revoked=false,identity=null,businessBaseline=null,knownInitialCredential=null,authenticationTransition=null,authenticationPhase=null;
 const page=()=>models.c.page;
 async function authorized(stage){assert.ok(!stopped&&!revoked,'C_STOPPED');custodyModule.assertCompletionAuthorization(deps.authorization,{permissions:['register-C','login-C','remember-C','password-change-C','revoke-C','business'],caseIds:['A06','A13','A15','A12']});custodyModule.assertAuthorizedVault(vault);await deps.assertAuthorization(stage);await deps.assertPersistentProfile();if(granted){if(authenticationTransition)await deps.assertAuthenticationTransition(authenticationTransition,{phase:authenticationPhase});else await deps.assertGrant();}}
 async function stage(name,fn){await authorized(name);const order=['A06-register','A13-first-adoption-guidance','A15-persistent-before-password-change','A15-password-negatives','A15-correct-change','A15-persistent-after-password-change','A15-old-new-login','A15-persistent-after-new-login','A12-own-current-session-revoke'];assert.equal(name,order[proof.stages.length],'FIXED_C_STAGE_ORDER');assert.ok(!proof.stages.some(x=>x.name===name),'NO_STAGE_REPLAY');const row={name,intentId:randomUUID(),state:'prepared',startedAt:new Date().toISOString()};proof.stages.push(row);save();try{const result=await fn(row,()=>{row.state='submitted-outcome-unknown';save();});row.state='confirmed';row.result=result;save();return result;}catch{stopped=true;row.state=row.state==='submitted-outcome-unknown'?'unknown-do-not-retry':'failed-before-submit';proof.errorStage=name;save();throw Error('C_STAGE_STOPPED_SEE_PRIVATE_CHECKPOINT');}finally{if(name==='A13-first-adoption-guidance'){try{const captured=await page().evaluate(()=>globalThis.__cAuthObservation?.adoptionIntent);if(row.state==='confirmed')assert.ok(captured?.actionId,'ORIGINAL_ADOPTION_INTENT_REQUIRED');if(captured){row.originalActionId=captured.actionId;row.durableIntent=await models.c.main((_electron,input)=>{const h=globalThis.__qaUiCaseContext;if(!h?.accounts||h.accounts.services.session.getOwnerAccountId()!==input.owner)throw Error('C_NOT_READY');const value=h.accounts.services.db.prepare('SELECT kind,input_hash,result FROM account_actions WHERE owner_account_id=? AND action_id=?').get(input.owner,'companions:'+input.actionId);if(!value)return {found:false};const state=JSON.parse(value.result);return {found:true,sha256:process.getBuiltinModule('node:crypto').createHash('sha256').update(JSON.stringify(value)).digest('hex'),status:['pending','verified','retry','conflict'].includes(state.status)?state.status:'other',sameOriginalIntent:state.input?.actionId===input.actionId,commandIsAdopt:state.command==='adopt'};},{owner:identity.ownerAccountId,actionId:captured.actionId});if(row.state==='confirmed')assert.ok(row.durableIntent.found&&row.durableIntent.sameOriginalIntent&&row.durableIntent.commandIsAdopt&&row.durableIntent.status==='verified');}}catch{stopped=true;row.state='journal-readback-failed';}save();}}}
 async function until(fn,accept,label,timeout=25000){proof.substage=label;save();const end=Date.now()+timeout;while(Date.now()<end){await authorized(label);const value=await fn();const ready=Boolean(accept(value));proof.lastObservation={ready,count:Array.isArray(value)?value.length:null,type:typeof value};save();if(ready)return value;await new Promise(r=>setTimeout(r,200));}throw Error('C_UI_TIMEOUT');}
 async function click(locator){await authorized('normal-ui-click');assert.equal(await locator.count(),1);await locator.click({timeout:15000});}
 async function session(){return models.c.call('accounts','session');}
 async function business(){await exact();return models.c.main((_electron,owner)=>{const h=globalThis.__qaUiCaseContext;if(!h?.accounts||h.accounts.services.session.getOwnerAccountId()!==owner)throw Error('C_NOT_READY');const db=h.accounts.services.db,crypto=process.getBuiltinModule('node:crypto'),out={};for(const table of ['companion_pets','conversation_messages','conversation_memories','battle_reports_v2','battle_reward_receipts']){const rows=db.prepare(`SELECT * FROM ${table} WHERE owner_account_id=?`).all(owner).map(r=>JSON.stringify(r)).sort();out[table]={count:rows.length,sha256:crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex')};}const actions=db.prepare("SELECT action_id,kind,input_hash,result,created_at FROM account_actions WHERE owner_account_id=? AND kind='companions-cloud-command' ORDER BY action_id").all(owner);if(!actions.some(row=>{const value=JSON.parse(row.result);return value.command==='adopt'&&value.status==='verified'&&value.input?.actionId&&row.action_id==='companions:'+value.input.actionId;}))throw Error('ORIGINAL_VERIFIED_ADOPTION_HISTORY_REQUIRED');out.companionActionHistory={count:actions.length,sha256:crypto.createHash('sha256').update(JSON.stringify(actions)).digest('hex')};return out;},identity.ownerAccountId);}
 async function exact(){const s=await session();assert.equal(s.currentUser?.account,plannedCAccount);assert.equal(s.currentUser?.authKind,'supabase');assert.equal(s.dataMode,'live');const got=await deps.verifyIdentity(models.c);if(identity){assert.equal(got.ownerAccountId,identity.ownerAccountId);assert.equal(got.authUserId,identity.authUserId);assert.equal(got.deviceId,identity.deviceId);}return got;}
 async function routeAccount(){await page().evaluate(()=>{location.hash='#/account';});await page().locator('.ac-password-form').waitFor({timeout:20000});await exact();}
 async function remember(){const box=page().getByRole('checkbox',{name:'保持登录',exact:true});assert.equal(await box.isEnabled(),true);if(await box.getAttribute('aria-checked')!=='true')await click(box);assert.equal(await box.getAttribute('aria-checked'),'true');}
 async function secret(cap,operation,fn){await vault.assertCustodyCapability(cap,{slot:'C',operation});return vault.withCredential(cap,async credential=>{assert.equal(credential.accountKey,plannedCAccount);assert.ok(credential.password.length>=6&&credential.password.length<=64);await fn(credential.password);return {ok:true};});}
 async function clearInputs(){const inputs=page().locator('input[type="password"]');for(let i=0;i<await inputs.count();i++)await inputs.nth(i).fill('',{timeout:5000});}
 async function observeInstall(){await page().evaluate(()=>{
  if(globalThis.__cAuthObservation)throw Error('DUPLICATE_OBSERVER');const bridge=window.lingjing,original=bridge.invoke;const state={rows:[],syncRows:[],original};
  const wrapped=async function(feature,command,payload){if(feature==='companions'&&command==='adopt'){if(typeof payload?.actionId!=='string'||!/^[a-zA-Z0-9:_-]+$/.test(payload.actionId))throw Error('MISSING_ORIGINAL_ACTION');state.adoptionIntent={actionId:payload.actionId,state:'submitted-unknown'};}const result=await original.call(this,feature,command,payload);if(feature==='accounts'&&['register','login','passwordChange','logout'].includes(command))state.rows.push({command,ok:result.ok===true,code:['INVALID_CREDENTIALS','INVALID_OLD_PASSWORD','PASSWORD_MISMATCH','ACCOUNT_EXISTS','SESSION_INVALIDATED','SESSION_EXPIRED'].includes(result.code)?result.code:result.ok?'OK':'OTHER'});if(feature==='accounts'&&['syncNow','syncRetry'].includes(command))state.syncRows.push({command,ok:result.ok===true});if(feature==='companions'&&command==='adopt')state.adoptionIntent.state=result.ok?'confirmed':'rejected';return result;};state.wrapped=wrapped;bridge.invoke=wrapped;globalThis.__cAuthObservation=state;
 });}
 async function observed(command,start){return until(()=>page().evaluate(()=>globalThis.__cAuthObservation?.rows||[]),rows=>rows.slice(start).some(r=>r.command===command),'normal-auth-response').then(rows=>{const matching=rows.slice(start).filter(r=>r.command===command);assert.equal(matching.length,1);return matching[0];});}
 async function count(){return page().evaluate(()=>globalThis.__cAuthObservation?.rows.length||0);}
 async function uninstall(){await page().evaluate(()=>{const s=globalThis.__cAuthObservation;if(!s)return;if(window.lingjing.invoke!==s.wrapped)throw Error('OBSERVER_CHANGED');window.lingjing.invoke=s.original;delete globalThis.__cAuthObservation;});}
 async function visibleAuthError(code,button){
  return until(async()=>{const alert=page().locator('.ac-error[role="alert"]');return {code,text:await alert.innerText(),visible:await alert.isVisible(),buttonEnabled:await button.isEnabled()};},value=>{try{return assertCVisibleAuthError(value);}catch{return false;}},'visible-auth-error-and-retry-ready');
 }
 async function guidanceObservation(){
  const snapshot=await models.c.call('companions','list');
  const notice=await page().locator('.cp-cloud-notice').evaluateAll(nodes=>nodes.map(node=>{const button=node.querySelector('button');return {text:node.querySelector('span')?.textContent||'',button:button?.textContent||'',enabled:!!button&&!button.disabled};}));return {snapshot,notice};
 }
 async function observeA12Desktop(binding){
  await authorized('a12-owned-desktop-observation');const actor=await exact(),host=await models.c.main(readCDesktopHost,binding);
  const pages=models.c.pages().filter(p=>p.url().endsWith('/desktop.html#/desktop/'+encodeURIComponent(binding.petId)));
  const renderer=pages.length===1?{...await pages[0].evaluate(readCDesktopRenderer),url:pages[0].url(),pageCount:1}:{pageCount:pages.length};
  await authorized('a12-owned-desktop-observed');return {actor,host,renderer,session:await session()};
 }
 async function prepareA12Desktop(row){
  assert.equal(row.name,'A12-own-current-session-revoke');assert.equal(authenticationTransition,null);assert.equal(row.desktopPreparation,undefined,'C_DESKTOP_PREPARATION_NO_REPLAY');
  const adoption=proof.stages.find(value=>value.name==='A13-first-adoption-guidance');assert.equal(adoption?.state,'confirmed');assert.ok(adoption.durableIntent?.found&&adoption.durableIntent.sameOriginalIntent&&adoption.durableIntent.commandIsAdopt&&adoption.durableIntent.status==='verified');
  await authorized('a12-desktop-prepare');const actor=await exact();assert.deepEqual(await business(),businessBaseline);
  const snapshot=await models.c.call('companions','list');assert.equal(snapshot.ownerAccountId,actor.ownerAccountId);assert.equal(snapshot.sync?.status,'ready');assert.equal(snapshot.sync.pending,0);assert.equal(snapshot.pets.length,1);
  const pet=snapshot.pets[0];assert.equal(pet.ownerAccountId,actor.ownerAccountId);assert.equal(pet.petId,adoption.petId);assert.match(pet.petId,/^[A-Za-z0-9:_-]+$/);assert.equal(pet.resource.kind,'2d');assert.ok(pet.globalSerial);assert.equal(pet.desktop.visible,false,'C_DESKTOP_UNEXPECTED_PREEXISTING_PREFERENCE');
  const binding={runId,stageIntentId:row.intentId,...Object.fromEntries(['ownerAccountId','authUserId','deviceId','sessionId'].map(key=>[key,actor[key]])),petId:pet.petId,resourceId:pet.resource.resourceId};
  row.desktopPreparation={state:'prepared',runId,stageIntentId:row.intentId,petId:pet.petId,clickCount:0};save();
  try{
   const before=await models.c.main(readCDesktopHost,binding);assert.equal(before.windows.length,0);assert.equal(before.nativeWindows.length,0);
   await page().evaluate(id=>{location.hash='#/companions/'+encodeURIComponent(id);},pet.petId);await page().locator(`.cp-detail-layout[data-pet-id="${pet.petId}"]`).waitFor({timeout:15000});
   const button=page().getByRole('button',{name:'开启桌面陪伴',exact:true});await authorized('a12-normal-desktop-click');assert.equal(await button.count(),1);assert.equal(await button.isEnabled(),true);
   // This is a local UI intent, not submission of the later session revocation.
   row.desktopPreparation.state='submitted-outcome-unknown';row.desktopPreparation.clickCount=1;save();await click(button);
   const observation=await until(()=>observeA12Desktop(binding),value=>{try{assertCDesktopPositive(binding,value);return true;}catch{return false;}},'a12-real-owned-desktop-visible');
   const positive=assertCDesktopPositive(binding,observation);assert.deepEqual(await business(),businessBaseline);
   await routeAccount();const latest=assertCDesktopPositive(binding,await observeA12Desktop(binding));assert.equal(latest.windowId,positive.windowId,'C_DESKTOP_WINDOW_REPLACED');
   row.desktopPreparation.state='confirmed';row.desktopPreparation.positive=latest;save();return {binding,positive:latest};
  }catch(error){row.desktopPreparation.state=row.desktopPreparation.clickCount?'unknown-do-not-retry':'failed-before-click';save();throw error;}
 }
 async function signedoutPrivacy(assertReadOnly,desktopEvidence=null){
  // No business API, sign-in, select or mutation. Revisit old routes through the
  // renderer, including browser history, while the account gate must remain.
  const petId=proof.stages.find(row=>row.name==='A13-first-adoption-guidance')?.petId;assert.ok(typeof petId==='string'&&petId);const routes=['#/companions','#/companions/'+encodeURIComponent(petId),'#/chat','#/account'];let checked=0,desktopCleanup=null;
  if(desktopEvidence){const b=desktopEvidence.binding;assert.equal(b.runId,runId);assert.equal(b.stageIntentId,proof.stages.find(row=>row.name==='A12-own-current-session-revoke')?.intentId);assert.equal(b.petId,petId);for(const key of ['ownerAccountId','authUserId','deviceId'])assert.equal(b[key],identity[key]);}
  const inspect=async()=>{
   const end=Date.now()+15000;let passed=false;
   while(Date.now()<end){
    await assertReadOnly();assert.equal((await session()).currentUser,null);await page().locator('.ac-auth').waitFor({timeout:15000});
    const observation=await page().evaluate(()=>{const auth=document.querySelector('.ac-auth');let shown=!!auth&&auth.getClientRects().length>0;for(let node=auth;node&&shown;node=node.parentElement){const style=getComputedStyle(node);if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||Number(style.opacity)===0)shown=false;}return {authVisible:shown,sidebarCount:document.querySelectorAll('.sidebar').length,privateContentCount:document.querySelectorAll('.cp-pet-card,.cp-detail-page,.cp-adoption-page,.cv-root,.ac-password-form,.ac-account-grid').length};});
    const desktops=await models.c.main(readCSignedoutDesktop,desktopEvidence?.positive?.windowId??null),visibleDesktopCount=desktops.visibleDesktopCount;
    await assertReadOnly();const currentUser=(await session()).currentUser;
    try{assertCSignedoutPrivacy({...observation,currentUser,visibleDesktopCount});if(desktopEvidence)desktopCleanup=assertCDesktopRemoved(desktopEvidence.binding,desktopEvidence.positive,desktops);passed=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}
   }
   assert.equal(passed,true,'SIGNEDOUT_PRIVATE_UI_NOT_CLEARED');checked++;
  };
  for(const route of routes){await assertReadOnly();await page().evaluate(value=>{location.hash=value;},route);await inspect();}
  await page().evaluate(()=>history.back());await page().waitForFunction(()=>location.hash==='#/chat');await inspect();
  await page().evaluate(()=>history.forward());await page().waitForFunction(()=>location.hash==='#/account');await inspect();
  return {routeObservations:checked,privateRoutesHidden:true,noVisibleDesktopWindows:true,priorVisibleDesktopNotEstablished:!desktopCleanup,...desktopCleanup};
 }
 async function login(cap,{negative=false}={}){
  await page().getByRole('tab',{name:'登录',exact:true}).waitFor();await click(page().getByRole('tab',{name:'登录',exact:true}));await page().getByLabel('账号',{exact:true}).fill(plannedCAccount);await remember();
  const before=await count();await secret(cap,cap===knownInitialCredential?'login':'password-change',async password=>{await page().getByLabel('密码',{exact:true}).fill(password);await click(page().getByRole('button',{name:'登录进入 →',exact:true}));});
  const response=await observed('login',before);await clearInputs();if(negative){assert.deepEqual(response,{command:'login',ok:false,code:'INVALID_CREDENTIALS'});assert.equal((await session()).currentUser,null);await visibleAuthError(response.code,page().getByRole('button',{name:'登录进入 →',exact:true}));}else{assert.equal(response.ok,true);await until(session,s=>Boolean(s.currentUser),'normal-login-ready');await exact();assert.equal((await session()).persistence,'secure');}return response;
 }
 await observeInstall();
 const api={
  async register(){return stage('A06-register',async(row,submitted)=>{
   assert.ok(!registered);await deps.assertExactAbsence();await deps.assertPreloginHold();assert.equal((await session()).currentUser,null);assert.equal((await session()).secureStorageAvailable,true);
   await click(page().getByRole('tab',{name:'注册',exact:true}));await page().getByLabel('用户名',{exact:true}).fill('专用验收丙');await page().getByLabel('账号',{exact:true}).fill(plannedCAccount);await remember();const before=await count();
   await secret(initialCredential,'register',async password=>{await page().getByLabel('密码',{exact:true}).fill(password);await page().getByLabel('确认密码',{exact:true}).fill(password);await deps.assertPreloginHold();await vault.claimBeforeSend(initialCredential);submitted();await click(page().getByRole('button',{name:'创建账号 →',exact:true}));});
   assert.equal((await observed('register',before)).ok,true);await clearInputs();await until(session,s=>Boolean(s.currentUser),'registered-normal-session');identity=await exact();registered=true;await vault.recordReadback(initialCredential,{outcome:'confirmed',digest:createHash('sha256').update(JSON.stringify({owner:identity.ownerAccountId,auth:identity.authUserId})).digest('hex')});knownInitialCredential=await vault.bindRegisteredC(initialCredential,{accountKey:plannedCAccount,owner:identity.ownerAccountId,authUid:identity.authUserId});nextCredential=await deps.prepareNextCredential(identity);await vault.assertCustodyCapability(nextCredential,{slot:'C',operation:'password-change',owner:identity.ownerAccountId,authUid:identity.authUserId,accountKey:plannedCAccount});assert.equal((await session()).persistence,'secure');
   // Root receives only non-secret verified manifest through the holder adapter.
   await deps.awaitGrantAndRelease(identity,{registeredLoginCredential:knownInitialCredential});granted=true;await deps.assertGrant();return {normalUi:true,secureSession:true,grantReleasedAfterIdentity:true};
  });},
  async firstAdoptionGuidance(){return stage('A13-first-adoption-guidance',async(row,submitted)=>{
   assert.ok(registered&&granted&&!changed);const before=await models.c.call('companions','list');assert.equal(before.pets.length,0);
   await page().evaluate(()=>{location.hash='#/companions/adopt';});await page().locator('.cp-adoption-page').waitFor({timeout:15000});const desktop=page().getByRole('checkbox',{name:'领养后放到桌面',exact:true});if(await desktop.getAttribute('aria-checked')==='true')await click(desktop);
   submitted();await click(page().getByRole('button',{name:'领养这位伙伴',exact:true}));const list=await until(()=>models.c.call('companions','list'),x=>x.pets.length===1,'first-normal-adoption');
   row.adoptionIntent=await page().evaluate(()=>globalThis.__cAuthObservation.adoptionIntent);assert.equal(row.adoptionIntent.state,'confirmed');const pet=list.pets[0];assert.equal(pet.ownerAccountId,identity.ownerAccountId);assert.ok(pet.globalSerial);row.petId=pet.petId;save();
   await page().evaluate(()=>{location.hash='#/companions';});await page().locator(`.cp-pet-card[data-pet-id="${pet.petId}"]`).waitFor({timeout:15000});
   const initial=await until(guidanceObservation,value=>value.snapshot.sync?.status==='ready'&&value.snapshot.sync.pending===0,'first-adoption-readback-ready');
   // Current cloud-authority readback can already clear the old shared-save
   // notice. Do not require an obsolete warning or manufacture a restore loop.
   if(initial.notice.length){assert.equal(initial.notice.length,1);assert.ok(['核对存档','查看同步详情'].includes(initial.notice[0].button));await click(page().getByRole('button',{name:initial.notice[0].button,exact:true}));}
   else{assertCCompanionGuidance(initial);await click(page().locator('.sidebar .account-button'));}
   await page().locator('.ac-password-form').waitFor({timeout:15000});const syncStart=await page().evaluate(()=>globalThis.__cAuthObservation.syncRows.length);
   await click(page().getByRole('button',{name:'刷新云端数据',exact:true}));
   const refresh=await until(async()=>{const rows=await page().evaluate(start=>globalThis.__cAuthObservation.syncRows.slice(start),syncStart),button=page().getByRole('button',{name:'刷新云端数据',exact:true});return {count:rows.length,ok:rows[0]?.ok===true,settled:await button.count()===1&&await button.isEnabled()};},value=>value.count===1&&value.settled,'normal-refresh-completed');
   const accountStatus=await models.c.call('accounts','syncStatus'),accountText=await page().locator('.ac-save-status').innerText();assert.equal(accountStatus.running,false);
   const checks=[];
   for(let revisit=0;revisit<2;revisit++){
    await page().evaluate(()=>{location.hash='#/companions';});await page().locator(`.cp-pet-card[data-pet-id="${pet.petId}"]`).waitFor({timeout:15000});
    const after=await until(guidanceObservation,value=>{try{assertCCompanionGuidance({...value,accountStatus,accountText,refresh});return true;}catch{return false;}},'guidance-closed-after-readback');
    for(const key of ['ownerAccountId','petId','templateId','globalSerial','resource','growth'])assert.deepEqual(after.snapshot.pets[0][key],pet[key]);checks.push(assertCCompanionGuidance({...after,accountStatus,accountText,refresh}));
    if(revisit===0){await click(page().locator('.sidebar .account-button'));await page().locator('.ac-password-form').waitFor({timeout:15000});}
   }
   businessBaseline=await business();return {normalUiAdoption:true,originalPetPreserved:true,initialNotice:initial.notice[0]?.button||'none',normalRefreshSettled:true,readOnlyRevisitChecks:checks,originalNonemptyAdoptionHistory:true};
  });},
  async persistentRestart(phase){assert.ok(['before-password-change','after-password-change','after-new-login'].includes(phase));return stage('A15-persistent-'+phase,async()=>{assert.ok(registered&&granted);await exact();assert.equal((await session()).persistence,'secure');await uninstall();models.c=await deps.relaunch('c',{logout:false});await observeInstall();await until(session,s=>Boolean(s.currentUser),'secure-vault-normal-restore');await exact();assert.equal((await session()).persistence,'secure');assert.ok(businessBaseline,'A13_DATA_BASELINE_REQUIRED');assert.deepEqual(await business(),businessBaseline);return {normalRestartWithoutLogout:true,originalSafeStorage:true};});},
  async passwordNegatives(){return stage('A15-password-negatives',async(row,submitted)=>{assert.ok(registered&&granted&&!changed);await routeAccount();const form=page().locator('.ac-password-form');
   // Deterministic invalid input is not a credential; never print actual candidates.
   for(const kind of ['wrong-old','mismatch']){const before=await count();await secret(knownInitialCredential,'login',async oldPassword=>{await secret(nextCredential,'password-change',async nextPassword=>{await form.getByLabel('当前密码',{exact:true}).fill(kind==='wrong-old'?oldPassword.slice(0,-1)+(oldPassword.endsWith('!')?'?':'!'):oldPassword);await form.getByLabel('新密码',{exact:true}).fill(nextPassword);await form.getByLabel('确认新密码',{exact:true}).fill(kind==='mismatch'?nextPassword.slice(0,-1)+(nextPassword.endsWith('!')?'?':'!'):nextPassword);submitted();await click(form.getByRole('button',{name:'保存密码',exact:true}));});});const result=await observed('passwordChange',before);assert.equal(result.ok,false);assert.equal(result.code,kind==='wrong-old'?'INVALID_OLD_PASSWORD':'PASSWORD_MISMATCH');await visibleAuthError(result.code,form.getByRole('button',{name:'保存密码',exact:true}));await clearInputs();await exact();}return {wrongOldRejected:true,mismatchRejected:true,visibleErrorsAndButtonsVerified:true};});},
  async changePassword(){return stage('A15-correct-change',async(row,submitted)=>{assert.ok(registered&&granted&&!changed);await routeAccount();const form=page().locator('.ac-password-form'),before=await count();await secret(knownInitialCredential,'login',async oldPassword=>{await secret(nextCredential,'password-change',async nextPassword=>{await form.getByLabel('当前密码',{exact:true}).fill(oldPassword);await form.getByLabel('新密码',{exact:true}).fill(nextPassword);await form.getByLabel('确认新密码',{exact:true}).fill(nextPassword);await vault.assertCustodyCapability(nextCredential,{slot:'C',operation:'password-change'});await vault.claimBeforeSend(nextCredential);submitted();await click(form.getByRole('button',{name:'保存密码',exact:true}));});});assert.equal((await observed('passwordChange',before)).ok,true);await page().getByText('密码已更新。',{exact:true}).waitFor({timeout:15000});await clearInputs();changed=true;await exact();assert.deepEqual(await business(),businessBaseline);await vault.recordReadback(nextCredential,{outcome:'confirmed',digest:createHash('sha256').update('normal-ui-password-change-confirmed:'+identity.ownerAccountId).digest('hex')});return {newCandidateSealedBeforeSubmit:true,normalUi:true};});},
  async verifyOldRejectedNewAccepted(){return stage('A15-old-new-login',async(row,submitted)=>{
   assert.ok(changed);await routeAccount();assert.equal(authenticationTransition,null);
   authenticationTransition=await deps.beginAuthenticationTransition({stage:'A15-old-new-login',intentId:row.intentId});authenticationPhase='logout';
   submitted();await click(page().getByRole('button',{name:'退出登录',exact:true}));await until(session,s=>!s.currentUser,'normal-logout-cleared');
   // The holder observes completion of the original normal logout, never sends
   // a second logout, and admits only this exact C authentication transition.
   await deps.assertAuthenticationTransition(authenticationTransition,{phase:'old-login'});authenticationPhase='old-login';
   const privacy=await signedoutPrivacy(()=>authorized('normal-logout-private-routes'));
   await login(knownInitialCredential,{negative:true});await deps.assertAuthenticationTransition(authenticationTransition,{phase:'new-login'});authenticationPhase='new-login';
   await login(nextCredential);await deps.finishAuthenticationTransition(authenticationTransition);authenticationTransition=null;authenticationPhase=null;
   await deps.assertGrant();assert.deepEqual(await business(),businessBaseline);return {oldRejected:true,newAccepted:true,secureSession:true,normalLogoutConfirmed:true,privateUi:privacy,originalNonemptyAdoptionHistory:true};
  });},
  async revokeCurrentSession(){return stage('A12-own-current-session-revoke',async(row,submitted)=>{assert.ok(changed);await exact();const desktopEvidence=await prepareA12Desktop(row);await deps.freezeCLogin();const target=await deps.assertExactRevokeTarget(models.c);for(const key of ['ownerAccountId','authUserId','deviceId','sessionId'])assert.equal(target[key],desktopEvidence.binding[key]);submitted();const result=await models.c.main(async({BrowserWindow},input)=>{
    const handle=globalThis.__qaUiCaseContext;if(!handle?.accounts||handle.bindingDigest!==input.bindingDigest)throw Error('C_NOT_READY');const context=await handle.accounts.requireCloudActor(),actor=context.actor||context;for(const key of ['ownerAccountId','authUserId','deviceId','sessionId'])if(actor[key]!==input[key])throw Error('REVOKE_TARGET_CHANGED');
    const owned=handle.accounts.services.get('companions').getDesktopWindows().filter(w=>w.windowId===input.desktopWindowId&&w.petId===input.desktopPetId&&w.ownerAccountId===actor.ownerAccountId&&w.visible===true),window=BrowserWindow.fromId(input.desktopWindowId);
    if(owned.length!==1||!window||window.isDestroyed()||!window.isVisible()||!window.webContents.getURL().endsWith('/desktop.html#/desktop/'+encodeURIComponent(input.desktopPetId)))throw Error('C_DESKTOP_POSITIVE_LOST_BEFORE_REVOKE');
    const response=await context.client.rpc('lingjing_revoke_device',{p_device_id:actor.deviceId});if(response.error||response.data?.revoked!==true)throw Error('REVOKE_UNCONFIRMED');return {revoked:true};
   },{...target,desktopWindowId:desktopEvidence.positive.windowId,desktopPetId:desktopEvidence.binding.petId});assert.equal(result.revoked,true);
   // Real normal UI protected operation, not an internal invalidate-session call.
   await page().getByRole('button',{name:'刷新云端数据',exact:true}).click({timeout:10000});const end=Date.now()+25000;while((await session()).currentUser&&Date.now()<end){custodyModule.assertCompletionAuthorization(deps.authorization,{permissions:['register-C','login-C','remember-C','password-change-C','revoke-C','business'],caseIds:['A06','A13','A15','A12']});await new Promise(r=>setTimeout(r,200));}assert.equal((await session()).currentUser,null);await page().locator('.ac-auth').waitFor({timeout:15000});const privacy=await signedoutPrivacy(async()=>{custodyModule.assertCompletionAuthorization(deps.authorization,{permissions:['register-C','login-C','remember-C','password-change-C','revoke-C','business'],caseIds:['A06','A13','A15','A12']});custodyModule.assertAuthorizedVault(vault);await deps.assertAuthorization('revoked-c-readonly-private-routes');await deps.assertPersistentProfile();assert.equal((await session()).currentUser,null);},desktopEvidence);revoked=true;return {normalOwnSdk:true,actualReauthenticationUi:true,privateUi:privacy};});},
  async close(){try{await uninstall();proof.observerRestored=true;}catch{proof.observerRestored=false;stopped=true;}finally{proof.passed=proof.observerRestored===true&&proof.stages.length===9&&proof.stages.every(s=>s.state==='confirmed');proof.completedAt=new Date().toISOString();save();}return proof;}
 };
 return Object.freeze(api);
}
