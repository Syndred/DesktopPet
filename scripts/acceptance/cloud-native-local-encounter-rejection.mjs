// M06 only: audited SFX, official fresh offline QA, simulated location and natural battle.
// No cloud identity, clock/stat mutation, forced outcome or SQL writes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,basename} from 'node:path';
import {launchPortableSession} from './portable-session.mjs';
import {pollState} from './poll-state.mjs';
import {sha256} from '../release/release-store.mjs';
const require=createRequire(import.meta.url),{MARKER,SCENARIO}=require('../../apps/pc-app/runtime/core/qa-scenario.cjs');
const option=name=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const config=JSON.parse(readFileSync('scripts/release/electron-builder.pc.json')),version=JSON.parse(readFileSync('package.json')).version,build=JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json'));
const executable=resolve(option('executable')||join(config.directories.output,`Lingjing-${version}-portable-x64.exe`)),expectedSource=option('source')||build.sourceCommit;
assert.ok(process.platform==='win32'&&process.env.GITHUB_ACTIONS==='true');assert.match(expectedSource,/^[a-f0-9]{40}$/);
const output=resolve('artifacts/foundation/cloud-engineering/localRejection',`run-${Date.now()}`);mkdirSync(output,{recursive:true});
const profile=realpathSync.native(mkdtempSync(join(tmpdir(),'lingjing-localRejection-'))),runId=randomUUID(),secret=`Qa-${randomUUID()}!`,account=`qa_rejection_${runId.slice(0,8)}`;
writeFileSync(join(profile,MARKER),JSON.stringify({schemaVersion:1,application:'lingjing',scenario:SCENARIO,runId,isolated:true,profilePath:realpathSync.native(profile),createdAt:new Date().toISOString()}),{flag:'wx'});
const offlineConfig=join(profile,'offline-public.json');writeFileSync(offlineConfig,'{}',{flag:'wx'});
const systemKeys=new Set(['PATH','PATHEXT','SYSTEMROOT','SYSTEMDRIVE','WINDIR','COMSPEC','TEMP','TMP','TMPDIR','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMFILES','PROGRAMFILES(X86)','PROGRAMW6432','LANG','LC_ALL','CI']);
const offlineEnvironment=Object.fromEntries(Object.keys(process.env).filter(key=>!systemKeys.has(key.toUpperCase())).map(key=>[key,undefined]));Object.assign(offlineEnvironment,{LINGJING_QA_SCENARIO:SCENARIO,LINGJING_PUBLIC_CONFIG:offlineConfig});
const proof={scope:'M06: official simulated-local escape, natural defeat, natural 30-minute expiry, UI return and original-intent rejection. No GPS/cloud/tile requests or clock/stat mutations.',sourceCommit:expectedSource,compiledFingerprint:build.compiledFingerprint,exeSha256:await sha256(executable),cases:[],passed:false,startedAt:new Date().toISOString()};
let model,uncertain=false,owner;const pids=new Set();const redact=()=> 'LOCAL_REJECTION_ACCEPTANCE_FAILED_SEE_STAGE';const save=()=>writeFileSync(join(output,'evidence.json'),JSON.stringify(proof,null,2));
function alive(pid){try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}}
async function stop(){if(model){proof.offlineBlocked=(proof.offlineBlocked||[]);proof.offlineBlocked.push(await model.main(()=>globalThis.__localRejectionOfflineBlocked).catch(()=>({observation:'unavailable'})));await Promise.race([model.stop(),new Promise((_,reject)=>setTimeout(()=>reject(Error('OWNED_STOP_TIMEOUT')),15000))]);}if(uncertain)throw Error('Launch outcome/PID unknown; keep temporary profile');proof.pidChecks=await pollState(()=>[...pids].map(pid=>({pid,alive:alive(pid)})),rows=>rows.every(row=>!row.alive),{timeoutMs:10000,intervalMs:200,label:'Owned process still alive; keep temporary profile'});model=null;}
async function launch(){uncertain=true;model=await launchPortableSession({executable,profile,expectedSource,label:'localRejection-qa',environment:offlineEnvironment});for(const pid of[model.launcherPid,model.runtime.pid])if(Number.isInteger(pid)&&pid>0)pids.add(pid);uncertain=false;assert.equal(model.info.build.compiledFingerprint,build.compiledFingerprint);assert.deepEqual(model.info.build.sourceDirtyFiles,[]);assert.equal((await model.call('accounts','session')).scenario?.runId,runId);await model.main(({session})=>{
  globalThis.__localRejectionOfflineBlocked={node:0,fetch:0,websocket:0,chromium:0};
  const denied=kind=>{globalThis.__localRejectionOfflineBlocked[kind]++;throw Error('OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN');};
  const local=value=>{try{const host=typeof value==='string'||value instanceof URL?new URL(String(value)).hostname:value?.hostname||value?.host||'localhost';return ['localhost','127.0.0.1','::1','[::1]'].includes(String(host).split(':').length===2?String(host).split(':')[0]:String(host));}catch{return false;}};
  for(const name of['node:http','node:https']){const mod=process.getBuiltinModule(name);for(const method of['request','get']){const original=mod[method];mod[method]=function(input,...args){if(!local(input))return denied('node');return original.call(this,input,...args);};}}
  for(const name of['node:net','node:tls']){const transport=process.getBuiltinModule(name);transport.connect=()=>denied('node');if(transport.createConnection)transport.createConnection=()=>denied('node');}
  process.getBuiltinModule('node:http2').connect=()=>denied('node');
  const fetchOriginal=globalThis.fetch;globalThis.fetch=function(input,...args){if(!local(input?.url||input)){globalThis.__localRejectionOfflineBlocked.fetch++;return Promise.reject(Object.assign(Error('OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN'),{code:'OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN'}));}return fetchOriginal.call(this,input,...args);};
  if(globalThis.WebSocket){const Original=globalThis.WebSocket;globalThis.WebSocket=class extends Original{constructor(url,...args){if(!local(url))denied('websocket');super(url,...args);}};}
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_details,callback)=>{globalThis.__localRejectionOfflineBlocked.chromium++;callback({cancel:true});});
 });}
