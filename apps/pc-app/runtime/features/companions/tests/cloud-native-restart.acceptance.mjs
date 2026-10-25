import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {setTimeout as delay} from 'node:timers/promises';

// Targeted final-source restart, actual cached-replay/interact IPC and native
// resource pixels. Reuses ONLY a successful isolated live run's encrypted vaults.
// The preceding full seven-group acceptance remains bound to its own source.
const require=createRequire(import.meta.url),{_electron}=require('playwright'),root=resolve('.');
const previous=resolve(process.argv[2]||'');assert.ok(previous.startsWith(resolve('artifacts/companions')+sep));
const prior=JSON.parse(readFileSync(join(previous,'evidence.json'),'utf8'));assert.equal(prior.passed,true);assert.equal(prior.defaultProductionEntrypoint,true);assert.equal(prior.mode,'live');assert.equal(prior.checks.length,7);
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),build=JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json','utf8'));assert.equal(build.sourceCommit,sourceCommit);
const output=mkdtempSync(join(resolve('artifacts/companions'),'guard-native-')),owner=prior.checks[0].owner,petId=prior.checks[1].petIds[0],resourceId=prior.checks[5].resourceId;
const report={at:new Date().toISOString(),sourceCommit,buildSource:build.sourceCommit,buildFingerprint:build.canonicalSourceFingerprint,fullRun:{runId:prior.runId,sourceCommit:prior.sourceCommit},mode:'live',physicalDevices:1,scope:'Targeted final-source production restart, encrypted session resume, actual main cached replay/interact, specified custom resource native pixels; full offline seven groups are separate earlier-source evidence',checks:[],errors:[],passed:false};
const save=()=>writeFileSync(join(output,'evidence.json'),JSON.stringify(report,null,2)+'\n');
const opened=[];
const invoke=async(model,feature,command,payload={})=>{const result=await model.page.evaluate(input=>window.lingjing.invoke(input.feature,input.command,input.payload),{feature,command,payload});assert.equal(result.ok,true,`${feature}:${command} ${result.code}`);return result.data;};
function query(label,sql,args){const db=new DatabaseSync(join(previous,label,'lingjing.sqlite'),{readOnly:true});try{db.exec('PRAGMA query_only=ON');return db.prepare(sql).get(...args);}finally{db.close();}}
async function list(model,check){for(let i=0;i<30;i++){const data=await invoke(model,'companions','list');if(check(data))return data;await delay(300);}throw Error('Final-source companion readback did not settle');}
try{
  for(const label of['A','B']){
    const env={...process.env,PET_USER_DATA_DIR:join(previous,label)};for(const key of['ELECTRON_RUN_AS_NODE','LINGJING_QA_SCENARIO','LINGJING_LEGACY_AUTH','PET_RUNTIME_DATA_FILE','ELECTRON_RENDERER_URL'])delete env[key];
    const app=await _electron.launch({executablePath:require('electron'),args:[root,'--force-device-scale-factor=1'],cwd:root,env}),page=await app.firstWindow();page.setDefaultTimeout(20000);page.on('pageerror',error=>report.errors.push(error.message));await page.waitForFunction(()=>Boolean(window.lingjing));
    const model={label,app,page};opened.push(model);const session=await invoke(model,'accounts','session');assert.equal(session.currentUser.id,owner);assert.equal(session.persistence,'secure');
    const runtime=await app.evaluate(()=>{const module=Object.values(process.getBuiltinModule('module')._cache).find(m=>m.filename.endsWith('companions\\cloud-authority.cjs'));if(!module)throw Error('Production authority module not loaded');const source=module.exports.CloudCompanionAuthority.prototype.serial.toString();return{pid:process.pid,electron:process.versions.electron,queueOwnerChecks:(source.match(/this\.current\(owner\)/g)||[]).length,serialSha256:process.getBuiltinModule('crypto').createHash('sha256').update(source).digest('hex')};});assert.equal(runtime.queueOwnerChecks,2);
    await list(model,s=>s.sync?.status==='ready'&&s.sync.pending===0&&s.pets.some(p=>p.petId===petId));
    const input=JSON.parse(query(label,'SELECT result FROM account_actions WHERE owner_account_id=? AND action_id=?',[owner,'companions:'+prior.checks[1].originalActionId]).result).input;
    assert.equal((await invoke(model,'companions','adopt',input)).pet.petId,petId);
    report.checks.push({name:'Final-source production process resumes encrypted original device and replays cached adoption',label,...runtime,deviceId:JSON.parse(readFileSync(join(previous,label,'accounts/device.json'),'utf8')).deviceId});save();
  }
  assert.notEqual(report.checks[0].pid,report.checks[1].pid);assert.notEqual(report.checks[0].deviceId,report.checks[1].deviceId);
  const [a,b]=opened,before=await invoke(a,'companions','get',{petId}),input={actionId:randomUUID(),petId};
  const touched=await invoke(a,'companions','interact',input);await invoke(b,'companions','interact',input);
  const state=await list(b,s=>s.pets.find(p=>p.petId===petId)?.growth.affinity===touched.pet.growth.affinity),after=state.pets.find(p=>p.petId===petId);
  assert.equal(after.growth.mood,Math.min(100,before.growth.mood+2));assert.equal(after.growth.affinity,Math.min(100,before.growth.affinity+1));assert.equal(after.growth.experience,before.growth.experience);
  report.checks.push({name:'Actual production interact and same-action replay award fixed mood/affinity only once across clients',actionId:input.actionId,petId,before:before.growth,after:after.growth});save();
  await invoke(a,'companions','desktop',{actionId:randomUUID(),petId,visible:true});await list(b,s=>s.pets.find(p=>p.petId===petId)?.desktop.visible);
  for(const model of opened){
    let page;for(let i=0;i<40;i++){page=model.app.windows().find(p=>p.url().includes(`#/desktop/${petId}`));if(page)break;await delay(200);}assert.ok(page);
    await page.locator(`.cp-desktop-surface[data-resource-id="${resourceId}"] .resource-stage[data-status="ready"][data-resource-id="${resourceId}"] canvas`).waitFor();await delay(300);
    const frame=await model.app.evaluate(async({BrowserWindow},id)=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes(`#/desktop/${id}`)),image=await w.capturePage(),pixels=image.toBitmap();let colored=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>10&&Math.max(pixels[i],pixels[i+1],pixels[i+2])-Math.min(pixels[i],pixels[i+1],pixels[i+2])>20)colored++;return{pid:process.pid,windowId:w.id,visible:w.isVisible(),coloredPixels:colored,bounds:w.getBounds(),png:image.toPNG().toString('base64')};},petId);
    assert.ok(frame.visible&&frame.coloredPixels>500);const png=Buffer.from(frame.png,'base64');delete frame.png;writeFileSync(join(output,'native-'+model.label+'.png'),png);report.checks.push({name:'Final-source actual native specified custom2D frame',label:model.label,resourceId,petId,...frame,sha256:createHash('sha256').update(png).digest('hex')});save();
  }
  await invoke(a,'companions','desktop',{actionId:randomUUID(),petId,visible:false});await list(b,s=>!s.pets.find(p=>p.petId===petId)?.desktop.visible);report.passed=true;
}catch(error){report.failure={name:error.name,message:error.message};process.exitCode=1;}
finally{for(const model of opened){const child=model.app.process(),exit=child.exitCode===null?new Promise(resolve=>child.once('exit',resolve)):Promise.resolve();await model.app.evaluate(({app})=>app.exit(0)).catch(()=>{});await exit;}save();console.log(JSON.stringify({passed:report.passed,output,checks:report.checks.length,failure:report.failure}));}
