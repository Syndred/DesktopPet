// Same-action event replay through the production editor; no stage remount or mocked preload.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const root=process.cwd(), require=createRequire(path.join(root,'package.json'));
const { _electron }=require('playwright');
const { catalog }=require(path.join(root,'apps/pc-app/runtime/features/resources/roster.cjs'));
const directory=path.join(root,'artifacts/resources/five-elements/replay');
await fs.mkdir(directory,{recursive:true});
const env={...process.env,PET_USER_DATA_DIR:path.join(root,'artifacts/resources/2d-profile')}; delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:require('electron'),args:[root],env,timeout:15000});
const report={at:new Date().toISOString(),runtime:'production Electron / real Pixi / public replay control',dataSource:{mode:'local-qa',simulated:false,cloud:'not used'},errors:[],characters:[]};
try {
  const page=await app.firstWindow(); page.setDefaultTimeout(5000);
  page.on('pageerror',error=>report.errors.push(error.message));
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setTitle('灵境 · 同名动作事件重播验收');w.setContentSize(1280,844);});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.getByRole('button',{name:'角色资源',exact:true}).click();
  const response=await page.evaluate(()=>window.lingjing.invoke('resources','list',{}));
  assert(response.ok);
  for(const character of catalog.characters.filter(entry=>['qingya','yantuan'].includes(entry.id))) {
    const resource=response.data.find(entry=>entry.id===character.resourceId);
    await page.locator(`.resource-card[data-resource-id="${character.resourceId}"]`).click();
    await page.locator('.resource-stage[data-status="ready"]').first().waitFor();
    const host=page.locator('.resource-stage .resource-sprite-host').first();
    const result={id:character.id,resourceId:resource.id,actions:[]};
    for(const [action,label,firstFrame,releaseFrame] of [['attack','普通攻击',8,9],['hit','受击',10,0]]) {
      await page.getByRole('combobox',{name:'预览动作',exact:true}).click();
      await page.getByRole('option',{name:label,exact:true}).click();
      const rectangle=index=>{const f=resource.atlas.frames[`frame_${index}`].frame;return[f.x,f.y,f.w,f.h].join(',');};
      const expectedStart=rectangle(firstFrame),expectedRelease=rectangle(releaseFrame),replays=[];
      const before=await host.evaluate(element=>{const canvas=element.querySelector('canvas');canvas.dataset.replayMarker=crypto.randomUUID();return {canvasMarker:canvas.dataset.replayMarker,textureSource:element.dataset.textureSource};});
      for(let replay=0;replay<2;replay++) {
        await page.getByRole('button',{name:'重播动作',exact:true}).click();
        const samples=[];
        for(let step=0;step<18;step++) {
          samples.push(await host.evaluate(element=>({...element.dataset,canvasMarker:element.querySelector('canvas')?.dataset.replayMarker})));
          if(step===0)await page.locator('.resource-stage').first().screenshot({path:path.join(directory,`${character.id}-${action}-${replay+1}-start.png`)});
          await new Promise(resolve=>setTimeout(resolve,35));
        }
        assert(samples.some(sample=>sample.textureFrame===expectedStart),`${character.id} ${action} did not restart its first pose`);
        assert(samples.some(sample=>sample.textureFrame===expectedRelease),`${character.id} ${action} did not advance`);
        assert(new Set(samples.map(sample=>sample.frameTexture)).size>=2,'Actual Pixi frame Texture UID did not change');
        assert(samples.every(sample=>sample.textureSource===before.textureSource),'Replay replaced the shared texture source');
        assert(samples.every(sample=>sample.canvasMarker===before.canvasMarker),'Replay remounted the stage canvas');
        replays.push({playbackKey:await page.locator('.resource-stage').first().getAttribute('data-playback-key'),samples});
      }
      assert.notEqual(replays[0].playbackKey,replays[1].playbackKey);
      result.actions.push({action,expectedStart,expectedRelease,replays});
    }
    report.characters.push(result);
  }
  assert.deepEqual(report.errors,[]);
  report.passed=true;
} catch(error) { report.passed=false;report.failure=error.stack;throw error; }
finally {
  await fs.writeFile(path.join(directory,'evidence.json'),JSON.stringify(report,null,2)+'\n');
  await app.evaluate(({app})=>app.exit(0)).catch(()=>{});
}
console.log(JSON.stringify({passed:report.passed,characters:report.characters.length,replays:report.characters.reduce((sum,c)=>sum+c.actions.reduce((n,a)=>n+a.replays.length,0),0)}));
