// M05 only: audited SFX, official fresh offline QA, simulated location and natural battle.
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
const output=resolve('artifacts/foundation/cloud-engineering/localCapture',`run-${Date.now()}`);mkdirSync(output,{recursive:true});
const profile=realpathSync.native(mkdtempSync(join(tmpdir(),'lingjing-localCapture-'))),runId=randomUUID(),secret=`Qa-${randomUUID()}!`,account=`qa_capture_${runId.slice(0,8)}`;
writeFileSync(join(profile,MARKER),JSON.stringify({schemaVersion:1,application:'lingjing',scenario:SCENARIO,runId,isolated:true,profilePath:realpathSync.native(profile),createdAt:new Date().toISOString()}),{flag:'wx'});
const offlineConfig=join(profile,'offline-public.json');writeFileSync(offlineConfig,'{}',{flag:'wx'});
const systemKeys=new Set(['PATH','PATHEXT','SYSTEMROOT','SYSTEMDRIVE','WINDIR','COMSPEC','TEMP','TMP','TMPDIR','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMFILES','PROGRAMFILES(X86)','PROGRAMW6432','LANG','LC_ALL','CI']);
const offlineEnvironment=Object.fromEntries(Object.keys(process.env).filter(key=>!systemKeys.has(key.toUpperCase())).map(key=>[key,undefined]));Object.assign(offlineEnvironment,{LINGJING_QA_SCENARIO:SCENARIO,LINGJING_PUBLIC_CONFIG:offlineConfig});
const proof={scope:'M05: actual audited Windows SFX; official simulated-local encounter, natural UI battle and capture. No real GPS, global numbering or cloud claim.',sourceCommit:expectedSource,compiledFingerprint:build.compiledFingerprint,exeSha256:await sha256(executable),cases:[],passed:false,startedAt:new Date().toISOString()};
let model,uncertain=false,owner;const pids=new Set();const redact=()=> 'LOCAL_CAPTURE_ACCEPTANCE_FAILED_SEE_STAGE';const save=()=>writeFileSync(join(output,'evidence.json'),JSON.stringify(proof,null,2));
function alive(pid){try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}}
async function stop(){if(model){proof.offlineBlocked=(proof.offlineBlocked||[]);proof.offlineBlocked.push(await model.main(()=>globalThis.__localCaptureOfflineBlocked).catch(()=>({observation:'unavailable'})));await Promise.race([model.stop(),new Promise((_,reject)=>setTimeout(()=>reject(Error('OWNED_STOP_TIMEOUT')),15000))]);}if(uncertain)throw Error('Launch outcome/PID unknown; keep temporary profile');proof.pidChecks=await pollState(()=>[...pids].map(pid=>({pid,alive:alive(pid)})),rows=>rows.every(row=>!row.alive),{timeoutMs:10000,intervalMs:200,label:'Owned process still alive; keep temporary profile'});model=null;}
async function launch(){uncertain=true;model=await launchPortableSession({executable,profile,expectedSource,label:'localCapture-qa',environment:offlineEnvironment});for(const pid of[model.launcherPid,model.runtime.pid])if(Number.isInteger(pid)&&pid>0)pids.add(pid);uncertain=false;assert.equal(model.info.build.compiledFingerprint,build.compiledFingerprint);assert.deepEqual(model.info.build.sourceDirtyFiles,[]);assert.equal((await model.call('accounts','session')).scenario?.runId,runId);await model.main(({session})=>{
  globalThis.__localCaptureOfflineBlocked={node:0,fetch:0,websocket:0,chromium:0};
  const denied=kind=>{globalThis.__localCaptureOfflineBlocked[kind]++;throw Error('OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN');};
  const local=value=>{try{const host=typeof value==='string'||value instanceof URL?new URL(String(value)).hostname:value?.hostname||value?.host||'localhost';return ['localhost','127.0.0.1','::1','[::1]'].includes(String(host).split(':').length===2?String(host).split(':')[0]:String(host));}catch{return false;}};
  for(const name of['node:http','node:https']){const mod=process.getBuiltinModule(name);for(const method of['request','get']){const original=mod[method];mod[method]=function(input,...args){if(!local(input))return denied('node');return original.call(this,input,...args);};}}
  for(const name of['node:net','node:tls']){const transport=process.getBuiltinModule(name);transport.connect=()=>denied('node');if(transport.createConnection)transport.createConnection=()=>denied('node');}
  process.getBuiltinModule('node:http2').connect=()=>denied('node');
  const fetchOriginal=globalThis.fetch;globalThis.fetch=function(input,...args){if(!local(input?.url||input)){globalThis.__localCaptureOfflineBlocked.fetch++;return Promise.reject(Object.assign(Error('OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN'),{code:'OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN'}));}return fetchOriginal.call(this,input,...args);};
  if(globalThis.WebSocket){const Original=globalThis.WebSocket;globalThis.WebSocket=class extends Original{constructor(url,...args){if(!local(url))denied('websocket');super(url,...args);}};}
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_details,callback)=>{globalThis.__localCaptureOfflineBlocked.chromium++;callback({cancel:true});});
 });}
