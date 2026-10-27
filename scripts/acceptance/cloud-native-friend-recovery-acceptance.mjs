// B10 only: owned client transport interruption and original-round UI recovery through official isolated loopback.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,basename} from 'node:path';
import {createConnection} from 'node:net';
import {launchPortableSession} from './portable-session.mjs';
import {pollState} from './poll-state.mjs';
import {sha256} from '../release/release-store.mjs';
const require=createRequire(import.meta.url),{MARKER,SCENARIO}=require('../../apps/pc-app/runtime/core/qa-scenario.cjs');
const {startQaDuelServer}=require('../../apps/pc-app/runtime/features/battle/tests/qa-duel-server.cjs');
const option=name=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3);
const config=JSON.parse(readFileSync('scripts/release/electron-builder.pc.json')),version=JSON.parse(readFileSync('package.json')).version,build=JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json'));
const executable=resolve(option('executable')||join(config.directories.output,`Lingjing-${version}-portable-x64.exe`)),expectedSource=option('source')||build.sourceCommit;
assert.ok(process.platform==='win32'&&process.env.GITHUB_ACTIONS==='true');assert.match(expectedSource,/^[a-f0-9]{40}$/);
const output=resolve('artifacts/foundation/cloud-engineering/friendRecovery',`run-${Date.now()}`);mkdirSync(output,{recursive:true});
const root=realpathSync.native(mkdtempSync(join(tmpdir(),'lingjing-friendRecovery-'))),runId=randomUUID(),token=randomBytes(32).toString('hex');
const proof={scope:'B10 actual audited SFX; official simulated-local loopback only. Two real clients, one before-send interruption, original pending action retry and natural completion. Not production JWT/cloud transport ledger or server-committed response loss.',sourceCommit:expectedSource,compiledFingerprint:build.compiledFingerprint,exeSha256:await sha256(executable),cases:[],passed:false};
const mark=value=>{proof.substage=value;save();};
const save=()=>writeFileSync(join(output,'evidence.json'),JSON.stringify(proof,null,2));
const actors={};let authority,endpoint;
const systemKeys=new Set(['PATH','PATHEXT','PSMODULEPATH','SYSTEMROOT','SYSTEMDRIVE','WINDIR','COMSPEC','TEMP','TMP','TMPDIR','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMFILES','PROGRAMFILES(X86)','PROGRAMW6432','LANG','LC_ALL','CI']);
function alive(pid){try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}}
async function stoppedPort(){return new Promise((done,reject)=>{const s=createConnection({host:'127.0.0.1',port:Number(new URL(endpoint).port)});s.setTimeout(2000);s.once('connect',()=>{s.destroy();done(false);});s.once('error',e=>{s.destroy();e.code==='ECONNREFUSED'?done(true):reject(Error('LOOPBACK_CLOSE_UNCONFIRMED'));});s.once('timeout',()=>{s.destroy();reject(Error('LOOPBACK_CLOSE_UNCONFIRMED'));});});}
async function stop(role){const a=actors[role];if(!a)return;if(a.model){await Promise.race([a.model.stop(),new Promise((_,r)=>setTimeout(()=>r(Error('OWNED_STOP_TIMEOUT')),15000))]);}assert.equal(a.uncertain,false);await pollState(()=>a.pids.every(pid=>!alive(pid)),Boolean,{timeoutMs:10000,label:'Owned client still alive'});a.stopped=true;}
async function launch(role){budget();const profile=join(root,role);mkdirSync(profile);const canonical=realpathSync.native(profile),a=actors[role]={profile:canonical,pids:[],uncertain:true,stopped:false};
 writeFileSync(join(profile,MARKER),JSON.stringify({schemaVersion:1,application:'lingjing',scenario:SCENARIO,runId,isolated:true,profilePath:canonical,createdAt:new Date().toISOString()}),{flag:'wx'});
 writeFileSync(join(profile,'battle-transport.json'),JSON.stringify({runId,token,endpoint}),{flag:'wx',mode:0o600});
 const offline=join(profile,'offline-public.json');writeFileSync(offline,'{}',{flag:'wx'});
 const environment=Object.fromEntries(Object.keys(process.env).filter(k=>!systemKeys.has(k.toUpperCase())).map(k=>[k,undefined]));Object.assign(environment,{LINGJING_QA_SCENARIO:SCENARIO,LINGJING_PUBLIC_CONFIG:offline});
 const m=a.model=await launchPortableSession({executable,profile,expectedSource,label:'friendRecovery-'+role,environment});a.pids=[m.launcherPid,m.runtime.pid].filter(p=>Number.isInteger(p)&&p>0);a.uncertain=false;
 assert.equal(m.info.build.compiledFingerprint,build.compiledFingerprint);assert.deepEqual(m.info.build.sourceDirtyFiles,[]);assert.equal((await m.call('accounts','session')).scenario?.runId,runId);
 await m.main(({session},allowed)=>{
  globalThis.__friendRecoveryBlocked={node:0,fetch:0,chromium:0};
  const deny=()=>{globalThis.__friendRecoveryBlocked.node++;throw Error('OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN');};
  const exact=input=>{try{return new URL(String(input?.url||input)).href===allowed;}catch{return false;}};
  for(const n of['node:http','node:https']){const mod=process.getBuiltinModule(n);mod.request=deny;mod.get=deny;}
  // fetch transport remains the sole permitted business connection: exact owned HTTP endpoint.
  const original=globalThis.fetch;globalThis.fetch=(input,...args)=>exact(input)?original(input,...args):(globalThis.__friendRecoveryBlocked.fetch++,Promise.reject(Error('OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN')));
  const permitted=new URL(allowed),net=process.getBuiltinModule('node:net');
  for(const name of['connect','createConnection']){const connect=net[name];net[name]=function(options,...args){if(!options||typeof options!=='object'||options.host!=='127.0.0.1'||Number(options.port)!==Number(permitted.port))return deny();return connect.call(this,options,...args);};}
  const tls=process.getBuiltinModule('node:tls');tls.connect=deny;if(tls.createConnection)tls.createConnection=deny;
  process.getBuiltinModule('node:http2').connect=deny;if(globalThis.WebSocket)globalThis.WebSocket=class{constructor(){deny();}};
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_d,cb)=>{globalThis.__friendRecoveryBlocked.chromium++;cb({cancel:true});});
 },endpoint);return m;
}
async function register(m,role){budget();const account=`qa_recover_${role}_${runId.slice(0,8)}`,password=`Qa-${randomUUID()}!`,p=m.page;await p.getByRole('tab',{name:'注册',exact:true}).click();await p.getByLabel('用户名',{exact:true}).fill('断线恢复验收'+role);await p.locator('input[autocomplete="username"]').fill(account);await p.getByLabel('密码',{exact:true}).fill(password);await p.getByLabel('确认密码',{exact:true}).fill(password);await p.getByRole('button',{name:'创建账号 →',exact:true}).click();await p.getByRole('navigation',{name:'主导航',exact:true}).waitFor();const s=await m.call('accounts','session');assert.equal(s.dataMode,'simulated');assert.ok(s.currentUser.id.startsWith(`qa:${runId}:`));actors[role].owner=s.currentUser.id;return account;}
async function friends(m){mark('friends-route');await m.page.evaluate(()=>{location.hash='#/battle';});const current=m.page.locator('.app-page-motion[data-route-key="/battle"][data-current-route="true"]');await current.waitFor();mark('friends-tab');await current.getByRole('tab',{name:'好友对战',exact:true}).click();mark('friends-layout');const friendsRoute=m.page.locator('.app-page-motion[data-route-key="/battle/friends"][data-current-route="true"]');await friendsRoute.waitFor();await friendsRoute.locator('.battle-friends-layout').waitFor();return friendsRoute;}
async function step(id,fn){budget();proof.stage=id;const row={id,status:'running'};proof.cases.push(row);save();try{Object.assign(row,await fn());row.status='passed';}catch(error){row.status='failed';throw error;}finally{save();}}
async function counts(role){const actor=actors[role];return actor.model.main(({app},input)=>{const fs=process.getBuiltinModule('node:fs'),path=process.getBuiltinModule('node:path');if(fs.realpathSync.native(app.getPath('userData')).toLowerCase()!==input.profile.toLowerCase())throw Error('WRONG_PROFILE');const require=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json'),db=new(require('better-sqlite3'))(path.join(input.profile,'lingjing.sqlite'),{readonly:true,fileMustExist:true});try{db.pragma('query_only=ON');return {rewards:db.prepare('SELECT count(*) n FROM battle_reward_receipts WHERE owner_account_id=?').get(input.owner).n,sessions:db.prepare('SELECT count(*) n FROM battle_sessions WHERE owner_account_id=?').get(input.owner).n,reports:db.prepare('SELECT count(*) n FROM battle_reports_v2 WHERE owner_account_id=?').get(input.owner).n};}finally{db.close();}},{profile:actor.profile,owner:actor.owner});}
const deadline=Date.now()+8*60*1000;
function budget(){assert.ok(Date.now()<deadline,'NATIVE_DEADLINE');}
async function state(m,id){return m.call('battle','snapshot',{sessionId:id});}
async function syncBoth(a,b,id){return Promise.all([a.call('battle','sync',{sessionId:id}),b.call('battle','sync',{sessionId:id})]);}
async function uiAct(m,action){budget();await m.page.waitForFunction(()=>document.querySelector('[data-animation-phase]')?.getAttribute('data-animation-phase')==='rest');const button=m.page.locator('.battle-move.battle-command[data-action="'+action+'"]');assert.equal(await button.count(),1);await pollState(()=>button.isEnabled(),Boolean,{timeoutMs:15000,label:'Original UI action unavailable'});await button.click();}
function sameRound(values,round){for(const s of values){assert.equal(s.snapshot.round,round);assert.equal(s.rounds.length,round);assert.ok(!s.pendingAction);assert.equal(s.context.authority,'simulated');}assert.equal(values[0].snapshot.player.hp,values[1].snapshot.enemy.hp);assert.equal(values[0].snapshot.enemy.hp,values[1].snapshot.player.hp);assert.equal(values[0].snapshot.player.anger,values[1].snapshot.enemy.anger);assert.equal(values[0].snapshot.enemy.anger,values[1].snapshot.player.anger);}
async function rewardProof(role,id){const actor=actors[role];return actor.model.main(({app},input)=>{
 const fs=process.getBuiltinModule('node:fs'),path=process.getBuiltinModule('node:path');if(fs.realpathSync.native(app.getPath('userData')).toLowerCase()!==input.profile.toLowerCase())throw Error('WRONG_PROFILE');
 const require=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json'),db=new(require('better-sqlite3'))(path.join(input.profile,'lingjing.sqlite'),{readonly:true,fileMustExist:true});try{db.pragma('query_only=ON');return{rewards:db.prepare('SELECT * FROM battle_reward_receipts WHERE owner_account_id=? AND session_id=?').all(input.owner,input.id),reports:db.prepare('SELECT * FROM battle_reports_v2 WHERE owner_account_id=? AND session_id=?').all(input.owner,input.id)};}finally{db.close();}
 },{profile:actor.profile,owner:actor.owner,id});}
try{
 authority=await startQaDuelServer({runId,token,directory:join(root,'private-authority')});endpoint=authority.endpoint;assert.equal(new URL(endpoint).hostname,'127.0.0.1');
 const a=await launch('a');await register(a,'a');const b=await launch('b');await register(b,'b');
 for(const m of[a,b]){const roster=await m.call('companions','list'),t=roster.templates.find(t=>t.element==='metal');assert.ok(t);const pet=(await m.call('companions','adopt',{templateId:t.templateId,name:'恢复伙伴',showOnDesktop:false,actionId:randomUUID()})).pet;await m.call('battle','selectPet',{petId:pet.petId,actionId:randomUUID()});await friends(m);}
 let id,roomId,originalIntent;
 await step('B10-normal-ui-create-join',async()=>{
  mark('host-create');await a.page.getByRole('button',{name:'创建房间',exact:true}).click();const screen=a.page.locator('[data-battle-screen="shared-v1"]');await screen.waitFor();id=await screen.getAttribute('data-session-id');const waiting=await state(a,id);assert.equal(waiting.status,'waiting');roomId=waiting.room.id;
  mark('guest-join');await b.page.getByLabel('房间码',{exact:true}).fill(waiting.room.room_code);await b.page.getByRole('button',{name:'加入房间',exact:true}).click();await b.page.locator('[data-session-id="'+id+'"]').waitFor();
  const pair=await syncBoth(a,b,id);for(const s of pair)assert.equal(s.status,'active');sameRound(pair,0);assert.equal(Object.keys(authority.state.rooms).length,1);assert.equal(authority.state.rooms[roomId].host_user_id,actors.a.owner);assert.equal(authority.state.rooms[roomId].guest_user_id,actors.b.owner);
  return{normalUiCreateAndJoin:true,sameOriginalRoom:true,authority:'simulated',noStatePreset:true};
 });
 await step('B10-original-round-retry',async()=>{
  mark('install-owned-before-send-fault');await b.main((_electron,input)=>{
   const original=globalThis.fetch,seen=[];let failed=false;
   globalThis.__b10Fault={read:()=>({failed,seen:seen.map(x=>({...x}))}),restore:()=>{globalThis.fetch=original;}};
   globalThis.fetch=function(url,options){let body;try{body=JSON.parse(options?.body||'{}');}catch{}
    if(String(url)===input.endpoint&&options?.method==='POST'&&body?.op==='submit_action'&&body.roomId===input.roomId&&body.roundNo===1&&body.userId===input.owner){
     seen.push({actionId:body.actionId,action:body.action,roundNo:body.roundNo});
     if(!failed){failed=true;return Promise.reject(Object.assign(Error('Simulated network unavailable before send'),{code:'NETWORK_UNAVAILABLE'}));}
    }return original.call(this,url,options);
   };
  },{endpoint,roomId,owner:actors.b.owner});
  mark('guest-original-ui-submit');await uiAct(b,'normal_attack');const pending=await pollState(()=>state(b,id),s=>s.pendingAction?.uncertain===true,{timeoutMs:15000,label:'Original pending intent not retained'});originalIntent={...pending.pendingAction};assert.equal(originalIntent.roundNo,1);assert.equal(originalIntent.action,'normal_attack');
  assert.equal(authority.state.rounds[roomId].length,0);assert.ok(!authority.state.actions[roomId+':1']?.guest);
  const failure=await b.main(()=>globalThis.__b10Fault.read());assert.equal(failure.seen.length,1);assert.equal(failure.seen[0].actionId,originalIntent.actionId);await b.page.getByRole('button',{name:'重试',exact:true}).waitFor();await b.page.screenshot({path:join(output,'B10-pending.png'),timeout:10000});
  mark('host-submit-original-round');await uiAct(a,'normal_attack');await pollState(()=>state(a,id),s=>s.pendingAction?.roundNo===1,{timeoutMs:15000,label:'Host not awaiting original round'});
  mark('guest-ui-retry-same-intent');await b.page.getByRole('button',{name:'重试',exact:true}).click();
  const pair=await pollState(()=>syncBoth(a,b,id),values=>values.every(s=>s.snapshot.round===1&&!s.pendingAction),{timeoutMs:20000,label:'Original round not recovered'});sameRound(pair,1);
  const recovered=await b.main(()=>globalThis.__b10Fault.read());assert.equal(recovered.seen.length,2);for(const x of recovered.seen)assert.deepEqual(x,{actionId:originalIntent.actionId,action:originalIntent.action,roundNo:1});
  assert.equal(authority.state.rounds[roomId].length,1);assert.equal(authority.state.rounds[roomId][0].round_no,1);await b.main(()=>globalThis.__b10Fault.restore());
  await b.page.screenshot({path:join(output,'B10-recovered.png'),timeout:10000});return{beforeSendFaultOnly:true,originalPendingActionId:originalIntent.actionId,originalRound:1,sameIntentRetried:true,oneAuthorityRound:true,bothClientsAgree:true};
 });
 await step('B10-continue-and-single-rewards',async()=>{
  let pair=await syncBoth(a,b,id);const rounds=[];
  for(let n=0;n<80&&pair.some(s=>s.status!=='finished');n++){
   budget();sameRound(pair,pair[0].snapshot.round);assert.ok(pair.every(s=>s.status==='active'));const previous=pair[0].snapshot.round;
   // Matching normal attacks are legal natural play; no RNG/stat/result presets.
   await Promise.all([uiAct(a,'normal_attack'),uiAct(b,'normal_attack')]);
   pair=await pollState(()=>syncBoth(a,b,id),values=>values.every(s=>s.snapshot.round===previous+1&&!s.pendingAction),{timeoutMs:20000,label:'Next original round unresolved'});sameRound(pair,previous+1);
   rounds.push({round:previous+1,statusA:pair[0].status,statusB:pair[1].status});proof.roundProgress=rounds;save();
  }
  assert.ok(pair.every(s=>s.status==='finished'&&!s.pendingAction));assert.ok(pair.some(s=>s.winner==='player'));assert.ok(pair.some(s=>s.winner==='enemy'));
  const count=pair[0].snapshot.round;assert.equal(authority.state.rounds[roomId].length,count);assert.equal(new Set(authority.state.rounds[roomId].map(r=>r.round_no)).size,count);
  const before={a:await rewardProof('a',id),b:await rewardProof('b',id)},petsBefore=await Promise.all([a.call('companions','list'),b.call('companions','list')]);
  for(const value of Object.values(before)){assert.equal(value.rewards.length,1);assert.equal(value.reports.length,1);}
  assert.equal(Object.keys(authority.state.claims).length,2);for(const role of ['a','b']){const claim=authority.state.claims[roomId+':'+actors[role].owner];assert.ok(claim);assert.equal(claim.authority,'simulated');assert.equal(claim.scenarioId,runId);assert.equal(claim.room_id,roomId);}
  const claims=JSON.stringify(authority.state.claims);await syncBoth(a,b,id);await syncBoth(a,b,id);assert.deepEqual(await rewardProof('a',id),before.a);assert.deepEqual(await rewardProof('b',id),before.b);assert.deepEqual(await Promise.all([a.call('companions','list'),b.call('companions','list')]),petsBefore);assert.equal(JSON.stringify(authority.state.claims),claims);
  await a.page.getByRole('button',{name:'战报',exact:true}).waitFor();await b.page.getByRole('button',{name:'战报',exact:true}).waitFor();await a.page.screenshot({path:join(output,'B10-finished-a.png'),timeout:10000});await b.page.screenshot({path:join(output,'B10-finished-b.png'),timeout:10000});
  return{roundCount:count,oneReceiptPerOwner:true,claims:2,repeatedSyncUnchanged:true,naturalTerminal:true,noCloudLedgerClaim:true};
 });assert.equal(proof.cases.length,3);proof.passed=proof.cases.every(c=>c.status==='passed');
}catch(error){proof.error='B10_FAILED_SEE_STAGE';proof.passed=false;process.exitCode=1;
 proof.errorKind=['TimeoutError','AssertionError'].includes(error?.name)?error.name:'CASE_FAILED';
 const line=String(error?.stack||'').match(/cloud-native-friend-recovery-acceptance\.mjs:(\d+):(\d+)/);if(line)proof.scriptLocation={line:Number(line[1]),column:Number(line[2])};
 const allowedOps=new Set(['search_accounts','list_duel_requests','send_duel_request','respond_duel_request','create_room','get_room','leave_room']);proof.authorityOperations={};for(const op of authority?.state.operations||[]){const key=allowedOps.has(op.op)?op.op:'OTHER';proof.authorityOperations[key]=(proof.authorityOperations[key]||0)+1;}
 const m=actors.a?.model;if(m){try{proof.blockedNetwork=await m.main(()=>globalThis.__friendRecoveryBlocked);}catch{}try{proof.ui=await m.page.evaluate(()=>({friends:!!document.querySelector('.battle-friends-layout'),users:document.querySelectorAll('.battle-user').length,emptySearch:[...document.querySelectorAll('.battle-empty-text')].some(e=>e.textContent==='未找到玩家'),onlineError:!!document.querySelector('.battle-online-error'),waiting:!!document.querySelector('.battle-waiting-actor')}));await m.page.screenshot({path:join(output,'B10-failed-owned-app.png'),timeout:10000});}catch{proof.failureUiUnavailable=true;}}
}
finally{
 try{await actors.b?.model?.main(()=>globalThis.__b10Fault?.restore());}catch{}
 for(const role of Object.keys(actors)){try{await stop(role);}catch{proof.ownedClientCleanupFailed=true;proof.passed=false;process.exitCode=1;}}
 try{if(authority){await Promise.race([authority.close(),new Promise((_,r)=>setTimeout(()=>r(Error('SERVER_CLOSE_TIMEOUT')),5000))]);assert.equal(await stoppedPort(),true);}proof.ownedLoopbackClosed=true;}catch{proof.loopbackCleanupFailed=true;proof.passed=false;process.exitCode=1;}
 try{assert.ok(Object.values(actors).every(a=>a.stopped));assert.ok(proof.ownedLoopbackClosed);assert.equal(dirname(root),realpathSync.native(tmpdir()));assert.ok(basename(root).startsWith('lingjing-friendRecovery-'));rmSync(root,{recursive:true,force:true});proof.privateProfilesAndAuthorityRemoved=true;}catch{proof.profileCleanupFailed=true;proof.passed=false;process.exitCode=1;}
 proof.completedAt=new Date().toISOString();save();console.log(JSON.stringify({output,passed:proof.passed,stage:proof.stage}));
}
