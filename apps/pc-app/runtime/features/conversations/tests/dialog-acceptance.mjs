// Narrow actual-Electron review of conversation portals, using the already
// namespaced local recovery fixture. Does not rerun the archive/HTTP flow.
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const source=readFileSync(resolve('artifacts/conversations/cloud-recovery/latest.txt'),'utf8').trim();
const profile=join(source,'qa-profile'),marker=JSON.parse(readFileSync(join(profile,'.lingjing-qa-profile.json'),'utf8'));
assert.equal(resolve(marker.profilePath).toLowerCase(),resolve(profile).toLowerCase());
const output=resolve('artifacts/conversations/dialogs',`run-${Date.now()}`);mkdirSync(output,{recursive:true});
const env={...process.env,PET_USER_DATA_DIR:profile,LINGJING_QA_SCENARIO:'unified-battle'};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:[resolve('.')],env}),checks=[];
try{
  const page=await app.firstWindow();await page.setViewportSize({width:1280,height:844});await page.waitForFunction(()=>Boolean(window.lingjing));
  async function settle(){await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(animation=>Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation=>animation.finished.catch(()=>{})));});}
  const loggedIn=await page.evaluate(()=>window.lingjing.invoke('accounts','login',{provider:'local',account:'qa_chat_recovery',password:'isolated-recovery-qa'}));assert.equal(loggedIn.ok,true);
  await page.evaluate(()=>{location.hash='#/settings/ai';});await page.getByRole('heading',{name:'AI 对话',exact:true}).waitFor();
  async function review(title,primary,file){
    const dialog=page.getByRole('dialog');await dialog.locator('.cv-dialog h2').waitFor();assert.equal(await dialog.locator('.cv-dialog h2').innerText(),title);
    await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(animation=>Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation=>animation.finished.catch(()=>{})));});
    const metrics=await dialog.evaluate(root=>{const box=root.getBoundingClientRect(),style=getComputedStyle(root),title=root.querySelector('.cv-dialog h2').getBoundingClientRect();return{dialog:{x:box.x,y:box.y,width:box.width,height:box.height},title:{x:title.x,y:title.y,width:title.width,height:title.height},translate:style.translate,viewport:{width:innerWidth,height:innerHeight}};});
    const button=dialog.getByRole('button',{name:primary,exact:true});
    const colors=await button.evaluate(node=>{const style=getComputedStyle(node),box=node.getBoundingClientRect();return{background:style.backgroundColor,color:style.color,blue:style.getPropertyValue('--cv-blue'),rect:{x:box.x,y:box.y,width:box.width,height:box.height}};});
    assert.ok(metrics.dialog.x>=0&&metrics.dialog.y>=0&&metrics.dialog.x+metrics.dialog.width<=metrics.viewport.width&&metrics.dialog.y+metrics.dialog.height<=metrics.viewport.height);
    assert.ok(Math.abs(metrics.dialog.x+metrics.dialog.width/2-metrics.viewport.width/2)<2);
    assert.ok(metrics.title.y>=0&&colors.rect.y>=0&&colors.rect.x>=0&&colors.rect.x+colors.rect.width<=metrics.viewport.width);
    assert.notEqual(colors.background,'rgba(0, 0, 0, 0)');assert.ok(colors.blue.trim());assert.notEqual(colors.color,colors.background);
    for(let index=0;index<8;index++)await page.keyboard.press('Tab');
    assert.equal(await dialog.evaluate(root=>root.contains(document.activeElement)),true);
    await dialog.getByRole('button',{name:'取消',exact:true}).focus();await settle();
    await page.screenshot({path:join(output,file),fullPage:true});checks.push({title,metrics,primary:colors,focusContained:true});
  }
  const importButton=page.getByRole('button',{name:'导入旧记录',exact:true});await importButton.click();await page.locator('.cv-import-counts').waitFor();
  await review('导入旧记录','导入','legacy-dialog-1280.png');await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='导入旧记录');
  assert.equal(await importButton.evaluate(node=>node===document.activeElement),true);
  const memoryButton=page.getByRole('button',{name:'添加记忆',exact:true});await memoryButton.click();await page.getByRole('dialog').getByLabel('记忆内容',{exact:true}).fill('QA：本次不保存的草稿');
  await review('原伙伴的记忆','保存记忆','memory-dialog-1280.png');await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='添加记忆');
  assert.equal(await memoryButton.evaluate(node=>node===document.activeElement),true);
  const snapshot=await page.evaluate(()=>window.lingjing.invoke('conversations','snapshot'));assert.equal(snapshot.ok,true);assert.equal(snapshot.data.memories.length,1);
  const build=JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json','utf8'));
  const changed=execFileSync('git',['diff','--name-only',build.sourceCommit,'HEAD'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
  assert.ok(changed.every(file=>file.startsWith('docs/')||file.includes('/tests/')),'Rebuild after production source changes.');
  const evidence={at:new Date().toISOString(),sourceCommit:build.sourceCommit,harnessSourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),productionSourceUnchangedSinceBuild:true,build,status:'passed',realElectron:true,realCloud:false,syntheticQaFixture:true,
    versions:await app.evaluate(()=>({electron:process.versions.electron,node:process.versions.node})),checks,escapeRestoresTriggerFocus:true,unsavedMemoryNotPersisted:true,sourceRecoveryRun:source};
  writeFileSync(join(output,'evidence.json'),JSON.stringify(evidence,null,2));writeFileSync(resolve('artifacts/conversations/dialogs/latest.txt'),output);
  console.log(JSON.stringify({status:'passed',checks:checks.length,realCloud:false,output}));
}finally{await app.close();}