async function step(id,coverage,fn){const row={id,coverage,status:'running',startedAt:new Date().toISOString()};proof.cases.push(row);save();try{Object.assign(row,await fn());row.status='passed-original-scope-offline';}catch(error){row.status='failed';row.error=redact(error);try{await model.page.screenshot({path:join(output,id+'-failed.png'),timeout:10000});}catch{}throw error;}finally{row.completedAt=new Date().toISOString();save();}}
async function route(path){proof.stage=path.startsWith('/discovery/encounter/')?'route-existing-encounter':path.startsWith('/discovery/wild/')?'route-existing-spawn':path==='/companions'?'route-companions':'route-discovery';save();await model.page.evaluate(path=>{location.hash='#'+path;},path);await model.page.waitForFunction(path=>location.hash==='#'+path,path);const current=model.page.locator(`.app-page-motion[data-route-key="${path}"][data-current-route="true"]`);await current.waitFor();if(path.startsWith('/discovery/encounter/'))await current.locator('[data-battle-screen="shared-v1"][data-session-id]').waitFor();else await current.locator('h1').first().waitFor();assert.equal(await current.getByText('页面暂时遇到问题',{exact:true}).count(),0);}
async function register(account,password,name){const page=model.page;await page.getByRole('tab',{name:'注册',exact:true}).click();await page.getByLabel('用户名',{exact:true}).fill(name);await page.locator('input[autocomplete="username"]').fill(account);await page.getByLabel('密码',{exact:true}).fill(password);await page.getByLabel('确认密码',{exact:true}).fill(password);await page.getByRole('button',{name:'创建账号 →',exact:true}).click();await page.getByRole('navigation',{name:'主导航',exact:true}).waitFor();const session=await model.call('accounts','session');assert.equal(session.dataMode,'simulated');assert.ok(session.currentUser.id.startsWith(`qa:${runId}:`));return session.currentUser.id;}