async function step(id,coverage,fn){const row={id,coverage,status:'running',startedAt:new Date().toISOString()};proof.cases.push(row);save();try{Object.assign(row,await fn());row.status='passed-original-scope-offline';}catch(error){row.status='failed';row.error=redact(error);try{await model.page.screenshot({path:join(output,id+'-failed.png'),timeout:10000});}catch{}throw error;}finally{row.completedAt=new Date().toISOString();save();}}
async function route(path){await model.page.evaluate(path=>{location.hash='#'+path;},path);await model.page.waitForFunction(path=>location.hash==='#'+path,path);const current=model.page.locator(`.app-page-motion[data-route-key="${path}"][data-current-route="true"]`);await current.waitFor();await current.locator('h1').first().waitFor();assert.equal(await current.getByText('页面暂时遇到问题',{exact:true}).count(),0);}
async function register(account,password,name){const page=model.page;await page.getByRole('tab',{name:'注册',exact:true}).click();await page.getByLabel('用户名',{exact:true}).fill(name);await page.locator('input[autocomplete="username"]').fill(account);await page.getByLabel('密码',{exact:true}).fill(password);await page.getByLabel('确认密码',{exact:true}).fill(password);await page.getByRole('button',{name:'创建账号 →',exact:true}).click();await page.getByRole('navigation',{name:'主导航',exact:true}).waitFor();const session=await model.call('accounts','session');assert.equal(session.dataMode,'simulated');assert.ok(session.currentUser.id.startsWith(`qa:${runId}:`));return session.currentUser.id;}

