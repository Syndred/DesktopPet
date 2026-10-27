// M04 partial only: official QA position refresh and nearby results; no range/cooldown/empty-state claim.
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
for(const arg of process.argv.slice(2))assert.ok(/^--(?:executable|source)=.+$/.test(arg),'UNKNOWN_OPTION');
const option=name=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const config=JSON.parse(readFileSync('scripts/release/electron-builder.pc.json')),version=JSON.parse(readFileSync('package.json')).version,build=JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json'));
const executable=resolve(option('executable')||join(config.directories.output,`Lingjing-${version}-portable-x64.exe`)),expectedSource=option('source')||build.sourceCommit;
assert.ok(process.platform==='win32'&&process.env.GITHUB_ACTIONS==='true');assert.match(expectedSource,/^[a-f0-9]{40}$/);
const output=resolve('artifacts/foundation/cloud-engineering/nearbyRefresh',`run-${Date.now()}`);mkdirSync(output,{recursive:true});
const profile=realpathSync.native(mkdtempSync(join(tmpdir(),'lingjing-nearbyRefresh-'))),runId=randomUUID(),secret=`Qa-${randomUUID()}!`,account=`qa_nearby_${runId.slice(0,8)}`;
writeFileSync(join(profile,MARKER),JSON.stringify({schemaVersion:1,application:'lingjing',scenario:SCENARIO,runId,isolated:true,profilePath:realpathSync.native(profile),createdAt:new Date().toISOString()}),{flag:'wx'});
const offlineConfig=join(profile,'offline-public.json');writeFileSync(offlineConfig,'{}',{flag:'wx'});
const systemKeys=new Set(['PATH','PATHEXT','PSMODULEPATH','SYSTEMROOT','SYSTEMDRIVE','WINDIR','COMSPEC','TEMP','TMP','TMPDIR','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMFILES','PROGRAMFILES(X86)','PROGRAMW6432','LANG','LC_ALL','CI']);
const offlineEnvironment=Object.fromEntries(Object.keys(process.env).filter(key=>!systemKeys.has(key.toUpperCase())).map(key=>[key,undefined]));Object.assign(offlineEnvironment,{LINGJING_QA_SCENARIO:SCENARIO,LINGJING_PUBLIC_CONFIG:offlineConfig});
const proof={scope:'M04 partial: normal UI refresh of official simulated-local location, nonempty nearby results and no duplicate gameplay effects. NOT range selection, cooldown, empty results, real GPS, map rendering or cloud discovery.',fullCasePassed:false,uncovered:['range-selection','cooldown','empty-results'],sourceCommit:expectedSource,compiledFingerprint:build.compiledFingerprint,exeSha256:await sha256(executable),cases:[],passed:false,startedAt:new Date().toISOString()};
let model,uncertain=false,owner;const pids=new Set();const redact=()=> 'NEARBY_REFRESH_ACCEPTANCE_FAILED_SEE_STAGE';const save=()=>writeFileSync(join(output,'evidence.json'),JSON.stringify(proof,null,2));
function alive(pid){try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}}
async function stop(){if(model){proof.offlineBlocked=(proof.offlineBlocked||[]);proof.offlineBlocked.push(await model.main(()=>globalThis.__nearbyRefreshOfflineBlocked).catch(()=>({observation:'unavailable'})));await Promise.race([model.stop(),new Promise((_,reject)=>setTimeout(()=>reject(Error('OWNED_STOP_TIMEOUT')),15000))]);}if(uncertain)throw Error('Launch outcome/PID unknown; keep temporary profile');proof.pidChecks=await pollState(()=>[...pids].map(pid=>({pid,alive:alive(pid)})),rows=>rows.every(row=>!row.alive),{timeoutMs:10000,intervalMs:200,label:'Owned process still alive; keep temporary profile'});model=null;}
async function launch(){uncertain=true;model=await launchPortableSession({executable,profile,expectedSource,label:'nearbyRefresh-qa',environment:offlineEnvironment});for(const pid of[model.launcherPid,model.runtime.pid])if(Number.isInteger(pid)&&pid>0)pids.add(pid);uncertain=false;assert.equal(model.info.build.compiledFingerprint,build.compiledFingerprint);assert.deepEqual(model.info.build.sourceDirtyFiles,[]);assert.equal((await model.call('accounts','session')).scenario?.runId,runId);await model.main(({session,net:electronNet})=>{
  globalThis.__nearbyRefreshOfflineBlocked={node:0,fetch:0,websocket:0,chromium:0};
  const denied=kind=>{globalThis.__nearbyRefreshOfflineBlocked[kind]++;throw Error('OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN');};
  const local=value=>{try{const host=typeof value==='string'||value instanceof URL?new URL(String(value)).hostname:value?.hostname||value?.host||'localhost';return ['localhost','127.0.0.1','::1','[::1]'].includes(String(host).split(':').length===2?String(host).split(':')[0]:String(host));}catch{return false;}};
  for(const name of['node:http','node:https']){const mod=process.getBuiltinModule(name);for(const method of['request','get']){const original=mod[method];mod[method]=function(input,...args){if(!local(input))return denied('node');return original.call(this,input,...args);};}}
  for(const name of['node:net','node:tls']){const transport=process.getBuiltinModule(name);transport.connect=()=>denied('node');if(transport.createConnection)transport.createConnection=()=>denied('node');}
  process.getBuiltinModule('node:http2').connect=()=>denied('node');
  const nativeFetch=electronNet.fetch;electronNet.fetch=function(input,...args){if(/^https?:/i.test(String(input?.url||input)))return Promise.reject(Object.assign(Error('OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN'),{code:'OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN'}));return nativeFetch.call(this,input,...args);};
  const fetchOriginal=globalThis.fetch;globalThis.fetch=function(input,...args){if(!local(input?.url||input)){globalThis.__nearbyRefreshOfflineBlocked.fetch++;return Promise.reject(Object.assign(Error('OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN'),{code:'OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN'}));}return fetchOriginal.call(this,input,...args);};
  if(globalThis.WebSocket){const Original=globalThis.WebSocket;globalThis.WebSocket=class extends Original{constructor(url,...args){if(!local(url))denied('websocket');super(url,...args);}};}
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_details,callback)=>{globalThis.__nearbyRefreshOfflineBlocked.chromium++;callback({cancel:true});});
 });}
