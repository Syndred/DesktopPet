import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

assert.ok(process.env.COMPANIONS_UI_PROFILE, 'Reopen the existing six-character acceptance profile without resetting its data');
const outputRoot=resolve('artifacts/companions');mkdirSync(outputRoot,{recursive:true});const output=mkdtempSync(join(outputRoot,'capture-'));
const env={...process.env,PET_USER_DATA_DIR:process.env.COMPANIONS_UI_PROFILE};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:[resolve('.'),'--force-device-scale-factor=1'],env});let page;
const evidence={at:new Date().toISOString(),output,profile:process.env.COMPANIONS_UI_PROFILE,scope:'A01/A02/A03/A06/A07 static capture only; prior six-character action evidence retained',captures:[]};
async function shot(name,selector) {
  await page.waitForFunction(selector=>{const content=document.querySelector(selector);const root=content?.closest('.app-page-motion');const stages=content?[...content.querySelectorAll('.resource-stage')]:[];return content&&root&&document.querySelectorAll('.main-content > .app-page-motion').length===1&&Number(getComputedStyle(root).opacity)>.999&&(stages.length>0||content.querySelector('.resource-portrait'))&&stages.every(stage=>stage.dataset.status==='ready');},selector);
  await page.evaluate(async()=>{await Promise.all([...document.querySelectorAll('.resource-portrait image')].map(async image=>{const decoded=new Image();decoded.src=image.getAttribute('href');await decoded.decode();}));});
  await page.mouse.move(0,0);await page.evaluate(()=>{document.activeElement?.blur();document.querySelector('.main-content')?.scrollTo({top:0});});
  const content=page.locator(selector);assert.equal(await content.isVisible(),true);assert.ok((await content.innerText()).length>80);
  await page.screenshot({path:join(output,name),timeout:5000});
  evidence.captures.push({name,url:page.url(),visibleText:await content.innerText(),metrics:await content.evaluate(node=>{const heading=node.querySelector('h1');const style=getComputedStyle(heading);const r=node.getBoundingClientRect();return{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,content:{x:r.x,y:r.y,width:r.width,height:r.height},heading:{size:style.fontSize,weight:style.fontWeight},stages:[...node.querySelectorAll('.resource-stage')].map(stage=>({resourceId:stage.dataset.resourceId,status:stage.dataset.status})),portraits:[...node.querySelectorAll('.resource-portrait')].map(svg=>({resourceId:svg.dataset.resourceId,framing:svg.dataset.framing,frame:svg.dataset.frame,viewBox:svg.getAttribute('viewBox'),image:svg.querySelector('image')?.getAttribute('href')}))};})});
}
try{
  for(let i=0;i<100&&!page;i++){page=app.windows().find(candidate=>candidate.url().includes('/dist/ui/index.html')&&!candidate.url().includes('#/desktop/'));if(!page)await delay(100);}assert.ok(page);page.setDefaultTimeout(10000);
  for(const [width,height]of[[1280,844],[1440,900]]){
    await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows().find(window=>window.webContents.getURL().includes('/dist/ui/index.html')&&!window.webContents.getURL().includes('#/desktop/')).setContentSize(size.width,size.height),{width,height});
    await page.waitForFunction(({width,height})=>innerWidth===width&&innerHeight===height,{width,height});
    await page.getByRole('button',{name:'我的灵宠',exact:true}).first().click();await page.getByRole('button',{name:'领养伙伴',exact:true}).waitFor();
    await page.getByRole('button',{name:/^选择伙伴 鱼丸 /}).click();await shot(`${width}-overview.png`,'.cp-page:not(.cp-detail-page):not(.cp-adoption-page)');
    await page.getByRole('button',{name:'查看伙伴详情',exact:true}).click();await shot(`${width}-detail.png`,'.cp-detail-page');
    await page.getByRole('button',{name:'我的灵宠',exact:true}).first().click();await page.getByRole('button',{name:'领养伙伴',exact:true}).click();await shot(`${width}-adoption.png`,'.cp-adoption-page');
    assert.equal(await page.locator('.cp-template-card').count(),6);
    assert.equal(await page.locator('.cp-template-card [data-framing="portrait"]').count(),6);
    assert.equal(await page.locator('.cp-adoption-art [data-framing="portrait"]').count(),0);
    assert.equal(await page.locator('.cp-adoption-art .resource-stage[data-status="ready"]').count(),1);
  }
  const desktop=app.windows().find(candidate=>candidate.url().includes('#/desktop/'));assert.ok(desktop);await desktop.locator('.resource-stage[data-status="ready"]').waitFor();
  assert.equal(await desktop.locator('.resource-portrait').count(),0);await desktop.screenshot({path:join(output,'desktop-full-body.png'),omitBackground:true,timeout:5000});
  evidence.result='passed';console.log(`REAL_AUDIT_CAPTURE_PASSED ${output}`);
}catch(error){evidence.result='failed';evidence.error=error.stack;process.exitCode=1;console.error(error);}
finally{writeFileSync(join(output,'evidence.json'),JSON.stringify(evidence,null,2));await app.close();}