async function receipts(encounterId,sessionId){return model.main(({app},input)=>{
 const fs=process.getBuiltinModule('node:fs'),path=process.getBuiltinModule('node:path');
 if(fs.realpathSync.native(app.getPath('userData')).toLowerCase()!==fs.realpathSync.native(input.profile).toLowerCase())throw Error('Wrong owned profile');
 const req=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json');
 const db=new(req('better-sqlite3'))(path.join(input.profile,'lingjing.sqlite'),{readonly:true,fileMustExist:true});
 try{db.pragma('query_only=ON');const parse=row=>row?JSON.parse(row.data_json):null;
  return {encounter:parse(db.prepare('SELECT data_json FROM discovery_encounters WHERE owner_account_id=? AND encounter_id=?').get(input.owner,input.encounterId)),capture:parse(db.prepare('SELECT data_json FROM discovery_captures WHERE owner_account_id=? AND encounter_id=?').get(input.owner,input.encounterId)),battle:parse(db.prepare('SELECT data_json FROM battle_sessions WHERE owner_account_id=? AND id=?').get(input.owner,input.sessionId)),action:db.prepare('SELECT result_json FROM discovery_actions WHERE owner_account_id=? AND action_id=?').get(input.owner,'context:'+input.sessionId),captureCount:db.prepare('SELECT count(*) n FROM discovery_captures WHERE owner_account_id=?').get(input.owner).n};
 }finally{db.close();}
},{profile,owner,encounterId,sessionId});}
try{
 await launch();owner=await register(account,secret,'野外收服验收');
 const roster=await model.call('companions','list'),metal=roster.templates.find(t=>t.element==='metal'),wood=roster.templates.find(t=>t.element==='wood');assert.ok(metal&&wood);
 const adopted=await model.call('companions','adopt',{templateId:metal.templateId,name:metal.name,showOnDesktop:false,actionId:randomUUID()});const player=adopted.pet;
 await model.call('battle','selectPet',{petId:player.petId,actionId:randomUUID()});
 const initialPets=(await model.call('companions','list')).pets;let session,encounterId,spawn;
 await step('M05-open','Official QA target and normal UI challenge; no capture before victory',async()=>{
  await route('/discovery');await model.call('discovery','setExploring',{active:true});
  const nearby=await model.call('discovery','qaTarget',{templateId:wood.templateId});spawn=nearby.spawns.find(s=>s.templateId===wood.templateId&&s.inRange);assert.ok(spawn);
  await route('/discovery/wild/'+spawn.id);await model.page.getByRole('button',{name:'开始挑战',exact:true}).click();
  const screen=model.page.locator('[data-battle-screen="shared-v1"][data-battle-mode="wild"]');await screen.waitFor();
  const id=await screen.getAttribute('data-session-id');session=await model.call('battle','snapshot',{sessionId:id});assert.equal(session.context.authority,'simulated');assert.equal(session.status,'active');assert.equal(session.player.petId,player.petId);
  const state=await model.call('discovery','snapshot');const encounter=state.encounters.find(e=>e.battle?.battleId===id);assert.ok(encounter);encounterId=encounter.encounterId;
  const capture=model.page.getByRole('button',{name:'收服',exact:true});assert.ok(await capture.count()===0||!(await capture.isEnabled()));
  assert.equal((await receipts(encounterId,id)).capture,null);await model.page.screenshot({path:join(output,'M05-before-victory.png'),timeout:10000});
  return {authority:'simulated-local',noCaptureBeforeVictory:true,normalUiChallenge:true};
 });
 await step('M05-natural-victory','Normal original actions, one round per UI click; no preset or changed attributes',async()=>{
  const rounds=[];
  for(let n=0;n<60&&session.status==='active';n++){
   await model.page.waitForFunction(()=>document.querySelector('[data-animation-phase]')?.getAttribute('data-animation-phase')==='rest');
   const choice=model.page.locator('.battle-move.battle-command.element_attack');assert.equal(await choice.count(),1);await pollState(()=>choice.isEnabled(),Boolean,{timeoutMs:20000,label:'Original move unavailable'});
   const before=session.snapshot.round;await choice.click();
   session=await pollState(()=>model.call('battle','snapshot',{sessionId:session.id}),s=>s.snapshot.round===before+1,{timeoutMs:20000,label:'Exactly one natural round not observed'});
   assert.equal(session.snapshot.round,before+1);await model.page.waitForFunction(round=>Number(document.querySelector('.battle-stage')?.getAttribute('data-round'))===round,session.snapshot.round);rounds.push({round:session.snapshot.round,status:session.status});proof.roundProgress=rounds;save();
  }
  assert.equal(session.status,'finished');assert.equal(session.winner,'player');
  await model.page.getByRole('button',{name:'收服',exact:true}).waitFor();await model.page.screenshot({path:join(output,'M05-natural-victory.png'),timeout:10000});return {rounds,winner:'player',noForcedOutcome:true};
 });
 await step('M05-capture','Normal UI capture; exact original encounter/resource, new pet and authoritative local receipt',async()=>{
  await model.page.getByRole('button',{name:'收服',exact:true}).click();const dialog=model.page.getByRole('dialog',{name:'收服伙伴',exact:true});await dialog.getByRole('textbox',{name:'昵称',exact:true}).fill('验收野外伙伴');await dialog.getByRole('button',{name:'确认',exact:true}).click();
  await model.page.waitForFunction(id=>location.hash==='#/discovery/result/'+id,encounterId);
  await model.page.locator(`.app-page-motion[data-route-key="/discovery/result/${encounterId}"][data-current-route="true"]`).waitFor();
  const state=await receipts(encounterId,session.id),capture=state.capture;assert.ok(capture);assert.equal(state.encounter.status,'captured');assert.equal(state.encounter.battle.battleId,session.id);assert.equal(state.battle.winner,'player');assert.equal(state.battle.status,'finished');assert.equal(capture.encounterId,encounterId);assert.equal(capture.actionId,'discovery:'+encounterId);assert.equal(state.encounter.spawn.id,spawn.id);assert.equal(state.encounter.spawn.resourceId,wood.resource.resourceId);assert.equal(capture.ownerAccountId,owner);assert.equal(capture.validation,'simulated');assert.equal(capture.scenarioId,runId);assert.equal(capture.templateId,wood.templateId);assert.equal(capture.resourceId,wood.resource.resourceId);assert.equal(state.encounter.capturePetId,capture.petId);assert.ok(state.action);assert.equal(JSON.parse(state.action.result_json).data.petId,capture.petId);
  const afterPets=(await model.call('companions','list')).pets,newPet=afterPets.find(p=>p.petId===capture.petId);assert.ok(newPet);assert.ok(!initialPets.some(p=>p.petId===newPet.petId));assert.equal(afterPets.length,initialPets.length+1);assert.equal(newPet.resource.resourceId,capture.resourceId);assert.equal(newPet.origin.battleId,session.id);assert.equal(newPet.origin.encounterId,encounterId);
  // Only after verified success replay the EXACT normal UI intent, never allocate a new retry ID.
  const replay=await model.call('battle','settleContext',{sessionId:session.id,actionId:'context:'+session.id,name:'验收野外伙伴'});assert.equal(replay.petId,capture.petId);assert.deepEqual(await receipts(encounterId,session.id),state);assert.deepEqual((await model.call('companions','list')).pets,afterPets);
  await model.page.screenshot({path:join(output,'M05-captured.png'),timeout:10000});return {exactLocalReceipt:true,originalEncounterAndBattle:true,expectedResource:true,newInstance:true,successfulOriginalIntentReplayUnchanged:true,receiptCount:state.captureCount};
 });proof.passed=true;
}catch(error){proof.error=redact(error);proof.passed=false;process.exitCode=1;}
finally{
 try{await stop();proof.ownedProcessStopped=true;}catch(error){proof.stopError=redact(error);proof.passed=false;process.exitCode=1;}
 try{assert.equal(dirname(profile),realpathSync.native(tmpdir()));assert.ok(basename(profile).startsWith('lingjing-localCapture-'));assert.ok(proof.ownedProcessStopped);rmSync(profile,{recursive:true,force:true});proof.temporaryProfileRemoved=true;}catch(error){proof.cleanupError=redact(error);proof.passed=false;process.exitCode=1;}
 proof.completedAt=new Date().toISOString();save();console.log(JSON.stringify({output,passed:proof.passed,error:proof.error}));
}
