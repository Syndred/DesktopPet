import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, realpathSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
const require = createRequire(import.meta.url);
const { startQaDuelServer } = require('./tests/qa-duel-server.cjs');
const { MARKER, SCENARIO } = require('../../core/qa-scenario.cjs');
const output = resolve('artifacts/battle', `v3-${Date.now()}`), project = join(output, 'application');
const runtime = resolve('apps/pc-app/runtime'), overlay = join(project, 'apps/pc-app/runtime');
const runId = randomUUID(), token = randomBytes(32).toString('hex');
mkdirSync(overlay, { recursive: true });
cpSync(runtime, overlay, { recursive: true, filter: source => source !== join(runtime, 'assets') });
symlinkSync(join(runtime, 'assets'), join(overlay, 'assets'), 'junction');
cpSync(resolve('apps/pc-app/dist'), join(project, 'apps/pc-app/dist'), { recursive: true });
writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'lingjing-battle-v3-qa', version: '0.0.0', main: 'bootstrap.cjs' }));
writeFileSync(join(project, 'bootstrap.cjs'), "require('./apps/pc-app/dist/main/index.cjs');\n");
const server = await startQaDuelServer({ runId, token, directory: join(output, 'authority') });
const profiles = {}, apps = new Map(), errors = [], steps = [], logs = {};
const sourceFiles = ['BattleArena.tsx','BattleScreen.tsx','BattleMoves.tsx','BattlePhaseClock.tsx','useBattleAnimation.ts','presentation.ts','battle-v3.css'].map(file => `apps/pc-app/ui/src/features/battle/${file}`);
const evidence = { at: new Date().toISOString(), provenance: 'simulated', runId, sourceCommit: execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), sourceDirty: execFileSync('git',['status','--short'],{encoding:'utf8'}).trim(), buildManifest: JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json','utf8')), sourceHashes: sourceFiles.map(file => ({file,sha256:createHash('sha256').update(readFileSync(file)).digest('hex')})),
  scope: 'Real compiled Electron rendering, native windows, IPC, path-bound namespaced SQLite accounts, canonical Pixi resources. Loopback friend authority and domain-owned location fixtures are simulated, not live cloud.', steps, errors };
