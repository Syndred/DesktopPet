// B02: real native four-action animation/atlas correlation in a fresh official offline QA profile.
// No preset, clock/media override, injected render frames, cloud or real account.
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
const output=resolve('artifacts/foundation/cloud-engineering/battleAnimation',`run-${Date.now()}`);mkdirSync(output,{recursive:true});
const profile=realpathSync.native(mkdtempSync(join(tmpdir(),'lingjing-battleAnimation-'))),runId=randomUUID(),secret=`Qa-${randomUUID()}!`,account=`qa_animation_${runId.slice(0,8)}`;
writeFileSync(join(profile,MARKER),JSON.stringify({schemaVersion:1,application:'lingjing',scenario:SCENARIO,runId,isolated:true,profilePath:realpathSync.native(profile),createdAt:new Date().toISOString()}),{flag:'wx'});
const offlineConfig=join(profile,'offline-public.json');writeFileSync(offlineConfig,'{}',{flag:'wx'});
const systemKeys=new Set(['PATH','PATHEXT','SYSTEMROOT','SYSTEMDRIVE','WINDIR','COMSPEC','TEMP','TMP','TMPDIR','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMFILES','PROGRAMFILES(X86)','PROGRAMW6432','LANG','LC_ALL','CI']);
const offlineEnvironment=Object.fromEntries(Object.keys(process.env).filter(key=>!systemKeys.has(key.toUpperCase())).map(key=>[key,undefined]));Object.assign(offlineEnvironment,{LINGJING_QA_SCENARIO:SCENARIO,LINGJING_PUBLIC_CONFIG:offlineConfig});
const proof={scope:'B02: actual audited SFX, fresh simulated-local, normal UI natural anger and four current actions; readonly real Pixi texture/frame and authority round correlation. No cloud, preset, system motion override or forged frame.',sourceCommit:expectedSource,compiledFingerprint:build.compiledFingerprint,exeSha256:await sha256(executable),cases:[],passed:false,startedAt:new Date().toISOString()};
let stage='setup',model,uncertain=false,owner;const pids=new Set();const save=()=>writeFileSync(join(output,'evidence.json'),JSON.stringify(proof,null,2));
function alive(pid){try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}}
async function stop(){if(model){proof.offlineBlocked=(proof.offlineBlocked||[]);proof.offlineBlocked.push(await model.main(()=>globalThis.__battleAnimationOfflineBlocked).catch(()=>({observation:'unavailable'})));await model.stop();}if(uncertain)throw Error('Launch outcome/PID unknown; keep temporary profile');proof.pidChecks=await pollState(()=>[...pids].map(pid=>({pid,alive:alive(pid)})),rows=>rows.every(row=>!row.alive),{timeoutMs:10000,intervalMs:200,label:'Owned process still alive; keep temporary profile'});model=null;}
async function launch(){uncertain=true;model=await launchPortableSession({executable,profile,expectedSource,label:'battleAnimation-qa',environment:offlineEnvironment});for(const pid of[model.launcherPid,model.runtime.pid])if(Number.isInteger(pid)&&pid>0)pids.add(pid);uncertain=false;assert.equal(model.info.build.compiledFingerprint,build.compiledFingerprint);assert.deepEqual(model.info.build.sourceDirtyFiles,[]);assert.equal((await model.call('accounts','session')).scenario?.runId,runId);await model.main(({session})=>{
  globalThis.__battleAnimationOfflineBlocked={node:0,fetch:0,websocket:0,chromium:0};
  const deny=kind=>{globalThis.__battleAnimationOfflineBlocked[kind]++;throw Error('OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN');};
  for(const name of['node:http','node:https']){const mod=process.getBuiltinModule(name);for(const method of['request','get'])mod[method]=()=>deny('node');}
  const net=process.getBuiltinModule('node:net');for(const method of['connect','createConnection'])net[method]=()=>deny('node');
  process.getBuiltinModule('node:tls').connect=()=>deny('node');process.getBuiltinModule('node:http2').connect=()=>deny('node');
  globalThis.fetch=()=>{globalThis.__battleAnimationOfflineBlocked.fetch++;return Promise.reject(Object.assign(Error('OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN'),{code:'OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN'}));};
  if(globalThis.WebSocket)globalThis.WebSocket=class{constructor(){deny('websocket');}};
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_details,callback)=>{globalThis.__battleAnimationOfflineBlocked.chromium++;callback({cancel:true});});
 });}
