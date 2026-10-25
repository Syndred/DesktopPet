// Real production main/UI acceptance. Only position is an explicit, server-granted
// QA fixture; Auth, HTTPS, battle actions, rewards, capture and SQLite stay real.
// Reuses the committed natural victory. A new short UI battle is abandoned.
import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const root=resolve('.'),profileBase=resolve(process.env.LINGJING_CLOUD_GAME_RESUME||'artifacts/cloud-discovery/live-game-1792899947119');
const profileRelative=relative(resolve('artifacts/cloud-discovery'),profileBase);assert.ok(profileRelative&&!profileRelative.startsWith('..')&&!isAbsolute(profileRelative),'Only this worktree dedicated cloud-discovery test profiles may be reused');
const output=resolve(`artifacts/cloud-discovery/live-main-${Date.now()}`),scenarioId='cloud-discovery-03';
const capturedPetId='pet-a3efdc72-2007-4e4f-823e-297d52c9bc22',originalPermit='a3efdc72-2007-4e4f-823e-297d52c9bc22';
const originalSession='battle-cloud-'+originalPermit,originalEncounter='encounter-'+originalPermit;
const publicConfig=resolve(process.env.LINGJING_PUBLIC_CONFIG||'config/lingjing-cloud-public.json');
const checkpointPath=process.env.LINGJING_CLOUD_MAIN_CHECKPOINT&&resolve(process.env.LINGJING_CLOUD_MAIN_CHECKPOINT),checkpoint=checkpointPath?JSON.parse(readFileSync(checkpointPath,'utf8')):null;
if(checkpoint){assert.equal(checkpoint.passed,true);assert.equal(checkpoint.scenarioId,scenarioId);assert.equal(checkpoint.shortBattle.status,'abandoned');}
mkdirSync(output,{recursive:true});
const evidence={at:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),
  sourceDirty:execFileSync('git',['status','--porcelain'],{encoding:'utf8',windowsHide:true}).trim().split('\n').filter(Boolean),
  build:JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json','utf8')),projectRef:'jbvrdmrkwpznbrvteive',scenarioId,
  realAuth:true,realHttps:true,productionMain:true,sharedBattleScreen:true,syntheticPosition:true,physicalPositionAcceptance:false,
  physicalSecondDevice:false,rawCoordinatesSaved:false,newNaturalVictory:false,actors:[],checks:[],errors:[]};
