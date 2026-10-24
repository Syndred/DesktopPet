// Real production ResourceStage capture, through public controls. No mocked preload or renderer.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const root=process.cwd(), require=createRequire(path.join(root,'package.json'));
const { _electron }=require('playwright');
const { catalog }=require(path.join(root,'apps/pc-app/runtime/features/resources/roster.cjs'));
const directory=path.join(root,'artifacts/resources/roster-preview');
const profile=path.resolve(process.argv[2] || path.join(root,'artifacts/resources/2d-profile'));
assert(profile.startsWith(path.join(root,'artifacts/resources')+path.sep));
await fs.mkdir(directory,{recursive:true});
const env={...process.env,PET_USER_DATA_DIR:profile}; delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:require('electron'),args:[root],env,timeout:15000});
const report={at:new Date().toISOString(),runtime:'production Electron / real Pixi / public resource UI',errors:[],consoleErrors:[],characters:[],views:[]};
const labels={idle:'待机',blink:'眨眼',walk:'行走',wave:'招手',eat:'吃东西',attack_windup:'攻击起手',attack_release:'攻击释放',attack:'普通攻击',hit:'受击',skill:'技能施放',victory:'胜利',sleep:'睡眠'};
try {
  const page=await app.firstWindow(); page.setDefaultTimeout(5000);
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',e=>{if(e.type()==='error')report.consoleErrors.push(e.text());});
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setTitle('灵境 · 六角色 Pixi 逐帧验收');w.setContentSize(1280,844);});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.getByRole('button',{name:'角色资源',exact:true}).click();
  const listed=await page.evaluate(()=>window.lingjing.invoke('resources','list',{}));
  assert.equal(listed.ok,true);
  assert.deepEqual(listed.data.filter(r=>r.origin==='builtin').map(r=>r.id),catalog.characters.map(c=>c.resourceId));
  const companions=await page.evaluate(()=>window.lingjing.invoke('companions','list',{}));
  assert.equal(companions.ok,true);
  report.templates=companions.data.templates.map(t=>({templateId:t.templateId,resourceId:t.resource.resourceId}));
  for(const character of catalog.characters)assert(report.templates.some(t=>t.templateId===character.templateId&&t.resourceId===character.resourceId));

  async function pause() { const button=page.getByRole('button',{name:'暂停动画',exact:true}); if(await button.isVisible())await button.click(); }
  async function select(action) {
    if(await page.locator('.resource-stage').first().getAttribute('data-action')===action)return;
    await page.getByRole('combobox',{name:'预览动作',exact:true}).click();
    await page.getByRole('option',{name:labels[action],exact:true}).click();
  }
  async function capture(character,resource,index,action,notes='') {
    await pause(); await select(action);
    const source=resource.atlas.frames[`frame_${index}`].frame;
    const expected=[source.x,source.y,source.w,source.h].join(',');
    const host=page.locator('.resource-stage').first().locator('.resource-sprite-host');
    if(await host.getAttribute('data-texture-frame')!==expected) {
      await page.getByRole('button',{name:'播放动画',exact:true}).click();
      await page.waitForFunction(rect=>document.querySelector('.resource-stage .resource-sprite-host')?.getAttribute('data-texture-frame')===rect,expected,{timeout:5000});
      await pause();
    }
    assert.equal(await host.getAttribute('data-texture-frame'),expected,`${character.id}/${index}`);
    assert.equal(await page.locator('.resource-stage').first().getAttribute('data-fallback'),'false');
    const bounds=JSON.parse(await host.getAttribute('data-content-bounds'));
    assert(bounds.x>=-.5 && bounds.y>=-.5 && bounds.x+bounds.width<=bounds.canvasWidth+.5 && bounds.y+bounds.height<=bounds.canvasHeight+.5,`${character.id}/${index}: rendered content is clipped by the stage`);
    const filename=`${character.id}-frame-${String(index).padStart(2,'0')}.png`;
    const screenshot=await page.locator('.resource-stage').first().screenshot({path:path.join(directory,filename)});
    const box=await page.locator('.resource-stage').first().boundingBox(), dpr=await page.evaluate(()=>devicePixelRatio);
    assert(Math.abs(screenshot.readUInt32BE(16)-box.width*dpr)<=2 && Math.abs(screenshot.readUInt32BE(20)-box.height*dpr)<=2,'Native screenshot geometry does not match the stage');
    return {index,action,notes,screenshot:filename,physicalPixels:[screenshot.readUInt32BE(16),screenshot.readUInt32BE(20)],expectedRectangle:source,renderedBounds:bounds,actual:await host.evaluate(element=>({...element.dataset}))};
  }

  for(const character of catalog.characters) {
    const resource=listed.data.find(r=>r.id===character.resourceId);
    assert(resource?.availability==='ready');
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));
    await page.locator(`.resource-card[data-resource-id="${character.resourceId}"]`).click();
    await page.locator(`.resource-stage[data-resource-id="${character.resourceId}"][data-status="ready"]`).waitFor({timeout:10000});
    const result={id:character.id,name:character.name,resourceId:resource.id,contentHash:resource.contentHash,frames:[],actionCoverage:[],magnification:'native zoom 1 / unmodified element screenshots; inspected at original physical pixel size. Zoomed Electron clip captures were rejected.'};
    for(const [index,action] of [[0,'idle'],[1,'blink'],[2,'walk'],[3,'walk'],[4,'wave'],[5,'wave'],[6,'eat'],[7,'eat'],[8,'attack_windup'],[9,'attack_release'],[10,'hit'],[11,'skill'],[12,'skill'],[13,'victory']]) {
      result.frames.push(await capture(character,resource,index,action));
    }
    // Inspect the alternative seated-sleep pose using the actual mapping editor, then discard.
    await page.getByRole('tab',{name:'动作配置',exact:true}).click(); await pause();
    await page.getByRole('combobox',{name:'睡眠映射',exact:true}).click();
    await page.getByRole('option',{name:'sleep_seated',exact:true}).click();
    result.frames.push(await capture(character,resource,14,'sleep','Temporary UI draft mapping to sleep_seated; not saved'));
    await page.getByRole('button',{name:'放弃修改',exact:true}).click();
    result.frames.push(await capture(character,resource,15,'sleep'));
    await select('attack');
    const expected=resource.atlas.frames.frame_8.frame;
    await page.waitForFunction(rect=>document.querySelector('.resource-stage .resource-sprite-host')?.getAttribute('data-texture-frame')===rect,[expected.x,expected.y,expected.w,expected.h].join(','));
    for(const action of catalog.actionConvention) {
      const clip=resource.clips.find(clip=>clip.name===resource.actions[action]);
      result.actionCoverage.push({action,clip:clip.name,frames:clip.frameNames,fps:clip.fps,loop:clip.loop});
    }
    assert.equal(new Set(result.frames.map(f=>f.actual.frameTexture)).size,16);
    assert.equal(new Set(result.frames.map(f=>f.actual.textureSource)).size,1);
    await page.getByRole('tab',{name:'角色资源',exact:true}).click();
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));
    await page.locator('.resources-library-scroll [data-radix-scroll-area-viewport]').evaluate(e=>{e.scrollTop=0;});
    await page.locator('.main-content').evaluate(e=>{e.scrollTop=0;});
    await page.screenshot({path:path.join(directory,`${character.id}-page-1280.png`)});
    const gallery=`<!doctype html><meta charset="utf-8"><title>${character.name} · 实际 Pixi 帧截图</title><style>body{margin:24px;background:#f7faff;color:#192f61;font:14px 'Microsoft YaHei',sans-serif}h1{font-size:24px;margin:0 0 8px}p{margin:0 0 18px;color:#617797}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}figure{margin:0;border:1px solid #dfe8f8;border-radius:8px;overflow:hidden;background:white}figure>a{display:block;height:180px;position:relative;overflow:hidden}img{position:absolute;height:100%;width:auto;max-width:none;left:50%;top:50%;transform:translate(-50%,-50%)}figcaption{padding:9px 12px;font-size:13px}</style><h1>${character.name} · 16 个真实 Pixi 帧</h1><p>证据排版，非产品页面。每格来自正式资源页 ResourceStage 截图；只裁去舞台两侧空白以便查看，原始截图可点击。</p><div class="grid">${result.frames.map(frame=>`<figure><a href="${frame.screenshot}"><img src="${frame.screenshot}" alt="frame ${frame.index}"></a><figcaption>${String(frame.index).padStart(2,'0')} · ${labels[frame.action]}${frame.index===14?'（坐睡）':''}</figcaption></figure>`).join('')}</div>`;
    const galleryPath=path.join(directory,`${character.id}-frames.html`);await fs.writeFile(galleryPath,gallery);
    const galleryImage=await app.evaluate(async({BrowserWindow},file)=>{
      const window=new BrowserWindow({width:1600,height:1280,useContentSize:true,show:false,webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false}});
      try { await window.loadFile(file);await window.webContents.executeJavaScript("Promise.all([...document.images].map(image=>image.complete?Promise.resolve():new Promise(resolve=>{image.onload=resolve;image.onerror=resolve})))");return (await window.webContents.capturePage()).toDataURL(); }
      finally { window.destroy(); }
    },galleryPath);
    await fs.writeFile(path.join(directory,`${character.id}-frames.png`),Buffer.from(galleryImage.split(',')[1],'base64'));
    result.gallery={html:`${character.id}-frames.html`,screenshot:`${character.id}-frames.png`,kind:'Layout of unmodified actual stage screenshots; no generated or substituted frames'};
    report.characters.push(result);
    console.log(JSON.stringify({character:character.name,realPixiFrames:result.frames.length,canonicalActions:result.actionCoverage.length,errors:report.errors.length}));
  }

  for(const size of [[1280,844],[1440,900]]) {
    await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(size[0],size[1]),size);
    await page.locator('.main-content').evaluate(e=>{e.scrollTop=0;});
    const screenshot=`resource-layout-${size[0]}.png`;
    await page.screenshot({path:path.join(directory,screenshot)});
    report.views.push({size,screenshot,metrics:await page.evaluate(()=>{const title=document.querySelector('.resources-heading h1'),card=document.querySelector('.resources-panel-heading h2'),s=getComputedStyle(title),c=getComputedStyle(card);return{viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,title:{font:s.fontFamily,size:s.fontSize,weight:s.fontWeight,lineHeight:s.lineHeight},card:{font:c.fontFamily,size:c.fontSize,weight:c.fontWeight},namedSliders:[...document.querySelectorAll('[role="slider"]')].map(e=>({name:e.getAttribute('aria-label'),now:e.getAttribute('aria-valuenow')}))};})});
  }
  assert.deepEqual(report.errors,[]); assert.deepEqual(report.consoleErrors,[]);
  report.passed=true;
} catch(error) {
  report.passed=false;report.failure=error.stack;throw error;
} finally {
  await fs.writeFile(path.join(directory,'evidence.json'),JSON.stringify(report,null,2)+'\n');
  await app.evaluate(({app})=>app.exit(0)).catch(()=>{});
}
console.log(JSON.stringify({passed:report.passed,characters:report.characters.length,realPixiFrames:report.characters.reduce((sum,c)=>sum+c.frames.length,0),errors:report.errors}));
