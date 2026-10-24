import { _electron as electron } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
const previous = JSON.parse(readFileSync(resolve('artifacts/foundation/resource-art/evidence.json'),'utf8'));
const output = resolve('artifacts/foundation/pages'); mkdirSync(output,{recursive:true});
const env = {...process.env,PET_USER_DATA_DIR:previous.profile}; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({args:[resolve('.')],env});
const resume = process.env.LINGJING_PAGES_RESUME === '1';
const evidence = resume ? {...JSON.parse(readFileSync(join(output,'failure.json'),'utf8')),resumedAt:new Date().toISOString(),errors:[]} : {at:new Date().toISOString(),profile:previous.profile,views:[],errors:[],data:'Actual isolated local account, imported resource, independent pets and random production training; no external model or GPS success asserted'};
delete evidence.failure;
let page;
const invoke = async (feature,command,payload) => {
  const result = await page.evaluate(({feature,command,payload})=>window.lingjing.invoke(feature,command,payload),{feature,command,payload});
  assert.equal(result.ok,true,JSON.stringify(result)); return result.data;
};
async function screen(number,path,title,notes='') {
  await page.bringToFront();
  await page.evaluate(path=>{location.hash=`#${path}`;},path);
  await page.getByRole('heading',{name:title,exact:true}).waitFor();
  await page.waitForFunction(()=>{const current=document.querySelector('.main-content > .app-page-motion[data-current-route=true]');return current&&Number(getComputedStyle(current).opacity)>.99;},null,{timeout:5000});
  await page.waitForFunction(()=>document.querySelectorAll('.main-content > .app-page-motion').length===1,null,{timeout:1000});
  await page.evaluate(()=>document.querySelector('.main-content').scrollTo(0,0));
  const file=`${number}-${path.split('/')[1]}.png`; await page.screenshot({path:join(output,file)});
  const primitives=await page.locator('[data-slot]').evaluateAll(elements=>[...new Set(elements.map(e=>e.getAttribute('data-slot')))]);
  evidence.views.push({number,path,title,file,notes,primitives});
}
try {
  for(let i=0;i<100;i++){page=app.windows().find(p=>p.url().includes('/dist/ui/index.html')&&!p.url().includes('#/desktop/'));if(page)break;await new Promise(r=>setTimeout(r,100));}
  assert.ok(page);page.on('pageerror',e=>evidence.errors.push(e.message));
  await page.getByRole('navigation',{name:'主导航'}).waitFor();
  const pets=(await invoke('companions','list')).pets, first=pets.find(p=>p.petId===previous.pets[0].petId), second=pets.find(p=>p.petId!==first.petId);
  if(!resume){
  await invoke('discovery','setDemo',{enabled:false});
  await screen('01','/companions','今天，也有小家伙在等你。');
  await screen('04',`/companions/${first.petId}`,'每一份陪伴，都有回应。');
  await screen('05','/companions/adopt','再认识一位新朋友。');
  await screen('08','/garden','给伙伴，留一片小天地。','Physical territory authority remains subject to real location gate');
  await screen('09','/inventory','把喜欢的，都留给你。');
  await screen('18','/garden/plots','把小日子，种成好收成。','No crop clocks or database timestamps changed');
  await screen('19','/garden/kitchen','这一口，是亲手种下的喜欢。','Current real inventory; production harvest/craft/feed evidence is also recorded by garden');
  await screen('13','/resources','让喜欢的角色，来到桌面。');
  await page.locator(`.resource-card[data-resource-id="${previous.imported.id}"]`).click(); await page.locator('.resource-stage[data-status="ready"]').waitFor();
  await page.getByRole('button',{name:'应用给伙伴',exact:true}).click();await page.getByRole('combobox',{name:'应用形象的伙伴',exact:true}).waitFor();await page.keyboard.press('Escape');
  const desktop=app.windows().find(p=>p.url().includes(`#/desktop/${first.petId}`));assert.ok(desktop);
  await desktop.locator('.resource-stage[data-status="ready"] canvas').waitFor();
  assert.equal(await desktop.locator('.resource-stage').evaluate(e=>getComputedStyle(e,'::before').display),'none');
  await desktop.screenshot({path:join(output,'01-native-desktop.png')});
  await screen('14','/settings','按你的节奏，安静陪伴。');
  await screen('14b','/settings/privacy','留一点安静，给自己。');
  await screen('15','/settings/ai','给每位伙伴，不同的声音与性格。','No live model credentials configured');
  await screen('17','/account','把每一段陪伴，好好保存。');
  await screen('02','/discovery','下楼走走，遇见新伙伴。','Real initial location/permission state; positive precise-location capture is separate');
  await invoke('discovery','setDemo',{enabled:true});await page.reload();await page.getByRole('heading',{name:'下楼走走，遇见新伙伴。',exact:true}).waitFor();
  await page.getByText('演示模式 · 示例位置与游戏点位，仅供浏览，不能收服或发放奖励。',{exact:true}).waitFor();
  await page.screenshot({path:join(output,'02-explicit-demo-map.png')});
  const discovery=await invoke('discovery','snapshot');
  evidence.mapEngine=await page.locator('[data-map-engine]').getAttribute('data-map-engine');assert.equal(evidence.mapEngine,'maplibre-gl');
  if(discovery.spawns[0]){await page.evaluate(id=>{location.hash=`#/discovery/wild/${id}`;},discovery.spawns[0].id);await page.locator('.discovery-wild-view').waitFor();await page.screenshot({path:join(output,'06-demo-wild-preview.png')});evidence.views.push({number:'06',path:'/discovery/wild/:id',file:'06-demo-wild-preview.png',notes:'Explicit demo preview; no capture/rewards'});}
  await invoke('discovery','setDemo',{enabled:false});
  await screen('11','/battle/friends','找位朋友，切磋一下。','Local account is correctly asked to log in to a cloud account; real friend service remains unverified');
  }
  await screen('03','/battle','和伙伴，并肩出战。');
  let session=(await invoke('battle','overview')).session || await invoke('battle','snapshot',{sessionId:previous.battle.sessionId});assert.ok(session&&session.mode==='training');
  const previouslyFinished=session.status==='finished', sessionId=session.id;
  const before=structuredClone((await invoke('companions','list')).pets);const gardenBefore=await invoke('garden','snapshot');
  for(let i=0;i<150&&session.status==='active';i++){
    const oldRound=session.snapshot.round;
    const ultimate=page.locator('.battle-move.ultimate');await (await ultimate.isEnabled()?ultimate:page.locator('.battle-move.element_attack')).click();
    for(let poll=0;poll<100;poll++){session=await invoke('battle','snapshot',{sessionId});if(session.snapshot.round>oldRound||session.status!=='active')break;await new Promise(r=>setTimeout(r,20));}
  }
  assert.equal(session.status,'finished');assert.equal(session.reward.applied,true);evidence.training={id:session.id,winner:session.winner,rounds:session.rounds.length,reward:session.reward};
  const after=(await invoke('companions','list')).pets;assert.deepEqual(after.find(p=>p.petId===second.petId).growth,before.find(p=>p.petId===second.petId).growth);
  const gardenAfter=await invoke('garden','snapshot');evidence.seedLedger={before:gardenBefore.items.filter(i=>i.category==='seed').reduce((sum,i)=>sum+i.quantity,0),after:gardenAfter.items.filter(i=>i.category==='seed').reduce((sum,i)=>sum+i.quantity,0),previouslyFinished};assert.equal(evidence.seedLedger.after-evidence.seedLedger.before,previouslyFinished?0:2);assert.equal(session.reward.seeds.quantity,2);
  await screen('12',`/battle/reports/${session.id}`,'每一次并肩，都值得记住。');
  await screen('10','/chat','想说的话，我都在听。','Actual assistant-ui over current account/pet; no live model response fabricated');
  assert.equal(await page.locator('model-viewer').count(),0);assert.deepEqual(evidence.errors,[]);
  writeFileSync(join(output,'evidence.json'),JSON.stringify(evidence,null,2));console.log('Integrated native page and training audit passed:',output);
}catch(error){evidence.failure=String(error);if(page)evidence.motionDiagnostic=await page.evaluate(()=>({hidden:document.hidden,policy:document.documentElement.dataset.motion,pages:[...document.querySelectorAll('.app-page-motion')].map(e=>({style:e.getAttribute('style'),opacity:getComputedStyle(e).opacity,title:e.querySelector('h1')?.textContent})),animations:document.getAnimations().map(a=>({state:a.playState,time:a.currentTime,duration:a.effect?.getTiming().duration}))}));writeFileSync(join(output,'failure.json'),JSON.stringify(evidence,null,2));if(page){await page.screenshot({path:join(output,'failure.png')});console.error(JSON.stringify(evidence.motionDiagnostic));console.error(await page.locator('body').innerText());}throw error;}finally{await app.close();}
