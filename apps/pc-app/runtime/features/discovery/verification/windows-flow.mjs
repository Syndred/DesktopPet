import { _electron as electron } from 'playwright';
import { createHash,randomUUID } from 'node:crypto';
import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve,join } from 'node:path';
import assert from 'node:assert/strict';

const output=resolve('artifacts/discovery/windows');mkdirSync(output,{recursive:true});
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const errors=[];
async function mainWindow(application) {
  for(let i=0;i<100;i++) {
    const page=application.windows().find(p=>p.url().includes('/dist/ui/index.html'));
    if(page) {await page.waitForLoadState('domcontentloaded');return page;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('Main application UI did not open');
}
const snapshot=async page=>{const result=await page.evaluate(()=>window.lingjing.invoke('discovery','snapshot'));assert.equal(result.ok,true);return result.data;};
const actualEnv={...env,PET_USER_DATA_DIR:join(output,'real-system-profile')};
let application=await electron.launch({args:[resolve('.')],env:actualEnv});
let systemEvidence;
try {
  const page=await mainWindow(application);page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'附近探索',exact:true}).click();
  await page.getByRole('button',{name:'获取系统位置',exact:true}).click();
  await page.waitForFunction(()=>['系统定位已就绪','定位精度不足','系统拒绝位置访问','系统定位超时','系统位置不可用'].includes(document.querySelector('.discovery-location-bar strong')?.textContent || ''),undefined,{timeout:30000});
  let state=await snapshot(page);
  const fix=state.location.fix;
  systemEvidence={at:new Date().toISOString(),mode:'production-runtime-native-location',locationStatus:state.location.status,source:fix?.source,provider:fix?.provider,positionSource:fix?.positionSource,accuracyMeters:fix?.accuracyMeters,timestampMs:fix?.timestampMs,coordinateHash:fix?createHash('sha256').update(`${fix.lat},${fix.lng}`).digest('hex'):null,error:state.location.lastError,preciseCoordinatesCommitted:false};
  if(fix) {
    assert.equal(fix.source,'os');assert.equal(fix.provider,'windows-geolocator');
    if(fix.accuracyMeters>80) {assert.equal(state.location.status,'imprecise');assert.ok(state.spawns.every(spawn=>!spawn.inRange));}
  } else assert.ok(['denied','timeout','unavailable'].includes(state.location.status));
  await page.locator('.main-content').evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:join(output,'real-system-location-private.png')});
  await page.getByLabel('演示模式',{exact:true}).click();
  await page.getByText('演示模式 · 示例坐标',{exact:true}).waitFor();
  state=await snapshot(page);assert.equal(state.location.fix.source,'demo');
  const challenge=page.getByRole('button',{name:'开始野外挑战',exact:true});if(await challenge.count()) assert.equal(await challenge.isDisabled(),true);
  // Visible, demand-loaded real map tiles; no fabricated road layer.
  await page.waitForFunction(()=>document.querySelectorAll('.discovery-tile img').length>=document.querySelectorAll('.discovery-tile').length*.8,undefined,{timeout:20000}).catch(()=>{});
  systemEvidence.demoTileImages=await page.locator('.discovery-tile img').count();
  await page.locator('.main-content').evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:join(output,'explicit-demo-map.png')});
  await page.getByLabel('底图',{exact:true}).selectOption('tencent');
  await page.getByText('当前底图尚未配置',{exact:true}).waitFor();
  assert.equal((await snapshot(page)).map.coordinateSystem,'gcj02');
  await page.getByLabel('底图',{exact:true}).selectOption('osm');
  assert.equal(await page.evaluate(()=>typeof window.require),'undefined');
} finally {await application.close();}