const save = () => writeFileSync(join(output,'evidence.json'), JSON.stringify(evidence,null,2));
const record = (name, details={}) => { steps.push({at:new Date().toISOString(),name,...details}); save(); console.log(name); };
async function api(page,feature,command,payload={}) { const result=await page.evaluate(({feature,command,payload})=>window.lingjing.invoke(feature,command,payload),{feature,command,payload});assert.equal(result.ok,true,`${feature}.${command}: ${result.message}`);return result.data; }
async function route(page,path) { await page.evaluate(path=>{window.__v3Observer?.disconnect();location.hash=path;},path); }
async function launch(name) {
  let config=profiles[name];
  if(!config) {
    const directory=join(output,name);mkdirSync(directory);
    writeFileSync(join(directory,MARKER),JSON.stringify({schemaVersion:1,application:'lingjing',scenario:SCENARIO,runId,isolated:true,profilePath:realpathSync(directory),createdAt:new Date().toISOString()}),{flag:'wx'});
    writeFileSync(join(directory,'battle-transport.json'),JSON.stringify({runId,endpoint:server.endpoint,token,enemyActions:{training:['normal_attack'],wild:['dodge'],territory:['dodge']}}));
    config=profiles[name]={directory,account:`qa_${name}_${Date.now().toString().slice(-8)}`};
  }
  const env={...process.env,PET_USER_DATA_DIR:config.directory,LINGJING_QA_SCENARIO:SCENARIO};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({args:[project],env});apps.set(name,app);logs[name]||=[];
  for(const stream of [app.process().stdout,app.process().stderr])stream?.on('data',value=>logs[name].push(String(value)));
  const page=await app.firstWindow(), window=await app.browserWindow(page);await window.evaluate(win=>win.setContentSize(1280,844,false));
  page.on('pageerror',error=>errors.push({name,message:error.message}));await page.waitForFunction(()=>Boolean(window.lingjing));
  if(config.registered)await api(page,'accounts','login',{provider:'local',account:config.account,password:'isolated-local-verification',rememberSession:false});
  else {await api(page,'accounts','register',{provider:'local',account:config.account,username:name==='host'?'并肩甲':'并肩乙',password:'isolated-local-verification',confirmPassword:'isolated-local-verification',rememberSession:false});config.registered=true;}
  const identity=await api(page,'accounts','session');assert.equal(identity.dataMode,'simulated');assert.ok(identity.currentUser.id.startsWith(`qa:${runId}:`));config.owner=identity.currentUser.id;
  const settings=await api(page,'accounts','settingsGet');Object.assign(settings.document.desktop,{animationsEnabled:true,interactionSounds:false});settings.document.privacy.locationAllowed=true;settings.document.notifications.enabled=false;
  await api(page,'accounts','settingsSave',{actionId:randomUUID(),revision:settings.revision,document:settings.document});
  if(!config.pets) { config.pets=[];for(const template of (await api(page,'companions','list')).templates){const result=await api(page,'companions','adopt',{actionId:`v3:${template.templateId}`,templateId:template.templateId,name:template.name,showOnDesktop:false});config.pets.push(result.pet);} }
  return {app,page,pets:config.pets};
}
async function screen(page,{waiting=false}={}) {
  await page.locator('[data-battle-screen="shared-v1"][data-battle-layout="v3"]').waitFor();
  await page.waitForFunction(count=>document.querySelectorAll('.battle-stage .resource-stage[data-status="ready"]').length===count,waiting?1:2);
  await page.waitForFunction(()=>document.querySelector('.app-page-motion[data-current-route="true"]')?.getBoundingClientRect().top===54);
  assert.equal(await page.locator('.battle-command').count(),4);
  const id=await page.locator('[data-battle-screen]').getAttribute('data-session-id');return api(page,'battle','snapshot',{sessionId:id});
}
async function start(page,pet,enemyElement='fire') { const session=await api(page,'battle','startTraining',{petId:pet.petId,enemyElement,actionId:randomUUID()});await route(page,`/battle/session/${session.id}`);return screen(page); }
async function abandon(page,session) { await api(page,'battle','leave',{sessionId:session.id}); }
async function preset(page,session,value='charged',enemyAction='dodge') { const state=await api(page,'battle','qaPreset',{sessionId:session.id,preset:value,enemyAction});await page.reload();await screen(page);return state; }
async function capture(page,name) { await page.screenshot({path:join(output,`${name}.png`)}); }
async function geometry(page,name) {
  const value=await page.evaluate(()=>{
    const box=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    const bounds=selector=>box(document.querySelector(selector));
    return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},mode:document.querySelector('[data-battle-mode]').getAttribute('data-battle-mode'),main:bounds('main'),arena:bounds('.battle-arena'),hud:[...document.querySelectorAll('.battle-arena-top .combatant-status')].map(box),identity:[...document.querySelectorAll('.battle-arena-top .combatant-identity')].map(box),level:[...document.querySelectorAll('.battle-arena-top .combatant-level')].map(box),actors:[...document.querySelectorAll('.battle-stage .battle-actor-slot')].map(box),group:bounds('.battle-command-group'),orbs:[...document.querySelectorAll('.battle-command-orb')].map(box),log:bounds('.battle-current-log'),enemyFill:[...document.querySelectorAll('.battle-arena-top .enemy progress')].map(node=>getComputedStyle(node).direction),enemyPortrait:getComputedStyle(document.querySelector('.battle-arena-top .enemy .battle-sprite-thumb')).transform,enemyText:getComputedStyle(document.querySelector('.battle-arena-top .enemy .combatant-title')).transform,canvases:document.querySelectorAll('.battle-stage canvas').length,sidebars:document.querySelectorAll('.battle-live-sidebar,.battle-party-grid').length};
  });
  const near=(a,b)=>assert.ok(Math.abs(a-b)<1,`${a} != ${b}`);
  near(value.arena.x,value.main.x);near(value.arena.y,value.main.y);near(value.arena.right,value.main.right);near(value.arena.bottom,value.main.bottom);
  near(value.hud[0].width,value.hud[1].width);near(value.hud[0].height,value.hud[1].height);
  for(let i=0;i<2;i++){assert.ok(value.level[i].bottom<=value.hud[i].bottom);assert.ok(value.level[i].y>=value.identity[i].y);}
  near(value.group.x+value.group.width/2,value.arena.x+value.arena.width/2);
  for(const orb of value.orbs.slice(2)){near(orb.width,value.orbs[1].width);near(orb.height,value.orbs[1].height);}
  assert.ok(value.orbs[0].width>value.orbs[1].width&&value.orbs[0].width<value.orbs[1].width*1.5);
  const overlaps=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;
  assert.ok(!overlaps(value.log,value.group),'Log overlaps commands');for(const actor of value.actors)assert.ok(!overlaps(value.log,actor),'Log overlaps actors');
  assert.ok(value.log.bottom<=value.viewport.height&&value.group.bottom<=value.viewport.height);
  assert.deepEqual(value.enemyFill,['rtl','rtl']);assert.equal(value.enemyPortrait,'matrix(-1, 0, 0, 1, 0, 0)');assert.equal(value.enemyText,'none');assert.equal(value.canvases,2);assert.equal(value.sidebars,0);
  value.visiblePixels=await page.evaluate(async()=>{
    const canvases=[...document.querySelectorAll('.battle-stage canvas')];let pixels=[];
    for(let attempt=0;attempt<30;attempt++) {
      await new Promise(resolve=>requestAnimationFrame(resolve));
      pixels=canvases.map(canvas=>{const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);const data=ctx.getImageData(0,0,copy.width,copy.height).data;let count=0;for(let i=3;i<data.length;i+=4)if(data[i]>20)count++;return count;});
      if(pixels.every(count=>count>2500))break;
    }
    return pixels;
  });
  assert.ok(value.visiblePixels.every(count=>count>2500),'Each canonical canvas must render visible pixels');
  await capture(page,name);record(`native layout ${name}`,value);return value;
}
async function observe(page) {
  await page.evaluate(()=>{window.__v3Observer?.disconnect();window.__v3Samples=[];window.__v3Canvases=[...document.querySelectorAll('.battle-stage canvas')];const root=document.querySelector('.battle-live-layout');const sample=()=>{const clock=root.querySelector('.battle-phase-clock');if(!root.isConnected||!clock)return;window.__v3Samples.push({at:Date.now(),phase:root.getAttribute('data-animation-phase'),kind:clock.getAttribute('data-phase-kind'),deadline:Number(clock.getAttribute('data-deadline')),remaining:Number(clock.getAttribute('data-remaining-ms')),actors:[...root.querySelectorAll('.battle-stage .resource-stage')].map(node=>({action:node.getAttribute('data-action'),frame:node.querySelector('.resource-sprite-host')?.getAttribute('data-texture-frame'),facing:node.getAttribute('data-facing')}))});};window.__v3Observer=new MutationObserver(sample);window.__v3Observer.observe(root,{attributes:true,subtree:true,childList:true});sample();});
}
async function act(page,session,action,name) {
  await observe(page);await page.locator(`.battle-command[data-action="${action}"]`).click();
  await page.waitForFunction(round=>Number(document.querySelector('.battle-stage').getAttribute('data-round'))===round,session.snapshot.round+1);
  await page.waitForFunction(()=>document.querySelector('.battle-live-layout').getAttribute('data-animation-phase')==='rest');
  const after=await api(page,'battle','snapshot',{sessionId:session.id}),samples=await page.evaluate(()=>window.__v3Samples);
  assert.equal(after.snapshot.round,session.snapshot.round+1);
  for(const phase of ['windup','release','impact','effects','rest'])assert.ok(samples.some(value=>value.phase===phase),`${name}: ${phase}`);
  const ticks=samples.filter(value=>value.kind==='animation');assert.ok(ticks.length>3);assert.equal(new Set(ticks.map(value=>value.deadline)).size,1);assert.ok(ticks.at(-1).remaining<ticks[0].remaining);
  const catalog=JSON.parse(readFileSync(join(runtime,'features/resources/assets/roster-v2/catalog.json'),'utf8'));
  for(const [index,side] of ['player','enemy'].entries())if(after.rounds.at(-1).directDamage[side]>0){const role=catalog.characters.find(value=>value.resourceId===(session[side].resourceRef||session[side].appearance2d));const atlas=JSON.parse(readFileSync(join(runtime,'features/resources/assets/roster-v2',role.manifest),'utf8'));const frame=atlas.frames[atlas.animations.hit[0]].frame;const expected=[frame.x,frame.y,frame.w,frame.h].join(',');assert.ok(samples.some(value=>value.phase==='impact'&&value.actors[index].action==='hit'&&value.actors[index].frame===expected),'The actual hit texture must appear at impact');}
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.battle-stage canvas')].every((node,i)=>node===window.__v3Canvases[i])),true);
  record(`real round ${name}`,{sessionId:session.id,before:session.snapshot,after:after.snapshot,samples});return after;
}
async function ring(page,session,name) {
  const result=await page.locator('.battle-command[data-action="ultimate"]').evaluate(node=>({disabled:node.disabled,ready:node.getAttribute('data-ready'),value:Number(node.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')),max:Number(node.querySelector('[role="progressbar"]').getAttribute('aria-valuemax')),offset:Number(node.querySelector('.battle-ring-value').getAttribute('stroke-dashoffset')),glint:getComputedStyle(node.querySelector('.battle-command-glint')).opacity,percent:node.querySelector('.battle-charge-percent').textContent,horizontal:node.querySelectorAll('progress').length}));
  const charge=Math.min(session.snapshot.player.anger,session.rules.ultimateAnger),ready=charge>=session.rules.ultimateAnger;
  assert.equal(result.value,charge);assert.equal(result.max,session.rules.ultimateAnger);assert.equal(result.offset,100-charge/session.rules.ultimateAnger*100);assert.equal(result.ready,String(ready));assert.equal(result.disabled,!ready);assert.equal(result.glint,ready?'1':'0');assert.equal(result.horizontal,0);
  await capture(page,name);record(`charge ${name}`,result);return result;
}
async function tooltips(page) {
  for(const [action,expected] of [['normal_attack','打断属性'],['element_attack','无法闪避'],['dodge','闪避攻击']]) {
    const button=page.locator(`.battle-command[data-action="${action}"]`);
    const ready=()=>page.waitForFunction(()=>{const node=document.querySelector('.battle-command-hint');return node&&Number(getComputedStyle(node).opacity)>.99;});
    await page.evaluate(()=>document.activeElement?.blur());await button.hover();await ready();assert.equal((await page.locator('.battle-command-hint').innerText()).trim(),expected);await capture(page,`hover-${action}`);
    await page.mouse.move(250,300);await page.keyboard.press('Escape');await button.focus();await ready();assert.equal((await page.locator('.battle-command-hint').innerText()).trim(),expected);await capture(page,`focus-${action}`);await page.keyboard.press('Escape');
    record(`hover and keyboard focus ${action}`,{text:expected});
  }
}
async function matrix(host) {
  const order=['metal','wood','earth','water','fire'],golden=['—→——←','←—→——','—←—→—','——←—→','→——←—'],pairs=[];
  for(let p=0;p<5;p++)for(let e=0;e<5;e++) {
    const session=await start(host.page,host.pets.find(pet=>pet.element===order[p]),order[e]);
    const result=await host.page.locator('.battle-affinity').evaluate(node=>({symbol:node.textContent,direction:node.getAttribute('data-direction'),label:node.getAttribute('aria-label'),elements:[...node.querySelectorAll('svg')].map(icon=>icon.getAttribute('data-element'))}));
    assert.equal(result.symbol,golden[p][e]);assert.deepEqual(result.elements,[order[p],order[e]]);
    if(result.symbol==='→')assert.equal(session.rules.advantage[order[p]],order[e]);if(result.symbol==='←')assert.equal(session.rules.advantage[order[e]],order[p]);
    assert.ok(result.label.includes(result.symbol==='→'?'从左向右':result.symbol==='←'?'从右向左':'无克制'));
    if((p===3&&e===4)||(p===4&&e===3)||(p===1&&e===4)||(p===3&&e===3))await capture(host.page,`affinity-${order[p]}-${order[e]}`);
    pairs.push({player:order[p],enemy:order[e],sessionId:session.id,...result});await abandon(host.page,session);
  }
  assert.equal(pairs.filter(value=>value.symbol==='→').length,5);assert.equal(pairs.filter(value=>value.symbol==='←').length,5);assert.equal(pairs.filter(value=>value.symbol==='—').length,15);record('25 native ordered affinities',{pairs});
}
async function entries(host) {
  const page=host.page;await route(page,'/discovery');await page.locator('.discovery-page').waitFor();await api(page,'discovery','setExploring',{active:true});await api(page,'discovery','locate');
  const discovery=await api(page,'discovery','snapshot'),spawn=discovery.spawns.find(value=>value.inRange&&!value.demo&&value.captureState==='available');assert.ok(spawn);
  await route(page,`/discovery/wild/${spawn.id}`);await page.getByRole('button',{name:'开始挑战',exact:true}).click();let session=await screen(page);assert.equal(session.mode,'wild');await geometry(page,'entry-wild');
  session=await preset(page,session,'finisher');session=await act(page,session,'ultimate','wild-win');assert.equal(session.winner,'player');
  await page.getByRole('button',{name:'收服',exact:true}).click();await page.getByLabel('昵称',{exact:true}).fill('V3隔离伙伴');const before=(await api(page,'companions','list')).pets.length;await page.getByRole('button',{name:'确认',exact:true}).click();await page.waitForFunction(()=>location.hash.startsWith('#/discovery/result/'));
  assert.equal((await api(page,'companions','list')).pets.length,before+1);await api(page,'battle','settleContext',{sessionId:session.id,actionId:`context:${session.id}`,name:'V3隔离伙伴'});assert.equal((await api(page,'companions','list')).pets.length,before+1);record('wild capture preserved',{sessionId:session.id,context:await api(page,'battle','context',{sessionId:session.id})});
  for(const loss of [false,true]) {
    const actor=loss?await launch('loss'):host,page=actor.page;await route(page,'/garden');await page.getByRole('button',{name:'查看演练领地',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.garden-territory-list > button').length>0);
    const garden=await api(page,'garden','snapshot'),index=garden.territories.findIndex(value=>value.ownerAccountId!==garden.ownerAccountId&&value.provenance==='simulated-geographic');assert.ok(index>=0);const target=garden.territories[index];
    await page.locator('.garden-territory-list > button').nth(index).click();await page.locator('.garden-territory-panel .garden-pet').first().click();await page.getByRole('button',{name:'发起领地挑战',exact:true}).click();session=await screen(page);assert.equal(session.mode,'territory');await geometry(page,`entry-territory-${loss?'loss':'win'}`);
    session=await preset(page,session,loss?'defending':'finisher',loss?'ultimate':'dodge');session=await act(page,session,loss?'normal_attack':'ultimate',`territory-${loss?'loss':'win'}`);assert.equal(session.winner,loss?'enemy':'player');
    await page.getByRole('button',{name:loss?'确认结果':'占领',exact:true}).click();await page.waitForFunction(()=>location.hash==='#/garden');const settled=await api(page,'garden','snapshot');assert.equal(settled.territories.find(value=>value.id===target.id).ownerAccountId,loss?target.ownerAccountId:settled.ownerAccountId);
    const before={pets:(await api(page,'companions','list')).pets,inventory:settled.inventory};await api(page,'battle','settleContext',{sessionId:session.id,actionId:`context:${session.id}`});await api(page,'battle','retrySettlement',{sessionId:session.id});assert.deepEqual((await api(page,'companions','list')).pets,before.pets);assert.deepEqual((await api(page,'garden','snapshot')).inventory,before.inventory);record(`territory ${loss?'loss':'win'} confirmation preserved`,{sessionId:session.id,context:await api(page,'battle','context',{sessionId:session.id})});
    if(loss){await actor.app.close();apps.delete('loss');}
  }
}
async function friends(host) {
  const guest=await launch('guest'),page=host.page;let session=await api(page,'battle','createRoom',{petId:host.pets.find(pet=>pet.element==='water').petId});await route(page,`/battle/session/${session.id}`);await screen(page,{waiting:true});
  assert.equal(await page.locator('.battle-waiting-peer progress').count(),0);assert.equal(await page.locator('.battle-affinity svg').count(),0);assert.equal(await page.locator('.battle-affinity').getAttribute('aria-label'),'对手未加入，克制关系未知');await capture(page,'friend-unknown');
  let peer=await api(guest.page,'battle','joinRoom',{roomCode:session.room.room_code,petId:guest.pets.find(pet=>pet.element==='fire').petId});await route(guest.page,`/battle/session/${peer.id}`);await screen(guest.page);await screen(page);await geometry(page,'entry-friend');
  session=await api(page,'battle','sync',{sessionId:session.id});session=await preset(page,session,'finisher');await guest.page.reload();peer=await screen(guest.page);
  await page.locator('.battle-command[data-action="ultimate"]').click();await page.waitForFunction(()=>document.querySelector('.battle-phase-clock').getAttribute('data-phase-kind')==='pending');
  const pending=await api(page,'battle','snapshot',{sessionId:session.id});assert.equal(pending.pendingAction.action,'ultimate');assert.equal(pending.snapshot.round,0);await capture(page,'friend-pending');
  await host.app.close();apps.delete('host');host=await launch('host');await route(host.page,`/battle/session/${session.id}`);await screen(host.page);assert.equal(await host.page.locator('.battle-phase-clock').getAttribute('data-phase-kind'),'pending');assert.equal(await host.page.locator('.battle-phase-clock').getAttribute('data-deadline'),null);
  await act(guest.page,peer,'dodge','friend-round');await host.page.waitForFunction(()=>Boolean(document.querySelector('.battle-complete-actions')));session=await api(host.page,'battle','snapshot',{sessionId:session.id});peer=await api(guest.page,'battle','snapshot',{sessionId:peer.id});assert.equal(session.winner,'player');assert.equal(peer.winner,'enemy');assert.equal(session.reward.applied,true);assert.equal(peer.reward.applied,true);assert.equal(server.state.rounds[session.room.id].length,1);await capture(host.page,'friend-settled');
  const before=(await api(host.page,'companions','list')).pets;await api(host.page,'battle','retrySettlement',{sessionId:session.id});assert.deepEqual((await api(host.page,'companions','list')).pets,before);
  await host.page.reload();await screen(host.page);await observe(host.page);await host.page.waitForTimeout(500);assert.ok((await host.page.evaluate(()=>window.__v3Samples)).every(value=>value.phase==='rest'&&value.kind==='complete'));
  record('two-peer simulated friend settlement, original pending restored after native restart, no invented deadline or historical replay',{session,peer,receipt:server.state.claims[`${session.room.id}:${session.context.cloudUserId}`]});await guest.app.close();apps.delete('guest');return host;
}
let failure;
try {
  let host=await launch('host');let session=await start(host.page,host.pets.find(pet=>pet.element==='water'),'fire');
  await geometry(host.page,'training-1280');
  const win=await host.app.browserWindow(host.page);await win.evaluate(win=>win.setContentSize(1440,900,false));await geometry(host.page,'training-1440');await win.evaluate(win=>win.setContentSize(1024,720,false));await geometry(host.page,'training-1024');await win.evaluate(win=>win.setContentSize(1280,844,false));
  if(process.argv.includes('--tips-only'))await tooltips(host.page);
  else if(!process.argv.includes('--layout-only')) {
    await ring(host.page,session,'charge-empty');await tooltips(host.page);session=await act(host.page,session,'normal_attack','partial-charge');assert.ok(session.snapshot.player.anger>0&&session.snapshot.player.anger<session.rules.ultimateAnger);await ring(host.page,session,'charge-partial');
    for(let i=0;i<3;i++)session=await act(host.page,session,'normal_attack',`log-${i}`);
    const scroll=host.page.locator('.battle-live-log-scroll [data-slot="scroll-area-viewport"]');const size=await scroll.evaluate(node=>({height:node.clientHeight,content:node.scrollHeight}));assert.ok(size.content>size.height);await scroll.hover();await host.page.mouse.wheel(0,400);await host.page.waitForFunction(()=>document.querySelector('.battle-live-log-scroll [data-slot="scroll-area-viewport"]').scrollTop>0);await capture(host.page,'log-scrolled');record('real round log scrolls inside bounded card',size);
    await abandon(host.page,session);session=await start(host.page,host.pets.find(pet=>pet.element==='water'),'fire');session=await preset(host.page,session);const before=await ring(host.page,session,'charge-ready');assert.equal(before.max,50);session=await act(host.page,session,'ultimate','ultimate-consumed');assert.equal(session.snapshot.player.anger,0);await ring(host.page,session,'charge-consumed');
    const authoritative=session.snapshot;await route(host.page,'/companions');await host.page.locator('.cp-page').waitFor();await route(host.page,`/battle/session/${session.id}`);await screen(host.page);assert.equal(await host.page.locator('.battle-phase-clock').getAttribute('data-phase-kind'),'choosing');assert.equal(await host.page.locator('.battle-phase-clock').getAttribute('data-deadline'),null);assert.deepEqual((await api(host.page,'battle','snapshot',{sessionId:session.id})).snapshot,authoritative);await abandon(host.page,session);
    await matrix(host);await entries(host);host=await friends(host);
    // The existing animation preference must immediately remove the timed presentation and unlock input.
    session=await start(host.page,host.pets.find(pet=>pet.element==='water'),'fire');await host.page.locator('.battle-command[data-action="normal_attack"]').click();await host.page.waitForFunction(()=>document.querySelector('.battle-phase-clock').getAttribute('data-phase-kind')==='animation');await capture(host.page,'phase-countdown');const resolved=await api(host.page,'battle','snapshot',{sessionId:session.id});await route(host.page,'/companions');await host.page.locator('.cp-page').waitFor();await route(host.page,`/battle/session/${session.id}`);await screen(host.page);assert.equal(await host.page.locator('.battle-phase-clock').getAttribute('data-phase-kind'),'choosing');assert.deepEqual((await api(host.page,'battle','snapshot',{sessionId:session.id})).snapshot,resolved.snapshot);record('switching away during animation restores the resolved round without replay or a new timer');
    await host.page.locator('.battle-command[data-action="normal_attack"]').click();await host.page.waitForFunction(()=>document.querySelector('.battle-phase-clock').getAttribute('data-phase-kind')==='animation');const settings=await api(host.page,'accounts','settingsGet');settings.document.desktop.animationsEnabled=false;await api(host.page,'accounts','settingsSave',{actionId:randomUUID(),revision:settings.revision,document:settings.document});await host.page.waitForFunction(()=>document.querySelector('.battle-phase-clock').getAttribute('data-phase-kind')==='choosing');assert.equal(await host.page.locator('.battle-phase-clock').getAttribute('data-deadline'),null);record('animation preference removes the actual deadline immediately');
  }
  assert.deepEqual(errors,[]);evidence.passed=true;record('V3 native verification passed');
} catch(error) { failure=error;evidence.passed=false;evidence.failure={message:error.message,stack:error.stack};save();for(const [name,app] of apps)try{await capture(await app.firstWindow(),`failure-${name}`);}catch{} }
finally {
  for(const app of apps.values())await app.close().catch(()=>{});await server.close();
  for(const [name,values] of Object.entries(logs))writeFileSync(join(output,`${name}.log`),values.join(''));
  evidence.profiles=Object.fromEntries(Object.entries(profiles).map(([name,value])=>[name,{directory:value.directory,owner:value.owner,account:value.account}]));
  evidence.sqlite=[];
  for(const [name,config] of Object.entries(profiles)) {
    const db=new DatabaseSync(join(config.directory,'lingjing.sqlite'),{readOnly:true});db.exec('PRAGMA query_only=ON');
    const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'battle_%'").all().map(value=>value.name);
    const sessions=db.prepare('SELECT owner_account_id,id,status,data_json FROM battle_sessions').all().map(value=>{assert.equal(value.owner_account_id,config.owner);const session=JSON.parse(value.data_json);return {id:value.id,status:value.status,mode:session.mode,rounds:session.rounds.length,anger:session.snapshot.player.anger,reward:session.reward};});
    const rewards=db.prepare('SELECT owner_account_id,session_id,action_id,pet_id,data_json FROM battle_reward_receipts').all();assert.ok(rewards.every(value=>value.owner_account_id===config.owner));assert.equal(new Set(rewards.map(value=>value.session_id)).size,rewards.length);
    evidence.sqlite.push({name,tables,sessions,rewards});db.close();
  }
  save();console.log(JSON.stringify({output,passed:evidence.passed,steps:steps.length,errors,failure:failure?.message}));
}
if(failure)throw failure;