if(checkpoint)evidence.reusedLiveUiEvidence={path:checkpointPath,sha256:createHash('sha256').update(readFileSync(checkpointPath)).digest('hex'),sourceCommit:checkpoint.sourceCommit,at:checkpoint.at,shortBattle:checkpoint.shortBattle};
const apps=[],bootstrap=join(output,'production-observer.cjs');let credentials;
const save=()=>writeFileSync(join(output,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
const phase=(name,extra={})=>{save();console.log(JSON.stringify({phase:name,at:new Date().toISOString(),output,...extra}));};
writeFileSync(bootstrap,`const core=require(${JSON.stringify(join(root,'apps/pc-app/runtime/core/services.cjs'))}),create=core.createServices;let registry;const timings=[];
function observe(fn,label,receiver,args){const item={label,start:Date.now(),status:'pending'};timings.push(item);if(timings.length>300)timings.shift();try{const result=Reflect.apply(fn,receiver,args);if(result?.then)result.then(()=>{item.status='fulfilled';item.durationMs=Date.now()-item.start;},e=>{item.status=e.code||'rejected';item.durationMs=Date.now()-item.start;});else{item.status='fulfilled';item.durationMs=Date.now()-item.start;}return result;}catch(e){item.status=e.code||'rejected';throw e;}}
core.createServices=(...args)=>{registry=create(...args);const invoke=registry.invoke;registry.invoke=function(...args){return observe(invoke,args[0]+'.'+args[1],this,args);};return registry;};
const Battle=require(${JSON.stringify(join(root,'apps/pc-app/runtime/features/battle/service.cjs'))}).BattleFeatureService,overview=Battle.prototype.overview;
Battle.prototype.overview=function(...args){if(!this.online.__timingObserver){const invoke=this.online.invoke;this.online.invoke=function(...args){return observe(invoke,'battle-online:'+args[0],this,args);};this.online.__timingObserver=true;}return Reflect.apply(overview,this,args);};
global.__cloudMainProbe=async({op,...input})=>{
 await new Promise(setImmediate);const s=registry;await s.get('accounts').ready;
 if(op==='timings')return timings;
 if(op==='actor'){const c=await s.get('cloudActor').requireActor();return{actor:c.actor,electron:process.versions.electron,qaProfile:Boolean(s.get('qaScenario'))};}
 if(op==='credentials')return JSON.parse(s.safeStorage.decryptString(require('node:fs').readFileSync(input.path)));
 if(op==='invoke')return s.get('cloudActor').invoke(input.name,input.body);
 if(op==='qaPosition'){
  const c=await s.get('cloudActor').requireActor(),protocol=await c.invoke('discovery',{op:'protocol'});
  if(c.authUserId!=='319083e4-2592-4369-84b4-0f05f6c2ea3a'||c.deviceId!=='b9300119-4e88-41d5-b182-051c3f943e87'||protocol.simulatedLocationAllowed!==true||protocol.scenarioId!==${JSON.stringify(scenarioId)})throw Error('Dedicated coordinator QA grant required');
  const permits=await c.invoke('discovery',{op:'permits'}),permit=permits.find(p=>p.id===${JSON.stringify(originalPermit)});if(!permit)throw Error('Original captured permit missing');
  const discovery=s.get('discovery'),position=input.spawnId?discovery.cloudRuntime.nearbyState?.spawns.find(p=>p.id===input.spawnId)?.position:permit.spawn.position;if(!position)throw Error('Only a real server-generated nearby point may be selected');
  const location=discovery.location;location.reset();location.adapter={scenario:'qa',scenarioId:protocol.scenarioId,metricFix:f=>f&&({...f,source:'os'}),getPosition:async()=>({ok:true,...position,accuracyMeters:5,timestampMs:Date.now(),coordinateSystem:'wgs84',source:'simulated',provider:'qa-discovery',scenarioId:protocol.scenarioId})};
  return{scenarioId:protocol.scenarioId,source:'simulated',protocol:protocol.protocol,coordinateHash:require('node:crypto').createHash('sha256').update(position.lat+','+position.lng).digest('hex')};
 }
 if(op==='journal'){const c=await s.get('cloudActor').requireActor();return s.db.prepare("select result from account_actions where owner_account_id=? and kind='discovery-cloud-command' and json_extract(result,'$.sessionId')=? order by rowid").all(c.ownerAccountId,input.sessionId).map(r=>JSON.parse(r.result));}
 if(op==='sqlite'){
  const c=await s.get('cloudActor').requireActor(),owner=c.ownerAccountId;
  return{owner,pets:s.db.prepare('select pet_id,data_json from companion_pets where owner_account_id=? order by pet_id').all(owner).map(r=>{const p=JSON.parse(r.data_json);return{petId:r.pet_id,experience:p.growth.experience,resourceId:p.resource.resourceId};}),
   captures:s.db.prepare('select pet_id,data_json from discovery_captures where owner_account_id=?').all(owner).map(r=>({petId:r.pet_id,battleId:JSON.parse(r.data_json).battleId})),
   memories:s.db.prepare('select pet_id,count(*) count from discovery_memory_tags where owner_account_id=? group by pet_id').all(owner)};
 }
 if(op==='capture'){
  const {BrowserWindow}=require('electron'),window=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w.webContents.getURL().includes('/renderer/'))||BrowserWindow.getAllWindows().find(w=>!w.isDestroyed());
  const image=await window.capturePage(),bitmap=image.toBitmap(),colors=new Set();let opaque=0;for(let i=0;i<bitmap.length;i+=16){if(bitmap[i+3])opaque++;colors.add(bitmap.readUInt32LE(i));}
  return{base64:image.toPNG().toString('base64'),size:image.getSize(),sampleColors:colors.size,opaqueSamples:opaque};
 }
 throw Error('Unknown observer operation');
};require(${JSON.stringify(join(root,'apps/pc-app/dist/main/index.cjs'))});\n`);

async function probe(client,op,input={}){const reply=await client.app.evaluate(async(_electron,args)=>{try{return{ok:true,data:await global.__cloudMainProbe(args)};}catch(e){return{ok:false,code:e.code||'OBSERVER_FAILED',message:e.message};}},{op,...input});if(!reply.ok)throw Object.assign(new Error(reply.code+': '+reply.message),{code:reply.code});return reply.data;}
const remote=(client,name,body)=>probe(client,'invoke',{name,body});
async function ipc(client,feature,command,payload={}){const r=await client.page.evaluate(args=>window.lingjing.invoke(args.feature,args.command,args.payload),{feature,command,payload});assert.equal(r.ok,true,feature+'.'+command+': '+JSON.stringify(r));return r.data;}
async function launch(label){
 const env={...process.env,PET_USER_DATA_DIR:join(profileBase,label),LINGJING_PUBLIC_CONFIG:publicConfig};
 for(const key of['ELECTRON_RUN_AS_NODE','PET_RUNTIME_DATA_FILE','LINGJING_QA_SCENARIO','LINGJING_CONTROLLED_LOCATION','LINGJING_BATTLE_QA','LINGJING_LEGACY_AUTH'])delete env[key];
 const app=await electron.launch({args:[bootstrap],cwd:root,env});apps.push(app);const page=await app.firstWindow();page.on('pageerror',e=>evidence.errors.push(e.message));await page.waitForFunction(()=>Boolean(window.lingjing));
 const client={app,page,label};if(label==='device-a')credentials=await probe(client,'credentials',{path:join(profileBase,'credentials.secure')});
 if(!(await ipc(client,'accounts','session')).currentUser)await ipc(client,'accounts','login',{provider:'runtime',...credentials,rememberSession:true});
 const identity=await probe(client,'actor');assert.equal(identity.electron,'44.9.3');assert.equal(identity.qaProfile,false);assert.equal(identity.actor.ownerAccountId,'account:31fa2df1-6847-4466-84ca-ed92bc4ee78f');client.actor=identity.actor;evidence.actors.push({label,...identity});return client;
}
async function until(client,predicate,label,timeout=40000){const deadline=Date.now()+timeout;while(Date.now()<deadline){const data=await ipc(client,'discovery','snapshot');if(predicate(data))return data;await client.page.waitForTimeout(200);}throw Error('Timed out: '+label);}
async function screenCapture(client,name){const shot=await probe(client,'capture');assert.ok(shot.sampleColors>100);assert.ok(shot.opaqueSamples>10000);writeFileSync(join(output,name+'.png'),Buffer.from(shot.base64,'base64'));const {base64,...metrics}=shot;return{name:name+'.png',...metrics};}
const rendererActors=client=>client.page.locator('.resource-stage').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().width>0).map(n=>({resourceId:n.getAttribute('data-resource-id'),petId:n.getAttribute('data-pet-id'),status:n.getAttribute('data-status'),action:n.getAttribute('data-action'),clip:n.getAttribute('data-clip'),playbackKey:n.getAttribute('data-playback-key')})));
const check=(label,details={})=>evidence.checks.push({label,passed:true,...details});
try{
 const a=await launch('device-a'),b=await launch('device-b');assert.notEqual(a.actor.deviceId,b.actor.deviceId);assert.notEqual(a.actor.sessionId,b.actor.sessionId);
 evidence.positionFixture=await probe(a,'qaPosition');phase('server-grant-verified');
 const before=await remote(a,'lingjing-save',{op:'read'}),unit=before.envelope.data.modules.companions.data.tables;phase('canonical-head-read');
 evidence.originalPetId=unit.companion_pets.find(p=>p.pet_id!==capturedPetId).pet_id;
 const settings=await ipc(a,'accounts','settingsGet');if(!settings.document.privacy.locationAllowed){settings.document.privacy.locationAllowed=true;await ipc(a,'accounts','settingsSave',{revision:settings.revision,document:settings.document,actionId:randomUUID()});}
 phase('privacy-setting-ready');await a.page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'附近探索',exact:true}).click();await a.page.locator('.discovery-main-heading').waitFor();phase('discovery-route-open');
 await a.app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.isVisible());w?.show();w?.focus();});
 await ipc(a,'discovery','setExploring',{active:true});let state=await ipc(a,'discovery','snapshot');
 if(!checkpoint&&!state.encounters.some(e=>e.status==='challenging'&&e.petId===capturedPetId)){await ipc(a,'discovery','watch');state=await until(a,s=>s.location.status==='ready'&&s.spawns.length>0,'server nearby');assert.equal(state.location.fix.source,'simulated');}
 assert.equal(state.storage,'cloud');assert.equal(state.scenario,'qa');
 assert.equal(typeof state.captures.find(c=>c.petId===capturedPetId).serial,'string');assert.ok(state.captures.find(c=>c.petId===capturedPetId).serial.length);check('production discovery snapshot imports canonical companion and existing capture');phase('canonical-main-projection-ready');
 const previousShort=state.encounters.find(e=>checkpoint?e.battle?.battleId===checkpoint.shortBattle.sessionId:e.status==='challenging'&&e.petId===capturedPetId);
 let short;
 if(previousShort){short=await ipc(a,'battle','snapshot',{sessionId:previousShort.battle.battleId});await a.page.evaluate(id=>{location.hash='#/discovery/encounter/'+id;},previousShort.encounterId);}
 else{
  let target=state.spawns.slice(0,8).find(p=>p.captureState==='available'&&p.inRange);
  if(!target){const next=state.spawns.slice(0,8).find(p=>p.captureState==='available');assert.ok(next);evidence.positionFixtureMove=await probe(a,'qaPosition',{spawnId:next.id});await ipc(a,'discovery','watch');state=await until(a,s=>s.location.status==='ready'&&s.spawns.some(p=>p.captureState==='available'&&p.inRange),'fresh proof at another real server point');target=state.spawns.slice(0,8).find(p=>p.captureState==='available'&&p.inRange);}
  assert.ok(target,'A new server point must lie inside the original 100m range');
  await a.page.locator('.discovery-map[data-map-ready="true"]').waitFor({timeout:40000});await a.page.getByRole('button',{name:'地图回到当前位置',exact:true}).click();
  await a.page.locator('.discovery-pin-button[data-spawn-id="'+target.id+'"]').click();await a.page.getByRole('button',{name:'和她打个招呼',exact:true}).click();await a.page.locator('.discovery-wild-view').waitFor();
  await a.page.getByRole('combobox',{name:'当前挑战伙伴',exact:true}).click();await a.page.getByRole('option').filter({hasText:'跨端同一新伙伴'}).click();await ipc(a,'discovery','watch');phase('fresh-ui-challenge-position');await a.page.getByRole('button',{name:'开始挑战',exact:true}).click();
  const started=await until(a,s=>s.encounters.some(e=>e.status==='challenging'&&e.petId===capturedPetId),'UI-created server challenge');short=await ipc(a,'battle','snapshot',{sessionId:started.encounters.find(e=>e.status==='challenging'&&e.petId===capturedPetId).battle.battleId});
 }
 const screen=a.page.locator('[data-battle-screen="shared-v1"][data-battle-mode="wild"]');await screen.waitFor({timeout:90000});assert.equal(await screen.getAttribute('data-session-id'),short.id);assert.equal(await screen.getAttribute('data-authority'),'simulated');assert.equal(await screen.getAttribute('data-battle-layout'),'v3');assert.equal(short.player.petId,capturedPetId);assert.equal(short.status,checkpoint?'abandoned':'active');
 await a.page.getByLabel('隔离模拟场景',{exact:true}).waitFor();evidence.shortBattle={sessionId:short.id,playerPetId:short.player.petId,initialRound:short.snapshot.round,renderedActions:[]};phase('shared-cloud-battle-open',{sessionId:short.id});
 for(const action of(checkpoint?[]:['normal_attack','element_attack'].slice(short.snapshot.round))){
  const nextRound=short.snapshot.round+1;
  await a.page.evaluate(()=>{window.__cloudAnimationSamples=[];window.__cloudAnimationTimer=setInterval(()=>{const el=document.querySelector('.battle-live-layout');if(el)window.__cloudAnimationSamples.push({phase:el.getAttribute('data-animation-phase'),key:el.getAttribute('data-animation-key'),at:performance.now()});},16);});
  await a.page.locator('.battle-command-group .battle-move.'+action).click();
  await a.page.waitForFunction(({id,round})=>{const e=document.querySelector('.battle-live-layout');return e?.getAttribute('data-animation-key')===id+':'+round&&e.getAttribute('data-animation-phase')==='rest';},{id:short.id,round:nextRound},{timeout:45000});
  const samples=await a.page.evaluate(()=>{clearInterval(window.__cloudAnimationTimer);return window.__cloudAnimationSamples;});
  short=await ipc(a,'battle','snapshot',{sessionId:short.id});assert.equal(short.snapshot.round,nextRound);const peer=await ipc(b,'battle','snapshot',{sessionId:short.id});assert.deepEqual(peer.snapshot,short.snapshot);assert.equal(peer.player.petId,capturedPetId);
  const phases=[...new Set(samples.filter(s=>s.key===short.id+':'+nextRound).map(s=>s.phase))];assert.ok(phases.includes('impact'));evidence.shortBattle.renderedActions.push({action,round:nextRound,phases,peerMatches:true});phase('ui-action-confirmed',{action,round:nextRound});
 }
 const journal=await probe(a,'journal',{sessionId:short.id}),acted=journal.find(j=>j.request.op==='act');assert.ok(acted);assert.equal(acted.status,'verified');
 const conflict=await a.page.evaluate(input=>window.lingjing.invoke('battle','act',input),{sessionId:short.id,actionId:acted.request.actionId,action:'dodge',expectedRound:acted.request.expectedRound});assert.equal(conflict.ok,false);assert.equal(conflict.code,'ACTION_ID_CONFLICT');assert.equal((await ipc(b,'battle','snapshot',{sessionId:short.id})).snapshot.round,short.snapshot.round);check('same UI action id rejects a changed move without another round');
 if(!checkpoint){await a.page.locator('.battle-leave-button').click();await a.page.getByRole('dialog',{name:'离开对战'}).getByRole('button',{name:'离开',exact:true}).click();}
 await a.page.getByText('已离开',{exact:true}).waitFor({timeout:40000});short=await ipc(b,'battle','snapshot',{sessionId:short.id});assert.equal(short.status,'abandoned');evidence.shortBattle.status=short.status;check(checkpoint?'original UI leave remains abandoned on replay':'real shared UI leave abandons server battle');
 if(checkpoint){const reserve=journal.find(j=>j.request.op==='reserve');assert.ok(reserve);assert.equal((await ipc(a,'discovery','snapshot')).location.fix,null);const recovered=await ipc(a,'discovery','begin',{spawnId:reserve.request.spawnId,petId:reserve.request.petId,actionId:reserve.request.actionId});assert.equal(recovered.battle.battleId,short.id);assert.equal(recovered.status,'cancelled');check('original begin receipt recovers after expiry without a new position or challenge');}
 await a.page.evaluate(id=>{location.hash='#/battle/session/'+id;},originalSession);await screen.waitFor({timeout:40000});await a.page.waitForFunction(id=>document.querySelector('[data-battle-screen]')?.getAttribute('data-session-id')===id,originalSession);
 const won=await ipc(a,'battle','snapshot',{sessionId:originalSession});assert.equal(won.status,'finished');assert.equal(won.winner,'player');assert.equal(won.snapshot.round,28);assert.equal(won.player.petId,evidence.originalPetId);evidence.existingVictory={sessionId:won.id,rounds:won.snapshot.round,playerPetId:won.player.petId,reward:won.reward};
 await a.page.locator('.battle-stage .resource-stage[data-status="ready"]').first().waitFor({timeout:40000});evidence.wonRendererActors=await rendererActors(a);evidence.wonScreen=await screenCapture(a,'existing-cloud-victory');
 const report=await ipc(a,'battle','getReport',{reportId:'report-cloud-'+originalPermit});assert.equal(report.status,'finished');assert.equal(report.rounds.length,28);assert.equal(report.player.petId,evidence.originalPetId);
 await a.page.getByRole('button',{name:'战报',exact:true}).click();await a.page.locator('.battle-reports-layout').waitFor({timeout:90000});await a.page.getByRole('button',{name:'第 28 回合',exact:true}).waitFor();await a.page.waitForFunction(()=>{const e=document.querySelector('.battle-reports-layout')?.closest('.app-page-motion');return !e||Number(getComputedStyle(e).opacity)>.99;});assert.match(await a.page.locator('.battle-reward-summary').innerText(),/28 回合/);evidence.reportRendererActors=await rendererActors(a);evidence.reportScreen=await screenCapture(a,'existing-cloud-report');check('existing natural victory and full report render original pet and 28 rounds');
 const replay=await ipc(a,'battle','settleContext',{sessionId:originalSession,actionId:'cloud-main-replay:'+randomUUID(),name:'重复确认不应改名'});assert.equal(replay.petId,capturedPetId);assert.equal(replay.resultPath,'/discovery/result/'+originalEncounter);check('normal battle.settleContext recovers original captured pet');
 await a.page.evaluate(id=>{location.hash='#/discovery/result/'+id;},originalEncounter);await a.page.locator('.discovery-result').waitFor({timeout:40000});await a.page.locator('.discovery-postcard .resource-stage[data-status="ready"] canvas').waitFor({timeout:40000});evidence.resultRendererActors=await rendererActors(a);assert.ok(evidence.resultRendererActors.some(r=>r.petId===capturedPetId&&r.resourceId==='builtin:lingjing-shiba-v2'&&r.status==='ready'));evidence.resultScreen=await screenCapture(a,'same-cloud-captured-pet');
 const final=await remote(a,'lingjing-save',{op:'read'}),tables=final.envelope.data.modules.companions.data.tables,pets=tables.companion_pets.map(p=>JSON.parse(p.data_json));
 assert.equal(pets.length,2);assert.equal(pets.find(p=>p.petId===evidence.originalPetId).growth.experience,20);assert.equal(pets.find(p=>p.petId===capturedPetId).growth.experience,0);assert.equal(tables.companion_capture_receipts.length,1);assert.equal(final.envelope.data.modules.garden.data.tables.garden_reward_receipts.filter(r=>r.source==='battle').length,1);
 evidence.cloudCounts={revision:final.revision,pets:pets.length,companionCaptureReceipts:tables.companion_capture_receipts.length,battleSeedReceipts:1,originalExperience:20,capturedExperience:0};evidence.sqliteA=await probe(a,'sqlite');assert.equal(evidence.sqliteA.captures.length,1);assert.equal(evidence.sqliteA.memories.find(m=>m.pet_id===capturedPetId).count,1);
 await a.app.close();const reopened=await launch('device-a');const restored=await ipc(reopened,'discovery','snapshot');assert.equal(restored.captures.find(c=>c.petId===capturedPetId).petId,capturedPetId);assert.equal(restored.location.fix,null);assert.equal(restored.location.watching,false);assert.equal((await ipc(reopened,'battle','snapshot',{sessionId:originalSession})).snapshot.round,28);evidence.restart=await probe(reopened,'sqlite');assert.equal(evidence.restart.captures.length,1);
 check('short abandoned UI battle adds no growth, capture, memory or seed receipt; cold restart retains original pet');assert.deepEqual(evidence.errors,[]);evidence.passed=true;phase('passed');
}catch(error){evidence.passed=false;evidence.error=error.message;for(const [i,app]of apps.entries()){try{evidence['timings'+i]=await probe({app},'timings');}catch{}for(const page of app.windows())if(!page.isClosed())await page.screenshot({path:join(output,'failure-private-'+i+'.png')}).catch(()=>{});}phase('failed',{message:error.message});throw error;}
finally{for(const app of apps.reverse())await app.close().catch(()=>{});save();writeFileSync(resolve('artifacts/cloud-discovery/latest-live-main.json'),JSON.stringify({...evidence,output},null,2)+'\n');}
