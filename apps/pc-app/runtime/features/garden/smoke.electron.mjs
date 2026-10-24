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
  const route = async path => {
    await page.evaluate(path => { location.hash = path; }, path);
    await page.waitForFunction(path=>document.querySelector('.garden-tabs a[aria-current="page"]')?.getAttribute('href')===`#${path}`,path);
  };
  const locateByButton=async()=>{
    await page.evaluate(()=>{
      window.__gardenLocationAttempt={started:false,finished:false};
      window.__gardenLocationStop=window.lingjing.subscribe('discovery:location',state=>{
        if(state.status==='locating')window.__gardenLocationAttempt.started=true;
        else if(window.__gardenLocationAttempt.started&&!['idle','locating'].includes(state.status))window.__gardenLocationAttempt.finished=true;
      });
    });
    try{
      await page.getByRole('button',{name:'获取系统位置',exact:true}).click();
      await page.waitForFunction(()=>window.__gardenLocationAttempt.finished,undefined,{timeout:35000});
      await page.getByRole('button',{name:'获取系统位置',exact:true}).waitFor({state:'visible',timeout:35000});
      await page.waitForFunction(async()=>{const result=await window.lingjing.invoke('accounts','settingsGet');return result.ok&&result.data.host.locationAllowed===false;});
      return await page.evaluate(()=>window.lingjing.invoke('discovery','snapshot'));
    }finally{await page.evaluate(()=>window.__gardenLocationStop());}
  };
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
  } else if (phase === 'identity-upgrade' || phase === 'identity-upgrade-readback') {
    assert.ok(run.identity&&run.final&&run.afterFeed,'Use the original raw-ID acceptance profile, preserving its earlier evidence');
    const result=await invoke('snapshot');assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.data.ownerAccountId,run.storageOwnerAccountId);
    assert.deepEqual(result.data.items,run.final.data.items);
    const pets=await page.evaluate(()=>window.lingjing.invoke('companions','list'));assert.equal(pets.ok,true);assert.equal(pets.data.pets.length,run.afterFeed.data.pets.length);
    for(const original of run.afterFeed.data.pets){const current=pets.data.pets.find(pet=>pet.petId===original.petId);assert.ok(current);assert.equal(current.ownerAccountId,run.storageOwnerAccountId);assert.equal(current.name,original.name);assert.deepEqual(current.growth,original.growth);}
    assert.equal(result.data.ledger.filter(event=>event.kind==='starter').length,run.final.data.ledger.filter(event=>event.kind==='starter').length);
    const again=await invoke('snapshot');assert.equal(again.revision,result.revision);assert.deepEqual(again.data.items,result.data.items);
    if(phase==='identity-upgrade'){
      run.identityUpgrade={target:run.storageOwnerAccountId,source:run.ownerAccountId,result,pets,secondReadSame:true};
      await page.emulateMedia({reducedMotion:'reduce'});await route('/inventory');await page.locator('.garden-pet-picker .cp-sheet-thumbnail, .garden-pet-picker .resource-stage[data-status="ready"]').first().waitFor();await page.screenshot({path:resolve(output,'identity-upgraded-preserved.png'),fullPage:true});
    }else{assert.deepEqual(pets.data.pets,run.identityUpgrade.pets.data.pets);run.identityUpgrade.restartExact=true;}
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
        await save({...original,privacy:{...original.privacy,locationAllowed:true,locationOnlyWhileExploring:true}});
        await route('/garden');await page.getByRole('heading',{name:'给伙伴，留一片小天地。'}).waitFor();
        const snapshot=await locateByButton();
        assert.equal(snapshot.ok,true);assert.equal(snapshot.data.location.mode,'real');
        assert.notEqual(snapshot.data.location.lastError?.code,'APP_LOCATION_DISABLED');
        assert.equal(snapshot.data.location.watching,false);
        run.map={engine:await page.locator('[data-map-engine]').getAttribute('data-map-engine'),locationStatus:snapshot.data.location.status,systemError:snapshot.data.location.lastError?.code||null,positionSource:snapshot.data.location.fix?.positionSource||null,accuracyMeters:snapshot.data.location.fix?.accuracyMeters||null,successfulLocation:snapshot.data.location.status==='ready',coordinatesOmitted:true,explicitForegroundRead:true,privacyReleasedAfterRead:true,continuousWatch:false};
        await page.screenshot({path:resolve(output,'07-real-location-result.png'),fullPage:true});
      }
    }finally{await save(original);}
  } else if (phase === 'canonical-resources') {
    const before=run.rosterAction?.after||run.roster?.after||run.rewardCycle?.finalPets||run.afterFeed;
    assert.ok(before,'Use an existing completed feeding proof');
    const pets=await page.evaluate(()=>window.lingjing.invoke('companions','list')),snapshot=await invoke('snapshot');assert.equal(pets.ok,true);assert.equal(snapshot.ok,true);
    assert.equal(pets.data.pets.length,before.data.pets.length);assert.deepEqual(pets.data.selections,before.data.selections);
    const stable=({resource,revision,updatedAt,...pet})=>{void resource;void revision;void updatedAt;return pet;};
    for(const previous of before.data.pets){
      const current=pets.data.pets.find(pet=>pet.petId===previous.petId);assert.deepEqual(stable(current),stable(previous));
      if(current.resource.resourceId!==previous.resource.resourceId){
        assert.ok(['builtin:lingjing-yuwan-v1','builtin:battle-yuwan-v1','builtin:battle-shiba-v1'].includes(previous.resource.resourceId));
        assert.equal(current.resource.resourceId,pets.data.templates.find(template=>template.templateId===current.templateId).resource.resourceId);assert.equal(current.revision,previous.revision+1);
      }else assert.deepEqual(current,previous);
    }
    assert.deepEqual(snapshot.data.items,(run.rosterAction?.stockAfter||run.roster?.stockAfter||run.rewardCycle?.final||run.final).data.items);
    run.canonicalResources={pets,inventoryExact:true,allGrowthAndOtherFieldsExact:true,allowedBuiltinReferenceUpgradeOnly:true};
  } else if (phase === 'roster-action') {
    assert.ok(run.roster?.restartExact,'Complete and reopen the six-resource feeding proof first');
    assert.ok(!run.rosterAction,'The feed receipt already exists; run roster-readback instead of feeding again');
    await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>document.documentElement.dataset.motion==='enabled');
    const before=await page.evaluate(()=>window.lingjing.invoke('companions','list')),stockBefore=await invoke('snapshot'),target=before.data.pets.find(pet=>pet.petId===run.roster.targetPetId);assert.ok(target);
    await route('/inventory');await page.locator('.garden-item').filter({has:page.getByText('番茄',{exact:true})}).click();
    const button=page.getByRole('button',{name:`${target.name} Lv.`,exact:false});await button.click();await button.locator('.resource-stage[data-status="ready"]').waitFor();
    await button.locator('.resource-stage').evaluate(stage=>{
      window.__gardenEatEvents=[];window.__gardenEatFrames=[];
      window.__gardenEatStop=window.lingjing.subscribe('companions:action',event=>window.__gardenEatEvents.push(event));
      const observer=new MutationObserver(()=>window.__gardenEatFrames.push({action:stage.getAttribute('data-action'),frame:stage.querySelector('.resource-sprite-host')?.getAttribute('data-frame')}));
      observer.observe(stage,{subtree:true,attributes:true,attributeFilter:['data-action','data-frame']});window.__gardenEatObserver=observer;
    });
    await page.getByRole('button',{name:`喂给${target.name}`,exact:true}).click();await page.getByRole('status').filter({hasText:`已给${target.name}喂食 1 份番茄`}).waitFor();
    await page.waitForFunction(()=>new Set(window.__gardenEatFrames.filter(frame=>frame.action==='eat'&&frame.frame!==null).map(frame=>frame.frame)).size>=2);
    const after=await page.evaluate(()=>window.lingjing.invoke('companions','list')),stockAfter=await invoke('snapshot'),receipt=stockAfter.data.ledger.find(event=>event.kind==='feed'&&event.itemId==='tomato'&&event.petId===target.petId);assert.ok(receipt);
    assert.equal(stockBefore.data.items.find(item=>item.id==='tomato').quantity-stockAfter.data.items.find(item=>item.id==='tomato').quantity,1);
    assert.deepEqual(after.data.pets.filter(pet=>pet.petId!==target.petId),before.data.pets.filter(pet=>pet.petId!==target.petId));
    const repeated=await invoke('feed',{actionId:receipt.actionId,expectedRevision:stockBefore.revision,expectedPetRevision:target.revision,petId:target.petId,itemId:'tomato',quantity:1});assert.equal(repeated.ok,true,JSON.stringify(repeated));assert.equal(repeated.replayed,true);
    const events=await page.evaluate(()=>({events:window.__gardenEatEvents,frames:window.__gardenEatFrames}));assert.equal(events.events.length,1);assert.equal(events.events[0].ownerAccountId,run.ownerAccountId);assert.equal(events.events[0].petId,target.petId);assert.equal(events.events[0].resourceId,target.resource.resourceId);assert.equal(events.events[0].action,'eat');
    run.rosterAction={targetPetId:target.petId,before,after,stockBefore,stockAfter,repeated,...events,otherPetsUnchanged:true};
    await page.screenshot({path:resolve(output,'only-selected-fox-eating.png'),fullPage:true});
    await page.evaluate(()=>{window.__gardenEatStop();window.__gardenEatObserver.disconnect();});
  } else if (phase === 'roster' || phase === 'roster-readback') {
    assert.ok(run.rosterFixture,'Use the separately copied, explicitly labelled roster QA profile');
    if(phase==='roster'){
      assert.ok(!run.roster,'The roster feed receipt already exists; run roster-readback instead of feeding again');
      const initial=await page.evaluate(()=>window.lingjing.invoke('companions','list'));assert.equal(initial.ok,true);
      const templates=initial.data.templates;assert.equal(templates.length,6);assert.equal(new Set(templates.map(template=>template.resource.resourceId)).size,6);
      const adopted=[];
      for(const template of templates){
        const result=await page.evaluate(template=>window.lingjing.invoke('companions','adopt',{actionId:`garden-roster:${template.templateId}`,templateId:template.templateId,name:`形象验收·${template.name}`,showOnDesktop:false}),template);
        assert.equal(result.ok,true,JSON.stringify(result));adopted.push(result.data.pet);
      }
      await route('/inventory');const assets=[];
      for(const pet of adopted){
        const button=page.getByRole('button',{name:`${pet.name} Lv.`,exact:false});await button.scrollIntoViewIfNeeded();
        const resolved=await page.evaluate(pet=>window.lingjing.invoke('resources','resolve',{resourceId:pet.resource.resourceId,petId:pet.petId,context:'desktop',action:'idle'}),pet);assert.equal(resolved.ok,true,JSON.stringify(resolved));
        const resource=resolved.data.resource,source=`lingjing-resource://asset/${encodeURIComponent(resource.id)}/${resource.entryAsset.split('/').map(encodeURIComponent).join('/')}`;
        const visible=button.locator('.cp-sheet-thumbnail, .resource-stage[data-status="ready"]');await visible.waitFor();
        const displayed=await visible.evaluate(async (element,source)=>{
          const image=new Image();image.src=source;await image.decode();const bounds=element.getBoundingClientRect();return {source,width:image.naturalWidth,height:image.naturalHeight,renderedWidth:bounds.width,renderedHeight:bounds.height,renderer:element.tagName==='svg'?'shared-thumbnail':'shared-pixi-stage'};
        },source);
        assert.ok(displayed.width>0&&displayed.height>0&&displayed.renderedWidth>0&&displayed.renderedHeight>0);assert.ok(decodeURIComponent(displayed.source).includes(pet.resource.resourceId));assets.push({petId:pet.petId,name:pet.name,resourceId:pet.resource.resourceId,contentHash:resource.contentHash,...displayed});
      }
      assert.equal(new Set(assets.map(asset=>asset.source)).size,6);assert.equal(new Set(assets.map(asset=>asset.contentHash)).size,6);
      const before=await page.evaluate(()=>window.lingjing.invoke('companions','list')),stockBefore=await invoke('snapshot');
      const target=adopted.find(pet=>pet.name.endsWith('小狐'));assert.ok(target);
      await page.locator('.garden-item').filter({has:page.getByText('胡萝卜',{exact:true})}).click();await page.getByRole('button',{name:`${target.name} Lv.`,exact:false}).click();
      await page.getByRole('button',{name:`喂给${target.name}`,exact:true}).click();await page.getByRole('status').filter({hasText:`已给${target.name}喂食 1 份胡萝卜`}).waitFor();
      const after=await page.evaluate(()=>window.lingjing.invoke('companions','list')),stockAfter=await invoke('snapshot');
      assert.equal(stockBefore.data.items.find(item=>item.id==='carrot').quantity-stockAfter.data.items.find(item=>item.id==='carrot').quantity,1);
      const changed=after.data.pets.find(pet=>pet.petId===target.petId);assert.equal(changed.growth.satiety,target.growth.satiety+12);assert.equal(changed.growth.affinity,target.growth.affinity+2);
      assert.deepEqual(after.data.pets.filter(pet=>pet.petId!==target.petId),before.data.pets.filter(pet=>pet.petId!==target.petId));
      run.roster={assets,targetPetId:target.petId,before,after,stockBefore,stockAfter,onlyTargetChanged:true};
      await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.documentElement.dataset.motion==='reduced');await page.screenshot({path:resolve(output,'six-canonical-resources-and-selected-fox-feed.png'),fullPage:true});
    }else{
      const pets=await page.evaluate(()=>window.lingjing.invoke('companions','list')),snapshot=await invoke('snapshot'),expected=run.rosterAction||run.roster;assert.deepEqual(pets.data.pets,(run.canonicalResources?.pets||expected.after).data.pets);assert.deepEqual(snapshot.data.items,expected.stockAfter.data.items);run.roster.restartExact=true;if(run.rosterAction)run.rosterAction.restartExact=true;if(run.canonicalResources)run.canonicalResources.restartExact=true;
    }
  } else if (phase === 'audit') {
    const nativeWindow=await application.browserWindow(page),measurements=[];
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.documentElement.dataset.motion==='reduced');
    for(const [width,height] of [[1280,844],[1440,900]]){
      await nativeWindow.evaluate((win,{width,height})=>win.setContentSize(width,height),{width,height});
      for(const path of ['/inventory','/garden/kitchen']){
        await route(path);await page.locator('.garden-pet-picker .cp-sheet-thumbnail, .garden-pet-picker .resource-stage[data-status="ready"]').first().waitFor();
        const result=await page.evaluate(()=>{
          const rect=e=>e.getBoundingClientRect().toJSON(),style=e=>({fontSize:getComputedStyle(e).fontSize,fontWeight:getComputedStyle(e).fontWeight,lineHeight:getComputedStyle(e).lineHeight,marginBottom:getComputedStyle(e).marginBottom});
          const cards=[...document.querySelectorAll('.garden-item')],pets=[...document.querySelectorAll('.garden-pet')];
          const boxes=cards.map(rect),overlap=boxes.some((a,i)=>boxes.some((b,j)=>i!==j&&Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5));
          return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},heading:{...style(document.querySelector('.garden-feature h1')),...rect(document.querySelector('.garden-feature h1'))},pagePadding:getComputedStyle(document.querySelector('.garden-feature')).padding,cards:cards.map(card=>({rect:rect(card),art:rect(card.querySelector('.garden-item-art'))})),petCards:pets.map(card=>({height:card.clientHeight,scrollHeight:card.scrollHeight})),overlap,cardsSpacing:[...document.querySelectorAll('.garden-card')].map(card=>({marginBottom:getComputedStyle(card).marginBottom,parentGap:getComputedStyle(card.parentElement).gap}))};
        });
        assert.equal(result.overlap,false);const titleTokens=await page.evaluate(()=>({size:getComputedStyle(document.documentElement).getPropertyValue('--text-title').trim()||'29px',weight:getComputedStyle(document.documentElement).getPropertyValue('--weight-title').trim()||'700'}));assert.equal(result.heading.fontSize,titleTokens.size);assert.equal(result.heading.fontWeight,titleTokens.weight);
        assert.equal(result.cards.every(card=>card.art.top>=card.rect.top&&card.art.bottom<=card.rect.bottom),true);
        assert.equal(result.petCards.every(card=>card.height>=100&&card.scrollHeight<=card.height),true);
        assert.equal(result.cardsSpacing.every(card=>card.marginBottom==='0px'),true);
        measurements.push({path,...result});await page.screenshot({path:resolve(output,`A04-${width}x${height}-${path.split('/').at(-1)}.png`),fullPage:true});
      }
    }
    run.visualAudit={source:'visual-audit.txt A04; follow A01/A03',fixCommits:['a79d9b9','155ac37'],measurements,readyForCentralRecheck:true};
  } else if (phase === 'real-territory-readback') {
    assert.ok(run.realTerritory?.completed,'Finish the actual-location challenge and garrison first');
    const snapshot=await invoke('snapshot'),pets=await page.evaluate(()=>window.lingjing.invoke('companions','list'));
    assert.deepEqual(snapshot.data.items,run.realTerritory.after.data.items);assert.deepEqual(pets.data,run.realTerritory.pets.data);
    assert.equal(snapshot.data.territories.find(territory=>territory.id===run.realTerritory.territoryId).garrisonPetId,run.realTerritory.garrisonPetId);
    run.realTerritory.restartExact=true;
  } else if (phase === 'real-territory') {
    assert.ok(run.rosterFixture&&!run.territoryFixture,'Use the separately labelled local roster QA profile, without an imported territory fixture');
    assert.ok(!run.realTerritory,'Inspect the saved physical attempt before retrying any challenge');
    const settings=await page.evaluate(()=>window.lingjing.invoke('accounts','settingsGet')),original=structuredClone(settings.data.document);
    const save=async document=>{const current=await page.evaluate(()=>window.lingjing.invoke('accounts','settingsGet'));const result=await page.evaluate(input=>window.lingjing.invoke('accounts','settingsSave',input),{actionId:crypto.randomUUID(),revision:current.data.revision,document});assert.equal(result.ok,true,JSON.stringify(result));};
    try{
      await save({...original,privacy:{...original.privacy,locationAllowed:true,locationOnlyWhileExploring:true}});
      await route('/garden');const discovery=await locateByButton();
      run.realTerritoryAttempt={at:new Date().toISOString(),status:discovery.data.location.status,error:discovery.data.location.lastError,positionSource:discovery.data.location.fix?.positionSource||null,accuracyMeters:discovery.data.location.fix?.accuracyMeters||null,coordinatesOmitted:true,challengeStarted:false};
      writeFileSync(runFile,JSON.stringify(run,null,2));console.log(JSON.stringify({physicalLocationAttempt:run.realTerritoryAttempt}));
      assert.equal(discovery.data.location.status,'ready',JSON.stringify({status:discovery.data.location.status,error:discovery.data.location.lastError}));
      assert.equal(discovery.data.location.fix.source,'os');assert.ok(discovery.data.location.fix.accuracyMeters<=80);
      await page.getByRole('status').filter({hasText:'附近领地已更新'}).waitFor();
      const before=await invoke('snapshot'),territory=before.data.territories.find(value=>value.provenance==='local-geographic'&&value.ownerAccountId===null);
      assert.ok(territory);assert.equal(before.data.territoryChallenges.length,0);
      const companions=await page.evaluate(()=>window.lingjing.invoke('companions','list')),chosen=companions.data.pets.find(pet=>pet.templateId==='animal-hat-cat');assert.ok(chosen);
      run.realTerritory={stage:'before-challenge',localAccount:true,importedFixture:false,territoryId:territory.id,location:discovery.data.location,before,selectedPetId:chosen.petId};
      writeFileSync(runFile,JSON.stringify(run,null,2));
      await page.getByRole('button',{name:`${chosen.name} Lv.`,exact:false}).click();await page.getByRole('button',{name:'发起领地挑战',exact:true}).click();
      await page.waitForFunction(()=>location.hash==='#/battle');
      const started=await invoke('snapshot'),challenge=started.data.territoryChallenges.find(value=>value.territoryId===territory.id);assert.ok(challenge);
      run.realTerritory.sessionId=challenge.sessionId;run.realTerritory.stage='battle';writeFileSync(runFile,JSON.stringify(run,null,2));
      run.realTerritoryAttempt.challengeStarted=true;
      let session=(await page.evaluate(sessionId=>window.lingjing.invoke('battle','snapshot',{sessionId}),challenge.sessionId)).data;
      const rules=(await page.evaluate(()=>window.lingjing.invoke('battle','rules'))).data;assert.equal(session.mode,'territory');
      for(let index=0;index<150&&session.status==='active';index++){
        const action=session.snapshot.player.anger>=rules.ultimateAnger?'ultimate':'element_attack',round=session.snapshot.round;
        await page.locator(`.battle-move.${action}`).click();
        await page.waitForFunction(async({sessionId,round})=>{const result=await window.lingjing.invoke('battle','snapshot',{sessionId});return result.ok&&(result.data.status!=='active'||result.data.snapshot.round>round);},{sessionId:session.id,round});
        session=(await page.evaluate(sessionId=>window.lingjing.invoke('battle','snapshot',{sessionId}),session.id)).data;
      }
      assert.equal(session.status,'finished');run.realTerritory.session=session;run.realTerritory.stage='battle-finished';writeFileSync(runFile,JSON.stringify(run,null,2));
      await page.screenshot({path:resolve(output,'real-territory-battle.png'),fullPage:true});
      await route('/garden');await page.getByRole('button',{name:'确认领地结算',exact:true}).click();await page.getByRole('status').filter({hasText:'领地挑战已结算'}).waitFor();
      const settled=await invoke('snapshot'),claimed=settled.data.territories.find(value=>value.id===territory.id);assert.equal(claimed.ownerAccountId,run.ownerAccountId,'Actual battle must win before physical garrison acceptance');
      const beforeGarrison=await page.evaluate(()=>window.lingjing.invoke('companions','list')),garrison=beforeGarrison.data.pets.find(pet=>pet.templateId==='big-fish-cheerful');assert.ok(garrison);
      await page.getByRole('button',{name:`${garrison.name} Lv.`,exact:false}).click();await page.getByRole('button',{name:'确认驻守',exact:true}).click();await page.getByRole('status').filter({hasText:'驻守伙伴已更新'}).waitFor();
      const after=await invoke('snapshot'),pets=await page.evaluate(()=>window.lingjing.invoke('companions','list'));assert.deepEqual(pets.data,beforeGarrison.data);assert.deepEqual(after.data.items,settled.data.items);
      assert.equal(after.data.territories.find(value=>value.id===territory.id).garrisonPetId,garrison.petId);
      Object.assign(run.realTerritory,{stage:'completed',completed:true,settled,after,pets,garrisonPetId:garrison.petId,garrisonChangesNoGrowthOrIndependentSelection:true});
      await page.screenshot({path:resolve(output,'real-location-garrison.png'),fullPage:true});
    }finally{await save(original);}
  } else if (phase === 'territory-ui' || phase === 'territory-readback') {
    assert.ok(run.territoryFixture,'Only run this phase in the explicitly labelled isolated territory fixture');
    const snapshot=await invoke('snapshot'),territory=snapshot.data.territories.find(t=>t.id===run.territoryFixture.id);assert.equal(territory.ownerAccountId,run.ownerAccountId);
    if(phase==='territory-ui'){
      const before=await page.evaluate(()=>window.lingjing.invoke('companions','list'));
      await route('/garden');await page.getByRole('heading',{name:run.territoryFixture.name,exact:true}).waitFor();
      await page.getByRole('button',{name:'鱼丸 Lv.',exact:false}).click();await page.getByRole('button',{name:'确认驻守',exact:true}).click();await page.getByRole('status').filter({hasText:'驻守伙伴已更新'}).waitFor();
      const first=await invoke('snapshot');assert.equal(first.data.territories.find(t=>t.id===territory.id).garrisonPetId,run.petIds['鱼丸']);
      await page.getByRole('button',{name:'小蓝 Lv.',exact:false}).click();await page.getByRole('button',{name:'确认驻守',exact:true}).click();await page.getByRole('status').filter({hasText:'驻守伙伴已更新'}).waitFor();
      const after=await invoke('snapshot'),pets=await page.evaluate(()=>window.lingjing.invoke('companions','list'));
      assert.equal(after.data.territories.find(t=>t.id===territory.id).garrisonPetId,run.petIds['小蓝']);assert.deepEqual(pets.data,before.data);
      run.territoryUI={fixture:true,realGeographicAcceptance:false,before,after,pets,garrisonOnly:true};
      await page.emulateMedia({reducedMotion:'reduce'});await page.screenshot({path:resolve(output,'territory-ui-garrison.png'),fullPage:true});
    }else{
      assert.equal(territory.garrisonPetId,run.petIds['小蓝']);assert.deepEqual(snapshot.data.items,run.territoryUI.after.data.items);
      const pets=await page.evaluate(()=>window.lingjing.invoke('companions','list'));assert.deepEqual(pets.data,run.territoryUI.pets.data);run.territoryRestart={exactGarrisonAndIndependentSelections:true};
    }
  } else if (phase === 'screens') {
    const window=await application.browserWindow(page);await window.evaluate(win=>win.setContentSize(1320,1000));
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.documentElement.dataset.motion==='reduced');
    for(const [path,name] of [['/garden/plots','10-garden-current.png'],['/garden/kitchen','11-kitchen-current.png'],['/inventory','12-inventory-current.png']]){
      await route(path);await page.locator('.garden-feature').waitFor();
      if(path==='/garden/plots')await page.locator('.garden-pixi-scene canvas').waitFor();
      else {await page.locator('.garden-pet-picker .cp-sheet-thumbnail, .garden-pet-picker .resource-stage[data-status="ready"]').first().waitFor();await page.getByRole('button',{name:'鱼丸 Lv.',exact:false}).click();}
      await page.evaluate(()=>{for(const element of document.querySelectorAll('*'))if(element.scrollHeight>element.clientHeight&&['auto','scroll'].includes(getComputedStyle(element).overflowY))element.scrollTop=0;document.activeElement?.blur();});
      await page.screenshot({path:resolve(output,name),fullPage:true});
    }
    run.screens={nativeWindow:true,contentSize:{width:1320,height:1000},reducedMotionForStableComparison:true};
  } else if (phase === 'responsive') {
    const window=await application.browserWindow(page);await window.evaluate(win=>win.setContentSize(1100,800));
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.documentElement.dataset.motion==='reduced');
    const screens=[];
    for(const path of ['/garden/plots','/garden/kitchen','/inventory']){
      await route(path);await page.locator('.garden-feature').waitFor();
      const geometry=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,content:document.querySelector('.garden-feature').getBoundingClientRect().toJSON()}));
      assert.ok(geometry.scrollWidth<=geometry.width,JSON.stringify({path,...geometry}));screens.push({path,...geometry});
      await page.screenshot({path:resolve(output,`responsive-${path.split('/').at(-1)}.png`),fullPage:true});
    }
    run.responsive=screens;
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
    const nativeWindow=await application.browserWindow(page);await nativeWindow.evaluate(win=>win.setContentSize(1280,844));
    await route('/garden/kitchen');await page.getByRole('heading',{name:'这一口，是亲手种下的喜欢。'}).waitFor();
    const select=page.getByRole('combobox',{name:'选择食物'});await select.focus();await select.press('Enter');await page.getByRole('listbox').waitFor();await page.keyboard.press('Escape');
    await page.getByRole('listbox').waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement?.getAttribute('role')==='combobox');assert.equal(await select.evaluate(element=>element===document.activeElement),true);
    await select.click();await page.getByRole('option',{name:/^胡萝卜 × \d+$/}).click();assert.match(await select.innerText(),/胡萝卜/);
    await page.locator('.garden-pet-picker .cp-sheet-thumbnail, .garden-pet-picker .resource-stage[data-status="ready"]').first().waitFor();
    await page.screenshot({path:resolve(output,'04-radix-kitchen.png'),fullPage:true});
    await route('/inventory');await page.getByRole('tablist',{name:'背包分类'}).waitFor();
    const all=page.getByRole('tab',{name:'全部',exact:true});await all.focus();await all.press('ArrowRight');
    await page.waitForFunction(()=>document.querySelector('[role="tab"][data-state="active"]')?.textContent==='食物');
    assert.equal(await page.getByRole('tab',{name:'食物',exact:true}).getAttribute('aria-selected'),'true');assert.equal(await page.locator('.garden-item-grid .garden-item').count(),4);
    await page.getByRole('tab',{name:'食物',exact:true}).press('End');await page.waitForFunction(()=>document.querySelector('[role="tab"][data-state="active"]')?.textContent==='道具');assert.equal(await page.getByRole('tab',{name:'道具',exact:true}).getAttribute('aria-selected'),'true');assert.equal(await page.locator('.garden-item-grid .garden-item').count(),5);
    await page.getByRole('tab',{name:'道具',exact:true}).press('Home');await page.waitForFunction(()=>document.querySelector('[role="tab"][data-state="active"]')?.textContent==='全部');assert.equal(await all.getAttribute('aria-selected'),'true');
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(()=>document.documentElement.dataset.motion==='reduced'&&getComputedStyle(document.querySelector('.garden-item-grid')).transform==='none');
    const headingMetrics=await page.locator('.garden-feature h1').evaluate(element=>({fontSize:getComputedStyle(element).fontSize,fontWeight:getComputedStyle(element).fontWeight}));const titleTokens=await page.evaluate(()=>({size:getComputedStyle(document.documentElement).getPropertyValue('--text-title').trim()||'29px',weight:getComputedStyle(document.documentElement).getPropertyValue('--weight-title').trim()||'700'}));assert.equal(headingMetrics.fontSize,titleTokens.size);assert.equal(headingMetrics.fontWeight,titleTokens.weight);
    const cardGeometry=await page.locator('.garden-item-grid .garden-item').evaluateAll(cards=>cards.map(card=>{
      const outer=card.getBoundingClientRect(),art=card.querySelector('.garden-item-art').getBoundingClientRect();
      return {height:outer.height,artHeight:art.height,contained:art.top>=outer.top&&art.bottom<=outer.bottom};
    }));assert.equal(cardGeometry.every(card=>card.height>120&&card.contained),true,JSON.stringify(cardGeometry));
    const petGeometry=await page.locator('.garden-pet-picker .garden-pet').evaluateAll(cards=>cards.map(card=>({height:card.getBoundingClientRect().height,content:card.scrollHeight})));assert.equal(petGeometry.every(card=>card.height>=100&&card.height>=card.content),true,JSON.stringify(petGeometry));
    await page.getByRole('searchbox',{name:'搜索物品名称'}).fill('米饭');assert.equal(await page.locator('.garden-item-grid .garden-item').count(),1);
    run.library={viewport:await page.evaluate(()=>({width:innerWidth,height:innerHeight})),radixSelectEscFocus:true,radixTabsArrowHomeEnd:true,search:true,sharedCompanionPortrait:true,headingMetrics,cardGeometry,petGeometry,shadcnSelectSlot:'tested-on-kitchen',motionList:await page.locator('.garden-item-grid').evaluate(element=>({projection:element.getAttribute('data-projection-id'),style:element.getAttribute('style')}))};
    await page.getByRole('searchbox',{name:'搜索物品名称'}).fill('');await page.screenshot({path:resolve(output,'05-radix-inventory.png'),fullPage:true});
    await page.emulateMedia({reducedMotion:'no-preference'});
  } else if (phase === 'rewardfinish') {
    assert.ok(run.afterFeed,'Finish the rice recipe and feed proof first');
    const before=await invoke('snapshot'),plot=before.data.plots.find(plot=>plot.plotId===run.rewardPlant.plotId),crop=before.data.crops.find(crop=>crop.id===run.rewardPlant.crop);
    assert.equal(plot.stage,'mature');assert.equal(plot.plantedAt,run.rewardPlant.after.data.plots.find(p=>p.plotId===plot.plotId).plantedAt);
    await route('/garden/plots');await page.getByRole('heading',{name:'把小日子，种成好收成。'}).waitFor();
    await page.locator(`[data-plot-id="${plot.plotId}"]`).click();await page.locator('.garden-pixi-scene canvas').waitFor();await page.screenshot({path:resolve(output,'09a-reward-mature.png'),fullPage:true});
    await page.getByRole('button',{name:'收获',exact:true}).click();await page.getByRole('status').filter({hasText:`${crop.name}已放入背包`}).waitFor();
    const harvested=await invoke('snapshot');assert.equal(harvested.data.items.find(item=>item.id===crop.harvestItemId).quantity-before.data.items.find(item=>item.id===crop.harvestItemId).quantity,plot.yieldQuantity);
    const beforeFeed=await page.evaluate(()=>window.lingjing.invoke('companions','list'));
    await route('/inventory');await page.getByRole('tablist',{name:'背包分类'}).waitFor();
    await page.locator('.garden-item').filter({has:page.getByText(crop.name,{exact:true})}).click();
    await page.getByRole('button',{name:'鱼丸 Lv.',exact:false}).click();await page.getByRole('button',{name:'喂给鱼丸',exact:true}).click();await page.getByRole('status').filter({hasText:`已给鱼丸喂食 1 份${crop.name}`}).waitFor();
    const afterFeed=await page.evaluate(()=>window.lingjing.invoke('companions','list')),fed=await invoke('snapshot');
    assert.equal(harvested.data.items.find(item=>item.id===crop.harvestItemId).quantity-fed.data.items.find(item=>item.id===crop.harvestItemId).quantity,1);
    for(const name of ['小蓝','饭团'])assert.deepEqual(afterFeed.data.pets.find(p=>p.name===name),beforeFeed.data.pets.find(p=>p.name===name));
    const fishBefore=beforeFeed.data.pets.find(p=>p.name==='鱼丸'),fishAfter=afterFeed.data.pets.find(p=>p.name==='鱼丸'),effects=fed.data.items.find(item=>item.id===crop.harvestItemId).effects;
    assert.equal(fishAfter.growth.satiety,Math.min(100,fishBefore.growth.satiety+effects.satiety));assert.equal(fishAfter.growth.affinity,fishBefore.growth.affinity+effects.intimacy);
    const start=await page.evaluate(petId=>window.lingjing.invoke('battle','startTraining',{actionId:'garden-reward-cycle-training',petId,enemyElement:'fire'}),run.petIds['鱼丸']);assert.equal(start.ok,true,JSON.stringify(start));
    let session=start.data;
    for(let i=0;i<150&&session.status==='active';i++){
      const result=await page.evaluate(input=>window.lingjing.invoke('battle','act',input),{sessionId:session.id,actionId:`garden-reward-cycle-action:${i}`,expectedRound:session.snapshot.round+1,action:session.snapshot.player.anger>=50?'ultimate':'element_attack'});assert.equal(result.ok,true,JSON.stringify(result));session=result.data;
    }
    assert.equal(session.status,'finished');assert.equal(session.reward.applied,true);
    const final=await invoke('snapshot'),finalPets=await page.evaluate(()=>window.lingjing.invoke('companions','list'));
    const total=data=>data.items.filter(item=>item.category==='seed').reduce((sum,item)=>sum+item.quantity,0);assert.equal(total(final.data)-total(fed.data),2);
    run.rewardCycle={before,harvested,beforeFeed,afterFeed,fed,nextBattle:session,final,finalPets};
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.documentElement.dataset.motion==='reduced');await page.screenshot({path:resolve(output,'09-reward-grown-fed-and-explored.png'),fullPage:true});
  } else if (phase === 'readback') {
    const result = await invoke('snapshot'); assert.equal(result.ok, true);
    assert.deepEqual(result.data.items, (run.rewardCycle?.final||run.final).data.items);
    const pets = await page.evaluate(() => window.lingjing.invoke('companions', 'list'));
    assert.deepEqual(pets.data.pets, (run.canonicalResources?.pets||run.rewardCycle?.finalPets||run.afterFeed).data.pets);
    const repeatHarvest = await invoke('harvest', { actionId: 'after-restart-double-harvest', expectedRevision: result.revision, plotIds: ['plot-1'] });
    assert.equal(repeatHarvest.code, 'ALREADY_HARVESTED');
    const staleOwner=await page.evaluate(revision=>window.lingjing.invoke('garden','plant',{actionId:'stale-owner-view',expectedRevision:revision,sessionOwnerAccountId:'another-account',ownerAccountId:'forged-owner',plotId:'plot-1',cropType:'carrot'}),result.revision);assert.equal(staleOwner.code,'SESSION_CHANGED');
    run.readback = { result, pets, repeatHarvest,staleOwner };
    if(run.canonicalResources)run.canonicalResources.restartExact=true;
  }
  assert.deepEqual(errors, []);
  run.phases.push({ phase, at: new Date().toISOString(), errors, electron: await application.evaluate(() => process.versions.electron) });
  writeFileSync(runFile, JSON.stringify(run, null, 2));
  console.log(JSON.stringify({ phase, profile, runFile, maturesAt: run.planted?.data.plots[0].maturesAt, at: new Date().toISOString() }));
} finally { await application.close(); }
const db = new DatabaseSync(resolve(profile, 'lingjing.sqlite'), { readOnly: true });
const readback = { account: db.prepare('SELECT * FROM garden_accounts WHERE owner_account_id=?').get(run.ownerAccountId), plots: db.prepare('SELECT * FROM garden_plots WHERE owner_account_id=?').all(run.ownerAccountId), items: db.prepare('SELECT * FROM garden_items WHERE owner_account_id=?').all(run.ownerAccountId), ledger: db.prepare('SELECT * FROM garden_events WHERE owner_account_id=? ORDER BY created_at').all(run.ownerAccountId) };
if(phase.startsWith('identity-upgrade')){
  readback.identityUpgrade={garden:db.prepare('SELECT source_owner_account_id,target_owner_account_id,created_at,LENGTH(archive_json) archiveBytes FROM garden_identity_imports WHERE source_owner_account_id=?').get(run.ownerAccountId),companions:db.prepare('SELECT source_owner_account_id,target_owner_account_id,created_at,LENGTH(archive_json) archiveBytes FROM companion_identity_imports WHERE source_owner_account_id=?').get(run.ownerAccountId)};
  assert.equal(readback.identityUpgrade.garden.target_owner_account_id,run.storageOwnerAccountId);assert.equal(readback.identityUpgrade.companions.target_owner_account_id,run.storageOwnerAccountId);
  for(const item of run.final.data.items)assert.equal(readback.items.find(row=>row.item_id===item.id)?.quantity||0,item.quantity);
}
writeFileSync(resolve(output, `${phase}-disk-readback.json`), JSON.stringify(readback, null, 2)); db.close();


