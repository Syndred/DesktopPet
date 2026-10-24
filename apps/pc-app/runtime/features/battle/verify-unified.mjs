import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, realpathSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
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
writeFileSync(join(project, 'bootstrap.cjs'), "require('./apps/pc-app/dist/main/index.cjs');\n");
const server = await startQaDuelServer({ runId, token, directory: join(output, 'authority') });
const profiles = {}, apps = new Map(), logs = {}, errors = [], steps = [], cases = [];
let failure;
const sourceFiles = ['apps/pc-app/runtime/services/battle-runtime.cjs','apps/pc-app/runtime/features/battle/service.cjs','apps/pc-app/runtime/features/battle/presentation.cjs','apps/pc-app/runtime/features/battle/qa-adapter.cjs','apps/pc-app/ui/src/features/battle/BattleScreen.tsx','apps/pc-app/ui/src/features/battle/BattleArena.tsx','apps/pc-app/ui/src/features/battle/BattleMoves.tsx','apps/pc-app/ui/src/features/battle/useBattleAnimation.ts','apps/pc-app/ui/src/features/battle/useBattleSession.ts','apps/pc-app/runtime/features/resources/assets/roster-v2/catalog.json'];
const evidence = { at: new Date().toISOString(), provenance: 'simulated', scenarioId: runId, sourceCommit: execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), sourceDirty: execFileSync('git',['status','--short'],{encoding:'utf8'}).trim(), sourceHashes: sourceFiles.map(file=>({file,sha256:createHash('sha256').update(readFileSync(file)).digest('hex')})),
  fixtures: { location:'domain-owned validated QA location adapter; no WindowsLocationAdapter replacement and no physical location claim', enemy:'explicit QA preset or declared opponent action; unchanged runtime executeRound', profiles:'fresh path-bound foundation QA profiles; namespaced SQLite accounts, no legacy user seed' }, steps, cases, errors };
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
  const account=`qa_${name}_${String(Date.now()).slice(-8)}`;
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
  if(config.registered)await api(page,'accounts','login',{provider:'local',account:config.account,password:'isolated-local-verification',rememberSession:false});
  else {await api(page,'accounts','register',{provider:'local',account:config.account,username:name==='host'?'并肩甲':'并肩乙',password:'isolated-local-verification',confirmPassword:'isolated-local-verification',rememberSession:false});config.registered=true;}
  const identity=await api(page,'accounts','session');assert.equal(identity.dataMode,'simulated');assert.ok(identity.currentUser.id.startsWith(`qa:${runId}:`));
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
    const sample=()=>{const value={at:performance.now(),phase:root?.getAttribute('data-animation-phase'),actors:[...document.querySelectorAll('.battle-stage .resource-stage')].map(node=>({resourceId:node.getAttribute('data-resource-id'),action:node.getAttribute('data-action'),clip:node.getAttribute('data-clip'),frame:node.querySelector('.resource-sprite-host')?.getAttribute('data-frame'),textureFrame:node.querySelector('.resource-sprite-host')?.getAttribute('data-texture-frame'),textureSource:node.querySelector('.resource-sprite-host')?.getAttribute('data-texture-source'),fallback:node.getAttribute('data-fallback')})),events:[...document.querySelectorAll('[data-event-kind]')].map(node=>node.getAttribute('data-event-kind'))};const last=window.__unifiedSamples.at(-1);if(JSON.stringify({...last,at:0})!==JSON.stringify({...value,at:0}))window.__unifiedSamples.push(value);};
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
function frameRegion(resourceId,animation,frameIndex=0) {
  const catalog=JSON.parse(readFileSync(join(runtime,'features/resources/assets/roster-v2/catalog.json'),'utf8'));
  const role=catalog.characters.find(value=>value.resourceId===resourceId);assert.ok(role,`Unknown canonical resource ${resourceId}`);
  const source=JSON.parse(readFileSync(join(runtime,'features/resources/assets/roster-v2',role.manifest),'utf8'));
  const frames=source.animations[animation],selected=frameIndex<0?[...frames].reverse().find(value=>value!==source.animations.idle[0]):frames[frameIndex];
  const frame=source.frames[selected].frame;
  return [frame.x,frame.y,frame.w,frame.h].join(',');
}
async function geometry(page,label) {
  await page.waitForTimeout(200);
  const result=await page.evaluate(()=>{
    const box=selector=>{const element=document.querySelector(selector),r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
    return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},mode:document.querySelector('[data-battle-screen]').getAttribute('data-battle-mode'),
      signature:['.battle-arena','.battle-stage','.battle-arena-top','.battle-moves','.battle-current-log'].map(selector=>({selector,count:document.querySelectorAll(selector).length,box:box(selector)})),
      cards:[...document.querySelectorAll('.battle-move')].map(element=>{const r=element.getBoundingClientRect(),style=getComputedStyle(element);return {label:element.getAttribute('aria-label'),bottom:r.bottom,shadow:style.boxShadow,transform:style.transform};}),
      portraitCount:document.querySelectorAll('.battle-portrait.small svg[data-framing="portrait"]').length};
  });
  assert.ok(result.signature.every(value=>value.count===1));assert.equal(result.cards.length,4);assert.ok(result.cards.every(value=>value.bottom<=result.viewport.height));
  assert.ok(result.cards.every(value=>value.shadow==='none'&&value.transform==='none'));assert.equal(result.portraitCount,6);
  await page.screenshot({path:join(output,`${label}.png`)});record(`shared geometry ${label}`,result);return result;
}
async function verifyMatrix(host) {
  const pets=Object.fromEntries(host.pets.map(pet=>[pet.element,pet]));
  for(const element of ['metal','wood','earth','water','fire'])assert.ok(pets[element],`Actual ${element} companion is required`);
  const pairs=[];
  for(const player of ['metal','wood','earth','water','fire'])for(const enemy of ['metal','wood','earth','water','fire']) {
    const initial=await startTraining(host.page,pets[player],enemy),before=await preset(host.page,initial,'charged','dodge');
    const result=await action(host.page,before,'element_attack',`matrix-${player}-${enemy}`,{screenshots:player===enemy});
    const round=result.after.rounds.at(-1),multiplier=before.rules.advantage[player]===enemy?1.2:before.rules.advantage[enemy]===player?0.8:1;
    assert.equal(round.directDamage.enemy,Math.round(12*multiplier));
    assert.equal(result.after.player.element,player);assert.equal(result.after.enemy.element,enemy);
    assert.ok(result.samples.some(sample=>sample.phase==='release'&&sample.actors[0].action==='skill'));
    const releaseRegion=frameRegion(before.player.resourceRef,'skill',-1);
    assert.ok(result.samples.some(sample=>sample.phase==='release'&&sample.actors[0].textureFrame===releaseRegion),'Real skill release texture must advance beyond charge');
    const hitRegion=frameRegion(before.enemy.resourceRef||before.enemy.appearance2d,'hit');
    assert.ok(result.samples.some(sample=>sample.phase==='impact'&&sample.actors[1].textureFrame===hitRegion),'Actual hit texture must be visible at impact');
    if(player==='water'){assert.ok(round.visualEvents.some(event=>event.kind==='anger'));assert.ok(!round.visualEvents.some(event=>event.status==='freeze'));}
    else {const type={metal:'vulnerability',wood:'parasite',earth:'petrify',fire:'burn'}[player];assert.ok(round.statusesAfter.enemy.some(status=>status.type===type));assert.ok(round.visualEvents.some(event=>event.kind==='status'&&event.status===type));}
    pairs.push({player,enemy,sessionId:result.after.id,directDamage:round.directDamage.enemy,playerResource:result.after.player.resourceRef,enemyResource:result.after.enemy.resourceRef,events:round.visualEvents});
    await abandon(host.page,result.after);if(pairs.length%5===0)record(`native ordered element pairs ${pairs.length}/25`);
  }
  evidence.elementPairs=pairs;assert.equal(pairs.length,25);record('25 real UI elemental pairings passed');
}
async function verifyGeometry(host) {
  const initial=await startTraining(host.page,host.pets.find(pet=>pet.element==='water'),'wood');
  await geometry(host.page,'entry-training-1280');
  const window=await host.app.browserWindow(host.page);await window.evaluate(win=>win.setContentSize(1440,900,false));
  await geometry(host.page,'entry-training-1440');await window.evaluate(win=>win.setContentSize(1280,844,false));
  await abandon(host.page,initial);
}
async function verifyMotion(host) {
  const page=host.page,initial=await startTraining(page,host.pets.find(pet=>pet.element==='wood'),'water'),before=await preset(page,initial,'charged','dodge');
  await page.evaluate(()=>{window.__unifiedCanvases=[...document.querySelectorAll('.battle-stage canvas')];});
  const first=await action(page,before,'element_attack','repeat-first',{screenshots:false});
  const second=await action(page,first.after,'element_attack','repeat-second',{screenshots:false});
  const release=frameRegion(before.player.resourceRef,'skill',-1);
  for(const result of [first,second])assert.ok(result.samples.some(value=>value.phase==='release'&&value.actors[0].textureFrame===release));
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.battle-stage canvas')].every((canvas,index)=>canvas===window.__unifiedCanvases[index])),true);
  await page.getByRole('button',{name:'普通攻击',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.battle-live-layout')?.getAttribute('data-animation-phase')==='windup');
  let settings=await api(page,'accounts','settingsGet');settings.document.desktop.animationsEnabled=false;
  await api(page,'accounts','settingsSave',{actionId:randomUUID(),revision:settings.revision,document:settings.document});
  await page.waitForFunction(()=>document.querySelector('.battle-live-layout')?.getAttribute('data-animation-phase')==='rest'&&document.querySelectorAll('.battle-stage .battle-portrait[data-animating="false"]').length===2);
  assert.equal(await page.getByRole('button',{name:'普通攻击',exact:true}).isEnabled(),true);
  const frames=[];for(let i=0;i<5;i++){await page.waitForTimeout(110);frames.push(await page.locator('.battle-stage .resource-sprite-host').evaluateAll(nodes=>nodes.map(node=>({frame:node.getAttribute('data-frame'),region:node.getAttribute('data-texture-frame')}))));}
  assert.ok(frames.every(value=>JSON.stringify(value)===JSON.stringify(frames[0])));
  await page.screenshot({path:join(output,'animations-off-terminal-snapshot.png')});
  settings=await api(page,'accounts','settingsGet');settings.document.desktop.animationsEnabled=true;
  await api(page,'accounts','settingsSave',{actionId:randomUUID(),revision:settings.revision,document:settings.document});await observe(page);await page.waitForTimeout(600);
  const restored=await page.evaluate(()=>window.__unifiedSamples);assert.ok(restored.every(value=>value.phase==='rest'));
  const after=await api(page,'battle','snapshot',{sessionId:before.id});record('same elemental action restarts real release texture without replacing canvases; motion off adopts final state, stops actual frames and unlocks controls; reenable does not replay history',{sessionId:before.id,frames,restored,beforeRound:before.snapshot.round,afterRound:after.snapshot.round});
  await abandon(page,after);
}
async function verifyEntries(host) {
  const page=host.page;
  await route(page,'/discovery');await page.locator('.discovery-page').waitFor();
  await api(page,'discovery','setExploring',{active:true});await api(page,'discovery','locate');
  let discovery=await api(page,'discovery','snapshot');
  const spawn=discovery.spawns.find(value=>value.inRange&&!value.demo&&value.captureState==='available');assert.ok(spawn,'A nearby QA spawn must be in range');
  await route(page,`/discovery/wild/${spawn.id}`);await page.getByRole('button',{name:'开始挑战',exact:true}).click();
  let session=await screen(page);assert.equal(session.mode,'wild');await geometry(page,'entry-wild-1280');
  session=await preset(page,session,'finisher','dodge');const win=await action(page,session,'ultimate','wild-win',{screenshots:false});
  assert.equal(win.after.winner,'player');await page.getByRole('button',{name:'收服',exact:true}).click();await page.getByLabel('昵称',{exact:true}).fill('隔离收服伙伴');
  const countBefore=(await api(page,'companions','list')).pets.length;
  await page.getByRole('button',{name:'确认',exact:true}).click();await page.waitForFunction(()=>location.hash.startsWith('#/discovery/result/'));
  discovery=await api(page,'discovery','snapshot');
  const savedCapture=discovery.captures.find(value=>value.name==='隔离收服伙伴');assert.ok(savedCapture);assert.equal(savedCapture.validation,'simulated');
  await page.waitForTimeout(250);await page.screenshot({path:join(output,'wild-captured-result.png')});
  const first=await api(page,'battle','settleContext',{sessionId:session.id,actionId:`context:${session.id}`,name:'隔离收服伙伴'});
  assert.ok(first.resultPath);const countAfter=(await api(page,'companions','list')).pets.length;assert.equal(countAfter,countBefore+1);
  await api(page,'battle','settleContext',{sessionId:session.id,actionId:`context:${session.id}`,name:'隔离收服伙伴'});assert.equal((await api(page,'companions','list')).pets.length,countAfter);
  record('wild entry uses shared battlefield; source capture receipt is simulated and duplicate confirmation adds no pet',{session:win.after,capture:savedCapture,countBefore,countAfter});
  for(const [label,presetId,enemyAction] of [['win','finisher','dodge'],['loss','defending','ultimate']]) {
    const actor=label==='loss'?await launch('territory-loss'):host,page=actor.page;
    await route(page,'/garden');await page.getByRole('button',{name:'查看演练领地',exact:true}).waitFor();await page.getByRole('button',{name:'查看演练领地',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.garden-territory-list > button').length>0);
    const garden=await api(page,'garden','snapshot'),target=garden.territories.find(value=>value.ownerAccountId!==garden.ownerAccountId&&value.provenance==='simulated-geographic');assert.ok(target);
    const index=garden.territories.findIndex(value=>value.id===target.id);await page.locator('.garden-territory-list > button').nth(index).click();
    await page.locator('.garden-territory-panel .garden-pet').first().click();await page.getByRole('button',{name:'发起领地挑战',exact:true}).click();
    session=await screen(page);assert.equal(session.mode,'territory');assert.equal(session.context.territoryId,target.id);await geometry(page,`entry-territory-${label}-1280`);
    session=await preset(page,session,presetId,enemyAction);const result=await action(page,session,label==='win'?'ultimate':'normal_attack',`territory-${label}`,{screenshots:false});
    assert.equal(result.after.winner,label==='win'?'player':'enemy');
    if(label==='loss')assert.equal(await page.getByRole('button',{name:'占领',exact:true}).count(),0);
    await page.screenshot({path:join(output,`territory-${label}-shared-result.png`)});
    await page.getByRole('button',{name:label==='win'?'占领':'确认结果',exact:true}).click();await page.waitForFunction(()=>location.hash==='#/garden');
    const settled=await api(page,'garden','snapshot'),territory=settled.territories.find(value=>value.id===target.id);assert.equal(territory.ownerAccountId,label==='win'?settled.ownerAccountId:target.ownerAccountId);
    const context=await api(page,'battle','context',{sessionId:session.id});assert.equal(context.settled,true);
    const before={pets:(await api(page,'companions','list')).pets,garden:settled};
    await api(page,'battle','settleContext',{sessionId:session.id,actionId:`context:${session.id}`});await api(page,'battle','retrySettlement',{sessionId:session.id});
    const after={pets:(await api(page,'companions','list')).pets,garden:await api(page,'garden','snapshot')};assert.deepEqual(after.pets,before.pets);assert.deepEqual(after.garden.inventory,before.garden.inventory);
    assert.equal(after.garden.territoryChallenges.some(value=>value.sessionId===session.id),false);
    record(`territory ${label}: source confirmation, correct owner and no duplicate XP/inventory`,{session:result.after,target,territory,context});
  }
}
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
  await guest.page.locator('.battle-waiting-peer').waitFor();assert.equal(await guest.page.locator('.battle-waiting-peer progress').count(),0);assert.equal(await guest.page.getByText('角色资源缺失',{exact:true}).count(),0);
  await guest.page.screenshot({path:join(output,'friend-waiting-peer-is-unknown.png')});
  await host.page.locator('.battle-invitations').getByRole('button',{name:'刷新',exact:true}).click();
  await host.page.getByRole('button',{name:'进入房间',exact:true}).click();
  let hostSession=await screen(host.page), guestSession=await screen(guest.page);
  await geometry(host.page,'entry-friend-1280');
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
async function verifyCopy(host) {
  const guest=await launch('guest');await friends(guest.page,guest.pets.find(pet=>pet.element==='metal'));await friends(host.page,host.pets.find(pet=>pet.element==='water'));
  await host.page.getByLabel('搜索账号或用户名',{exact:true}).fill(profiles.guest.account);await host.page.getByRole('button',{name:'搜索',exact:true}).click();
  await host.page.locator('.battle-user-list .battle-small-action').click();await guest.page.locator('.battle-invitations').getByRole('button',{name:'刷新',exact:true}).click();
  const forbidden=['搜索结果来自当前联机服务','输入账号或昵称，找到想一起切磋的朋友','和朋友的伙伴','对方进入房间后','想和你的伙伴切磋一下'];
  for(const page of [host.page,guest.page]){
    const text=await page.locator('body').innerText();for(const copy of forbidden)assert.ok(!text.includes(copy),copy);
    assert.ok(await page.getByRole('button',{name:'创建房间',exact:true}).isEnabled());assert.ok(await page.locator('#battle-room-code').isVisible());
  }
  assert.ok(await guest.page.getByRole('button',{name:'接受',exact:true}).isEnabled());assert.ok(await guest.page.getByRole('button',{name:'婉拒',exact:true}).isEnabled());
  await host.page.screenshot({path:join(output,'friends-compact-selected.png')});await guest.page.screenshot({path:join(output,'friends-compact-invitation.png')});
  record('friend lobby compact copy with real selected identity and pending invitation; all actions remain available',{forbiddenAbsent:forbidden,hostAccount:profiles.host.account,guestAccount:profiles.guest.account});
}
try {
  let host=await launch('host');const water=host.pets.find(pet=>pet.element==='water'); assert.ok(water);
  record('real local account and independent canonical adoptions',{petCount:host.pets.length});
  const interactions=[['interrupt','normal_attack','element_attack'],['dodge','dodge','normal_attack'],['water','element_attack','dodge'],['ultimate','ultimate','dodge']];
  const only=process.argv.find(value=>['--friends-only','--entries-only','--matrix-only','--interrupt-only','--copy-only'].includes(value));
  for(const [label,selected,enemyAction] of only&&only!=='--interrupt-only'?[]:only==='--interrupt-only'?interactions.slice(0,1):interactions) {
    const initial=await startTraining(host.page,water,'fire'), before=await preset(host.page,initial,'charged',enemyAction);
    const result=await action(host.page,before,selected,label), round=result.after.rounds.at(-1), events=round.visualEvents;
    if(label==='interrupt'){assert.ok(events.some(event=>event.kind==='interrupt'&&event.side==='enemy'));assert.ok(!events.some(event=>event.kind==='dodge'));assert.ok(result.samples.filter(sample=>sample.phase==='release').every(sample=>!['hit','skill'].includes(sample.actors[1].action)));const hit=frameRegion(before.enemy.resourceRef||before.enemy.appearance2d,'hit');assert.ok(result.samples.some(sample=>sample.phase==='impact'&&sample.actors[1].action==='hit'&&sample.actors[1].textureFrame===hit),'Impact must expose actual hit pixels');}
    if(label==='dodge'){assert.ok(events.some(event=>event.kind==='dodge'&&event.side==='player'));assert.equal(result.after.snapshot.player.hp,85);assert.equal(result.after.snapshot.player.anger,60);}
    if(label==='water'){assert.ok(events.some(event=>event.kind==='anger'));assert.ok(!events.some(event=>event.status==='freeze'));assert.equal(result.after.snapshot.enemy.anger,5);assert.ok(!result.after.snapshot.enemy.statuses.some(status=>status.type==='freeze'));}
    if(label==='ultimate'){assert.ok(!events.some(event=>event.kind==='dodge'));assert.equal(result.after.snapshot.player.hp,105);assert.equal(result.after.snapshot.player.anger,0);assert.equal(round.directDamage.enemy,24);assert.ok(result.samples.some(sample=>sample.phase==='impact'&&sample.actors[1].action==='hit'));}
    await abandon(host.page,result.after); record(`native interaction ${label} passed`);
  }
  if(process.argv.includes('--geometry'))await verifyGeometry(host);
  if(process.argv.includes('--motion'))await verifyMotion(host);
  if(process.argv.includes('--friends')||process.argv.includes('--friends-only')||process.argv.includes('--all'))host=await verifyFriends(host);
  if(process.argv.includes('--copy-only'))await verifyCopy(host);
  if(process.argv.includes('--entries')||process.argv.includes('--entries-only')||process.argv.includes('--all'))await verifyEntries(host);
  if(process.argv.includes('--matrix')||process.argv.includes('--matrix-only')||process.argv.includes('--all'))await verifyMatrix(host);
  assert.deepEqual(errors,[]); evidence.passed=true; record('focused native interaction pass complete');
} catch(error) { failure=error; evidence.passed=false; evidence.failure={message:error.message,stack:error.stack}; save(); }
finally {
  for(const app of apps.values())await app.close().catch(()=>{});
  await server.close();for(const [name,lines]of Object.entries(logs))writeFileSync(join(output,`${name}.log`),lines.join(''));
  save();console.log(JSON.stringify({output,passed:evidence.passed,failure:evidence.failure?.message}));
}
if(failure)throw failure;
