import { _electron as electron } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const output=resolve(process.argv[2] || 'artifacts/foundation/visual-recheck');
const baseline=JSON.parse(readFileSync(join(output,'evidence.json'),'utf8'));
const env={...process.env,PET_USER_DATA_DIR:baseline.profile};delete env.ELECTRON_RUN_AS_NODE;
const proof={at:new Date().toISOString(),profile:baseline.profile,scope:'Targeted A01-A12 runtime readback after the concentrated capture; external service gates remain separate',checks:[],errors:[]};
const app=await electron.launch({args:[resolve('.')],env});let page;
const invoke=async(feature,command,payload={})=>{
  const value=await page.evaluate(({feature,command,payload})=>window.lingjing.invoke(feature,command,payload),{feature,command,payload});
  assert.equal(value.ok,true,JSON.stringify(value));return value.data;
};
async function route(path) {
  await page.bringToFront();await page.evaluate(path=>{location.hash='#'+path;},path);
  await page.waitForFunction(path=>{const e=document.querySelector('.main-content>.app-page-motion');return e?.getAttribute('data-route-key')===path&&getComputedStyle(e).opacity==='1'&&document.querySelectorAll('.main-content>.app-page-motion').length===1;},path);
  await page.evaluate(()=>document.querySelector('.main-content').scrollTo(0,0));
}
async function size(width,height){await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows().find(w=>!w.webContents.getURL().includes('#/desktop/')).setSize(...size),[width,height]);}
try {
  for(let i=0;i<100;i++){page=app.windows().find(p=>p.url().includes('/dist/ui/index.html')&&!p.url().includes('#/desktop/'));if(page)break;await new Promise(r=>setTimeout(r,100));}
  assert.ok(page);page.on('pageerror',e=>proof.errors.push(e.message));await page.getByRole('navigation',{name:'主导航'}).waitFor();
  const before=await invoke('companions','list'),pets=before.pets,resources=await invoke('resources','list');
  assert.equal(before.templates.length,6);assert.equal(new Set(before.templates.map(t=>t.resource.resourceId)).size,6);
  const actions=['idle','blink','walk','wave','eat','attack_windup','attack_release','attack','hit','skill','victory','sleep'];
  proof.roster=[];
  for(const pet of pets){
    const ids=[];
    for(const action of actions){const display=await invoke('resources','resolve',{petId:pet.petId,resourceId:pet.resource.resourceId,context:'battle',action});assert.equal(display.fallback,false,`${pet.name}:${action}`);assert.equal(display.resource.id,pet.resource.resourceId);ids.push({action,frames:display.clip.frameNames||display.clip.frames});}
    proof.roster.push({petId:pet.petId,name:pet.name,resourceId:pet.resource.resourceId,actions:ids});
  }
  assert.equal(pets.length,6);assert.equal(resources.filter(r=>pets.some(p=>p.resource.resourceId===r.id)).length,6);
  proof.checks.push('A07/A08: six distinct canonical resources; all 72 action resolutions use authored clips without fallback');
  for(const width of [1280,1440]){
    await size(width,width===1280?844:900);await route('/inventory');await page.locator('.garden-item').first().waitFor();
    const geometry=await page.locator('.garden-item-grid>.garden-item').evaluateAll(elements=>elements.map(e=>{const r=e.getBoundingClientRect(),art=e.querySelector('.garden-item-art').getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,artContained:art.x>=r.x&&art.y>=r.y&&art.right<=r.right+.5&&art.bottom<=r.bottom+.5};}));
    assert.ok(geometry.every(e=>e.artContained));for(let i=0;i<geometry.length;i++)for(let j=i+1;j<geometry.length;j++){const a=geometry[i],b=geometry[j];assert.ok(a.right<=b.x+.5||b.right<=a.x+.5||a.bottom<=b.y+.5||b.bottom<=a.y+.5,'inventory card intersection');}
    const petCards=await page.locator('.garden-pet').evaluateAll(elements=>elements.map(e=>({height:e.clientHeight,scroll:e.scrollHeight})));assert.ok(petCards.every(e=>e.scroll<=e.height+2));
    proof.checks.push(`A04: ${width}px inventory cards contain art and do not overlap; pet cards contain names and levels`);
    await route('/settings');await page.getByRole('button',{name:'保存设置',exact:true}).waitFor();
    const switches=await page.locator('.ac-radix-switch').evaluateAll(elements=>elements.map(e=>{const r=e.getBoundingClientRect(),thumb=e.querySelector('[data-slot=switch-thumb]').getBoundingClientRect();return{state:e.getAttribute('data-state'),inside:thumb.x>=r.x-.5&&thumb.right<=r.right+.5&&thumb.y>=r.y-.5&&thumb.bottom<=r.bottom+.5};}));
    assert.ok(switches.some(s=>s.state==='checked')&&switches.some(s=>s.state==='unchecked'));assert.ok(switches.every(s=>s.inside));
    const save=await page.getByRole('button',{name:'保存设置',exact:true}).boundingBox();assert.ok(save.y+save.height<=await page.evaluate(()=>innerHeight));
    proof.checks.push(`A05: ${width}px on/off switch thumbs stay within tracks; save control visible`);
  }
  await size(1280,844);await route('/resources');
  const labels={walk:'行走',eat:'吃东西',attack:'普通攻击',skill:'技能施放'};
  proof.pixi=[];
  for(const pet of pets){
    await page.locator(`.resource-card[data-resource-id="${pet.resource.resourceId}"]`).click();
    for(const [action,label]of Object.entries(labels)){
      await page.getByRole('combobox',{name:'预览动作',exact:true}).click();await page.getByRole('option',{name:label,exact:true}).click();
      const stage=page.locator(`.resources-preview .resource-stage[data-resource-id="${pet.resource.resourceId}"][data-action="${action}"][data-status="ready"][data-fallback="false"]`);await stage.waitFor();
      await page.waitForTimeout(180);assert.equal(await stage.locator('canvas').count(),1);
      proof.pixi.push({petId:pet.petId,action,clip:await stage.getAttribute('data-clip')});
    }
  }
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.documentElement.dataset.motion==='reduced');
  const still=await page.locator('.resources-preview .resource-stage').locator('.resource-sprite-host').getAttribute('data-frame');await page.waitForTimeout(300);assert.equal(await page.locator('.resources-preview .resource-stage').locator('.resource-sprite-host').getAttribute('data-frame'),still);
  await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>document.documentElement.dataset.motion==='enabled');
  proof.checks.push('A08/A12: actual Pixi canvases played 24 selected clips across six resources; live system reduced-motion stopped frames');
  await route('/battle');let session=await invoke('battle','snapshot',{sessionId:baseline.battleSession.id});
  assert.equal(session.status,'active','Use the retained fresh concentrated-review training session');
  await page.locator('.battle-stage .resource-stage[data-status=ready]').first().waitFor();
  const skillRects=await page.locator('.battle-move').evaluateAll(elements=>elements.map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,bottom:r.bottom,art:!!e.querySelector('.battle-skill-art'),status:!!e.querySelector('.battle-skill-status')};}));
  assert.equal(skillRects.length,4);assert.ok(skillRects.every(r=>r.bottom<=844&&r.art&&r.status));assert.ok(Math.max(...skillRects.map(r=>r.width))-Math.min(...skillRects.map(r=>r.width))<1);
  assert.equal(await page.locator('.battle-move.ultimate').isDisabled(),true);
  await page.locator('.battle-move.normal_attack').focus();await page.keyboard.press('Tab');assert.equal(await page.locator('.battle-move.element_attack').evaluate(e=>e.matches(':focus-visible')),true);
  const gardenBefore=await invoke('garden','snapshot'),growthBefore=(await invoke('companions','list')).pets;
  await page.evaluate(()=>{window.__battleActions=[];new MutationObserver(()=>{window.__battleActions.push([...document.querySelectorAll('.battle-stage .resource-stage')].map(e=>({action:e.getAttribute('data-action'),fallback:e.getAttribute('data-fallback')})));}).observe(document.querySelector('.battle-stage'),{subtree:true,attributes:true,attributeFilter:['data-action','data-frame']});});
  let clicks=0,ultimateUsed=false;
  while(session.status==='active'&&clicks<80){
    const action=session.snapshot.player.anger>=50?'ultimate':'element_attack';if(action==='ultimate')ultimateUsed=true;
    const oldRound=session.snapshot.round;await page.locator(`.battle-move.${action}`).click();
    for(let i=0;i<100;i++){session=await invoke('battle','snapshot',{sessionId:session.id});if(session.snapshot.round>oldRound||session.status!=='active')break;await page.waitForTimeout(20);}
    if(clicks===0){await page.waitForTimeout(200);assert.equal(await page.locator('.battle-move.element_attack').getAttribute('aria-pressed'),'true');await page.screenshot({path:join(output,'03-selected-skill.png')});}
    clicks++;await page.waitForTimeout(160);
  }
  assert.equal(session.status,'finished');assert.equal(session.reward.applied,true);assert.ok(ultimateUsed);proof.battle={id:session.id,rounds:session.rounds.length,winner:session.winner,reward:session.reward,ultimateUsed,skillRects,actions:await page.evaluate(()=>window.__battleActions)};
  const growthAfter=(await invoke('companions','list')).pets;
  for(const pet of growthBefore)if(pet.petId!==session.player.petId)assert.deepEqual(growthAfter.find(p=>p.petId===pet.petId).growth,pet.growth);
  const gardenAfter=await invoke('garden','snapshot');const seeds=s=>s.items.filter(i=>i.category==='seed').reduce((n,i)=>n+i.quantity,0);assert.equal(seeds(gardenAfter)-seeds(gardenBefore),2);
  await route(`/battle/reports/${session.id}`);await page.getByRole('heading',{name:'每一次并肩，都值得记住。',exact:true}).waitFor();await page.screenshot({path:join(output,'12-report.png')});
  proof.checks.push('A09/A10/A11: equal four visible skill cards, focus/selected states, natural ultimate charge, real standard-120 battle, selected-instance reward and one seed receipt');
  assert.deepEqual(proof.errors,[]);proof.completedAt=new Date().toISOString();proof.result='Targeted revised runtime checks passed; independent final visual approval remains pending';console.log(proof.result);
}catch(error){proof.failure=String(error);if(page)await page.screenshot({path:join(output,'revision-failure.png')});throw error;}finally{writeFileSync(join(output,'revision-checks.json'),JSON.stringify(proof,null,2));await app.close();}
