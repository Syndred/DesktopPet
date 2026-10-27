// B08/B09 only: actual production handler/SQL gates in disposable PGlite + audited native UI.
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
import {startInvitationSqlBridge} from './qa-invitation-sql-bridge.mjs';
const option=name=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3);
const config=JSON.parse(readFileSync('scripts/release/electron-builder.pc.json')),version=JSON.parse(readFileSync('package.json')).version,build=JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json'));
const executable=resolve(option('executable')||join(config.directories.output,`Lingjing-${version}-portable-x64.exe`)),expectedSource=option('source')||build.sourceCommit;
assert.ok(process.platform==='win32'&&process.env.GITHUB_ACTIONS==='true');assert.match(expectedSource,/^[a-f0-9]{40}$/);
const output=resolve('artifacts/foundation/cloud-engineering/invitationLifecycle',`run-${Date.now()}`);mkdirSync(output,{recursive:true});
const root=realpathSync.native(mkdtempSync(join(tmpdir(),'lingjing-invitationLifecycle-'))),runId=randomUUID(),token=randomBytes(32).toString('hex');
const proof={scope:'B08/B09 audited SFX and two official local QA profiles; owned synthetic actor bridge to original production handler and PostgreSQL migrations/RPC. Real five-minute server clock. Not production Auth, deployment, real accounts or Realtime.',sourceCommit:expectedSource,compiledFingerprint:build.compiledFingerprint,exeSha256:await sha256(executable),cases:[],passed:false};
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
 const m=a.model=await launchPortableSession({executable,profile,expectedSource,label:'invitationLifecycle-'+role,environment});a.pids=[m.launcherPid,m.runtime.pid].filter(p=>Number.isInteger(p)&&p>0);a.uncertain=false;
 assert.equal(m.info.build.compiledFingerprint,build.compiledFingerprint);assert.deepEqual(m.info.build.sourceDirtyFiles,[]);assert.equal((await m.call('accounts','session')).scenario?.runId,runId);
 await m.main(({session},allowed)=>{
  globalThis.__invitationLifecycleBlocked={node:0,fetch:0,chromium:0};
  const deny=()=>{globalThis.__invitationLifecycleBlocked.node++;throw Error('OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN');};
  const exact=input=>{try{return new URL(String(input?.url||input)).href===allowed;}catch{return false;}};
  for(const n of['node:http','node:https']){const mod=process.getBuiltinModule(n);mod.request=deny;mod.get=deny;}
  // fetch transport remains the sole permitted business connection: exact owned HTTP endpoint.
  const original=globalThis.fetch;globalThis.fetch=(input,...args)=>exact(input)?original(input,...args):(globalThis.__invitationLifecycleBlocked.fetch++,Promise.reject(Error('OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN')));
  const permitted=new URL(allowed),net=process.getBuiltinModule('node:net');
  for(const name of['connect','createConnection']){const connect=net[name];net[name]=function(options,...args){if(!options||typeof options!=='object'||options.host!=='127.0.0.1'||Number(options.port)!==Number(permitted.port))return deny();return connect.call(this,options,...args);};}
  const tls=process.getBuiltinModule('node:tls');tls.connect=deny;if(tls.createConnection)tls.createConnection=deny;
  process.getBuiltinModule('node:http2').connect=deny;if(globalThis.WebSocket)globalThis.WebSocket=class{constructor(){deny();}};
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_d,cb)=>{globalThis.__invitationLifecycleBlocked.chromium++;cb({cancel:true});});
 },endpoint);return m;
}
async function register(m,role){budget();const account=`qa_invite_${role}_${runId.slice(0,8)}`,password=`Qa-${randomUUID()}!`,p=m.page;await p.getByRole('tab',{name:'注册',exact:true}).click();await p.getByLabel('用户名',{exact:true}).fill('邀请门禁验收'+role);await p.locator('input[autocomplete="username"]').fill(account);await p.getByLabel('密码',{exact:true}).fill(password);await p.getByLabel('确认密码',{exact:true}).fill(password);await p.getByRole('button',{name:'创建账号 →',exact:true}).click();await p.getByRole('navigation',{name:'主导航',exact:true}).waitFor();const s=await m.call('accounts','session');assert.equal(s.dataMode,'simulated');assert.ok(s.currentUser.id.startsWith(`qa:${runId}:`));actors[role].owner=s.currentUser.id;return account;}
async function friends(m){mark('friends-route');await m.page.evaluate(()=>{location.hash='#/battle';});const current=m.page.locator('.app-page-motion[data-route-key="/battle"][data-current-route="true"]');await current.waitFor();mark('friends-tab');await current.getByRole('tab',{name:'好友对战',exact:true}).click();mark('friends-layout');const friendsRoute=m.page.locator('.app-page-motion[data-route-key="/battle/friends"][data-current-route="true"]');await friendsRoute.waitFor();await friendsRoute.locator('.battle-friends-layout').waitFor();return friendsRoute;}
async function step(id,fn){budget();proof.stage=id;const row={id,status:'running'};proof.cases.push(row);save();try{Object.assign(row,await fn());row.status='passed';}catch(error){row.status='failed';throw error;}finally{save();}}
async function counts(role){const actor=actors[role];return actor.model.main(({app},input)=>{const fs=process.getBuiltinModule('node:fs'),path=process.getBuiltinModule('node:path');if(fs.realpathSync.native(app.getPath('userData')).toLowerCase()!==input.profile.toLowerCase())throw Error('WRONG_PROFILE');const require=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json'),db=new(require('better-sqlite3'))(path.join(input.profile,'lingjing.sqlite'),{readonly:true,fileMustExist:true});try{db.pragma('query_only=ON');return {rewards:db.prepare('SELECT count(*) n FROM battle_reward_receipts WHERE owner_account_id=?').get(input.owner).n,sessions:db.prepare('SELECT count(*) n FROM battle_sessions WHERE owner_account_id=?').get(input.owner).n,reports:db.prepare('SELECT count(*) n FROM battle_reports_v2 WHERE owner_account_id=?').get(input.owner).n};}finally{db.close();}},{profile:actor.profile,owner:actor.owner});}
const deadline=Date.now()+10*60*1000;
function budget(){assert.ok(Date.now()<deadline,'NATIVE_DEADLINE');}
async function directAccept(role,requestId){budget();const a=actors[role],response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json','x-qa-run':runId,'x-qa-token':token},body:JSON.stringify({op:'create_room',actionId:`accept:${requestId}`,requestId,petId:a.pet.petId,userId:a.owner,userAccount:a.account,username:a.username,sessionToken:`qa:${runId}:${a.owner}`})});return{status:response.status,value:await response.json()};}
async function lists(){return Promise.all(['a','b'].map(r=>actors[r].model.call('battle','invitations')));}
function one(values,id,status){assert.equal(values[0].outbound.find(x=>x.id===id)?.status,status);assert.equal(values[1].inbound.find(x=>x.id===id)?.status,status);}
async function invariants(){return{sql:await authority.inspect(),a:await counts('a'),b:await counts('b'),pets:await Promise.all(['a','b'].map(r=>actors[r].model.call('companions','list')))};}
function unchanged(before,after){assert.deepEqual(after.sql.invitations,before.sql.invitations);assert.deepEqual(after.sql.commands,before.sql.commands);assert.deepEqual(after.sql.counts,{rooms:0,rounds:0,settlements:0});assert.deepEqual(after.a,before.a);assert.deepEqual(after.b,before.b);assert.deepEqual(after.pets,before.pets);}
async function send(){budget();const a=actors.a.model,b=actors.b.model;await friends(a);await a.page.getByLabel('搜索账号或用户名',{exact:true}).fill(actors.b.account);await a.page.getByRole('button',{name:'搜索',exact:true}).click();const user=a.page.locator('.battle-user').filter({hasText:'@'+actors.b.account});await user.waitFor();assert.equal(await user.count(),1);await user.getByRole('button',{name:'发起对战',exact:true}).click();const pair=await pollState(lists,values=>values[0].outbound.some(x=>x.status==='pending')&&values[1].inbound.some(x=>x.status==='pending'),{timeoutMs:15000,label:'Original invitation not delivered'});const invite=pair[0].outbound.find(x=>x.status==='pending');assert.ok(invite);one(pair,invite.id,'pending');assert.equal(Date.parse(invite.expiresAt)-Date.parse(invite.createdAt),300000);await friends(b);await b.page.getByRole('button',{name:'刷新',exact:true}).click();await b.page.getByRole('button',{name:'接受',exact:true}).waitFor();return invite;}
async function screenshot(role,name){await actors[role].model.page.screenshot({path:join(output,name+'.png'),timeout:10000});}
try{
 const privateDirectory=join(root,'private-authority');mkdirSync(privateDirectory);authority=await startInvitationSqlBridge({runId,token,directory:privateDirectory});endpoint=authority.endpoint;proof.sqlAuthoritySources=authority.source;save();
 for(const role of ['a','b']){const m=await launch(role);actors[role].account=await register(m,role);const session=await m.call('accounts','session');actors[role].username=session.currentUser.username;
  const roster=await m.call('companions','list'),template=roster.templates.find(t=>t.element==='metal');assert.ok(template);const pet=(await m.call('companions','adopt',{templateId:template.templateId,name:'邀请门禁伙伴',showOnDesktop:false,actionId:randomUUID()})).pet;actors[role].pet=pet;
  await authority.registerActor({owner:actors[role].owner,account:actors[role].account,username:actors[role].username,pet});await m.call('battle','selectPet',{petId:pet.petId,actionId:randomUUID()});await friends(m);
 }
 const a=actors.a.model,b=actors.b.model;
 await step('B08-cancel-original-invitation',async()=>{
  mark('cancel-send');const invite=await send();await screenshot('b','B08-before-cancel');
  mark('cancel-normal-ui');await a.page.getByRole('button',{name:'取消邀请',exact:true}).click();await pollState(lists,p=>p[0].outbound.find(x=>x.id===invite.id)?.status==='cancelled',{timeoutMs:15000,label:'Cancellation not authoritative'});
  mark('cancel-accept-original');let uiAcceptAttempted=false;const accept=b.page.getByRole('button',{name:'接受',exact:true});if(await accept.count()===1&&await accept.isEnabled()){await accept.click();uiAcceptAttempted=true;}
  // A six-second normal refresh may already hide a cancelled card. Do not force it back.
  let domainCode;try{await b.call('battle','respondInvite',{requestId:invite.id,decision:'accept',petId:actors.b.pet.petId});throw Error('CANCELLED_ACCEPT_SUCCEEDED');}catch(e){const text=String(e?.message||'');assert.ok(/INVITE_CONFLICT/.test(text)||e?.code==='INVITE_CONFLICT');domainCode='rejected';}
  mark('cancel-sql-original-intent');const before=await invariants();for(let n=0;n<2;n++){const result=await directAccept('b',invite.id);assert.equal(result.value.code,'INVITE_CONFLICT');assert.equal(result.status,409);}const after=await invariants();unchanged(before,after);
  const pair=await lists();one(pair,invite.id,'cancelled');await a.page.getByRole('button',{name:'刷新',exact:true}).click();await b.page.getByRole('button',{name:'刷新',exact:true}).click();await pollState(()=>b.page.getByRole('button',{name:'接受',exact:true}).count(),n=>n===0,{timeoutMs:10000,label:'Cancelled card still actionable'});assert.equal(await a.page.getByRole('button',{name:'取消邀请',exact:true}).count(),0);
  await screenshot('a','B08-cancelled-a');await screenshot('b','B08-cancelled-b');return{requestId:invite.id,normalUiCancel:true,uiStaleAcceptAttempted:uiAcceptAttempted,normalDomainAccept:domainCode,sqlOriginalIntent:`accept:${invite.id}`,sqlCode:'INVITE_CONFLICT',sqlAttempts:2,bothStatus:'cancelled',noRoomRoundReward:true,privateSqlFixture:true};
 });
 await step('B09-natural-five-minute-expiry',async()=>{
  mark('expiry-send');const invite=await send(),createdAt=Date.parse(invite.createdAt),expiresAt=Date.parse(invite.expiresAt);assert.ok(Number.isSafeInteger(createdAt)&&createdAt<=Date.now());assert.equal(expiresAt-createdAt,300000);const initial=await authority.inspect();assert.ok(Number(initial.clock)<expiresAt);proof.expiry={createdAt,expiresAt,createdAtUtc:new Date(createdAt).toISOString(),expiresAtUtc:new Date(expiresAt).toISOString()};save();console.log(JSON.stringify({stage:'expiry-wait',...proof.expiry}));await screenshot('b','B09-pending-before-deadline');
  mark('expiry-natural-clock-wait');while(Date.now()<=expiresAt+100){budget();await new Promise(r=>setTimeout(r,Math.min(5000,expiresAt+101-Date.now())));}
  const observed=await authority.inspect();assert.ok(Number(observed.clock)>expiresAt);proof.expiry.observedAt=Number(observed.clock);proof.expiry.elapsedMs=Number(observed.clock)-createdAt;save();
  mark('expiry-normal-ui-refresh');await a.page.getByRole('button',{name:'刷新',exact:true}).click();await b.page.getByRole('button',{name:'刷新',exact:true}).click();await b.page.getByText('邀请已过期，请对方重新发起。',{exact:true}).waitFor();await a.page.getByRole('button',{name:'重新发起',exact:true}).waitFor();assert.equal(await b.page.getByRole('button',{name:'接受',exact:true}).count(),0);one(await lists(),invite.id,'expired');
  mark('expiry-original-domain-attempt');let rejected=false;try{await b.call('battle','respondInvite',{requestId:invite.id,decision:'accept',petId:actors.b.pet.petId});}catch(e){assert.ok(/过期|INVITE_EXPIRED/.test(String(e?.message||''))||e?.code==='INVITE_EXPIRED');rejected=true;}assert.equal(rejected,true);
  mark('expiry-original-sql-attempt');const before=await invariants();for(let n=0;n<2;n++){const result=await directAccept('b',invite.id);assert.equal(result.value.code,'INVITE_EXPIRED');assert.equal(result.status,409);}const after=await invariants();unchanged(before,after);assert.equal(after.sql.invitations.length,2);assert.equal(after.a.rewards,0);assert.equal(after.b.rewards,0);assert.equal(after.a.sessions,0);assert.equal(after.b.sessions,0);one(await lists(),invite.id,'expired');
  await screenshot('a','B09-expired-a');await screenshot('b','B09-expired-b');return{requestId:invite.id,createdAt,expiresAt,observedAt:proof.expiry.observedAt,elapsedMs:proof.expiry.elapsedMs,naturalClockTimestamp:true,normalUiExpiredAndAcceptAbsent:true,normalDomainReject:true,sqlOriginalIntent:`accept:${invite.id}`,sqlCode:'INVITE_EXPIRED',sqlAttempts:2,bothStatus:'expired',noRoomRoundReward:true};
 });
 assert.equal(proof.cases.length,2);proof.authorityEvents=authority.events;proof.passed=proof.cases.every(c=>c.status==='passed');
}catch(error){proof.passed=false;process.exitCode=1;proof.error='INVITATION_LIFECYCLE_FAILED_SEE_STAGE';proof.errorKind=['TimeoutError','AssertionError'].includes(error?.name)?error.name:'CASE_FAILED';const line=String(error?.stack||'').match(/cloud-native-invitation-lifecycle-acceptance\.mjs:(\d+):(\d+)/);if(line)proof.scriptLocation={line:Number(line[1]),column:Number(line[2])};proof.authorityEvents=authority?.events||[];
 for(const role of Object.keys(actors)){try{await screenshot(role,'failed-'+role);}catch{}}
}finally{
 for(const role of Object.keys(actors)){try{await stop(role);}catch{proof.ownedClientCleanupFailed=true;proof.passed=false;process.exitCode=1;}}
 try{if(authority){await Promise.race([authority.close(),new Promise((_,r)=>setTimeout(()=>r(Error('SERVER_CLOSE_TIMEOUT')),5000))]);assert.equal(await stoppedPort(),true);}proof.ownedLoopbackClosed=true;}catch{proof.loopbackCleanupFailed=true;proof.passed=false;process.exitCode=1;}
 try{assert.ok(Object.values(actors).every(a=>a.stopped));assert.ok(proof.ownedLoopbackClosed);assert.equal(dirname(root),realpathSync.native(tmpdir()));assert.ok(basename(root).startsWith('lingjing-invitationLifecycle-'));rmSync(root,{recursive:true,force:true});proof.privateProfilesAndAuthorityRemoved=true;}catch{proof.profileCleanupFailed=true;proof.passed=false;process.exitCode=1;}
 proof.completedAt=new Date().toISOString();save();console.log(JSON.stringify({output,passed:proof.passed,stage:proof.stage}));
}
