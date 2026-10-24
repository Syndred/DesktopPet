import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const executable=resolve(process.argv[2] || 'artifacts/pc-beta/Lingjing-0.1.8-portable-x64.exe');
const baseline=JSON.parse(readFileSync(resolve('artifacts/foundation/visual-recheck/evidence.json'),'utf8'));
const output=resolve('artifacts/foundation/portable');mkdirSync(output,{recursive:true});
const reservation=createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
const env={...process.env,PET_USER_DATA_DIR:baseline.profile};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(executable,[`--remote-debugging-port=${port}`],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
let launchError,logs='';child.on('error',e=>{launchError=e;});
for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{logs=(logs+bytes.toString()).slice(-30000);});
const proof={at:new Date().toISOString(),executable,launcherPid:child.pid,profile:baseline.profile,checks:[],errors:[]};let browser;
try {
  const endpoint=`http://127.0.0.1:${port}`;
  let ready=false;
  for(let i=0;i<240;i++){
    if(launchError)throw launchError;
    try {const response=await fetch(`${endpoint}/json/version`,{signal:AbortSignal.timeout(300)});if(response.ok){ready=true;break;}}catch{/* The SFX extracts before Electron starts. */}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert.ok(ready,'Portable SFX must start its embedded Electron process');
  browser=await chromium.connectOverCDP(endpoint);
  let page;
  for(let i=0;i<100;i++){page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('/app.asar/')&&p.url().includes('/dist/ui/index.html')&&!p.url().includes('#/desktop/'));if(page)break;await new Promise(resolve=>setTimeout(resolve,100));}
  assert.ok(page);page.on('pageerror',error=>proof.errors.push(error.message));
  await page.getByRole('navigation',{name:'主导航'}).waitFor();
  const invoke=async(feature,command,payload={})=>{const result=await page.evaluate(({feature,command,payload})=>window.lingjing.invoke(feature,command,payload),{feature,command,payload});assert.equal(result.ok,true,JSON.stringify(result));return result.data;};
  proof.loadedUrl=page.url();assert.ok(!proof.loadedUrl.includes('win-unpacked'));
  proof.info=await invoke('app','info');assert.equal(proof.info.features.length,7);
  const pets=await invoke('companions','list');assert.equal(pets.pets.length,6);assert.equal(new Set(pets.pets.map(p=>p.resource.resourceId)).size,6);
  const resources=await invoke('resources','list');assert.equal(resources.filter(r=>r.origin==='builtin').length,6);assert.ok(resources.every(r=>r.availability==='ready'));
  proof.checks.push('Actual portable SFX launched from its extracted ASAR, retaining the independent QA account and six canonical instances');
  assert.equal(await page.evaluate(()=>typeof window.require),'undefined');assert.equal(await page.evaluate(()=>typeof window.lingjing.send),'undefined');
  await page.locator('.sidebar').getByRole('button',{name:'角色资源',exact:true}).click();
  await page.locator(`.resource-card[data-resource-id="${pets.pets[0].resource.resourceId}"]`).click();
  await page.getByRole('combobox',{name:'预览动作',exact:true}).click();await page.getByRole('option',{name:'行走',exact:true}).click();
  const stage=page.locator('.resources-preview .resource-stage[data-status=ready][data-action=walk][data-fallback=false]');await stage.waitFor();
  assert.equal(await stage.locator('canvas').count(),1);await page.waitForTimeout(300);
  proof.stage=await stage.evaluate(e=>({resource:e.getAttribute('data-resource-id'),clip:e.getAttribute('data-clip'),frame:e.querySelector('.resource-sprite-host').getAttribute('data-frame'),texture:e.querySelector('.resource-sprite-host').getAttribute('data-texture-key')}));
  await page.screenshot({path:join(output,'portable-resource-stage.png')});
  proof.checks.push('Packaged secure IPC, registered asset protocol and real Pixi walk canvas work; every bundled canonical asset is readable');
  proof.pets=pets.pets.map(p=>({petId:p.petId,resourceId:p.resource.resourceId,growth:p.growth}));
  assert.deepEqual(proof.errors,[]);proof.passed=true;proof.completedAt=new Date().toISOString();console.log('Portable SFX/ASAR launch and live Pixi checks passed:',output);
}catch(error){proof.failure=String(error);throw error;}finally{
  if(browser){try{const cdp=await browser.newBrowserCDPSession();await cdp.send('Browser.close');}catch{/* The portable launcher may close its pipe first. */}await browser.close().catch(()=>{});}
  if(child.exitCode===null&&!launchError){await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,2500))]);}
  if(child.exitCode===null&&Number.isInteger(child.pid)){try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});proof.qaProcessTreeStopped=true;}catch{/* It may already have exited. */}}
  writeFileSync(join(output,'evidence.json'),JSON.stringify(proof,null,2));writeFileSync(join(output,'launcher.log'),logs);
}