async function receipts(encounterId,sessionId){return model.main(({app},input)=>{
 const fs=process.getBuiltinModule('node:fs'),path=process.getBuiltinModule('node:path');
 if(fs.realpathSync.native(app.getPath('userData')).toLowerCase()!==fs.realpathSync.native(input.profile).toLowerCase())throw Error('Wrong owned profile');
 const req=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json');
 const db=new(req('better-sqlite3'))(path.join(input.profile,'lingjing.sqlite'),{readonly:true,fileMustExist:true});
 try{db.pragma('query_only=ON');const parse=row=>row?JSON.parse(row.data_json):null;
  return {encounter:parse(db.prepare('SELECT data_json FROM discovery_encounters WHERE owner_account_id=? AND encounter_id=?').get(input.owner,input.encounterId)),capture:parse(db.prepare('SELECT data_json FROM discovery_captures WHERE owner_account_id=? AND encounter_id=?').get(input.owner,input.encounterId)),battle:parse(db.prepare('SELECT data_json FROM battle_sessions WHERE owner_account_id=? AND id=?').get(input.owner,input.sessionId)),action:db.prepare('SELECT result_json FROM discovery_actions WHERE owner_account_id=? AND action_id=?').get(input.owner,'context:'+input.sessionId),rewardRows:db.prepare('SELECT * FROM battle_reward_receipts WHERE owner_account_id=? ORDER BY session_id').all(input.owner),captureCount:db.prepare('SELECT count(*) n FROM discovery_captures WHERE owner_account_id=?').get(input.owner).n};
 }finally{db.close();}
},{profile,owner,encounterId,sessionId});}
const deadline=Date.now()+50*60*1000;
function timeBudget(){assert.ok(Date.now()<deadline,'NATIVE_DEADLINE');}
async function raw(feature,command,payload){return model.page.evaluate(({feature,command,payload})=>window.lingjing.invoke(feature,command,payload),{feature,command,payload});}
let session,encounterId,spawn,player,wood;
async function begin(){
 timeBudget();await route('/discovery');await model.call('discovery','setExploring',{active:true});
 const nearby=await model.call('discovery','qaTarget',{templateId:wood.templateId});spawn=nearby.spawns.find(s=>s.templateId===wood.templateId&&s.inRange);assert.ok(spawn);
 await route('/discovery/wild/'+spawn.id);await model.page.getByRole('button',{name:'开始挑战',exact:true}).click();
 const screen=model.page.locator('[data-battle-screen="shared-v1"][data-battle-mode="wild"]');await screen.waitFor();
 const id=await screen.getAttribute('data-session-id');session=await model.call('battle','snapshot',{sessionId:id});assert.equal(session.status,'active');assert.equal(session.player.petId,player.petId);assert.equal(session.context.authority,'simulated');
 const state=await model.call('discovery','snapshot');const encounter=state.encounters.find(e=>e.battle?.battleId===id);assert.ok(encounter);encounterId=encounter.encounterId;
 assert.equal((await receipts(encounterId,id)).capture,null);return encounter;
}
async function roundToEnd(action,winner){
 const rounds=[],end=Date.now()+8*60*1000;
 for(let n=0;n<80&&session.status==='active';n++){
  timeBudget();assert.ok(Date.now()<end);assert.ok(!session.pendingAction);
  await model.page.waitForFunction(()=>document.querySelector('[data-animation-phase]')?.getAttribute('data-animation-phase')==='rest');
  const actualAction=action==='dodge'&&session.snapshot.player.freeDodgeUsed&&session.snapshot.player.anger<=0?'normal_attack':action;
  const choice=model.page.locator('.battle-move.battle-command.'+actualAction);assert.equal(await choice.count(),1);await pollState(()=>choice.isEnabled(),Boolean,{timeoutMs:20000,label:'Natural action unavailable'});
  const before=session.snapshot.round;await choice.click();session=await pollState(()=>model.call('battle','snapshot',{sessionId:session.id}),s=>s.snapshot.round===before+1,{timeoutMs:20000,label:'Natural round unresolved'});
  assert.equal(session.snapshot.round,before+1);await model.page.waitForFunction(round=>Number(document.querySelector('.battle-stage')?.getAttribute('data-round'))===round,session.snapshot.round);
  rounds.push({round:session.snapshot.round,action:actualAction,status:session.status});proof.activeRounds=rounds;save();
 }
 assert.equal(session.status,'finished');assert.equal(session.winner,winner);assert.ok(!session.pendingAction);return rounds;
}
async function returnSame(status){
 await route('/companions');await route('/discovery/encounter/'+encounterId);
 await model.page.locator('[data-session-id="'+session.id+'"]').waitFor();
 const state=await model.call('discovery','snapshot');assert.equal(state.encounters.find(e=>e.encounterId===encounterId)?.status,status);
 const current=await model.call('battle','snapshot',{sessionId:session.id});assert.equal(current.id,session.id);assert.equal(current.status,session.status);assert.ok(!current.pendingAction);
}
async function deniedCapture(code){
 const payload={sessionId:session.id,actionId:'context:'+session.id,name:spawn.name};
 const before=await receipts(encounterId,session.id),pets=(await model.call('companions','list')).pets;
 for(let n=0;n<2;n++){
  const response=await raw('battle','settleContext',payload);assert.equal(response.ok,false);assert.equal(response.code||response.error?.code,code);
  assert.deepEqual(await receipts(encounterId,session.id),before);assert.deepEqual((await model.call('companions','list')).pets,pets);
 }
 assert.equal(before.capture,null);assert.equal(before.captureCount,0);return {originalActionId:payload.actionId,code,attempts:2,noCapture:true,receiptsAndPetsUnchanged:true};
}
try{
 await launch();owner=await register(account,secret,'野外拒绝验收');
 const roster=await model.call('companions','list'),metal=roster.templates.find(t=>t.element==='metal');wood=roster.templates.find(t=>t.element==='wood');assert.ok(metal&&wood);
 player=(await model.call('companions','adopt',{templateId:metal.templateId,name:metal.name,showOnDesktop:false,actionId:randomUUID()})).pet;
 await model.call('battle','selectPet',{petId:player.petId,actionId:randomUUID()});
 await step('M06-escape','Actual UI leave confirmation, return same abandoned session, original capture intent denied twice',async()=>{
  await begin();await returnSame('challenging');
  await model.page.getByRole('button',{name:'离开',exact:true}).click();const dialog=model.page.getByRole('dialog',{name:'离开对战',exact:true});await dialog.getByRole('button',{name:'离开',exact:true}).click();
  session=await pollState(()=>model.call('battle','snapshot',{sessionId:session.id}),s=>s.status==='abandoned',{timeoutMs:15000,label:'Leave not committed'});
  await returnSame('cancelled');assert.equal(await model.page.getByRole('button',{name:'收服',exact:true}).count(),0);
  const result=await deniedCapture('VICTORY_REQUIRED');await model.page.screenshot({path:join(output,'M06-escape.png'),timeout:10000});return result;
 });
 await step('M06-defeat','Natural UI dodge strategy until real enemy victory, return and deny capture without another settlement',async()=>{
  await begin();const rounds=await roundToEnd('dodge','enemy');await returnSame('lost');assert.equal(await model.page.getByRole('button',{name:'收服',exact:true}).count(),0);
  const result=await deniedCapture('VICTORY_REQUIRED');await model.page.screenshot({path:join(output,'M06-defeat.png'),timeout:10000});return {...result,rounds};
 });
 await step('M06-expiry','Natural win then real createdAt + 30 minutes, fresh same QA position, UI original confirmation rejects expiry',async()=>{
  const encounter=await begin();const rounds=await roundToEnd('element_attack','player');await returnSame('won');
  const original=(await model.call('discovery','snapshot')).location.fix;assert.ok(original?.source==='simulated');
  assert.ok(Number.isSafeInteger(encounter.createdAt)&&encounter.createdAt<=Date.now());
  const expiresAfter=encounter.createdAt+30*60*1000;proof.wait={createdAt:encounter.createdAt,expiresAfter,startedAt:Date.now()};save();
  await route('/companions');
  while(Date.now()<=expiresAfter+1000){timeBudget();await new Promise(resolve=>setTimeout(resolve,Math.min(15000,Math.max(1,expiresAfter+1001-Date.now()))));proof.wait.observedAt=Date.now();save();}
  await returnSame('won');await model.call('discovery','setExploring',{active:true});const located=await model.call('discovery','locate');
  assert.equal(located.location.fix.source,'simulated');assert.equal(located.location.fix.lat,original.lat);assert.equal(located.location.fix.lng,original.lng);assert.equal(located.location.status,'ready');
  const before=await receipts(encounterId,session.id),pets=(await model.call('companions','list')).pets;
  await model.page.getByRole('button',{name:'收服',exact:true}).click();const dialog=model.page.getByRole('dialog',{name:'收服伙伴',exact:true});
  await dialog.getByRole('button',{name:'确认',exact:true}).click();await dialog.getByText('这次相遇已超过 30 分钟，请重新探索',{exact:true}).waitFor();
  assert.deepEqual(await receipts(encounterId,session.id),before);assert.deepEqual((await model.call('companions','list')).pets,pets);
  const result=await deniedCapture('ENCOUNTER_EXPIRED');await model.page.screenshot({path:join(output,'M06-expired.png'),timeout:10000});
  await dialog.getByRole('button',{name:'返回探索',exact:true}).click();await returnSame('won');
  assert.deepEqual(await receipts(encounterId,session.id),before);return {...result,rounds,wait:proof.wait,nativeUiError:true,sameFixedQaPosition:true};
 });assert.equal(proof.cases.length,3);proof.passed=proof.cases.every(row=>row.status==='passed-original-scope-offline');
}catch(error){proof.error=redact(error);proof.passed=false;process.exitCode=1;}
finally{
 try{await stop();proof.ownedProcessStopped=true;}catch(error){proof.stopError=redact(error);proof.passed=false;process.exitCode=1;}
 try{assert.equal(dirname(profile),realpathSync.native(tmpdir()));assert.ok(basename(profile).startsWith('lingjing-localRejection-'));assert.ok(proof.ownedProcessStopped);rmSync(profile,{recursive:true,force:true});proof.temporaryProfileRemoved=true;}catch(error){proof.cleanupError=redact(error);proof.passed=false;process.exitCode=1;}
 proof.completedAt=new Date().toISOString();save();console.log(JSON.stringify({output,passed:proof.passed,error:proof.error}));
}