async function step(id,coverage,fn){const row={id,coverage,status:'running',startedAt:new Date().toISOString()};proof.cases.push(row);save();try{Object.assign(row,await fn());row.status='passed-original-scope-offline';}catch(error){row.status='failed';row.error=redact(error);try{await model.page.screenshot({path:join(output,id+'-failed.png'),timeout:10000});}catch{}throw error;}finally{row.completedAt=new Date().toISOString();save();}}
async function route(path){proof.stage=path.startsWith('/discovery/encounter/')?'route-existing-encounter':path.startsWith('/discovery/wild/')?'route-existing-spawn':path==='/companions'?'route-companions':'route-discovery';save();await model.page.evaluate(path=>{location.hash='#'+path;},path);await model.page.waitForFunction(path=>location.hash==='#'+path,path);const current=model.page.locator(`.app-page-motion[data-route-key="${path}"][data-current-route="true"]`);await current.waitFor();if(path.startsWith('/discovery/encounter/'))await current.locator('[data-battle-screen="shared-v1"][data-session-id]').waitFor();else await current.locator('h1').first().waitFor();assert.equal(await current.getByText('页面暂时遇到问题',{exact:true}).count(),0);}
async function register(account,password,name){const page=model.page;await page.getByRole('tab',{name:'注册',exact:true}).click();await page.getByLabel('用户名',{exact:true}).fill(name);await page.locator('input[autocomplete="username"]').fill(account);await page.getByLabel('密码',{exact:true}).fill(password);await page.getByLabel('确认密码',{exact:true}).fill(password);await page.getByRole('button',{name:'创建账号 →',exact:true}).click();await page.getByRole('navigation',{name:'主导航',exact:true}).waitFor();const session=await model.call('accounts','session');assert.equal(session.dataMode,'simulated');assert.ok(session.currentUser.id.startsWith(`qa:${runId}:`));return session.currentUser.id;}