const controlledEnv={...env,PET_USER_DATA_DIR:join(output,`controlled-profile-${randomUUID()}`),LINGJING_CONTROLLED_LOCATION:'1'};
const host=resolve('apps/pc-app/runtime/features/discovery/verification/host.cjs');
application=await electron.launch({args:[host],env:controlledEnv});
let capture,controlledEvidence;
try {
  const page=await mainWindow(application);page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('button',{name:'获取系统位置',exact:true}).click();
  await page.getByText('系统定位已就绪',{exact:true}).waitFor();
  const initial=await snapshot(page),before=initial.pets.length;
  await page.getByLabel('当前挑战伙伴',{exact:true}).selectOption(initial.pets.find(p=>p.name==='验证出战伙伴').petId);
  let victory=false;
  for(let attempt=0;attempt<5 && !victory;attempt++) {
    const state=await snapshot(page),target=state.spawns.find(s=>s.element==='wood'&&s.inRange);
    assert.ok(target);
    await page.locator('.discovery-map-pin').nth(state.spawns.findIndex(s=>s.id===target.id)).click();
    await page.getByRole('button',{name:'开始野外挑战',exact:true}).click();
    await page.locator('.discovery-arena').waitFor();
    for(let round=0;round<70;round++) {
      const state=await snapshot(page),current=state.encounters.find(e=>['challenging','won'].includes(e.status));
      if(!current) break;
      if(current.status==='won') {victory=true;break;}
      const beforeRound=current.battle.view.round;
      const button=page.getByRole('button',{name:current.battle.view.player.anger>=50 ? /^大招/ : /^普通攻击/});
      await button.click();
      await page.waitForFunction(round=>Number(document.querySelector('.discovery-round')?.textContent?.match(/\d+/)?.[0])>round,beforeRound);
    }
    if(!victory) {await page.getByRole('button',{name:'离开这次遭遇',exact:true}).click();await page.locator('.discovery-map').waitFor();}
  }
  assert.equal(victory,true,'Real random combat did not produce a victory within five attempts');
  await page.screenshot({path:join(output,'controlled-victory.png')});
  await page.getByLabel('昵称',{exact:true}).fill('新相遇伙伴');
  await page.getByRole('button',{name:'确认收服',exact:true}).click();
  await page.getByText('新伙伴已加入',{exact:true}).waitFor();
  const final=await snapshot(page);capture=final.captures[0];
  assert.equal(final.pets.length,before+1);assert.ok(capture.petId);assert.equal(capture.memoryTags.length,1);
  const retry=await page.evaluate(({id,actionId})=>window.lingjing.invoke('discovery','confirm',{encounterId:id,actionId}),{id:capture.encounterId,actionId:randomUUID()});
  assert.equal(retry.ok,true);assert.equal(retry.data.petId,capture.petId);assert.equal((await snapshot(page)).pets.length,before+1);
  await page.screenshot({path:join(output,'controlled-capture-result.png')});
  await page.getByRole('button',{name:'放到桌面',exact:true}).click();
  await page.getByRole('button',{name:'已放到桌面',exact:true}).waitFor();
  let desktops=[];
  for(let i=0;i<30;i++) {
    desktops=await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>({title:w.getTitle(),url:w.webContents.getURL(),visible:w.isVisible(),bounds:w.getBounds()})));
    if(desktops.some(w=>w.visible&&w.url.includes('desktop.html'))) break;
    await page.waitForTimeout(250);
  }
  assert.ok(desktops.some(w=>w.visible&&w.url.includes('desktop.html')),'Captured companion must have a visible independent desktop window');
  const rows=await application.evaluate(()=>{const {db,owner}=global.__discoveryVerification;return {captures:db.prepare('SELECT COUNT(*) AS n FROM discovery_captures WHERE owner_account_id=?').get(owner).n,memories:db.prepare('SELECT COUNT(*) AS n FROM discovery_memory_tags WHERE owner_account_id=?').get(owner).n,reports:db.prepare('SELECT COUNT(*) AS n FROM battle_reports_v2 WHERE owner_account_id=?').get(owner).n};});
  assert.equal(rows.captures,1);assert.equal(rows.memories,1);
  controlledEvidence={at:new Date().toISOString(),controlledLocation:true,realLocationAcceptance:false,realRandomCombat:true,capture,rows,desktops};
  await page.getByRole('button',{name:'继续探索',exact:true}).click();
  await page.getByRole('button',{name:/查看相遇图鉴/}).click();
  await page.getByRole('heading',{name:'我的相遇图鉴',exact:true}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'新相遇伙伴',exact:true}).count(),1);
  await page.screenshot({path:join(output,'controlled-pokedex.png')});
} finally {await application.close();}
application=await electron.launch({args:[host],env:controlledEnv});
try {
  const page=await mainWindow(application);await page.getByRole('heading',{name:'下楼走走，遇见新伙伴。',exact:true}).waitFor();
  const restored=await snapshot(page);assert.equal(restored.captures.length,1);assert.equal(restored.captures[0].petId,capture.petId);assert.equal(restored.location.fix,null);
  controlledEvidence.restart={samePetId:true,captures:restored.captures.length,currentLocationPersisted:false};
} finally {await application.close();}
assert.deepEqual(errors,[]);
writeFileSync(join(output,'evidence.json'),JSON.stringify({systemEvidence,controlledEvidence,errors},null,2));
console.log(JSON.stringify({systemEvidence,controlledFlow:{captured:true,pokedex:true,desktop:true,restart:true},errors},null,2));
