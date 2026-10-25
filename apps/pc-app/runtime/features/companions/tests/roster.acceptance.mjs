import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const root = resolve('.'); const outputRoot = resolve('artifacts/companions'); mkdirSync(outputRoot, { recursive: true });
const output = mkdtempSync(join(outputRoot, 'roster-')); const profile = join(output, 'profile'); mkdirSync(profile);
const { RuntimeDataStore } = require(resolve('apps/pc-app/runtime/services/runtime-data-store.cjs'));
const legacyFile = join(profile, 'pet-runtime-data.json');
const legacy = new RuntimeDataStore({ filePath: legacyFile, sessionFilePath: join(profile, 'pet-auth-session.json') });
const account = 'roster_acceptance'; const password = 'Local-roster-proof-72!';
legacy.registerUser(account, password, '六形象验收'); legacy.loginUser(account, password);
const originalBytes = readFileSync(legacyFile); const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const evidence = { at: new Date().toISOString(), output, audit: ['A01','A02','A03','A06','A07','A08','A11'], independentVisualApproval: 'pending central review', checks: [], characters: [], screenshots: [], errors: [] };
const env = { ...process.env, PET_USER_DATA_DIR: profile }; delete env.ELECTRON_RUN_AS_NODE;
let application; let page;
const invoke = (feature, command, payload) => page.evaluate(({ feature, command, payload }) => window.lingjing.invoke(feature, command, payload), { feature, command, payload });
async function launch() {
  application = await electron.launch({ args: [root, '--force-device-scale-factor=1'], env });
  for (let i = 0; i < 120; i++) { page = application.windows().find(candidate => candidate.url().includes('/dist/ui/index.html') && !candidate.url().includes('#/desktop/')); if (page) break; await delay(100); }
  assert.ok(page); page.setDefaultTimeout(10000); page.on('pageerror', error => evidence.errors.push(error.message));
}
async function size(width, height) {
  await application.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('/dist/ui/index.html') && !window.webContents.getURL().includes('#/desktop/')).setContentSize(size.width, size.height), { width, height });
  await page.waitForFunction(({ width, height }) => innerWidth === width && innerHeight === height, { width, height });
}
async function home() { await page.getByRole('button', { name: '我的灵宠', exact: true }).first().click(); await page.getByRole('button', { name: '领养伙伴', exact: true }).waitFor(); }
async function showDetail(pet) {
  await home(); await page.getByRole('button', { name: `选择伙伴 ${pet.name} ${pet.serial}`, exact: true }).click();
  await page.getByRole('button', { name: '查看伙伴详情', exact: true }).click(); await page.getByRole('tab', { name: '成长', exact: true }).waitFor();
}
async function settle() {
  await page.waitForFunction(() => {
    const expected = location.hash === '#/companions/adopt' ? '.cp-adoption-page' : location.hash.startsWith('#/companions/') ? '.cp-detail-page' : '.cp-page:not(.cp-detail-page):not(.cp-adoption-page)';
    const content = document.querySelector(expected), root = content?.closest('.app-page-motion');
    const stages = content ? [...content.querySelectorAll('.resource-stage')] : [];
    return root && document.querySelectorAll('.main-content > .app-page-motion').length === 1 && Number(getComputedStyle(root).opacity) > .999 && (stages.length > 0 || content.querySelector('.resource-portrait')) && stages.every(stage => stage.getAttribute('data-status') === 'ready');
  });
  await page.mouse.move(0, 0); await page.evaluate(() => { document.activeElement?.blur(); document.querySelector('.main-content')?.scrollTo({ top: 0 }); });
}
async function screenshot(name) { await settle(); await page.screenshot({ path: join(output, name), animations: 'disabled', timeout: 5000 }); evidence.screenshots.push(name); }
async function selectAction(pet, label) {
  await page.getByRole('combobox', { name: `${pet.name}的预览动作` }).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}