const deadline=Date.now()+4*60*1000;
function budget(){assert.ok(Date.now()<deadline,'NATIVE_DEADLINE');}
async function effects(){return model.main(({app},input)=>{
 const fs=process.getBuiltinModule('node:fs'),path=process.getBuiltinModule('node:path');assertProfile();function assertProfile(){if(fs.realpathSync.native(app.getPath('userData')).toLowerCase()!==input.profile.toLowerCase())throw Error('WRONG_PROFILE');}
 const req=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json'),db=new(req('better-sqlite3'))(path.join(input.profile,'lingjing.sqlite'),{readonly:true,fileMustExist:true});
 try{db.pragma('query_only=ON');const result={};for(const table of ['discovery_encounters','discovery_captures','discovery_actions','battle_sessions','battle_reward_receipts','companion_pets']){const rows=db.prepare(`SELECT * FROM ${table} WHERE owner_account_id=?`).all(input.owner).map(row=>JSON.stringify(row)).sort();result[table]={count:rows.length,sha256:process.getBuiltinModule('node:crypto').createHash('sha256').update(JSON.stringify(rows)).digest('hex')};}return result;}finally{db.close();}
},{profile,owner});}
function valid(state){assert.equal(state.scenario,'qa');assert.equal(state.location.status,'ready');assert.equal(state.location.fix.source,'simulated');assert.equal(state.location.fix.provider,'qa-discovery');assert.equal(state.location.fix.scenarioId,runId);assert.ok(state.spawns.length>0);assert.equal(new Set(state.spawns.map(s=>s.id)).size,state.spawns.length);assert.ok(state.spawns.every(s=>s.expiresAt>Date.now()));assert.equal(state.encounters.length,0);assert.equal(state.captures.length,0);}
try{
 await launch();budget();owner=await register(account,secret,'附近更新验收');const baseline=await effects(),pets=(await model.call('companions','list')).pets;for(const row of Object.values(baseline))assert.equal(row.count,0);
 await step('M04-normal-ui-location-refresh-partial','Only official simulated location, actual nonempty result UI and normal repeated position refresh; no full M04 claim',async()=>{
  proof.stage='open-discovery';save();await model.page.getByRole('navigation',{name:'主导航',exact:true}).getByText('附近探索',{exact:true}).click();await model.page.locator('.app-page-motion[data-route-key="/discovery"][data-current-route="true"] .discovery-page[data-discovery-scenario="qa"]').waitFor();
  const button=model.page.getByRole('button',{name:'更新场景位置',exact:true});await button.waitFor();const observations=[];let previous,locatedBaseline;
  for(let attempt=0;attempt<3;attempt++){
   budget();proof.stage=attempt===0?'initial-ui-location':'repeat-ui-location';save();const old=(await model.call('discovery','snapshot')).location.fix?.timestampMs||0;
   await pollState(()=>button.isEnabled(),Boolean,{timeoutMs:10000,label:'Location control not ready'});await button.click();
   const state=await pollState(()=>model.call('discovery','snapshot'),s=>s.location.status==='ready'&&s.location.fix?.timestampMs>old,{timeoutMs:15000,label:'Normal location refresh not observed'});valid(state);
   await pollState(()=>model.page.locator('.discovery-nearby-heading').innerText(),text=>text.includes(`${state.spawns.length} 位伙伴`),{timeoutMs:10000,label:'Nearby result count not displayed'});assert.ok(await model.page.locator('.discovery-selected-copy h2').innerText());
   if(previous){assert.equal(state.location.fix.lat,previous.location.fix.lat);assert.equal(state.location.fix.lng,previous.location.fix.lng);if(state.spawns[0].expiresAt===previous.spawns[0].expiresAt)assert.deepEqual(state.spawns.map(s=>s.id),previous.spawns.map(s=>s.id));}
   const currentEffects=await effects();assert.deepEqual(currentEffects,locatedBaseline||baseline);if(!locatedBaseline)locatedBaseline=currentEffects;assert.deepEqual((await model.call('companions','list')).pets,pets);
   observations.push({attempt:attempt+1,provider:state.location.fix.provider,source:state.location.fix.source,timestampMs:state.location.fix.timestampMs,resultCount:state.spawns.length,uniqueIds:true,samePositionAsPrevious:previous?true:null,gameplayEffects:currentEffects});previous=state;
  }
  await model.page.screenshot({path:join(output,'M04-nearby-results.png'),timeout:10000});return{observations,normalUiRefreshes:3,normalUiRetryMeaning:'Repeated existing Update scenario position control; no separate scan/radius API',noDuplicateRewards:true,fullCasePassed:false};
 });assert.equal(proof.cases.length,1);proof.passed=proof.cases.every(c=>c.status==='passed-original-scope-offline');
}catch(error){proof.error=redact(error);proof.errorKind=['TimeoutError','AssertionError'].includes(error?.name)?error.name:'CASE_FAILED';const line=String(error?.stack||'').match(/cloud-native-nearby-refresh-acceptance\.mjs:(\d+):(\d+)/);if(line)proof.scriptLocation={line:Number(line[1]),column:Number(line[2])};proof.passed=false;process.exitCode=1;}
finally{
 try{await stop();proof.ownedProcessStopped=true;}catch(error){proof.stopError=redact(error);proof.passed=false;process.exitCode=1;}
 try{assert.equal(dirname(profile),realpathSync.native(tmpdir()));assert.ok(basename(profile).startsWith('lingjing-nearbyRefresh-'));assert.ok(proof.ownedProcessStopped);rmSync(profile,{recursive:true,force:true});proof.temporaryProfileRemoved=true;}catch(error){proof.cleanupError=redact(error);proof.passed=false;process.exitCode=1;}
 proof.completedAt=new Date().toISOString();save();console.log(JSON.stringify({output,passed:proof.passed,fullCasePassed:false}));
}
