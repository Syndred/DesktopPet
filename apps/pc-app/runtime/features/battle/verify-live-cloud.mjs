import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

// Credentials are an ignored, coordinator-controlled input file, never CLI literals/evidence.
const input=process.env.LINGJING_CLOUD_BATTLE_INPUT;
const friendsOnly=process.argv.includes('--friends-only');
const reopenIndex=process.argv.indexOf('--reopen-proof'),reopenPath=reopenIndex>=0?process.argv[reopenIndex+1]:null;
const reopenProof=reopenPath?JSON.parse(readFileSync(resolve(reopenPath),'utf8')):null;
if(reopenIndex>=0){assert.ok(reopenPath);assert.equal(reopenProof?.passed,true);assert.equal(reopenProof.projectRef,'jbvrdmrkwpznbrvteive');assert.equal(reopenProof.provenance,'real-HTTPS-and-Realtime-acceptance');}
const resumeIndex=process.argv.indexOf('--resume-duel-proof'),resumePath=resumeIndex>=0?process.argv[resumeIndex+1]:null;
const resumeProof=resumePath?JSON.parse(readFileSync(resolve(resumePath),'utf8')):null;
if(resumeIndex>=0){assert.ok(resumePath);assert.ok(!reopenProof);assert.equal(resumeProof?.projectRef,'jbvrdmrkwpznbrvteive');assert.equal(resumeProof.provenance,'real-HTTPS-and-Realtime-acceptance');const pushes=resumeProof.steps.find(step=>step.name==='both actual private channels delivered server round/room pushes');assert.equal(pushes?.pushes?.length,2);assert.ok(pushes.pushes.every(value=>value.events.some(event=>event.type==='round-updated')));const terminal=resumeProof.steps.findLast(step=>/^real HTTPS round \d+ matches on both clients$/.test(step.name));assert.ok(terminal&&(terminal.playerHp===0||terminal.enemyHp===0));}
const revokeIndex=process.argv.indexOf('--resume-device-proof'),revokePath=revokeIndex>=0?process.argv[revokeIndex+1]:null;
const revokeProof=revokePath?JSON.parse(readFileSync(resolve(revokePath),'utf8')):null;
if(revokeIndex>=0){assert.ok(revokePath);assert.ok(!reopenProof&&!resumeProof);assert.equal(revokeProof?.projectRef,'jbvrdmrkwpznbrvteive');assert.equal(revokeProof.provenance,'real-HTTPS-and-Realtime-acceptance');assert.ok(revokeProof.steps.some(step=>step.name==='second same-owner native client naturally resumed cloud training through actual UI moves; both share canonical growth/inventory/report'&&step.reward.applied));}
assert.ok(input,'Set LINGJING_CLOUD_BATTLE_INPUT to the private acceptance input file');
const inputBytes=readFileSync(resolve(input),'utf8');
const decoded=input.endsWith('.dpapi')?execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"[Console]::InputEncoding=[Text.Encoding]::UTF8;[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);Add-Type -AssemblyName System.Security;[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String([Console]::In.ReadToEnd()),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))"],{input:inputBytes,encoding:'utf8',windowsHide:true}):inputBytes;
const config=JSON.parse(decoded);assert.equal(config.testOnly,true,'Designated test accounts only');
assert.equal(config.projectRef,'jbvrdmrkwpznbrvteive');
assert.equal(config.url,'https://jbvrdmrkwpznbrvteive.supabase.co');
assert.ok(config.publishableKey?.startsWith('sb_publishable_'),'Only the verified modern publishable key is accepted');
assert.equal(config.accounts?.length,2);assert.notEqual(config.accounts[0].account,config.accounts[1].account);
for(const account of config.accounts)assert.ok(account.account&&account.password&&account.petId,'Provide two authorized cloud accounts and server-owned pet IDs');
const runId=randomUUID(),output=resolve('artifacts/battle',`live-${Date.now()}-${runId.slice(0,8)}`),project=join(output,'application');
const runtime=resolve('apps/pc-app/runtime'),overlay=join(project,'apps/pc-app/runtime');mkdirSync(overlay,{recursive:true});
cpSync(runtime,overlay,{recursive:true,filter:source=>source!==join(runtime,'assets')});symlinkSync(join(runtime,'assets'),join(overlay,'assets'),'junction');
cpSync(resolve('apps/pc-app/dist'),join(project,'apps/pc-app/dist'),{recursive:true});
writeFileSync(join(project,'package.json'),JSON.stringify({name:'lingjing-real-cloud-battle-acceptance',version:'0.0.0',main:'bootstrap.cjs'}));
writeFileSync(join(project,'bootstrap.cjs'),`
const fs=require('node:fs');
globalThis.__liveBattleRequire=require;
const trace=process.env.LINGJING_BATTLE_TRACE,origin=${JSON.stringify(config.url)};
globalThis.__liveBattleTrace=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async function(input,options={}) {
  const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url);
  const headers=new Headers(input?.headers||{});new Headers(options.headers||{}).forEach((v,k)=>headers.set(k,v));
  const cloud=url.pathname.startsWith('/functions/v1/')||url.pathname.startsWith('/auth/v1/')||url.pathname.startsWith('/rest/v1/');
  if(cloud&&url.origin!==origin)throw new Error('Cloud acceptance refused a different or non-HTTPS origin');
  let op;try{op=JSON.parse(typeof options.body==='string'?options.body:'{}').op;}catch{}
  const start=Date.now(),response=await originalFetch(input,options);
  if(cloud){const entry={at:new Date().toISOString(),origin:url.origin,path:url.pathname,op,status:response.status,authorizationPresent:headers.has('authorization'),deviceHeaderPresent:headers.has('x-lingjing-device-id'),elapsedMs:Date.now()-start};globalThis.__liveBattleTrace.push(entry);fs.appendFileSync(trace,JSON.stringify(entry)+'\\n');}
  // A controlled response-read interruption after a real HTTPS submit. This does not
  // fabricate a reply or alter game state; the server's actual receipt must reconcile it.
  if(globalThis.__dropBattleResponseOnce&&['submit_action','training_action'].includes(op)) {globalThis.__dropBattleResponseOnce=false;await response.body?.cancel();}
  return response;
};
const {OnlineDuelService}=require('./apps/pc-app/runtime/services/online-duel-service.cjs');
const servicesModule=require('./apps/pc-app/runtime/core/services.cjs'),createServices=servicesModule.createServices;
servicesModule.createServices=options=>{const services=createServices(options);globalThis.__liveBattleServices=services;return services;};
const subscribe=OnlineDuelService.prototype.subscribeRoom;
OnlineDuelService.prototype.subscribeRoom=async function(...args){globalThis.__liveBattle=this;if(!this.__acceptanceObserved){this.__acceptanceObserved=true;this.onEvent(event=>{if(event.type==='realtime-status'){globalThis.__liveBattleStatuses??=[];globalThis.__liveBattleStatuses.push(event);}if(event.payload?.source==='realtime'){globalThis.__liveBattlePushes??=[];globalThis.__liveBattlePushes.push({type:event.type,at:event.at,roomId:event.payload.room?.id,round:event.payload.round?.round_no});}});}return subscribe.apply(this,args);};
require('./apps/pc-app/dist/main/index.cjs');
`);
const apps=new Map(),profiles={},errors=[],steps=[];
const proof={runId,at:new Date().toISOString(),provenance:'real-HTTPS-and-Realtime-acceptance',scope:friendsOnly?'friend-duel-only; training/device-revoke remain pending':'friend-duel, training, recovery and device-revoke',projectRef:config.projectRef,origin:config.url,machineCount:1,physicalDevices:1,concurrentDuelPlayers:2,independentProfiles:friendsOnly?2:3,statement:'Two isolated duel clients plus an optional fresh same-account recovery client on the same Windows host; not two physical devices. Test faults cancel a real response read and close the real SDK socket; no mock authority or simulated location is used.',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceDirty:execFileSync('git',['status','--short'],{encoding:'utf8'}).trim(),build:JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json','utf8')),steps,errors};
if(reopenProof)Object.assign(proof,{scope:'after-retirement: real Auth/HTTPS/private-channel and persisted completed report reopen only',priorFullAcceptance:resolve(reopenPath),concurrentDuelPlayers:0,independentProfiles:1,statement:'One fresh isolated native profile reopens the prior fully accepted cloud battle using the final retired transport, then restarts with persisted Auth. This scoped check does not claim another complete duel/training/revocation run.'});
if(resumeProof)Object.assign(proof,{scope:'resume immutable completed cloud duel: report/reward restart, natural training takeover and device-only revoke',priorDuelProof:{path:resolve(resumePath),sha256:createHash('sha256').update(readFileSync(resolve(resumePath))).digest('hex'),runId:resumeProof.runId,sourceCommit:resumeProof.sourceCommit,fullRunPassed:resumeProof.passed,priorFailure:resumeProof.failure?.message,completedScope:'actual invite/join, response loss, refresh/reconnect, pending-action native restart, ten natural immutable rounds and actual private-channel pushes'},statement:'Continue the same designated owners and completed cloud room through fresh isolated native profiles. Earlier duel phases retain their original failed-run proof and source commit; this run independently rereads the actual terminal room/rewards, then checks the remaining report/training/revocation flow. One Windows host, not two physical devices.'});
if(revokeProof)Object.assign(proof,{scope:'remaining device-only revoke stage on actual completed duel/training owners',priorTrainingProof:{path:resolve(revokePath),sha256:createHash('sha256').update(readFileSync(resolve(revokePath))).digest('hex'),runId:revokeProof.runId,sourceCommit:revokeProof.sourceCommit,fullRunPassed:revokeProof.passed,priorFailure:revokeProof.failure?.message,priorDuelProof:revokeProof.priorDuelProof},independentProfiles:2,concurrentDuelPlayers:0,statement:'Two fresh native profiles of the same designated owner reread its completed training/report. One revokes the other actual device, then the captured still-valid JWT must fail REST/private Realtime while the remaining device succeeds. Earlier duel/training phases keep their original proofs and commits. One Windows host.'});
const save=()=>writeFileSync(join(output,'evidence.json'),JSON.stringify(proof,null,2));
const record=(name,details={})=>{steps.push({at:new Date().toISOString(),name,...details});save();console.log(name);};
const api=async(page,feature,command,payload={})=>{const result=await page.evaluate(({feature,command,payload})=>window.lingjing.invoke(feature,command,payload),{feature,command,payload});assert.equal(result.ok,true,`${feature}.${command}: ${result.code} ${result.message}`);return result.data;};
async function launch(index,accountIndex=index) {
  let profile=profiles[index];
  if(!profile){const directory=join(output,`device-${index+1}`);mkdirSync(directory);profile=profiles[index]={directory,accountIndex};writeFileSync(join(directory,'.lingjing-live-battle-profile.json'),JSON.stringify({schemaVersion:1,runId,profilePath:realpathSync(directory),purpose:'real-cloud-battle-acceptance',simulated:false}),{flag:'wx'});}accountIndex=profile.accountIndex;
  const env={...process.env,PET_USER_DATA_DIR:profile.directory,LINGJING_SUPABASE_URL:config.url,LINGJING_SUPABASE_PUBLISHABLE_KEY:config.publishableKey,SUPABASE_URL:config.url,SUPABASE_PUBLISHABLE_KEY:config.publishableKey,SUPABASE_ANON_KEY:config.publishableKey,LINGJING_BATTLE_TRACE:join(output,`device-${index+1}-https.jsonl`)};
  delete env.LINGJING_QA_SCENARIO;delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({args:[project],env});apps.set(index,app);const page=await app.firstWindow();const window=await app.browserWindow(page);await window.evaluate(win=>win.setContentSize(1280,844,false));page.on('pageerror',error=>errors.push({device:index+1,message:error.message}));await page.waitForFunction(()=>Boolean(window.lingjing));
  const existing=await api(page,'accounts','session');
  if(profile.loggedIn)assert.ok(existing.currentUser,'Native restart must restore persisted Auth; do not silently sign in again');
  else {await api(page,'accounts','login',{provider:'runtime',account:config.accounts[accountIndex].account,password:config.accounts[accountIndex].password,rememberSession:true});profile.loggedIn=true;const preview=await api(page,'accounts','cloudPreview');await api(page,'accounts','backupRestore',{previewId:preview.previewId,mode:'replace',actionId:randomUUID()});}
  const identity=await api(page,'accounts','session');assert.ok(identity.currentUser);assert.notEqual(identity.dataMode,'simulated');profile.owner=identity.currentUser.ownerAccountId||identity.currentUser.id;
  const info=await api(page,'app','info');assert.ok(!info.scenario,'Do not run the foundation simulated QA transport in a real-cloud test');assert.equal(info.runtime.electron,'44.9.3');
  const inventory=await api(page,'companions','list');profile.pet=inventory.pets.find(pet=>(pet.petId||pet.id)===config.accounts[accountIndex].petId);assert.ok(profile.pet,'Restore the verified cloud-owned companion before running acceptance; never inject a local fake actor');
  return {app,page,index,profile,accountIndex};
}
async function route(page,path){await page.evaluate(path=>{location.hash=path;},path);}
async function screen(page,waiting=false) {
  await page.locator('[data-battle-screen="shared-v1"]').waitFor();
  await page.waitForFunction(count=>document.querySelectorAll('.battle-stage .resource-stage[data-status="ready"]').length===count,waiting?1:2);
  const id=await page.locator('[data-battle-screen]').getAttribute('data-session-id'),session=await api(page,'battle','snapshot',{sessionId:id});assert.equal(session.mode,'friend');assert.notEqual(session.context?.authority,'simulated');return session;
}
async function friendLobby(client){const overview=await api(client.page,'battle','overview');assert.equal(overview.selectedPetId,config.accounts[client.accountIndex].petId,'Use the existing legitimately cloud-selected pet; no local-only selection is injected');await route(client.page,'/battle/friends');await client.page.locator('.battle-friends-layout').waitFor();await client.page.locator('.battle-invitations').getByRole('button',{name:'刷新',exact:true}).click();}
async function connection(client) {
  const result=await client.app.evaluate(()=>{const online=globalThis.__liveBattle||globalThis.__liveBattleServices?.legacy?.onlineDuelService;if(!online)throw new Error('No actual OnlineDuelService observed');const value=online.getStatus();return {origin:online.supabaseUrl,authKind:value.authKind,actor:value.actor?{authority:value.actor.authority,authUserId:value.actor.authUserId,ownerAccountId:value.actor.ownerAccountId,deviceId:value.actor.deviceId,sessionId:value.actor.sessionId}:null,socket:online.client.realtime.connectionState(),channel:online.channel?.state,manualToken:online.client.realtime._isManualToken()};});
  assert.equal(result.origin,config.url);assert.equal(result.authKind,'supabase');assert.equal(result.actor.authority,'live');assert.equal(result.actor.ownerAccountId,client.profile.owner);assert.equal(result.manualToken,false);return result;
}
async function joined(client) {
  let state;for(let attempt=0;attempt<60;attempt++){state=await connection(client);if(state.socket==='open'&&state.channel==='joined')return state;await new Promise(resolve=>setTimeout(resolve,250));}
  const events=await client.app.evaluate(()=>globalThis.__liveBattleStatuses?.slice(-10)||[]);
  assert.fail(`Real private Realtime channel did not join: ${JSON.stringify({state,events})}`);
}
async function pendingAction(client,sessionId,roundNo) {
  for(let attempt=0;attempt<150;attempt++){const value=await api(client.page,'battle','snapshot',{sessionId});if(value.pendingAction?.roundNo===roundNo)return value;await client.page.waitForTimeout(200);}
  assert.fail('The actual queued action never reached a durable pending receipt');
}
async function resolvedRound(client,sessionId,roundNo) {
  for(let attempt=0;attempt<20;attempt++){const value=await api(client.page,'battle','sync',{sessionId});if(value.snapshot.round>=roundNo)return value;await client.page.waitForTimeout(200);}
  assert.fail('Both immutable cloud actions did not resolve their original round');
}
const screenshot=async(page,name)=>page.screenshot({path:join(output,`${name}.png`)});
async function refreshAndDisconnect(client) {
  const refreshed=await client.app.evaluate(async()=>{
    const accounts=globalThis.__liveBattleServices.get('accounts'),before=accounts.remote.active,online=globalThis.__liveBattle;
    const sdk=online.client,next=await accounts.remote.refresh(before);await sdk.realtime.setAuth();
    return {sameOwner:next.actor.ownerAccountId===before.actor.ownerAccountId,sameSession:next.actor.sessionId===before.actor.sessionId,tokenRotated:next.accessToken!==before.accessToken,sameSdk:sdk===online.client,manualToken:sdk.realtime._isManualToken()};
  });
  assert.equal(refreshed.sameOwner,true);assert.equal(refreshed.sameSession,true);assert.equal(refreshed.sameSdk,true);assert.equal(refreshed.manualToken,false);
  record('actual Auth refresh retains the same SID-bound SDK and callback auth mode',refreshed);
  await client.app.evaluate(()=>globalThis.__liveBattle.client.realtime.disconnect());
}
async function revokeAndVerify(revoked,other,roomId) {
  const descriptor=await revoked.app.evaluate(async()=>{
    const services=globalThis.__liveBattleServices,accounts=services.get('accounts'),actor=await services.get('cloudActor').requireActor();
    // Main-memory only. No token/client object reaches the renderer or evidence.
    globalThis.__revokedBattleRead={token:accounts.remote.active.accessToken,url:actor.url,key:actor.publishableKey,deviceId:actor.deviceId};
    return {deviceId:actor.deviceId,sessionId:actor.sessionId,ownerAccountId:actor.ownerAccountId};
  });
  await other.app.evaluate(async(_electron,{deviceId})=>{const actor=await globalThis.__liveBattleServices.get('cloudActor').requireActor();const value=await actor.client.rpc('lingjing_revoke_device',{p_device_id:deviceId});if(value.error)throw new Error(value.error.message);},descriptor);
  const denied=await revoked.app.evaluate(async(_electron,{roomId})=>{
    const state=globalThis.__revokedBattleRead,headers={apikey:state.key,Authorization:'Bearer '+state.token,'X-Lingjing-Device-Id':state.deviceId};
    const paths=[`/rest/v1/lingjing_battle_rooms?id=eq.${roomId}&select=id`,`/rest/v1/lingjing_battle_rounds?room_id=eq.${roomId}&select=round_no`];
    const rest=[];for(const path of paths){const response=await fetch(state.url+path,{headers});const body=await response.json();rest.push({status:response.status,code:body.code,message:body.message});}
    const authResponse=await fetch(state.url+'/auth/v1/user',{headers}),auth=await authResponse.json();
    const {createClient}=globalThis.__liveBattleRequire('@supabase/supabase-js');
    // Independent real SDK probe keeps the captured valid-but-revoked JWT in a
    // callback; production account SDK refresh/logout behavior remains intact.
    const probe=createClient(state.url,state.key,{accessToken:async()=>state.token,global:{headers:{'X-Lingjing-Device-Id':state.deviceId}}});
    await new Promise(resolve=>setImmediate(resolve));await probe.realtime.setAuth();
    const topic=probe.channel('lingjing:battle:'+roomId,{config:{private:true}});
    const realtime=await new Promise(resolve=>{const timer=setTimeout(()=>resolve('TIMEOUT'),15000);topic.subscribe(status=>{if(['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){clearTimeout(timer);resolve(status);}});});
    await probe.removeChannel(topic);probe.realtime.disconnect();delete globalThis.__revokedBattleRead;
    return {rest,authJwtStillValid:authResponse.status===200&&Boolean(auth.id),realtime};
  },{roomId});
  assert.equal(denied.authJwtStillValid,true,'Test device-only revocation while the original JWT is still valid');
  assert.ok(denied.rest.every(row=>[401,403].includes(row.status)&&/LJ_(DEVICE_SESSION_REQUIRED|SESSION_REVOKED)/.test(String(row.message))));
  assert.equal(denied.realtime,'CHANNEL_ERROR','Require an actual server channel denial');
  const allowed=await other.app.evaluate(async(_electron,{roomId})=>{
    const actor=await globalThis.__liveBattleServices.get('cloudActor').requireActor(),result=await actor.client.from('lingjing_battle_rooms').select('id').eq('id',roomId);
    if(result.error)throw new Error(result.error.message);
    const channel=actor.client.channel('lingjing:battle:'+roomId,{config:{private:true}});
    const realtime=await new Promise(resolve=>{const timer=setTimeout(()=>resolve('TIMEOUT'),15000);channel.subscribe(status=>{if(['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){clearTimeout(timer);resolve(status);}});});await actor.client.removeChannel(channel);
    return {roomCount:result.data.length,realtime,deviceId:actor.deviceId};
  },{roomId});
  assert.equal(allowed.roomCount,1);assert.equal(allowed.realtime,'SUBSCRIBED');assert.notEqual(allowed.deviceId,descriptor.deviceId);
  record('actual device-only revoke denies old JWT REST/private Realtime while another same-owner device stays authorized',{roomId,revoked:descriptor,denied,allowed});
}
let failure;
try {
  if(revokeProof){
    const revoked=await launch(0),other=await launch(1,0),prior=revokeProof.steps.find(step=>step.roomId),training=revokeProof.steps.find(step=>step.sessionId&&step.reward?.applied);assert.equal(revoked.profile.owner,other.profile.owner);assert.equal(revoked.profile.owner,revokeProof.profiles[0].owner);
    const trainingReport=await api(revoked.page,'battle','getReport',{reportId:training.sessionId});assert.deepEqual(await api(other.page,'battle','getReport',{reportId:training.sessionId}),trainingReport);assert.equal(trainingReport.reward.applied,true);
    await route(revoked.page,`/battle/session/online-${prior.roomId}`);await screen(revoked.page);await api(revoked.page,'battle','sync',{sessionId:`online-${prior.roomId}`});const authorized=await joined(revoked);profiles[0].deviceId=authorized.actor.deviceId;
    const otherDevice=await other.app.evaluate(async()=>{const actor=await globalThis.__liveBattleServices.get('cloudActor').requireActor();return {ownerAccountId:actor.ownerAccountId,deviceId:actor.deviceId};});assert.notEqual(otherDevice.deviceId,profiles[0].deviceId);profiles[1].deviceId=otherDevice.deviceId;record('same-owner native devices reread the prior accepted cloud training/report before device-only revoke',{roomId:prior.roomId,trainingSessionId:training.sessionId,authorized,otherDevice});
    await revokeAndVerify(revoked,other,prior.roomId);
  } else if(reopenProof){
    const client=await launch(0),roomId=reopenProof.steps.find(step=>step.roomId)?.roomId;
    assert.ok(roomId);const prior=reopenProof.sqlite.find(value=>value.owner===client.profile.owner),saved=prior?.reports.find(value=>value.session_id===`online-${roomId}`);assert.ok(saved,'The designated account must own the prior accepted report');
    const report=await api(client.page,'battle','getReport',{reportId:saved.id});await route(client.page,`/battle/session/${saved.session_id}`);await screen(client.page);const session=await api(client.page,'battle','sync',{sessionId:saved.session_id});assert.equal(session.status,'finished');assert.equal(session.reward.applied,true);assert.equal(session.pendingAction,null);
    const authorized=await joined(client),retired=await client.app.evaluate(()=>{const online=globalThis.__liveBattle;return {functionName:online.functionName,legacyPasswordMethods:['registerAccount','loginAccount','updateAccount'].filter(name=>typeof online[name]==='function'),hasLegacyKeyField:Object.hasOwn(online,'supabaseAnonKey')};});assert.equal(retired.functionName,'lingjing-battle');assert.deepEqual(retired.legacyPasswordMethods,[]);assert.equal(retired.hasLegacyKeyField,false);await screenshot(client.page,'after-retirement-completed-battle');
    await client.app.close();apps.delete(0);const restarted=await launch(0);assert.deepEqual(await api(restarted.page,'battle','getReport',{reportId:saved.id}),report);record('final retired transport reopened the actual completed cloud battle/private channel and preserved report/Auth across native restart',{roomId,reportId:saved.id,authorized,retired});
  } else {
  let host=await launch(0);const guest=await launch(1);assert.notEqual(host.profile.owner,guest.profile.owner);let left,right,round=0;const observed=[[],[]];
  if(resumeProof){
    const prior=resumeProof.steps.find(step=>step.roomId),terminal=resumeProof.steps.findLast(step=>/^real HTTPS round \d+ matches on both clients$/.test(step.name)),sessionId=`online-${prior.roomId}`;
    assert.equal(host.profile.owner,prior.a.actor.ownerAccountId);assert.equal(guest.profile.owner,prior.b.actor.ownerAccountId);
    for(const client of [host,guest]){await route(client.page,`/battle/session/${sessionId}`);await screen(client.page);}
    left=await api(host.page,'battle','sync',{sessionId});right=await api(guest.page,'battle','sync',{sessionId});assert.equal(left.snapshot.player.hp,terminal.playerHp);assert.equal(left.snapshot.enemy.hp,terminal.enemyHp);assert.equal(left.snapshot.player.hp,right.snapshot.enemy.hp);assert.equal(left.snapshot.enemy.hp,right.snapshot.player.hp);round=left.snapshot.round;assert.ok(round>2);assert.equal(right.snapshot.round,round);
    const a=await joined(host),b=await joined(guest);profiles[0].deviceId=a.actor.deviceId;profiles[1].deviceId=b.actor.deviceId;record('fresh actual native clients reread the original immutable completed cloud duel and both pet-bound applied rewards',{roomId:prior.roomId,rounds:round,a,b,priorDuelRunId:resumeProof.runId});
  } else {
  await friendLobby(guest);await friendLobby(host);
  await host.page.getByLabel('搜索账号或用户名',{exact:true}).fill(config.accounts[1].account);await host.page.getByRole('button',{name:'搜索',exact:true}).click();await host.page.locator('.battle-user-list .battle-small-action').click();
  await guest.page.locator('.battle-invitations').getByRole('button',{name:'刷新',exact:true}).click();await guest.page.getByRole('button',{name:'接受',exact:true}).click();await screen(guest.page,true);await screenshot(guest.page,'accepted-waiting');
  await host.page.locator('.battle-invitations').getByRole('button',{name:'刷新',exact:true}).click();await host.page.getByRole('button',{name:'进入房间',exact:true}).click();left=await screen(host.page);right=await screen(guest.page);assert.equal(left.room.id,right.room.id);assert.equal(left.player.petId,right.enemy.petId);
  const a=await joined(host),b=await joined(guest);assert.notEqual(a.actor.authUserId,b.actor.authUserId);assert.notEqual(a.actor.deviceId,b.actor.deviceId);profiles[0].deviceId=a.actor.deviceId;profiles[1].deviceId=b.actor.deviceId;record('two real JWT/device clients invited, accepted and joined one authorized Realtime room',{roomId:left.room.id,a,b});
  for(const client of [host,guest])await client.page.evaluate(()=>{window.__liveBattleEvents=[];window.lingjing.subscribe('battle:online',value=>window.__liveBattleEvents.push(value));});
  while(left.status!=='finished'&&round<30) {
    const next=left.snapshot.round+1;for(const client of [host,guest])await client.page.waitForFunction(round=>document.querySelector('.battle-live-layout')?.getAttribute('data-animation-phase')==='rest'&&document.querySelector('.battle-round-number > span')?.textContent?.trim()===`回合 ${round}`,next);
    if(round===0)await host.app.evaluate(()=>{globalThis.__dropBattleResponseOnce=true;});
    if(round===1){await refreshAndDisconnect(host);record('real SDK WebSocket deliberately disconnected after Auth refresh');}
    await host.page.locator('.battle-command[data-action="normal_attack"]').click();
    let pending=await pendingAction(host,left.id,next);assert.equal(pending.pendingAction.action,'normal_attack');
    if(round===0){const original=pending.pendingAction.actionId;for(let attempt=0;attempt<100;attempt++){if(await host.app.evaluate(()=>globalThis.__dropBattleResponseOnce===false))break;await host.page.waitForTimeout(200);}assert.equal(await host.app.evaluate(()=>globalThis.__dropBattleResponseOnce),false,'A real HTTPS response must have reached the interrupted read');pending=await api(host.page,'battle','snapshot',{sessionId:left.id});assert.equal(pending.pendingAction.actionId,original);assert.equal(pending.pendingAction.roundNo,next);record('actual submit response was interrupted after HTTPS receipt; original pending action retained',{actionId:original,roundNo:next,reconciledByReadback:!pending.pendingAction.uncertain});}
    if(round===1){await host.app.evaluate(()=>globalThis.__liveBattle.client.realtime.connect());await api(host.page,'battle','sync',{sessionId:left.id});const reconnected=await joined(host);record('same native process recreated its authorized private channel through normal sync after reconnect',reconnected);}
    if(round===2){await screenshot(host.page,'pending-before-native-restart');await host.app.close();apps.delete(0);}
    await guest.page.locator('.battle-command[data-action="normal_attack"]').click();
    if(round===2){host=await launch(0);await route(host.page,`/battle/session/${left.id}`);await screen(host.page);const recovered=await api(host.page,'battle','sync',{sessionId:left.id});const reconnected=await joined(host);assert.equal(reconnected.actor.deviceId,profiles[0].deviceId);let retriedOriginal=false;if(recovered.pendingAction){assert.equal(recovered.pendingAction.actionId,pending.pendingAction.actionId);assert.equal(recovered.pendingAction.roundNo,next);if(recovered.pendingAction.uncertain){await host.page.getByRole('button',{name:'重试',exact:true}).click();retriedOriginal=true;}}record('native process restart restored original device/Auth and original action; unresolved delivery retried through the UI',{...reconnected,actionId:pending.pendingAction.actionId,retriedOriginal});}
    left=await resolvedRound(host,left.id,next);right=await resolvedRound(guest,right.id,next);assert.equal(left.snapshot.round,next);assert.equal(right.snapshot.round,next);assert.equal(left.snapshot.player.hp,right.snapshot.enemy.hp);assert.equal(left.snapshot.enemy.hp,right.snapshot.player.hp);assert.equal(left.pendingAction,null);assert.equal(right.pendingAction,null);
    await assert.rejects(api(host.page,'battle','retryAction',{sessionId:left.id}),/没有待确认/);assert.equal((await api(host.page,'battle','sync',{sessionId:left.id})).snapshot.round,next);round++;
    record(`real HTTPS round ${next} matches on both clients`,{roomId:left.room.id,playerHp:left.snapshot.player.hp,enemyHp:left.snapshot.enemy.hp,actions:left.rounds.at(-1).actions});
  }
  assert.equal(left.status,'finished');assert.equal(right.status,'finished');assert.ok(round>2);assert.equal(left.reward.applied,true);assert.equal(right.reward.applied,true);assert.notEqual(left.winner,right.winner);
  const pushes=[];for(const client of [host,guest]){const delivered=await client.app.evaluate(()=>globalThis.__liveBattlePushes||[]);assert.ok(delivered.some(event=>event.type==='round-updated'&&event.roomId),`Player ${client.index+1} must receive actual private-channel Postgres round events, beyond HTTPS readback`);pushes.push({device:client.index+1,events:delivered});}record('both actual private channels delivered server round/room pushes', {pushes});
  }
  assert.equal(left.status,'finished');assert.equal(right.status,'finished');assert.equal(left.reward.applied,true);assert.equal(right.reward.applied,true);assert.notEqual(left.winner,right.winner);
  const before=[(await api(host.page,'companions','list')).pets,(await api(guest.page,'companions','list')).pets];for(const client of [host,guest]){const session=client.index===0?left:right;await api(client.page,'battle','retrySettlement',{sessionId:session.id});await api(client.page,'battle','retrySettlement',{sessionId:session.id});assert.deepEqual((await api(client.page,'companions','list')).pets,before[client.index]);}
  await screenshot(host.page,'finished-host');await screenshot(guest.page,'finished-guest');
  for(const client of [host,guest]) {
    const session=client.index===0?left:right,report=await api(client.page,'battle','getReport',{reportId:session.reportId});await client.page.getByRole('button',{name:'战报',exact:true}).click();await client.page.getByRole('region',{name:'战报详情'}).waitFor();await screenshot(client.page,`report-${client.index+1}`);await client.app.close();apps.delete(client.index);const restarted=await launch(client.index);const restored=await api(restarted.page,'battle','getReport',{reportId:session.reportId});assert.deepEqual(restored,report);observed[client.index]=report.rounds;
  }
  assert.equal(observed[0].length,round);assert.equal(observed[1].length,round);record('two completed cloud reports survive native restart; repeated settlement leaves both inventories/growth unchanged',{rounds:round,leftReward:left.reward,rightReward:right.reward});
  // The third isolated profile is the first player's account, used only for
  // recovery/growth readback. It never becomes an opponent for that owner.
  if(!friendsOnly) {
  host={app:apps.get(0),page:await apps.get(0).firstWindow(),index:0,accountIndex:0,profile:profiles[0]};
  const guestApp=apps.get(1);if(guestApp){await guestApp.close();apps.delete(1);}
  let training=await api(host.page,'battle','startTraining',{actionId:randomUUID(),petId:config.accounts[0].petId,enemyElement:'fire'});
  assert.equal(training.context.authority,'supabase');await route(host.page,`/battle/session/${training.id}`);await host.page.locator('[data-battle-screen="shared-v1"]').waitFor();
  const recovery=await launch(2,0);assert.equal(recovery.profile.owner,host.profile.owner);
  const overview=await api(recovery.page,'battle','overview');assert.equal(overview.session.id,training.id);assert.equal(overview.session.context.authority,'supabase');
  await route(recovery.page,`/battle/session/${training.id}`);await recovery.page.locator('[data-battle-screen="shared-v1"]').waitFor();await recovery.page.locator('.battle-stage .resource-stage[data-status="ready"] canvas').first().waitFor();await screenshot(recovery.page,'training-recovered-on-second-device');
  const recoveryActor=await connection(recovery),hostActor=await connection(host);assert.notEqual(recoveryActor.actor.deviceId,hostActor.actor.deviceId);assert.equal(recoveryActor.actor.authUserId,hostActor.actor.authUserId);
  recovery.profile.deviceId=recoveryActor.actor.deviceId;
  let count=0;
  while(training.status==='active'&&count<100) {
    const next=training.snapshot.round+1,action=training.snapshot.player.anger>=50?'ultimate':'element_attack';
    await recovery.page.waitForFunction(round=>document.querySelector('.battle-live-layout')?.getAttribute('data-animation-phase')==='rest'&&document.querySelector('.battle-round-number > span')?.textContent?.trim()===`回合 ${round}`,next);
    await recovery.page.locator(`.battle-command[data-action="${action}"]`).click();
    for(let attempt=0;attempt<150;attempt++){training=await api(recovery.page,'battle','snapshot',{sessionId:training.id});if(training.snapshot.round>=next)break;await recovery.page.waitForTimeout(200);}assert.equal(training.snapshot.round,next);
    const synced=await api(host.page,'battle','sync',{sessionId:training.id});assert.deepEqual(synced.snapshot,training.snapshot);count++;
  }
  assert.equal(training.status,'finished');assert.equal(training.reward.applied,true);assert.ok(count>1);
  const grown=(await api(host.page,'companions','list')).pets,otherGrown=(await api(recovery.page,'companions','list')).pets;assert.deepEqual(otherGrown,grown);
  const originalPet=before[0].find(pet=>pet.petId===config.accounts[0].petId),grownPet=grown.find(pet=>pet.petId===config.accounts[0].petId);assert.equal(grownPet.growth.experience-originalPet.growth.experience,training.reward.experience);
  const inventory=async client=>client.app.evaluate(()=>{const services=globalThis.__liveBattleServices,owner=services.get('accounts').getOwnerAccountId();return {items:services.db.prepare('SELECT item_id,quantity FROM garden_items WHERE owner_account_id=? ORDER BY item_id').all(owner),receipts:services.db.prepare('SELECT source,receipt_id,action_id FROM garden_reward_receipts WHERE owner_account_id=? ORDER BY source,receipt_id').all(owner)};});
  const inventoryA=await inventory(host);assert.deepEqual(await inventory(recovery),inventoryA);assert.ok(inventoryA.receipts.some(row=>row.receipt_id===training.id));assert.equal(training.reward.seeds.quantity,2);
  const trainingReport=await api(host.page,'battle','getReport',{reportId:training.reportId});assert.deepEqual(await api(recovery.page,'battle','getReport',{reportId:training.reportId}),trainingReport);
  await recovery.page.waitForFunction(()=>document.querySelector('.battle-live-layout')?.getAttribute('data-animation-phase')==='rest');await screenshot(recovery.page,'cloud-training-finished');record('second same-owner native client naturally resumed cloud training through actual UI moves; both share canonical growth/inventory/report',{sessionId:training.id,rounds:count,reward:training.reward,deviceIds:[hostActor.actor.deviceId,recoveryActor.actor.deviceId]});
  await revokeAndVerify(host,recovery,left.room.id);
  }
  }
  assert.deepEqual(errors,[]);proof.passed=true;
} catch(error){failure=error;proof.passed=false;proof.failure={message:error.message,stack:error.stack};for(const [index,app] of apps)try{await screenshot(await app.firstWindow(),`failure-${index+1}`);}catch{}}
finally {
  for(const app of apps.values())await app.close().catch(()=>{});proof.profiles=Object.entries(profiles).map(([index,value])=>({index,profilePath:value.directory,owner:value.owner,deviceId:value.deviceId}));proof.sqlite=[];
  for(const profile of Object.values(profiles)) {
    const marker=JSON.parse(readFileSync(join(profile.directory,'.lingjing-live-battle-profile.json'),'utf8'));assert.equal(marker.profilePath,realpathSync(profile.directory));assert.equal(marker.runId,runId);
    const file=join(profile.directory,'lingjing.sqlite');if(!existsSync(file)){proof.sqlite.push({profile:profile.directory,status:'database-not-created'});continue;}const db=new DatabaseSync(file,{readOnly:true});db.exec('PRAGMA query_only=ON');
    proof.sqlite.push({owner:profile.owner,rewards:db.prepare('SELECT owner_account_id,session_id,pet_id,action_id FROM battle_reward_receipts').all(),reports:db.prepare('SELECT id,session_id,owner_account_id FROM battle_reports_v2').all()});db.close();
  }
  save();console.log(JSON.stringify({output,passed:proof.passed,steps:steps.length,errors:errors.length,failure:failure?.message}));
}
if(failure)throw failure;