async function pose(pet, action, label) {
  await selectAction(pet, label);
  await page.evaluate(expected => {
    const stage = document.querySelector('.cp-action-preview .resource-stage'); const host = stage.querySelector('[data-renderer^="pixi"]');
    window.__poseFrames = []; window.__poseObserver?.disconnect();
    window.__poseObserver = new MutationObserver(() => { if (stage.dataset.action === expected) window.__poseFrames.push(host.dataset.frame); });
    window.__poseObserver.observe(host, { attributes: true, attributeFilter: ['data-frame'] });
  }, action);
  await page.getByRole('button', { name: '播放动作', exact: true }).click();
  const stage = page.locator(`.cp-action-preview .resource-stage[data-action="${action}"][data-status="ready"]`); await stage.waitFor();
  const resourceId = await stage.getAttribute('data-resource-id'); assert.equal(resourceId, pet.resource.resourceId);
  const initial = await stage.locator('[data-renderer^="pixi"]').getAttribute('data-frame');
  await delay(300);
  const frames = await page.evaluate(first => { window.__poseObserver.disconnect(); return [first, ...window.__poseFrames]; }, initial);
  assert.ok(new Set(frames).size > 1, `${pet.name}/${action} must advance actual AnimatedSprite frames: ${JSON.stringify(frames)}`);
  if (pet.name === '鱼丸') await screenshot(`action-${action}.png`);
  return { action, resourceId, frames };
}
try {
  await launch(); await size(1280,844);
  const login = await invoke('accounts','login',{ provider:'local', account, password, rememberSession:true }); assert.equal(login.ok,true,JSON.stringify(login));
  const initial = await invoke('companions','list'); assert.equal(initial.ok,true,JSON.stringify(initial));
  const templates = initial.data.templates; assert.equal(templates.length,6); assert.equal(new Set(templates.map(template => template.resource.resourceId)).size,6);
  assert.deepEqual(templates.map(template => template.name),['鱼丸','小蓝','饭团','焰柴','礼帽喵','小狐']);
  await page.getByRole('button',{name:'领养伙伴',exact:true}).click();
  const show = page.getByRole('checkbox',{name:'领养后放到桌面',exact:true}); if(await show.getAttribute('aria-checked') === 'true') await show.click();
  for (const template of templates) {
    await page.locator('.cp-template-card').filter({has:page.locator('strong',{hasText:new RegExp(`^${template.name}$`)})}).click();
    await page.getByRole('textbox',{name:'给它起个昵称',exact:true}).fill(template.name);
    await page.getByRole('button',{name:'领养这位伙伴',exact:true}).click();
    await page.getByRole('status').filter({hasText:`${template.name} 已加入`}).waitFor();
  }
  let snapshot = (await invoke('companions','list')).data; const pets = templates.map(template => snapshot.pets.find(pet => pet.templateId === template.templateId && pet.source === 'adoption'));
  assert.ok(pets.every(Boolean)); assert.equal(new Set(pets.map(pet => pet.petId)).size,6);
  for(const pet of pets.slice(0,3)) assert.equal((await invoke('companions','desktop',{actionId:`show-${pet.petId}`,petId:pet.petId,visible:true})).ok,true);
  await home(); await screenshot('1280-overview.png');
  for(const pet of pets) {
    const resolved = await invoke('resources','resolve',{petId:pet.petId,resourceId:pet.resource.resourceId,context:'desktop',action:'idle'}); assert.equal(resolved.ok,true,JSON.stringify(resolved));
    assert.equal(resolved.data.resource.id,pet.resource.resourceId); assert.equal(resolved.data.resource.availability,'ready');
    const actionFrames = Object.fromEntries(['wave','eat','attack','hit','skill'].map(action => { const clip=resolved.data.resource.clips.find(clip=>clip.name===resolved.data.resource.actions[action]); assert.ok(clip); return [action,clip.frameNames||clip.frames]; }));
    assert.notDeepEqual(actionFrames.attack,actionFrames.wave); assert.notDeepEqual(actionFrames.hit,actionFrames.eat);
    await showDetail(pet); await screenshot(`detail-${pet.name}.png`);
    await page.getByRole('tab',{name:'外观',exact:true}).click(); await page.locator('.cp-action-preview .resource-stage[data-status="ready"]').waitFor();
    const poses=[]; for(const [action,label] of [['wave','招手'],['eat','吃饭'],['attack','普通攻击'],['hit','受击']]) poses.push(await pose(pet,action,label));
    const desktop=application.windows().find(candidate=>candidate.url().includes(`#/desktop/${pet.petId}`));
    if(desktop) { await desktop.locator('.resource-stage[data-status="ready"]').waitFor(); assert.equal(await desktop.locator('.resource-stage').getAttribute('data-resource-id'),pet.resource.resourceId); }
    const profile=await invoke('companions','combatProfile',{petId:pet.petId}); const training=await invoke('battle','startTraining',{actionId:`train-${pet.petId}`,petId:pet.petId,enemyElement:'fire'});
    assert.equal(training.ok,true,JSON.stringify(training));
    try { assert.equal(training.data.player.petId,pet.petId); assert.equal(training.data.player.resource.resourceId,pet.resource.resourceId); assert.equal(training.data.snapshot.player.maxHp,profile.data.rules.maxHp); assert.deepEqual(training.data.rules,profile.data.rules); }
    finally { assert.equal((await invoke('battle','leave',{sessionId:training.data.id})).ok,true); }
    await page.getByRole('tab',{name:'回忆',exact:true}).click(); await page.getByRole('button',{name:'打开它的聊天与记忆',exact:true}).click();
    await page.waitForURL('**#/chat'); const chat=await invoke('conversations','snapshot'); assert.equal(chat.data.petId,pet.petId); assert.equal(chat.data.pets.find(item=>item.petId===pet.petId).resource.resourceId,pet.resource.resourceId);
    evidence.characters.push({name:pet.name,petId:pet.petId,templateId:pet.templateId,resourceId:pet.resource.resourceId,actionFrames,poses,growthHp:profile.data.growthStats.hp,trainingMaxHp:training.data.snapshot.player.maxHp});
  }
  evidence.checks.push('Six actual UI adoptions have distinct canonical resources; detail, desktop, conversation and actual training preserve each pet/resource identity');
  evidence.checks.push('All six characters play wave/eat/attack/hit through production IPC with actual changing Pixi frames; no attack-wave or hit-eat alias');
  evidence.layouts=[];
  for(const [width,height] of [[1280,844],[1440,900]]) {
    await size(width,height); await showDetail(pets[0]); await screenshot(`${width}-detail.png`);
    const metrics=await page.evaluate(()=>{
      const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
      const main=document.querySelector('.main-content'); const heading=getComputedStyle(document.querySelector('.cp-detail-left h1'));
      return{viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},title:rect('.cp-detail-left .page-header'),tabs:rect('.cp-detail-tabs'),right:rect('.cp-detail-body'),scene:rect('.cp-detail-hero'),heading:{size:heading.fontSize,weight:heading.fontWeight,family:heading.fontFamily},cardMargins:[...document.querySelectorAll('.cp-detail-body .card')].map(card=>getComputedStyle(card).marginBottom),scroll:{height:main.clientHeight,content:main.scrollHeight}};
    });
    assert.equal(metrics.heading.size,'28px');assert.equal(metrics.heading.weight,'700');assert.ok(metrics.cardMargins.every(value=>value==='0px'));assert.ok(Math.abs(metrics.title.y-metrics.tabs.y)<=2);assert.ok(metrics.tabs.width>=metrics.right.width-2);assert.ok(metrics.scene.bottom<=height);
    await home();await page.getByRole('button',{name:'领养伙伴',exact:true}).click();await screenshot(`${width}-adoption.png`);
    metrics.adoption=await page.evaluate(()=>({cards:document.querySelectorAll('.cp-template-card').length,headerTop:document.querySelector('.cp-adoption-main .page-header').getBoundingClientRect().y,previewTop:document.querySelector('.cp-adoption-preview').getBoundingClientRect().y,resourceIds:[...document.querySelectorAll('.cp-template-card [data-resource-id]')].map(stage=>stage.getAttribute('data-resource-id'))}));
    assert.equal(metrics.adoption.cards,6);assert.equal(new Set(metrics.adoption.resourceIds).size,6);assert.ok(Math.abs(metrics.adoption.headerTop-metrics.adoption.previewTop)<=2);evidence.layouts.push(metrics);
  }
  const before=(await invoke('companions','list')).data.pets.filter(pet=>pet.resource.kind==='2d');await application.close();await launch();
  snapshot=(await invoke('companions','list')).data;
  for(const pet of before){const restored=snapshot.pets.find(item=>item.petId===pet.petId);assert.equal(restored.resource.resourceId,pet.resource.resourceId);assert.equal(restored.name,pet.name);assert.deepEqual(restored.growth,pet.growth);assert.equal(restored.desktop.visible,pet.desktop.visible);}
  await page.waitForFunction(()=>Boolean(window.lingjing));
  assert.equal(hash(readFileSync(legacyFile)),hash(originalBytes)); assert.deepEqual(evidence.errors,[]);
  evidence.checks.push('1280x844 and 1440x900 CSS px: shared title tokens, zero Card margins, top-aligned full-width Tabs, loaded real scene and six-card adoption');
  evidence.checks.push('Restart restores canonical identities, names/growth/visibility; original archived animals/legacy bytes remain unchanged');
  evidence.result='passed';console.log(`REAL_SIX_CHARACTER_PASSED ${output}`);
}catch(error){evidence.result='failed';evidence.error=error.stack;process.exitCode=1;if(page)await page.screenshot({path:join(output,'failure.png'),timeout:5000}).catch(()=>{});console.error(`REAL_SIX_CHARACTER_FAILED ${output}`,error);}
finally{writeFileSync(join(output,'evidence.json'),JSON.stringify(evidence,null,2));await application?.close().catch(()=>{});}
