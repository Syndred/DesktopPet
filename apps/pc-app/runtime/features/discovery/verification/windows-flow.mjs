import { _electron as electron } from 'playwright';
import { createHash,randomUUID } from 'node:crypto';
import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve,join } from 'node:path';
import assert from 'node:assert/strict';

const output=resolve(`artifacts/discovery/2d-windows-${Date.now()}`);mkdirSync(output,{recursive:true});
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.LINGJING_DISCOVERY_CLOUD;
const errors=[],evidence={at:new Date().toISOString(),scope:'2D UI first',output};
const controlledOnly=process.argv.includes('--controlled-only');
let application;
const invoke=(page,feature,command,payload={})=>page.evaluate(({feature,command,payload})=>window.lingjing.invoke(feature,command,payload),{feature,command,payload});
async function snapshot(page) {const value=await invoke(page,'discovery','snapshot');assert.equal(value.ok,true,JSON.stringify(value));return value.data;}
async function mainWindow(app) {
  for(let i=0;i<150;i++) {
    const page=app.windows().find(p=>p.url().includes('/dist/ui/index.html')&&!p.url().includes('/desktop/'));
    if(page){await page.waitForLoadState('domcontentloaded');page.on('pageerror',e=>errors.push(e.message));return page;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('Main UI did not appear');
}
async function until(page,predicate,label) {
  for(let i=0;i<100;i++){const value=await snapshot(page);if(predicate(value))return value;await page.waitForTimeout(150);}
  throw new Error(`State did not converge: ${label}`);
}
async function settings(page,change) {
  const current=await invoke(page,'accounts','settingsGet');assert.equal(current.ok,true,JSON.stringify(current));
  change(current.data.document);
  const result=await invoke(page,'accounts','settingsSave',{revision:current.data.revision,actionId:randomUUID(),document:current.data.document});assert.equal(result.ok,true,JSON.stringify(result));
}
async function shot(page,name) {
  await page.waitForFunction(()=>{const el=document.querySelector('.app-page-motion');return el&&Number(getComputedStyle(el).opacity)>.99&&el.querySelector('.discovery-page');});
  await page.locator('.main-content').evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:join(output,name)});
}
try {
  let page;
  if(!controlledOnly){
  // Production main/preload/registry, with only an isolated local test account.
  application=await electron.launch({args:[resolve('.')],env:{...env,PET_USER_DATA_DIR:join(output,'native-profile')}});
  page=await mainWindow(application);
  const registered=await invoke(page,'accounts','register',{provider:'local',account:'discovery_os_test',password:'isolated-verification-only',confirmPassword:'isolated-verification-only',username:'系统定位验证',rememberSession:false});assert.equal(registered.ok,true,JSON.stringify(registered));
  await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'附近探索',exact:true}).click();
  await page.getByRole('button',{name:'获取系统位置',exact:true}).click();
  let state=await until(page,s=>s.location.status==='privacy_disabled','app privacy');
  assert.equal(state.location.fix,null);assert.equal(state.location.lastError.code,'APP_LOCATION_DISABLED');
  evidence.appPrivacyDefaultBlocked=true;
  await settings(page,document=>{document.privacy.locationAllowed=true;});
  await page.getByRole('button',{name:'获取系统位置',exact:true}).click();
  state=await until(page,s=>['ready','imprecise','denied','unavailable','timeout'].includes(s.location.status),'native OS result');
  const fix=state.location.fix;
  evidence.system={productionMain:true,status:state.location.status,source:fix?.source,provider:fix?.provider,positionSource:fix?.positionSource,accuracyMeters:fix?.accuracyMeters,timestampMs:fix?.timestampMs,
    coordinateHash:fix?createHash('sha256').update(`${fix.lat},${fix.lng}`).digest('hex'):null,error:state.location.lastError,preciseCoordinatesCommitted:false};
  if(fix){assert.equal(fix.source,'os');assert.equal(fix.provider,'windows-geolocator');if(fix.accuracyMeters>80){assert.equal(state.location.status,'imprecise');assert.ok(state.spawns.every(s=>!s.inRange));}}
  else assert.ok(['denied','unavailable','timeout'].includes(state.location.status));
  await shot(page,'real-system-location-private.png');
  await page.getByRole('button',{name:'探索设置',exact:true}).click();
  await page.getByRole('switch',{name:'演示模式',exact:true}).click();
  await until(page,s=>s.location.mode==='demo','demo');
  await page.keyboard.press('Escape');
  await page.locator('[data-map-engine="maplibre-gl"][data-map-ready="true"]').first().waitFor({timeout:30000});
  await page.locator('.discovery-pin-button').first().waitFor();
  evidence.map={engine:'MapLibre GL JS',canvasCount:await page.locator('canvas.maplibregl-canvas').count(),characterMarkers:await page.locator('.discovery-pin-button [data-appearance="2d"]').count()};
  assert.ok(evidence.map.canvasCount>0);assert.ok(evidence.map.characterMarkers>0);
  await shot(page,'02-map-exploration.png');
  await page.getByRole('button',{name:'探索设置',exact:true}).click();
  const provider=page.getByRole('combobox',{name:'地图服务',exact:true});await provider.press('Enter');
  await page.getByRole('option',{name:'腾讯地图（尚未配置）',exact:true}).click();
  await until(page,s=>s.map.id==='tencent','provider');
  await page.keyboard.press('Escape');await page.getByText('当前底图尚未配置',{exact:true}).waitFor();
  evidence.providerFailureHonest=true;
  await settings(page,document=>{document.privacy.locationAllowed=false;});
  state=await until(page,s=>s.location.status==='privacy_disabled','privacy revocation');assert.equal(state.location.fix,null);assert.equal(state.location.watching,false);
  evidence.appPrivacyRevokesAndClearsFix=true;
  page.removeAllListeners('pageerror');await application.close();application=null;
  }

  const host=resolve('apps/pc-app/runtime/features/discovery/verification/host.cjs');
  const controlledEnv={...env,PET_USER_DATA_DIR:join(output,'controlled-profile'),LINGJING_CONTROLLED_LOCATION:'1'};
  application=await electron.launch({args:[host],env:controlledEnv});page=await mainWindow(application);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.getByRole('button',{name:'获取系统位置',exact:true}).click();
  let current=await until(page,s=>s.location.status==='ready','controlled fix');
  assert.equal(current.location.fix.provider,'controlled-test-fixture');
  const before=current.pets.length;
  const target=current.spawns.find(spawn=>spawn.inRange&&spawn.captureState==='available');assert.ok(target);
  await page.locator(`[data-spawn-id="${target.id}"]`).click();
  await page.getByRole('button',{name:'和她打个招呼',exact:true}).click();
  await page.getByRole('heading',{name:`在附近，遇见了${target.name}。`,exact:true}).waitFor();
  const picker=page.getByRole('combobox',{name:'当前挑战伙伴',exact:true});
  await page.waitForFunction(()=>{const el=document.querySelector('[aria-label="当前挑战伙伴"]');return el&&!el.disabled;});
  await picker.press('ArrowDown');
  await page.getByRole('option',{name:/验证出战伙伴/}).waitFor();await page.keyboard.press('Enter');
  await page.getByRole('button',{name:'获取系统位置',exact:true}).click();
  await until(page,s=>s.location.status==='ready','fresh fix before challenge');
  await page.locator('[data-renderer="pixi-spritesheet"] canvas').first().waitFor({timeout:30000});
  await shot(page,'04-wild-preview.png');
  await page.getByRole('button',{name:'开始挑战',exact:true}).click();
  await page.locator('.discovery-arena').waitFor();
  await until(page,s=>s.encounters.some(e=>e.status==='challenging'),'first persisted challenge');
  let victory=false,attempts=0;
  while(!victory&&attempts<5){attempts++;
    for(let round=0;round<80;round++){
      current=await snapshot(page);const encounter=current.encounters.find(e=>e.status==='challenging'||e.status==='won');
      if(!encounter)break;if(encounter.status==='won'){victory=true;break;}
      const action=encounter.battle.view.player.anger>=50?/^大招/:encounter.battle.view.enemy.anger>=70?/^属性攻击/:/^普通攻击/;
      await page.getByRole('button',{name:action}).click();
      await until(page,s=>s.encounters.some(e=>e.encounterId===encounter.encounterId&&e.battle.view.round>encounter.battle.view.round),'battle round');
    }
    if(!victory&&attempts<5){
      const previousIds=current.encounters.map(e=>e.encounterId);
      await page.getByRole('button',{name:'离开这次遭遇',exact:true}).click();
      await page.getByRole('heading',{name:'下楼走走，遇见新伙伴。',exact:true}).waitFor();
      await page.locator(`[data-spawn-id="${target.id}"]`).click();
      await page.getByRole('button',{name:'和她打个招呼',exact:true}).click();
      await page.getByRole('button',{name:'获取系统位置',exact:true}).click();await until(page,s=>s.location.status==='ready','retry fix');
      await page.getByRole('button',{name:'开始挑战',exact:true}).click();
      await until(page,s=>s.encounters.some(e=>e.status==='challenging'&&!previousIds.includes(e.encounterId)),'new persisted challenge');
    }
  }
  assert.equal(victory,true);
  await page.getByRole('button',{name:'获取系统位置',exact:true}).click();await until(page,s=>s.location.status==='ready','fresh fix before capture');
  await shot(page,'04-wild-victory.png');
  const invite=page.getByRole('button',{name:'邀请成为伙伴',exact:true});await invite.click();
  const dialog=page.getByRole('dialog',{name:/邀请.*成为伙伴/});await dialog.waitFor();
  await page.getByRole('textbox',{name:'昵称',exact:true}).waitFor();
  assert.equal(await page.getByRole('textbox',{name:'昵称',exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  assert.equal(await invite.evaluate(el=>el===document.activeElement),true);
  await invite.click();await page.getByRole('textbox',{name:'昵称',exact:true}).fill('新相遇伙伴');
  await page.getByRole('button',{name:'确认收服',exact:true}).click();
  await page.getByText('新伙伴已加入',{exact:true}).waitFor();
  current=await snapshot(page);const capture=current.captures[0];
  assert.equal(current.pets.length,before+1);assert.equal(capture.memoryTags.length,1);assert.ok(capture.resourceId.startsWith('builtin:'));
  const duplicate=await invoke(page,'discovery','confirm',{encounterId:capture.encounterId,actionId:randomUUID()});assert.equal(duplicate.ok,true);assert.equal(duplicate.data.petId,capture.petId);assert.equal((await snapshot(page)).pets.length,before+1);
  await page.locator('[data-renderer="pixi-spritesheet"] canvas').first().waitFor();
  await shot(page,'04-capture-result.png');
  await page.getByRole('switch',{name:'新伙伴在桌面显示',exact:true}).click();
  await until(page,s=>s.captures[0].showOnDesktop,'desktop');
  let desktops=[];
  for(let i=0;i<100;i++){desktops=await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>({url:w.webContents.getURL(),visible:w.isVisible(),bounds:w.getBounds()})));if(desktops.some(w=>w.visible&&w.url.includes('/desktop/')))break;await page.waitForTimeout(150);}
  assert.ok(desktops.some(w=>w.visible&&w.url.includes('/desktop/')));
  const desktopPage=application.windows().find(p=>p.url().includes('/desktop/'));assert.ok(desktopPage);await desktopPage.locator('[data-renderer="pixi-spritesheet"] canvas').waitFor({timeout:30000});
  await desktopPage.screenshot({path:join(output,'independent-2d-desktop.png')});
  await settings(page,document=>{document.desktop.animationsEnabled=false;});
  await page.locator('.app-page-motion[data-motion="reduced"]').waitFor();
  await page.waitForTimeout(250);const frozen=await page.locator('[data-renderer="pixi-spritesheet"]').first().getAttribute('data-frame');await page.waitForTimeout(650);assert.equal(await page.locator('[data-renderer="pixi-spritesheet"]').first().getAttribute('data-frame'),frozen);
  evidence.appAnimationSwitchPausesPixi=true;
  await page.getByRole('button',{name:'继续探索',exact:true}).click();await page.getByRole('button',{name:'查看相遇图鉴',exact:true}).click();
  await page.getByRole('heading',{name:'我的相遇图鉴',exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'新相遇伙伴',exact:true}).count(),1);await shot(page,'pokedex-2d.png');
  const rows=await application.evaluate(()=>{const {db,owner}=global.__discoveryVerification;return {owner,pets:db.prepare('SELECT COUNT(*) n FROM companion_pets WHERE owner_account_id=?').get(owner).n,captures:db.prepare('SELECT COUNT(*) n FROM discovery_captures WHERE owner_account_id=?').get(owner).n,memories:db.prepare('SELECT COUNT(*) n FROM discovery_memory_tags WHERE owner_account_id=?').get(owner).n,reports:db.prepare('SELECT COUNT(*) n FROM battle_reports_v2 WHERE owner_account_id=?').get(owner).n};});
  evidence.controlled={explicitlyLabelledFixture:true,realLocationAcceptance:false,realRandomCombat:true,attempts,capture,rows,desktops,radixSelect:true,radixSwitch:true,radixPopover:true,dialogKeyboardFocusAndEscape:true,sharedPixiStage:true,sharedMotion:true};
  page.removeAllListeners('pageerror');await application.close();application=null;
  application=await electron.launch({args:[host],env:controlledEnv});page=await mainWindow(application);
  await page.getByRole('heading',{name:'下楼走走，遇见新伙伴。',exact:true}).waitFor();current=await snapshot(page);assert.equal(current.captures.length,1);assert.equal(current.captures[0].petId,capture.petId);assert.equal(current.location.fix,null);
  evidence.restart={samePetId:true,currentLocationPersisted:false};
  assert.deepEqual(errors,[]);evidence.errors=errors;writeFileSync(join(output,'evidence.json'),JSON.stringify(evidence,null,2));
  writeFileSync(resolve(`artifacts/discovery/latest-2d-${controlledOnly?'controlled-':''}evidence.json`),JSON.stringify({output,...evidence},null,2));
  console.log(JSON.stringify({passed:true,output,system:evidence.system,map:evidence.map,controlled:{capture:true,pokedex:true,desktop:true,keyboard:true,restart:true},errors},null,2));
}catch(error){
  if(application){const page=application.windows().find(p=>!p.url().includes('/desktop/'));if(page)await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});}
  writeFileSync(join(output,'failure.json'),JSON.stringify({...evidence,errors,error:error.message},null,2));throw error;
}finally{if(application)await application.close();}
