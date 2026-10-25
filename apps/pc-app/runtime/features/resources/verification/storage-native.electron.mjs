// Actual production Electron/Pixi UI; transfer is an explicitly labelled localhost protocol fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync,spawn} from 'node:child_process';
const root=process.cwd(),require=createRequire(import.meta.url),{_electron}=require('playwright');
const {provisionQaProfile}=require('../../accounts/qa-scenario.cjs'),{storageFixture}=require('./storage-http-fixture.cjs');
const directory=path.join(root,'artifacts/resources/cloud-native-'+Date.now());await fs.mkdir(directory);
const profileA=path.join(directory,'A'),profileB=path.join(directory,'B'),marker=provisionQaProfile(profileA);
const http=await storageFixture(),opened=[],stopped=new WeakSet();
const report={at:new Date().toISOString(),runtimeSourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dataSource:{mode:'simulated',cloudVerified:false,transfer:'official SDK over explicit localhost fixture',ui:'production Electron and actual Pixi; two separate processes and profile roots',physicalDevices:1},owner:null,views:[],errors:[],passed:false};
const account='storageqa_'+randomUUID().slice(0,8),password='Fixture_'+randomUUID();
async function launch(profile){
  const env={...process.env,PET_USER_DATA_DIR:profile,LINGJING_QA_SCENARIO:'unified-battle'};delete env.ELECTRON_RUN_AS_NODE;delete env.PET_RUNTIME_DATA_FILE;
  const app=await _electron.launch({executablePath:require('electron'),args:[root],cwd:root,env,timeout:20000});opened.push(app);const page=await app.firstWindow();page.setDefaultTimeout(10000);
  page.on('pageerror',error=>report.errors.push(error.message));await page.waitForFunction(()=>Boolean(window.lingjing));
  const invoke=async(feature,command,payload={})=>{const result=await page.evaluate(input=>window.lingjing.invoke(input.feature,input.command,input.payload),{feature,command,payload});assert(result.ok,`${feature}:${command} ${result.code}`);return result.data;};
  return {app,page,invoke};
}
async function stop(application){
  if(stopped.has(application))return;stopped.add(application);
  const child=application.process(),exited=child.exitCode!==null?Promise.resolve():new Promise(resolve=>child.once('exit',resolve));
  await application.evaluate(({app})=>app.exit(0)).catch(()=>{});await exited;
}
try{
  const first=await launch(profileA);const startup=await first.app.evaluate(({app})=>app.getLoginItemSettings().openAtLogin);
  await first.invoke('accounts','register',{provider:'local',account,username:'资源恢复验收',password,confirmPassword:password,rememberSession:false});
  const session=await first.invoke('accounts','session');assert.equal(session.dataMode,'simulated');report.owner=session.currentUser.id;
  assert.equal(await first.app.evaluate(({app})=>app.getLoginItemSettings().openAtLogin),startup);
  await stop(first.app);
  // Both originate in this fresh explicit QA run, never an ordinary or user account profile.
  await fs.cp(profileA,profileB,{recursive:true,filter:file=>!['Cache','Code Cache','GPUCache','DawnGraphiteCache','DawnWebGPUCache','SingletonLock','SingletonCookie','SingletonSocket'].includes(path.basename(file))});
  await fs.writeFile(path.join(profileB,'.lingjing-qa-profile.json'),JSON.stringify({...marker,profilePath:await fs.realpath(profileB)},null,2)+'\n');
  const prepared=path.join(directory,'prepared.json'),jobFile=path.join(directory,'fixture-job.json');
  await fs.writeFile(jobFile,JSON.stringify({simulated:true,url:http.url,uid:randomUUID(),owner:report.owner,A:profileA,B:profileB,output:prepared}));
  await new Promise((resolve,reject)=>{const child=spawn(require('electron'),['apps/pc-app/runtime/features/resources/verification/seed-storage-native.cjs',jobFile],{cwd:root,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v);child.on('exit',code=>code===0?resolve():reject(Error(output)));});
  report.transfer=JSON.parse(await fs.readFile(prepared,'utf8'));
  const applications=[await launch(profileA),await launch(profileB)];assert.notEqual(applications[0].app.process().pid,applications[1].app.process().pid);
  for(const [index,current]of applications.entries()){
    await current.invoke('accounts','login',{provider:'local',account,password,rememberSession:false});
    const session=await current.invoke('accounts','session');assert.equal(session.currentUser.id,report.owner);assert.equal(session.dataMode,'simulated');
    await current.app.evaluate(({BrowserWindow},label)=>{const w=BrowserWindow.getAllWindows()[0];w.setTitle('灵境 · 资源双客户端恢复自验 '+label);w.setContentSize(1280,844);},index?'B':'A');
    await current.page.getByRole('button',{name:'角色资源',exact:true}).click();
    const resource=(await current.invoke('resources','list')).find(r=>r.id===report.transfer.resourceId);assert(resource);assert.equal(resource.contentHash,report.transfer.contentHash);assert.equal(resource.availability,'ready');
    await current.page.locator(`.resource-card[data-resource-id="${resource.id}"]`).click();
    const stage=current.page.locator(`.resource-stage[data-resource-id="${resource.id}"]`).first();await stage.locator('[data-renderer="pixi-spritesheet"][data-texture-frame]').waitFor();
    const host=await stage.locator('.resource-sprite-host').evaluate(element=>({...element.dataset}));assert.equal(host.renderer,'pixi-spritesheet');
    const cloudStatus=await current.invoke('resources','cloudStatus');assert.equal(cloudStatus.enabled,false);assert.equal(cloudStatus.lastVerifiedAt,null,'The fixture receipt must never be presented as live cloud verification');
    const screenshot=`client-${index?'B':'A'}.png`;await current.page.screenshot({path:path.join(directory,screenshot)});
    report.views.push({label:index?'B':'A',pid:current.app.process().pid,profile:path.relative(root,index?profileB:profileA),owner:session.currentUser.id,resourceId:resource.id,contentHash:resource.contentHash,host,cloudStatus,screenshot});
  }
  assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure=error.stack;throw error;}
finally{for(const app of opened)try{await stop(app);}catch{}await http.close();await fs.writeFile(path.join(directory,'evidence.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,evidence:path.relative(root,path.join(directory,'evidence.json'))}));}
