import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, realpathSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { RuntimeDataStore } = require('../../services/runtime-data-store.cjs');
const { startQaDuelServer } = require('./tests/qa-duel-server.cjs');
const { MARKER, SCENARIO } = require('../../core/qa-scenario.cjs');
const output = resolve('artifacts/battle', `unified-${Date.now()}`), project = join(output, 'application');
const runId = randomUUID(), token = randomBytes(32).toString('hex');
const runtime = resolve('apps/pc-app/runtime'), overlay = join(project, 'apps/pc-app/runtime');
mkdirSync(overlay, { recursive: true });
cpSync(runtime, overlay, { recursive: true, filter: source => source !== join(runtime, 'assets') });
symlinkSync(join(runtime, 'assets'), join(overlay, 'assets'), 'junction');
cpSync(resolve('apps/pc-app/dist'), join(project, 'apps/pc-app/dist'), { recursive: true });
writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'lingjing-unified-battle-qa', version: '0.0.0', main: 'bootstrap.cjs' }));
writeFileSync(join(project, 'bootstrap.cjs'), `
const {readQaScenario}=require('./apps/pc-app/runtime/core/qa-scenario.cjs');
const scenario=readQaScenario({userData:process.env.PET_USER_DATA_DIR});
if(!scenario)throw new Error('This verification host requires an explicitly isolated profile');
const {readFileSync,existsSync}=require('node:fs');const {join}=require('node:path');
const {WindowsLocationAdapter}=require('./apps/pc-app/runtime/features/discovery/location-adapter.cjs');
WindowsLocationAdapter.prototype.getPosition=async function(){const file=join(scenario.profilePath,'qa-location.json');const point=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{lat:31.2304,lng:121.4737};return {ok:true,...point,accuracyMeters:15,timestampMs:Date.now(),provider:'qa-simulated-location',positionSource:'simulated'};};
require('./apps/pc-app/dist/main/index.cjs');
`);
const server = await startQaDuelServer({ runId, token, directory: join(output, 'authority') });
const profiles = {}, apps = new Map(), logs = {}, errors = [], steps = [], cases = [];
let failure;
const sourceFiles = ['apps/pc-app/runtime/services/battle-runtime.cjs','apps/pc-app/runtime/features/battle/service.cjs','apps/pc-app/runtime/features/battle/presentation.cjs','apps/pc-app/runtime/features/battle/qa-adapter.cjs','apps/pc-app/ui/src/features/battle/BattleScreen.tsx','apps/pc-app/ui/src/features/battle/BattleArena.tsx','apps/pc-app/ui/src/features/battle/BattleMoves.tsx','apps/pc-app/ui/src/features/battle/useBattleAnimation.ts','apps/pc-app/ui/src/features/battle/useBattleSession.ts','apps/pc-app/runtime/features/resources/assets/roster-v2/catalog.json'];
const evidence = { at: new Date().toISOString(), provenance: 'simulated', scenarioId: runId, sourceCommit: execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), sourceDirty: execFileSync('git',['status','--short'],{encoding:'utf8'}).trim(), sourceHashes: sourceFiles.map(file=>({file,sha256:createHash('sha256').update(readFileSync(file)).digest('hex')})),
  fixtures: { location:'explicit QA WindowsLocationAdapter replacement in isolated bootstrap; not physical location evidence', enemy:'explicit QA preset or declared opponent action; unchanged runtime executeRound', profiles:'two newly created and path-bound foundation QA profiles' }, steps, cases, errors };