async function route(path){await model.page.evaluate(path=>{location.hash='#'+path;},path);await model.page.waitForFunction(path=>location.hash==='#'+path,path);const current=model.page.locator(`.app-page-motion[data-route-key="${path}"][data-current-route="true"]`);await current.waitFor();await current.locator('h1').first().waitFor();assert.equal(await current.getByText('页面暂时遇到问题',{exact:true}).count(),0);}
async function register(account,password,name){const page=model.page;await page.getByRole('tab',{name:'注册',exact:true}).click();await page.getByLabel('用户名',{exact:true}).fill(name);await page.locator('input[autocomplete="username"]').fill(account);await page.getByLabel('密码',{exact:true}).fill(password);await page.getByLabel('确认密码',{exact:true}).fill(password);await page.getByRole('button',{name:'创建账号 →',exact:true}).click();await page.getByRole('navigation',{name:'主导航',exact:true}).waitFor();const session=await model.call('accounts','session');assert.equal(session.dataMode,'simulated');assert.ok(session.currentUser.id.startsWith(`qa:${runId}:`));return session.currentUser.id;}
async function adopt(){await route('/companions/adopt');const data=await model.call('companions','list'),template=data.templates.find(t=>t.templateId==='animal-wood-deer');assert.ok(template);await model.page.locator('.cp-template-card').filter({has:model.page.locator('strong',{hasText:template.name})}).click();const toggle=model.page.getByRole('checkbox',{name:'领养后放到桌面',exact:true});if(await toggle.getAttribute('aria-checked')==='true')await toggle.click();await model.page.getByRole('button',{name:'领养这位伙伴',exact:true}).click();const after=await pollState(()=>model.call('companions','list'),x=>x.pets.length===data.pets.length+1);return after.pets.find(p=>!data.pets.some(old=>old.petId===p.petId));}
async function screenshot(name){await model.page.screenshot({path:join(output,name+'.png'),timeout:10000});}
const deadline=Date.now()+300000;const bounded=()=>assert.ok(Date.now()<deadline,'Fixture deadline reached');
const resources={};
function expectedAction(round,side,phase){const selected=round.actions[side],other=side==='player'?'enemy':'player';
 if(phase==='impact'&&(round.directDamage?.[side]||0)>0)return 'hit';
 if(selected==='dodge')return 'walk';
 if(phase==='windup')return selected==='stunned'?'idle':'attack_windup';
 if(selected==='element_attack'&&round.actions[other]==='normal_attack'&&!(round.directDamage?.[other]||0))return 'idle';
 if(phase==='release')return selected==='normal_attack'?'attack_release':['element_attack','ultimate'].includes(selected)?'skill':'idle';return 'idle';}
