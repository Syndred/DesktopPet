import { _electron as electron } from 'playwright';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const root = process.cwd();
const phase = process.argv[2] || 'plant';
const output = resolve(process.env.GARDEN_SMOKE_OUTPUT || 'artifacts/garden/electron');
const profile = resolve(output, 'profile');
mkdirSync(profile, { recursive: true });
const runFile = resolve(output, 'run.json');
let run = existsSync(runFile) ? JSON.parse(readFileSync(runFile, 'utf8')) : null;
if (!run) {
  const { RuntimeDataStore } = require(resolve('apps/pc-app/runtime/services/runtime-data-store.cjs'));
  const store = new RuntimeDataStore({ filePath: resolve(profile, 'pet-runtime-data.json'), sessionFilePath: resolve(profile, 'pet-auth-session.json') });
  const account = store.registerUser(`garden-check-${Date.now()}`, 'garden-local-acceptance-926', '菜园验收');
  assert.equal(account.ok, true);
  run = { at: new Date().toISOString(), ownerAccountId: account.currentUser.id, phases: [] };
  writeFileSync(runFile, JSON.stringify(run, null, 2));
}
const env = { ...process.env, PET_USER_DATA_DIR: profile };
delete env.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({ args: [root], cwd: root, env });
const errors = [];
try {
  const page = await application.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(()=>Boolean(window.lingjing));
  const accounts=await page.evaluate(()=>window.lingjing.invoke('accounts','session'));
  if(accounts.ok && !accounts.data.currentUser){
    const legacy=JSON.parse(readFileSync(resolve(profile,'pet-runtime-data.json'),'utf8'));
    const account=legacy.users.find(user=>user.id===(run.legacyOwnerAccountId||run.ownerAccountId))?.account;
    const login=await page.evaluate(account=>window.lingjing.invoke('accounts','login',{provider:'local',account,password:'garden-local-acceptance-926',rememberSession:false}),account);
    assert.equal(login.ok,true,JSON.stringify(login));
    run.storageOwnerAccountId=login.data.currentUser.ownerAccountId;
    if(!run.planted){run.legacyOwnerAccountId||=run.ownerAccountId;run.ownerAccountId=run.storageOwnerAccountId;}
  }
  await page.getByRole('navigation', { name: '主导航' }).waitFor();
  const invoke = async (command, payload) => page.evaluate(({ command, payload }) => window.lingjing.invoke('garden', command, payload), { command, payload: payload ? {...payload,sessionOwnerAccountId:run.ownerAccountId} : undefined });
  const route = async path => { await page.evaluate(path => { location.hash = path; }, path); };
  if (phase === 'plant') {
    const companions = await page.evaluate(() => window.lingjing.invoke('companions', 'list'));
    assert.equal(companions.ok, true, JSON.stringify(companions));
    const names = ['鱼丸', '小蓝', '饭团'];
    run.petIds ||= {};
    for (const name of names) {
      if (run.petIds[name]) continue;
      const result = await page.evaluate(({ name }) => window.lingjing.invoke('companions', 'adopt', { actionId: `garden-smoke-adopt:${name}`, templateId: 'big-fish-gentle', name, showOnDesktop: false }), { name });
      assert.equal(result.ok, true, JSON.stringify(result)); run.petIds[name] = result.data.pet.petId;
    }
    await route('/garden/plots');
    await page.getByRole('heading', { name: '把小日子，种成好收成。' }).waitFor();
    await page.getByRole('button', { name: '稻米 种子', exact: false }).click();
    await page.getByRole('button', { name: '播种', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '稻米已播种' }).waitFor();
    await page.locator('[data-plot-id="plot-2"]').click();
    await page.getByRole('button', { name: '胡萝卜 种子', exact: false }).click();
    await page.getByRole('button', { name: '播种', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '胡萝卜已播种' }).waitFor();
    const snapshot = await invoke('snapshot'); assert.equal(snapshot.ok, true); assert.equal(snapshot.data.plots.filter(p => p.cropType).length, 2);
    assert.equal(snapshot.data.plots[0].cropType, 'rice'); assert.equal(snapshot.data.plots[1].cropType, 'carrot');
    run.planted = snapshot;
    await page.screenshot({ path: resolve(output, '01-planted.png'), fullPage: true });
  } else if (phase === 'identity') {
    const failure=await invoke('snapshot');assert.equal(failure.code,'OWNER_MIGRATION_REQUIRED');run.identity={source:run.ownerAccountId,target:run.storageOwnerAccountId,result:failure};
    await route('/garden/plots');await page.getByRole('heading',{name:'旧菜园还在，正在等待存档衔接'}).waitFor();await page.screenshot({path:resolve(output,'identity-migration-preserved.png'),fullPage:true});
  } else if (phase === 'motion' || phase === 'map') {
    const settings=await page.evaluate(()=>window.lingjing.invoke('accounts','settingsGet'));
    assert.equal(settings.ok,true);const original=structuredClone(settings.data.document);
    const save=async document=>{
      const current=await page.evaluate(()=>window.lingjing.invoke('accounts','settingsGet'));
      const result=await page.evaluate(input=>window.lingjing.invoke('accounts','settingsSave',input),{actionId:crypto.randomUUID(),revision:current.data.revision,document});
      assert.equal(result.ok,true,JSON.stringify(result));return result;
    };
    try{
      if(phase==='motion'){
        await page.emulateMedia({reducedMotion:'no-preference'});
        await save({...original,desktop:{...original.desktop,animationsEnabled:true}});
        await route('/inventory');await page.getByRole('tablist',{name:'背包分类'}).waitFor();
        await page.waitForFunction(()=>document.documentElement.dataset.motion==='enabled');
        await save({...original,desktop:{...original.desktop,animationsEnabled:false}});
        await page.waitForFunction(()=>document.documentElement.dataset.motion==='reduced');
        await route('/garden/kitchen');await page.getByRole('combobox',{name:'选择食物'}).waitFor();
        await page.waitForFunction(()=>document.querySelector('.app-page-motion')?.getAttribute('data-motion')==='reduced');
        await save({...original,desktop:{...original.desktop,animationsEnabled:true}});
        await page.waitForFunction(()=>document.documentElement.dataset.motion==='enabled');
        await page.emulateMedia({reducedMotion:'reduce'});
        await page.waitForFunction(()=>document.documentElement.dataset.motion==='reduced');
        await route('/inventory');await page.getByRole('tablist',{name:'背包分类'}).waitFor();
        await page.waitForFunction(()=>document.querySelector('.app-page-motion')?.getAttribute('data-motion')==='reduced');
        await page.emulateMedia({reducedMotion:'no-preference'});
        await page.waitForFunction(()=>document.documentElement.dataset.motion==='enabled');
        run.motion={actualAccountsSettingToggle:true,liveSystemReducedMotion:true,restoredOriginalSettings:true};
        await page.screenshot({path:resolve(output,'06-motion-settings.png'),fullPage:true});
      }else{
        await save({...original,privacy:{...original.privacy,locationAllowed:true}});
        await route('/garden');await page.getByRole('heading',{name:'给伙伴，留一片小天地。'}).waitFor();
        await page.getByRole('button',{name:'获取系统位置',exact:true}).click();
        await page.getByRole('button',{name:'获取系统位置',exact:true}).waitFor({state:'visible',timeout:35000});
        const snapshot=await page.evaluate(()=>window.lingjing.invoke('discovery','snapshot'));
        assert.equal(snapshot.ok,true);assert.equal(snapshot.data.location.mode,'real');
        assert.notEqual(snapshot.data.location.lastError?.code,'APP_LOCATION_DISABLED');
        run.map={engine:await page.locator('[data-map-engine]').getAttribute('data-map-engine'),locationStatus:snapshot.data.location.status,systemError:snapshot.data.location.lastError?.code||null,positionSource:snapshot.data.location.fix?.positionSource||null,accuracyMeters:snapshot.data.location.fix?.accuracyMeters||null,successfulLocation:snapshot.data.location.status==='ready',coordinatesOmitted:true};
        await page.screenshot({path:resolve(output,'07-real-location-result.png'),fullPage:true});
      }
    }finally{await save(original);}
  } else if (phase === 'rewardplant') {
    const receipt=run.battle.session.reward.seeds;assert.equal(receipt.quantity,2);
    const before=await invoke('snapshot'),crop=before.data.crops.find(crop=>crop.seedItemId===receipt.itemId);
    assert.ok(crop);await route('/garden/plots');await page.getByRole('heading',{name:'把小日子，种成好收成。'}).waitFor();
    await page.locator('[data-plot-id="plot-3"]').click();
    await page.getByRole('button',{name:`${crop.name} 种子`,exact:false}).click();
    await page.getByRole('button',{name:'播种',exact:true}).click();await page.getByRole('status').filter({hasText:`${crop.name}已播种`}).waitFor();
    const after=await invoke('snapshot');assert.equal(after.data.items.find(item=>item.id===receipt.itemId).quantity,before.data.items.find(item=>item.id===receipt.itemId).quantity-1);
    run.rewardPlant={receipt,crop:crop.id,before,after,plotId:'plot-3'};
    await page.screenshot({path:resolve(output,'08-battle-reward-planted.png'),fullPage:true});
  } else if (phase === 'carrot') {
    await route('/garden/plots');
    await page.getByRole('heading', { name: '把小日子，种成好收成。' }).waitFor();
    const grown=await invoke('snapshot');assert.equal(grown.data.plots[1].stage,'mature');assert.equal(grown.data.plots[1].plantedAt,run.planted.data.plots[1].plantedAt);
    await page.locator('[data-plot-id="plot-2"]').click();
    await page.getByRole('button',{name:'收获',exact:true}).click();
    await page.getByRole('status').filter({hasText:'胡萝卜已放入背包'}).waitFor();
    const saved=await invoke('snapshot');assert.equal(saved.data.items.find(item=>item.id==='carrot').quantity,3);assert.equal(saved.data.plots[0].cropType,'rice');
    run.carrotHarvest=saved;await page.screenshot({path:resolve(output,'01b-carrot-after-restart.png'),fullPage:true});
  } else if (phase === 'battle') {
    const before=await invoke('snapshot');
    const start=await page.evaluate(petId=>window.lingjing.invoke('battle','startTraining',{actionId:'garden-electron-training',petId,enemyElement:'wood'}),run.petIds['鱼丸']);assert.equal(start.ok,true,JSON.stringify(start));
    let session=start.data;
    for(let i=0;i<150&&session.status==='active';i++){
      const result=await page.evaluate(input=>window.lingjing.invoke('battle','act',input),{sessionId:session.id,actionId:`garden-electron-action:${i}`,expectedRound:session.snapshot.round+1,action:session.snapshot.player.anger>=50?'ultimate':'element_attack'});
      assert.equal(result.ok,true,JSON.stringify(result));session=result.data;
    }
    assert.equal(session.status,'finished');assert.equal(session.reward.applied,true);
    await route('/garden/plots');await page.getByRole('heading',{name:'把小日子，种成好收成。'}).waitFor();
    const after=await invoke('snapshot');const total=data=>data.items.filter(item=>item.category==='seed').reduce((sum,item)=>sum+item.quantity,0);
    assert.equal(total(after.data)-total(before.data),2);const again=await invoke('snapshot');assert.equal(total(again.data),total(after.data));
    run.battle={session,before,after,again};await page.screenshot({path:resolve(output,'01c-battle-seeds.png'),fullPage:true});
  } else if (phase === 'harvest') {
    await route('/garden/plots');
    await page.getByRole('heading', { name: '把小日子，种成好收成。' }).waitFor();
    await page.locator('.garden-pixi-scene canvas').waitFor(); await page.screenshot({path:resolve(output,'02a-2d-mature-garden.png'),fullPage:true}); const grown = await invoke('snapshot');
    assert.equal(grown.ok, true);
    assert.equal(grown.data.plots[0].stage, 'mature', `Rice matures at ${new Date(grown.data.plots[0].maturesAt).toISOString()}; wait for normal production growth`);
    assert.equal(grown.data.plots[0].plantedAt, run.planted.data.plots[0].plantedAt);
    await page.getByRole('button', { name: '收获成熟作物', exact: false }).click();
    await page.getByRole('status').filter({ hasText: '成熟作物已放入背包' }).waitFor();
    const harvested = await invoke('snapshot'); assert.equal(harvested.data.items.find(i => i.id === 'rice').quantity, 2);
    await page.getByRole('link', { name: '制作食物', exact: true }).click();
    await page.getByRole('button', { name: '制作米饭', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '米饭做好了' }).waitFor();
    const beforeFeed = await page.evaluate(() => window.lingjing.invoke('companions', 'list'));
    await page.getByRole('button', { name: '鱼丸 Lv.', exact: false }).click();
    await page.getByRole('button', { name: '喂给鱼丸', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '已给鱼丸喂食 1 份' }).waitFor();
    const afterFeed = await page.evaluate(() => window.lingjing.invoke('companions', 'list'));
    const result = await invoke('snapshot');
    const fishBefore = beforeFeed.data.pets.find(p => p.petId === run.petIds['鱼丸']);
    const fishAfter = afterFeed.data.pets.find(p => p.petId === run.petIds['鱼丸']);
    assert.equal(fishAfter.growth.satiety, fishBefore.growth.satiety + 20); assert.equal(fishAfter.growth.affinity, fishBefore.growth.affinity + 4);
    for (const name of ['小蓝', '饭团']) assert.deepEqual(afterFeed.data.pets.find(p => p.petId === run.petIds[name]), beforeFeed.data.pets.find(p => p.petId === run.petIds[name]));
    assert.equal(result.data.items.find(i => i.id === 'rice').quantity, 1); assert.equal(result.data.items.find(i => i.id === 'cooked_rice').quantity, 0);
    run.harvested = harvested; run.beforeFeed = beforeFeed; run.afterFeed = afterFeed; run.final = result;
    await page.screenshot({ path: resolve(output, '02-cooked-and-fed.png'), fullPage: true });
    await route('/inventory'); await page.getByRole('heading', { name: '把喜欢的，都留给你。' }).waitFor();
    await page.screenshot({ path: resolve(output, '03-inventory.png'), fullPage: true });
  } else if (phase === 'library') {
    await route('/garden/kitchen');await page.getByRole('heading',{name:'这一口，是亲手种下的喜欢。'}).waitFor();
    const select=page.getByRole('combobox',{name:'选择食物'});await select.focus();await select.press('Enter');await page.getByRole('listbox').waitFor();await page.keyboard.press('Escape');
    await page.getByRole('listbox').waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement?.getAttribute('role')==='combobox');assert.equal(await select.evaluate(element=>element===document.activeElement),true);
    await select.click();await page.getByRole('option',{name:/^胡萝卜 × \d+$/}).click();assert.match(await select.innerText(),/胡萝卜/);
    await page.locator('.garden-pet-picker .cp-sheet-thumbnail').first().waitFor();
    await page.screenshot({path:resolve(output,'04-radix-kitchen.png'),fullPage:true});
    await route('/inventory');await page.getByRole('tablist',{name:'背包分类'}).waitFor();
    const all=page.getByRole('tab',{name:'全部',exact:true});await all.focus();await all.press('ArrowRight');
    await page.waitForFunction(()=>document.querySelector('[role="tab"][data-state="active"]')?.textContent==='食物');
    assert.equal(await page.getByRole('tab',{name:'食物',exact:true}).getAttribute('aria-selected'),'true');assert.equal(await page.locator('.garden-item-grid .garden-item').count(),4);
    await page.getByRole('tab',{name:'食物',exact:true}).press('End');await page.waitForFunction(()=>document.querySelector('[role="tab"][data-state="active"]')?.textContent==='道具');assert.equal(await page.getByRole('tab',{name:'道具',exact:true}).getAttribute('aria-selected'),'true');assert.equal(await page.locator('.garden-item-grid .garden-item').count(),5);
    await page.getByRole('tab',{name:'道具',exact:true}).press('Home');await page.waitForFunction(()=>document.querySelector('[role="tab"][data-state="active"]')?.textContent==='全部');assert.equal(await all.getAttribute('aria-selected'),'true');
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(()=>document.documentElement.dataset.motion==='reduced'&&getComputedStyle(document.querySelector('.garden-item-grid')).transform==='none');
    const cardGeometry=await page.locator('.garden-item-grid .garden-item').evaluateAll(cards=>cards.map(card=>{
      const outer=card.getBoundingClientRect(),art=card.querySelector('.garden-item-art').getBoundingClientRect();
      return {height:outer.height,artHeight:art.height,contained:art.top>=outer.top&&art.bottom<=outer.bottom};
    }));assert.equal(cardGeometry.every(card=>card.height>120&&card.contained),true,JSON.stringify(cardGeometry));
    const petGeometry=await page.locator('.garden-pet-picker .garden-pet').evaluateAll(cards=>cards.map(card=>({height:card.getBoundingClientRect().height,content:card.scrollHeight})));assert.equal(petGeometry.every(card=>card.height>=100&&card.height>=card.content),true,JSON.stringify(petGeometry));
    await page.getByRole('searchbox',{name:'搜索物品名称'}).fill('米饭');assert.equal(await page.locator('.garden-item-grid .garden-item').count(),1);
    run.library={radixSelectEscFocus:true,radixTabsArrowHomeEnd:true,search:true,sharedCompanionPortrait:true,cardGeometry,petGeometry,shadcnSelectSlot:'tested-on-kitchen',motionList:await page.locator('.garden-item-grid').evaluate(element=>({projection:element.getAttribute('data-projection-id'),style:element.getAttribute('style')}))};
    await page.getByRole('searchbox',{name:'搜索物品名称'}).fill('');await page.screenshot({path:resolve(output,'05-radix-inventory.png'),fullPage:true});
    await page.emulateMedia({reducedMotion:'no-preference'});
  } else if (phase === 'readback') {
    const result = await invoke('snapshot'); assert.equal(result.ok, true);
    assert.deepEqual(result.data.items, run.final.data.items);
    const pets = await page.evaluate(() => window.lingjing.invoke('companions', 'list'));
    assert.deepEqual(pets.data.pets, run.afterFeed.data.pets);
    const repeatHarvest = await invoke('harvest', { actionId: 'after-restart-double-harvest', expectedRevision: result.revision, plotIds: ['plot-1'] });
    assert.equal(repeatHarvest.code, 'ALREADY_HARVESTED');
    const staleOwner=await page.evaluate(revision=>window.lingjing.invoke('garden','plant',{actionId:'stale-owner-view',expectedRevision:revision,sessionOwnerAccountId:'another-account',ownerAccountId:'forged-owner',plotId:'plot-1',cropType:'carrot'}),result.revision);assert.equal(staleOwner.code,'SESSION_CHANGED');
    run.readback = { result, pets, repeatHarvest,staleOwner };
  }
  assert.deepEqual(errors, []);
  run.phases.push({ phase, at: new Date().toISOString(), errors, electron: await application.evaluate(() => process.versions.electron) });
  writeFileSync(runFile, JSON.stringify(run, null, 2));
  console.log(JSON.stringify({ phase, profile, runFile, maturesAt: run.planted?.data.plots[0].maturesAt, at: new Date().toISOString() }));
} finally { await application.close(); }
const db = new DatabaseSync(resolve(profile, 'lingjing.sqlite'), { readOnly: true });
const readback = { account: db.prepare('SELECT * FROM garden_accounts WHERE owner_account_id=?').get(run.ownerAccountId), plots: db.prepare('SELECT * FROM garden_plots WHERE owner_account_id=?').all(run.ownerAccountId), items: db.prepare('SELECT * FROM garden_items WHERE owner_account_id=?').all(run.ownerAccountId), ledger: db.prepare('SELECT * FROM garden_events WHERE owner_account_id=? ORDER BY created_at').all(run.ownerAccountId) };
writeFileSync(resolve(output, `${phase}-disk-readback.json`), JSON.stringify(readback, null, 2)); db.close();