function save() { writeFileSync(join(output,'evidence.json'),JSON.stringify(evidence,null,2)); }
function record(name, details={}) { steps.push({at:new Date().toISOString(),name,...details}); save(); console.log(name); }
async function api(page, feature, command, payload={}) {
  const value=await page.evaluate(({feature,command,payload})=>window.lingjing.invoke(feature,command,payload),{feature,command,payload});
  assert.equal(value.ok,true,`${feature}.${command}: ${value.code} ${value.message}`); return value.data;
}
function profile(name) {
  const directory=join(output,name); mkdirSync(directory);
  writeFileSync(join(directory,MARKER),JSON.stringify({schemaVersion:1,application:'lingjing',scenario:SCENARIO,runId,isolated:true,profilePath:realpathSync(directory),createdAt:new Date().toISOString()},null,2),{flag:'wx'});
  writeFileSync(join(directory,'battle-transport.json'),JSON.stringify({runId,endpoint:server.endpoint,token,enemyActions:{training:['dodge'],wild:['dodge'],territory:['dodge']}}));
  const account=`battle-qa-${name}-${Date.now()}`;
  const legacy=new RuntimeDataStore({filePath:join(directory,'pet-runtime-data.json'),sessionFilePath:join(directory,'pet-auth-session.json')});
  legacy.registerUser(account,'isolated-local-verification',name==='host'?'并肩甲':'并肩乙');
  profiles[name]={directory,account}; return profiles[name];
}
async function launch(name) {
  const config=profiles[name]||profile(name), env={...process.env,PET_USER_DATA_DIR:config.directory,LINGJING_QA_SCENARIO:SCENARIO}; delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({args:[project],env}); apps.set(name,app); logs[name]||=[];
  for(const stream of [app.process().stdout,app.process().stderr])stream?.on('data',value=>logs[name].push(String(value)));
  const page=await app.firstWindow(), window=await app.browserWindow(page);
  await window.evaluate(win=>win.setContentSize(1280,844,false));
  page.on('pageerror',error=>errors.push({peer:name,message:error.message}));
  await page.waitForFunction(()=>Boolean(window.lingjing));
  await api(page,'accounts','login',{provider:'local',account:config.account,password:'isolated-local-verification',rememberSession:true});
  const settings=await api(page,'accounts','settingsGet'); settings.document.privacy.locationAllowed=true; settings.document.notifications.enabled=false; settings.document.desktop.interactionSounds=false;
  await api(page,'accounts','settingsSave',{actionId:randomUUID(),revision:settings.revision,document:settings.document});
  const inventory=await api(page,'companions','list');
  const pets=[];
  for(const template of inventory.templates){const adopted=await api(page,'companions','adopt',{actionId:`unified-adopt:${template.templateId}`,templateId:template.templateId,name:template.name,showOnDesktop:false});pets.push(adopted.pet);}
  profiles[name].pets=pets; return {app,page,pets};
}
async function route(page,path) { await page.evaluate(path=>{location.hash=path;},path); }
async function screen(page) {
  await page.locator('[data-battle-screen="shared-v1"]').waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('.battle-stage .resource-stage[data-status="ready"]').length===2);
  assert.equal(await page.locator('.battle-move').count(),4);
  assert.equal(await page.locator('.discovery-arena,.discovery-battle-actions').count(),0);
  const id=await page.locator('[data-battle-screen]').getAttribute('data-session-id');
  return api(page,'battle','snapshot',{sessionId:id});
}
async function startTraining(page,pet,enemyElement='fire') {
  await api(page,'battle','selectPet',{petId:pet.petId,actionId:randomUUID()}); await route(page,'/battle');
  await page.getByRole('heading',{name:'对战中心',exact:true}).waitFor();
  await page.getByRole('combobox',{name:'训练对手五行'}).click();
  const label={metal:'金',wood:'木',earth:'土',water:'水',fire:'火'}[enemyElement];
  await page.getByRole('option',{name:new RegExp(`^${label} ·`)}).click();
  await page.getByRole('button',{name:'开始',exact:true}).click(); return screen(page);
}
async function preset(page,session,preset='charged',enemyAction='dodge') {
  const state=await api(page,'battle','qaPreset',{sessionId:session.id,preset,enemyAction});
  await page.reload(); await screen(page); return state;
}
async function observe(page) {
  await page.evaluate(()=>{
    window.__unifiedSamples=[]; window.__unifiedObserver?.disconnect();
    const root=document.querySelector('.battle-live-layout');
    const sample=()=>{const value={at:performance.now(),phase:root?.getAttribute('data-animation-phase'),actors:[...document.querySelectorAll('.battle-stage .resource-stage')].map(node=>({action:node.getAttribute('data-action'),clip:node.getAttribute('data-clip'),frame:node.querySelector('.resource-sprite-host')?.getAttribute('data-frame'),fallback:node.getAttribute('data-fallback')})),events:[...document.querySelectorAll('[data-event-kind]')].map(node=>node.getAttribute('data-event-kind'))};const last=window.__unifiedSamples.at(-1);if(JSON.stringify({...last,at:0})!==JSON.stringify({...value,at:0}))window.__unifiedSamples.push(value);};
    window.__unifiedObserver=new MutationObserver(sample);window.__unifiedObserver.observe(root,{attributes:true,childList:true,subtree:true});sample();
  });
}
async function action(page,session,action,label,{screenshots=true}={}) {
  await observe(page);
  await page.getByRole('button',{name:{normal_attack:'普通攻击',element_attack:'属性攻击',dodge:'闪避',ultimate:'大招'}[action],exact:true}).click();
  const captures=[];
  for(const phase of ['release','impact','effects']) {
    await page.waitForFunction(phase=>document.querySelector('.battle-live-layout')?.getAttribute('data-animation-phase')===phase,phase);
    await page.waitForTimeout(120);
    if(screenshots){await page.screenshot({path:join(output,`${label}-${phase}.png`)});captures.push(`${label}-${phase}.png`);}
  }
  await page.waitForFunction(()=>document.querySelector('.battle-live-layout')?.getAttribute('data-animation-phase')==='rest');
  const after=await api(page,'battle','snapshot',{sessionId:session.id});
  const samples=await page.evaluate(()=>window.__unifiedSamples);
  for(const phase of ['windup','release','impact','effects','rest'])assert.ok(samples.some(sample=>sample.phase===phase),`${label}: missing ${phase}`);
  assert.ok(samples.every(sample=>sample.actors.every(actor=>actor.fallback!=='true')),'Missing canonical action must not be hidden by an idle fallback');
  assert.equal(after.snapshot.round,session.snapshot.round+1);
  const result={label,action,before:session,after,samples,screenshots:captures};cases.push(result);save(); return result;
}
async function abandon(page,session) { await api(page,'battle','leave',{sessionId:session.id}); }
async function friends(page,pet) {
  await api(page,'battle','selectPet',{petId:pet.petId,actionId:randomUUID()}); await route(page,'/battle/friends');
  await page.locator('.battle-friends-layout').waitFor();
  await page.locator('.battle-invitations').getByRole('button',{name:'刷新',exact:true}).click();
}
async function verifyFriends(host) {
  const guest=await launch('guest'), hostPet=host.pets.find(pet=>pet.element==='water'), guestPet=guest.pets.find(pet=>pet.element==='metal');
  await friends(guest.page,guestPet);await friends(host.page,hostPet);
  await host.page.getByLabel('搜索账号或用户名',{exact:true}).fill(profiles.guest.account);
  await host.page.getByRole('button',{name:'搜索',exact:true}).click();
  await host.page.locator('.battle-user-list .battle-small-action').click();
  await guest.page.locator('.battle-invitations').getByRole('button',{name:'刷新',exact:true}).click();
  await guest.page.getByRole('button',{name:'接受',exact:true}).click();
  await host.page.locator('.battle-invitations').getByRole('button',{name:'刷新',exact:true}).click();
  await host.page.getByRole('button',{name:'进入房间',exact:true}).click();
  let hostSession=await screen(host.page), guestSession=await screen(guest.page);
  assert.equal(hostSession.room.id,guestSession.room.id);assert.equal(hostSession.player.petId,guestSession.enemy.petId);
  assert.equal(hostSession.context.authority,'simulated');assert.equal(guestSession.context.authority,'simulated');
  hostSession=await preset(host.page,hostSession,'charged');await guest.page.reload();guestSession=await screen(guest.page);
  await host.page.getByRole('button',{name:'普通攻击',exact:true}).click();
  const pending=await api(host.page,'battle','snapshot',{sessionId:hostSession.id});assert.equal(pending.pendingAction.action,'normal_attack');assert.equal(pending.snapshot.round,0);
  await host.page.screenshot({path:join(output,'friend-pending-before-restart.png')});
  await host.app.close();apps.delete('host');
  await action(guest.page,guestSession,'element_attack','friend-interrupted-guest');
  host=await launch('host');await route(host.page,`/battle/session/${hostSession.id}`);await screen(host.page);
  await host.page.waitForFunction(()=>Number(document.querySelector('.battle-stage')?.getAttribute('data-round'))===1);
  await host.page.waitForFunction(()=>document.querySelector('.battle-live-layout')?.getAttribute('data-animation-phase')==='rest');
  hostSession=await api(host.page,'battle','snapshot',{sessionId:hostSession.id});guestSession=await api(guest.page,'battle','snapshot',{sessionId:guestSession.id});
  assert.equal(hostSession.pendingAction,null);assert.equal(hostSession.rounds.length,1);assert.equal(hostSession.snapshot.player.hp,guestSession.snapshot.enemy.hp);
  assert.equal(server.state.rounds[hostSession.room.id].length,1);
  await host.page.screenshot({path:join(output,'friend-restored-after-resolution.png')});
  await host.app.close();apps.delete('host');host=await launch('host');await route(host.page,`/battle/session/${hostSession.id}`);await screen(host.page);await observe(host.page);await host.page.waitForTimeout(800);
  const restoredSamples=await host.page.evaluate(()=>window.__unifiedSamples);assert.ok(restoredSamples.every(value=>value.phase==='rest'));
  record('two isolated friend UIs: invite, accept, same room, pending restart, one resolution and no historical replay',{roomId:hostSession.room.id,pending:pending.pendingAction,host:hostSession,guest:guestSession,restoredSamples});
  await abandon(host.page,hostSession);await api(guest.page,'battle','sync',{sessionId:guestSession.id});
  await friends(host.page,hostPet);await friends(guest.page,guestPet);
  await host.page.getByRole('button',{name:'创建房间',exact:true}).click();await host.page.locator('[data-battle-screen="shared-v1"]').waitFor();
  hostSession=await api(host.page,'battle','snapshot',{sessionId:await host.page.locator('[data-battle-screen]').getAttribute('data-session-id')});
  await guest.page.locator('#battle-room-code').fill(hostSession.room.room_code);await guest.page.getByRole('button',{name:'加入房间',exact:true}).click();guestSession=await screen(guest.page);
  await host.page.waitForFunction(()=>document.querySelectorAll('.battle-stage .resource-stage[data-status="ready"]').length===2);
  hostSession=await api(host.page,'battle','sync',{sessionId:hostSession.id});hostSession=await preset(host.page,hostSession,'finisher');await guest.page.reload();guestSession=await screen(guest.page);
  await host.page.getByRole('button',{name:'大招',exact:true}).click();
  const result=await action(guest.page,guestSession,'dodge','friend-guaranteed-ultimate',{screenshots:false});
  await host.page.waitForFunction(()=>document.querySelector('.battle-complete-actions'));
  hostSession=await api(host.page,'battle','snapshot',{sessionId:hostSession.id});
  assert.equal(hostSession.status,'finished');assert.equal(hostSession.winner,'player');assert.equal(result.after.winner,'enemy');assert.equal(hostSession.reward.applied,true);assert.equal(result.after.reward.applied,true);
  await host.page.screenshot({path:join(output,'friend-finished-shared-result.png')});
  const before={pets:(await api(host.page,'companions','list')).pets,garden:await api(host.page,'garden','snapshot')};
  await api(host.page,'battle','retrySettlement',{sessionId:hostSession.id});await api(host.page,'battle','retrySettlement',{sessionId:hostSession.id});
  const after={pets:(await api(host.page,'companions','list')).pets,garden:await api(host.page,'garden','snapshot')};
  assert.deepEqual(after.pets,before.pets);assert.deepEqual(after.garden.inventory,before.garden.inventory);
  record('friend simulated settlement and two retries preserve XP and inventory',{session:hostSession,peer:result.after,proof:server.state.claims[`${hostSession.room.id}:${hostSession.context.cloudUserId}`],unchangedPets:true,unchangedInventory:true});
  return host;
}
try {
  let host=await launch('host');const water=host.pets.find(pet=>pet.element==='water'); assert.ok(water);
  record('real local account and independent canonical adoptions',{petCount:host.pets.length});
  const interactions=[['interrupt','normal_attack','element_attack'],['dodge','dodge','normal_attack'],['water','element_attack','dodge'],['ultimate','ultimate','dodge']];
  for(const [label,selected,enemyAction] of process.argv.includes('--friends-only')?[]:interactions) {
    const initial=await startTraining(host.page,water,'fire'), before=await preset(host.page,initial,'charged',enemyAction);
    const result=await action(host.page,before,selected,label), round=result.after.rounds.at(-1), events=round.visualEvents;
    if(label==='interrupt'){assert.ok(events.some(event=>event.kind==='interrupt'&&event.side==='enemy'));assert.ok(!events.some(event=>event.kind==='dodge'));assert.ok(result.samples.filter(sample=>sample.phase==='release').every(sample=>sample.actors[1].action!=='skill'));}
    if(label==='dodge'){assert.ok(events.some(event=>event.kind==='dodge'&&event.side==='player'));assert.equal(result.after.snapshot.player.hp,85);assert.equal(result.after.snapshot.player.anger,60);}
    if(label==='water'){assert.ok(events.some(event=>event.kind==='anger'));assert.ok(!events.some(event=>event.status==='freeze'));assert.equal(result.after.snapshot.enemy.anger,5);assert.ok(!result.after.snapshot.enemy.statuses.some(status=>status.type==='freeze'));}
    if(label==='ultimate'){assert.ok(!events.some(event=>event.kind==='dodge'));assert.equal(result.after.snapshot.player.hp,105);assert.equal(result.after.snapshot.player.anger,0);assert.equal(round.directDamage.enemy,24);assert.ok(result.samples.some(sample=>sample.phase==='impact'&&sample.actors[1].action==='hit'));}
    await abandon(host.page,result.after); record(`native interaction ${label} passed`);
  }
  if(process.argv.includes('--friends')||process.argv.includes('--friends-only')||process.argv.includes('--all'))host=await verifyFriends(host);
  assert.deepEqual(errors,[]); evidence.passed=true; record('focused native interaction pass complete');
} catch(error) { failure=error; evidence.passed=false; evidence.failure={message:error.message,stack:error.stack}; save(); }
finally {
  for(const app of apps.values())await app.close().catch(()=>{});
  await server.close();for(const [name,lines]of Object.entries(logs))writeFileSync(join(output,`${name}.log`),lines.join(''));
  save();console.log(JSON.stringify({output,passed:evidence.passed,failure:evidence.failure?.message}));
}
if(failure)throw failure;