function atlasPlan(resource,action){const name=resource.actions[action],clip=resource.clips.find(c=>c.name===name);assert.ok(clip,'Expected authored action missing');const names=clip.frameNames||resource.atlas.animations[clip.name];assert.ok(names?.length);return {clip:clip.name,regions:names.map(n=>{const f=resource.atlas.frames[n].frame;return [f.x,f.y,f.w,f.h].join(',');})};}
async function motion(){const value=await model.page.evaluate(()=>({hidden:document.hidden,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,motion:document.querySelector('.battle-stage')?.closest('[data-motion]')?.getAttribute('data-motion')}));proof.motion=value;save();assert.equal(value.hidden,false);assert.equal(value.reduced,false,'REDUCED_MOTION_BLOCKED');assert.notEqual(value.motion,'reduced');}
async function observeStart(){await model.page.evaluate(()=>{
 const root=document.querySelector('[data-battle-screen="shared-v1"]');if(!root)throw Error('No owned battle screen');const samples=[],start=performance.now();
 const sample=()=>{if(samples.length>=250)return;const state={ms:performance.now()-start,phase:root.querySelector('[data-animation-phase]')?.getAttribute('data-animation-phase'),key:root.querySelector('[data-animation-key]')?.getAttribute('data-animation-key'),actors:[...root.querySelectorAll('.battle-stage .battle-actor-slot')].map(slot=>{const e=slot.querySelector('.resource-stage'),h=e?.querySelector('.resource-sprite-host');return {side:slot.getAttribute('data-side'),pet:e?.getAttribute('data-pet-id'),resource:e?.getAttribute('data-resource-id'),action:e?.getAttribute('data-action'),clip:e?.getAttribute('data-clip'),playbackKey:e?.getAttribute('data-playback-key'),fallback:e?.getAttribute('data-fallback'),frame:h?.getAttribute('data-frame'),region:h?.getAttribute('data-texture-frame'),texture:h?.getAttribute('data-frame-texture'),canvas:e?.querySelectorAll('canvas').length};}),events:[...root.querySelectorAll('[data-event-id]')].map(e=>({id:e.getAttribute('data-event-id'),kind:e.getAttribute('data-event-kind'),text:e.textContent}))};samples.push(state);};sample();const timer=setInterval(sample,30);window.__battleAnimationObservation={samples,stop(){clearInterval(timer);sample();}};
 });}
