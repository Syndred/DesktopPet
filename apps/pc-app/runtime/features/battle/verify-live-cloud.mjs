import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

// Credentials are an ignored, coordinator-controlled input file, never CLI literals/evidence.
const input=process.env.LINGJING_CLOUD_BATTLE_INPUT;
assert.ok(input,'Set LINGJING_CLOUD_BATTLE_INPUT to the private acceptance input file');
const config=JSON.parse(readFileSync(resolve(input),'utf8'));
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
  if(globalThis.__dropBattleResponseOnce&&op==='submit_action') {globalThis.__dropBattleResponseOnce=false;await response.body?.cancel();}
  return response;
};
const {OnlineDuelService}=require('./apps/pc-app/runtime/services/online-duel-service.cjs');
const subscribe=OnlineDuelService.prototype.subscribeRoom;
OnlineDuelService.prototype.subscribeRoom=async function(...args){globalThis.__liveBattle=this;return subscribe.apply(this,args);};
require('./apps/pc-app/dist/main/index.cjs');
`);
const apps=new Map(),profiles={},errors=[],steps=[];
const proof={runId,at:new Date().toISOString(),provenance:'real-HTTPS-and-Realtime-acceptance',projectRef:config.projectRef,origin:config.url,machineCount:1,physicalDevices:1,independentElectronProcesses:2,statement:'Two isolated clients on the same Windows host; not two physical devices. Test transport faults cancel a real response read and close the real SDK socket; no mock authority or simulated location is used.',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceDirty:execFileSync('git',['status','--short'],{encoding:'utf8'}).trim(),build:JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json','utf8')),steps,errors};
const save=()=>writeFileSync(join(output,'evidence.json'),JSON.stringify(proof,null,2));
const record=(name,details={})=>{steps.push({at:new Date().toISOString(),name,...details});save();console.log(name);};
const api=async(page,feature,command,payload={})=>{const result=await page.evaluate(({feature,command,payload})=>window.lingjing.invoke(feature,command,payload),{feature,command,payload});assert.equal(result.ok,true,`${feature}.${command}: ${result.code} ${result.message}`);return result.data;};
async function launch(index) {
  let profile=profiles[index];
  if(!profile){const directory=join(output,`device-${index+1}`);mkdirSync(directory);profile=profiles[index]={directory};writeFileSync(join(directory,'.lingjing-live-battle-profile.json'),JSON.stringify({schemaVersion:1,runId,profilePath:realpathSync(directory),purpose:'real-cloud-battle-acceptance',simulated:false}),{flag:'wx'});}
  const env={...process.env,PET_USER_DATA_DIR:profile.directory,LINGJING_SUPABASE_URL:config.url,LINGJING_SUPABASE_PUBLISHABLE_KEY:config.publishableKey,SUPABASE_URL:config.url,SUPABASE_PUBLISHABLE_KEY:config.publishableKey,SUPABASE_ANON_KEY:config.publishableKey,LINGJING_BATTLE_TRACE:join(output,`device-${index+1}-https.jsonl`)};
  delete env.LINGJING_QA_SCENARIO;delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({args:[project],env});apps.set(index,app);const page=await app.firstWindow();const window=await app.browserWindow(page);await window.evaluate(win=>win.setContentSize(1280,844,false));page.on('pageerror',error=>errors.push({device:index+1,message:error.message}));await page.waitForFunction(()=>Boolean(window.lingjing));
  const existing=await api(page,'accounts','session');
  if(profile.loggedIn)assert.ok(existing.currentUser,'Native restart must restore persisted Auth; do not silently sign in again');
  else {await api(page,'accounts','login',{provider:'runtime',account:config.accounts[index].account,password:config.accounts[index].password,rememberSession:true});profile.loggedIn=true;}
  const identity=await api(page,'accounts','session');assert.ok(identity.currentUser);assert.notEqual(identity.dataMode,'simulated');profile.owner=identity.currentUser.ownerAccountId||identity.currentUser.id;
  const info=await api(page,'app','info');assert.ok(!info.scenario,'Do not run the foundation simulated QA transport in a real-cloud test');
  const inventory=await api(page,'companions','list');profile.pet=inventory.pets.find(pet=>(pet.petId||pet.id)===config.accounts[index].petId);assert.ok(profile.pet,'Restore the verified cloud-owned companion before running acceptance; never inject a local fake actor');
  return {app,page,index,profile};
}
async function route(page,path){await page.evaluate(path=>{location.hash=path;},path);}
async function screen(page,waiting=false) {
  await page.locator('[data-battle-screen="shared-v1"]').waitFor();
  await page.waitForFunction(count=>document.querySelectorAll('.battle-stage .resource-stage[data-status="ready"]').length===count,waiting?1:2);
  const id=await page.locator('[data-battle-screen]').getAttribute('data-session-id'),session=await api(page,'battle','snapshot',{sessionId:id});assert.equal(session.mode,'friend');assert.notEqual(session.context?.authority,'simulated');return session;
}
async function friendLobby(client){await api(client.page,'battle','selectPet',{petId:config.accounts[client.index].petId,actionId:randomUUID()});await route(client.page,'/battle/friends');await client.page.locator('.battle-friends-layout').waitFor();await client.page.locator('.battle-invitations').getByRole('button',{name:'刷新',exact:true}).click();}
async function connection(client) {
  const result=await client.app.evaluate(()=>{const online=globalThis.__liveBattle;if(!online)throw new Error('No actual OnlineDuelService channel observed');const value=online.getStatus();return {origin:online.supabaseUrl,authKind:value.authKind,actor:value.actor?{authority:value.actor.authority,authUserId:value.actor.authUserId,ownerAccountId:value.actor.ownerAccountId,deviceId:value.actor.deviceId,sessionId:value.actor.sessionId}:null,socket:online.client.realtime.connectionState(),channel:online.channel?.state};});
  assert.equal(result.origin,config.url);assert.equal(result.authKind,'supabase');assert.equal(result.actor.authority,'live');assert.equal(result.actor.ownerAccountId,client.profile.owner);return result;
}
const screenshot=async(page,name)=>page.screenshot({path:join(output,`${name}.png`)});
let failure;
try {
  let host=await launch(0);const guest=await launch(1);assert.notEqual(host.profile.owner,guest.profile.owner);await friendLobby(guest);await friendLobby(host);
  await host.page.getByLabel('搜索账号或用户名',{exact:true}).fill(config.accounts[1].account);await host.page.getByRole('button',{name:'搜索',exact:true}).click();await host.page.locator('.battle-user-list .battle-small-action').click();
  await guest.page.locator('.battle-invitations').getByRole('button',{name:'刷新',exact:true}).click();await guest.page.getByRole('button',{name:'接受',exact:true}).click();await screen(guest.page,true);await screenshot(guest.page,'accepted-waiting');
  await host.page.locator('.battle-invitations').getByRole('button',{name:'刷新',exact:true}).click();await host.page.getByRole('button',{name:'进入房间',exact:true}).click();let left=await screen(host.page),right=await screen(guest.page);assert.equal(left.room.id,right.room.id);assert.equal(left.player.petId,right.enemy.petId);
  const a=await connection(host),b=await connection(guest);assert.notEqual(a.actor.authUserId,b.actor.authUserId);assert.notEqual(a.actor.deviceId,b.actor.deviceId);profiles[0].deviceId=a.actor.deviceId;profiles[1].deviceId=b.actor.deviceId;record('two real JWT/device clients invited, accepted and joined one authorized Realtime room',{roomId:left.room.id,a,b});
  const observed=[[],[]];
  for(const client of [host,guest])await client.page.evaluate(()=>{window.__liveBattleEvents=[];window.lingjing.subscribe('battle:online',value=>window.__liveBattleEvents.push(value));});
  let round=0;
  while(left.status!=='finished'&&round<30) {
    const next=left.snapshot.round+1;await host.page.waitForFunction(()=>document.querySelector('.battle-live-layout').getAttribute('data-animation-phase')==='rest');await guest.page.waitForFunction(()=>document.querySelector('.battle-live-layout').getAttribute('data-animation-phase')==='rest');
    if(round===0)await host.app.evaluate(()=>{globalThis.__dropBattleResponseOnce=true;});
    if(round===1){await host.app.evaluate(()=>globalThis.__liveBattle.client.realtime.disconnect());record('real SDK WebSocket deliberately disconnected before reconnect');}
    await host.page.locator('.battle-command[data-action="normal_attack"]').click();
    const pending=await api(host.page,'battle','snapshot',{sessionId:left.id});assert.equal(pending.pendingAction.roundNo,next);assert.equal(pending.pendingAction.action,'normal_attack');
    if(round===0)assert.equal(pending.pendingAction.uncertain,true,'The real HTTPS response-read interruption must remain an original uncertain action');
    if(round===1){await host.app.evaluate(()=>globalThis.__liveBattle.client.realtime.connect());let reconnected;for(let attempt=0;attempt<30;attempt++){reconnected=await connection(host);if(reconnected.socket==='open'&&reconnected.channel==='joined')break;await new Promise(resolve=>setTimeout(resolve,300));}assert.equal(reconnected.socket,'open');assert.equal(reconnected.channel,'joined');record('same native process reconnected its actual authorized SDK channel',reconnected);}
    if(round===2){await screenshot(host.page,'pending-before-native-restart');await host.app.close();apps.delete(0);}
    await guest.page.locator('.battle-command[data-action="normal_attack"]').click();
    if(round===2){host=await launch(0);await route(host.page,`/battle/session/${left.id}`);await screen(host.page);const reconnected=await connection(host);assert.equal(reconnected.actor.deviceId,profiles[0].deviceId);record('native process restart restored original device/Auth and pending round',reconnected);}
    left=await api(host.page,'battle','sync',{sessionId:left.id});right=await api(guest.page,'battle','sync',{sessionId:right.id});assert.equal(left.snapshot.round,next);assert.equal(right.snapshot.round,next);assert.equal(left.snapshot.player.hp,right.snapshot.enemy.hp);assert.equal(left.snapshot.enemy.hp,right.snapshot.player.hp);assert.equal(left.pendingAction,null);assert.equal(right.pendingAction,null);
    await assert.rejects(api(host.page,'battle','retryAction',{sessionId:left.id}),/没有待确认/);assert.equal((await api(host.page,'battle','sync',{sessionId:left.id})).snapshot.round,next);round++;
    record(`real HTTPS round ${next} matches on both clients`,{roomId:left.room.id,playerHp:left.snapshot.player.hp,enemyHp:left.snapshot.enemy.hp,actions:left.rounds.at(-1).actions});
  }
  assert.equal(left.status,'finished');assert.equal(right.status,'finished');assert.ok(round>2);assert.equal(left.reward.applied,true);assert.equal(right.reward.applied,true);assert.notEqual(left.winner,right.winner);
  const before=[(await api(host.page,'companions','list')).pets,(await api(guest.page,'companions','list')).pets];for(const client of [host,guest]){const session=client.index===0?left:right;await api(client.page,'battle','retrySettlement',{sessionId:session.id});await api(client.page,'battle','retrySettlement',{sessionId:session.id});assert.deepEqual((await api(client.page,'companions','list')).pets,before[client.index]);}
  await screenshot(host.page,'finished-host');await screenshot(guest.page,'finished-guest');
  for(const client of [host,guest]) {
    const session=client.index===0?left:right,report=await api(client.page,'battle','getReport',{reportId:session.reportId});await client.page.getByRole('button',{name:'战报',exact:true}).click();await client.page.getByRole('region',{name:'战报详情'}).waitFor();await screenshot(client.page,`report-${client.index+1}`);await client.app.close();apps.delete(client.index);const restarted=await launch(client.index);const restored=await api(restarted.page,'battle','getReport',{reportId:session.reportId});assert.deepEqual(restored,report);observed[client.index]=report.rounds;
  }
  assert.equal(observed[0].length,round);assert.equal(observed[1].length,round);record('two completed cloud reports survive native restart; repeated settlement leaves both inventories/growth unchanged',{rounds:round,leftReward:left.reward,rightReward:right.reward});
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