async function execute(before,action){bounded();stage=`round-${before.snapshot.round+1}-${action}`;proof.stage=stage;save();await motion();assert.equal(before.status,'active');assert.ok(!before.pendingAction);await model.page.waitForFunction(()=>document.querySelector('[data-animation-phase]')?.getAttribute('data-animation-phase')==='rest');
 const button=model.page.locator(`.battle-move.battle-command[data-action="${action}"]`);assert.equal(await button.count(),1);assert.equal(await button.isEnabled(),true);const initial=before.snapshot.player;
 if(initial.anger<before.rules.ultimateAnger)assert.equal(await model.page.locator('.battle-move.battle-command[data-action="ultimate"]').isDisabled(),true);
 if(action==='ultimate')assert.ok(initial.anger>=before.rules.ultimateAnger);
 if(action==='dodge')assert.ok(initial.anger>0||!initial.freeDodgeUsed);
 await observeStart();let samples;
 try{await button.click();await model.page.waitForFunction(()=>window.__battleAnimationObservation.samples.some(s=>s.phase==='windup'),null,{timeout:12000});await model.page.waitForFunction(()=>window.__battleAnimationObservation.samples.some(s=>s.phase==='effects')&&document.querySelector('[data-animation-phase]')?.getAttribute('data-animation-phase')==='rest',null,{timeout:12000});}
 finally{samples=await model.page.evaluate(()=>{const o=window.__battleAnimationObservation;o.stop();delete window.__battleAnimationObservation;return o.samples;});proof.observations??=[];proof.observations.push({action,round:before.snapshot.round+1,samples});save();}
 const after=await model.call('battle','snapshot',{sessionId:before.id}),round=after.rounds.at(-1);assert.equal(after.id,before.id);assert.equal(after.snapshot.round,before.snapshot.round+1);assert.equal(after.rounds.length,before.rounds.length+1);assert.equal(round.actions.player,action);assert.ok(!after.pendingAction);
 let expectedAnger=initial.anger;
 if(action==='ultimate')expectedAnger-=before.rules.ultimateCost;
 if(action==='dodge')expectedAnger-=Math.min(initial.anger,before.rules.dodgeMaxCost);
 const playerHit=action==='normal_attack'?round.actions.enemy!=='dodge':action==='element_attack'?round.actions.enemy!=='normal_attack':false;
 if(playerHit)expectedAnger=Math.min(100,expectedAnger+20); // wood -> earth normal rule advantage
 expectedAnger=Math.min(100,expectedAnger+Math.floor((round.directDamage.player||0)*0.5));
 if(action==='dodge'&&round.actions.enemy==='normal_attack')expectedAnger=Math.min(100,expectedAnger+before.rules.dodgeRefund);
 assert.equal(after.snapshot.player.anger,expectedAnger,'Actual anger spend/gain must match the normal ordered rule');
 const key=`${before.id}:${round.round}`;const phaseChecks=[];
 for(const phase of ['windup','release','impact','effects'])for(const side of ['player','enemy']){
  const expected=expectedAction(round,side,phase),plan=atlasPlan(resources[side],expected),matches=samples.filter(s=>s.key===key&&s.phase===phase).map(s=>s.actors.find(a=>a.side===side)).filter(a=>a&&a.action===expected&&a.clip===plan.clip&&a.region===plan.regions[Number(a.frame)]);
  assert.ok(matches.length,`${side}/${phase} authored texture was not actually observed`);assert.ok(matches.every(a=>a.playbackKey===`${key}:${side}:${phase}:${expected}`&&a.canvas===1&&a.fallback==='false'&&a.texture&&a.pet===before[side].petId&&a.resource===resources[side].id));
  phaseChecks.push({side,phase,action:expected,clip:plan.clip,frames:[...new Set(matches.map(a=>a.frame))],regions:[...new Set(matches.map(a=>a.region))],playbackKeys:[...new Set(matches.map(a=>a.playbackKey))]});
 }
 const playerPhases=phaseChecks.filter(x=>x.side==='player');assert.ok(new Set(playerPhases.flatMap(x=>x.regions)).size>1,'Actual player atlas regions must change, not only text/phase');
 if(action==='normal_attack'){assert.notDeepEqual(playerPhases.find(x=>x.phase==='windup').regions,playerPhases.find(x=>x.phase==='release').regions);}
 if(action==='dodge')assert.ok(playerPhases.some(x=>x.action==='walk'&&x.frames.length>1),'Dodge walk clip must actually progress');
 if(['element_attack','ultimate'].includes(action)&&playerPhases.some(x=>x.phase==='release'&&x.action==='skill'))assert.ok(playerPhases.find(x=>x.phase==='release').frames.length>1,'Skill must actually advance inside release');
 for(const side of ['player','enemy'])if((round.directDamage?.[side]||0)>0)assert.ok(phaseChecks.some(x=>x.side===side&&x.phase==='impact'&&x.action==='hit'&&x.frames.length>1),'Real target hit animation must advance');
 const shownEvents=samples.flatMap(s=>s.events);for(const event of round.visualEvents||[])if(event.kind!=='action')assert.ok(shownEvents.some(e=>e.id===event.id&&e.kind===event.kind),'Authoritative event missing from actual presentation');
 const entry=model.page.locator('.battle-current-log .battle-log-entry').filter({has:model.page.locator('h4',{hasText:`回合 ${round.round}`})}).first();await entry.waitFor();const text=await entry.innerText();assert.ok(text.includes(({normal_attack:'普通攻击',element_attack:'属性攻击',dodge:'闪避',ultimate:'大招'})[action]));
 proof.rounds??=[];proof.rounds.push({round:round.round,action,before:before.snapshot,after:after.snapshot,authority:round,animationKey:key,phaseChecks,readableLog:text});save();await screenshot(`B02-${round.round}-${action}`);return after;
}
try{
 await launch();owner=await register(account,secret,'四动作动画验收');const pet=await adopt();proof.fixture={owner,petId:pet.petId,mode:'simulated-local',presetsUsed:false};save();stage='normal-ui-training';await route('/battle');await model.page.getByRole('combobox',{name:'训练对手五行',exact:true}).click();await model.page.getByRole('option').filter({hasText:'土 ·'}).click();await model.page.getByRole('button',{name:'开始',exact:true}).click();await model.page.waitForFunction(()=>location.hash.startsWith('#/battle/session/'));let session=(await model.call('battle','overview')).session;assert.equal(session.player.petId,pet.petId);assert.equal(session.player.element,'wood');assert.equal(session.enemy.element,'earth');assert.equal(session.snapshot.round,0);assert.equal(session.snapshot.player.anger,0);assert.equal(session.snapshot.player.hp,120);assert.equal(session.context.authority,'simulated');assert.ok(!session.context.qaPreset&&!session.context.qaEnemyAction);
 await model.page.waitForFunction(()=>document.querySelectorAll('.battle-stage .resource-stage[data-status="ready"]').length===2);await motion();for(const side of ['player','enemy'])resources[side]=(await model.call('resources','resolve',{petId:session[side].petId,resourceId:session[side].resource?.resourceId||session[side].appearance2d||session[side].resourceRef,context:'battle',action:'idle'})).resource;
 proof.resources=Object.fromEntries(Object.entries(resources).map(([side,r])=>[side,{id:r.id,contentHash:r.contentHash,actions:r.actions,clips:r.clips,atlasFrames:r.atlas.frames}]));save();
 // Consecutive identical normal actions prove a fresh playback key with real regions each time.
 for(const action of ['normal_attack','normal_attack','element_attack','dodge'])session=await execute(session,action);
 const done=new Set(proof.rounds.map(r=>r.action));
 for(let n=0;n<24&&session.status==='active'&&done.size<4;n++){
  const action=!done.has('ultimate')&&session.snapshot.player.anger>=session.rules.ultimateAnger?'ultimate':done.has('ultimate')&&!done.has('dodge')&&(session.snapshot.player.anger>0||!session.snapshot.player.freeDodgeUsed)?'dodge':'element_attack';session=await execute(session,action);done.add(action);
 }
 assert.equal(done.size,4,'Natural battle ended before all four actions; no state mutation permitted');assert.notEqual(proof.rounds[0].animationKey,proof.rounds[1].animationKey);assert.deepEqual(proof.rounds.slice(0,2).map(r=>r.action),['normal_attack','normal_attack']);
 const ultimate=proof.rounds.find(r=>r.action==='ultimate');assert.ok(ultimate.authority.healEvents.player.some(e=>e.type==='ultimate'));assert.ok(proof.rounds.some(r=>r.authority.healEvents.player.some(e=>e.amount>0)),'Actual positive healing must be observed, not a label');
 proof.cases.push({id:'B02',status:'passed-native-scoped',fullCasePassed:false,sessionId:session.id,actions:[...done],naturalAnger:true,actualAtlasAndFrameCorrelation:true,consecutiveNormalReplay:true,mapping:'Current specified four actions: normal/element/dodge/ultimate; defense is dodge vs normal, healing is wood parasite/ultimate. No separate defend/heal command.'});proof.passed=true;
}catch{proof.error=proof.motion?.reduced||proof.motion?.motion==='reduced'?'REDUCED_MOTION_ENVIRONMENT_BLOCKED':'ASSERTION_OR_STAGE_FAILED';proof.stage=stage;proof.passed=false;process.exitCode=1;}
finally{
 try{await stop();proof.ownedProcessStopped=true;}catch{proof.stopError='OWNED_PROCESS_EXIT_UNCONFIRMED';proof.passed=false;process.exitCode=1;}
 try{assert.equal(dirname(profile),realpathSync.native(tmpdir()));assert.ok(basename(profile).startsWith('lingjing-battleAnimation-'));assert.ok(proof.ownedProcessStopped);rmSync(profile,{recursive:true,force:true});proof.temporaryProfileRemoved=true;}catch{proof.cleanupError='OWNED_PROFILE_CLEANUP_UNCONFIRMED';proof.passed=false;process.exitCode=1;}
 proof.completedAt=new Date().toISOString();save();console.log(JSON.stringify({output,passed:proof.passed,stage:proof.stage}));
}
