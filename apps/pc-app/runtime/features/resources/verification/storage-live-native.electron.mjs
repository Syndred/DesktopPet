// Two real Electron processes, production typed main/preload, real Auth/HTTPS Storage.
// Login material is supplied through stdin, never arguments, screenshots, or evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=process.cwd(),require=createRequire(import.meta.url),{_electron}=require('playwright');
let raw='';for await(const part of process.stdin){raw+=part;if(raw.length>4096)throw Error('Private test input is too large');}
const login=JSON.parse(raw);raw='';
if(!login.account||!login.password||!login.resourceId||!process.env.LINGJING_PUBLIC_CONFIG)throw Error('Coordinator-approved live test login and resource ID are required');
const directory=path.join(root,'artifacts/resources/cloud-real-electron-'+Date.now());await fs.mkdir(directory);
const report={at:new Date().toISOString(),runtimeSourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dataSource:{mode:'live',simulated:false,topology:'Two independent production Electron processes and userData roots on one physical machine',physicalDevices:1},views:[],errors:[],passed:false};
report.buildProvenance=JSON.parse(await fs.readFile(path.join(root,'apps/pc-app/dist/build-manifest.json'),'utf8'));
const open=[],stopped=new WeakSet();
async function stop(app){if(stopped.has(app))return;stopped.add(app);const cp=app.process(),exit=cp.exitCode===null?new Promise(resolve=>cp.once('exit',resolve)):Promise.resolve();await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await exit;}
try{
  for(const label of ['A','B']){
    const profile=path.join(directory,label);await fs.mkdir(profile);
    const env={...process.env,PET_USER_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.LINGJING_QA_SCENARIO;delete env.PET_RUNTIME_DATA_FILE;
    const app=await _electron.launch({executablePath:require('electron'),args:[root],cwd:root,env,timeout:25000});open.push(app);const page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',error=>report.errors.push(error.message));
    await page.waitForFunction(()=>Boolean(window.lingjing));
    const invoke=async(feature,command,payload={})=>{const response=await page.evaluate(input=>window.lingjing.invoke(input.feature,input.command,input.payload),{feature,command,payload});assert(response.ok,`${feature}:${command}: ${response.code}`);return response.data;};
    const startupBefore=await app.evaluate(({app})=>app.getLoginItemSettings().openAtLogin);
    assert.equal(startupBefore,false,'This isolated live acceptance must not disable an existing startup setting');
    await invoke('accounts','login',{provider:'runtime',account:login.account,password:login.password,rememberSession:false});
    const session=await invoke('accounts','session');assert.equal(session.currentUser.authKind,'supabase');assert.equal(session.currentUser.authUserId,login.authUserId);assert.equal(session.currentUser.id,login.ownerAccountId);
    assert(!JSON.stringify(session).includes(login.password));assert(!/"(?:accessToken|refreshToken|cloudProof)"/.test(JSON.stringify(session)));
    const settings=await invoke('accounts','settingsGet');settings.document.sync.enabled=true;
    await invoke('accounts','settingsSave',{actionId:randomUUID(),revision:settings.revision,document:settings.document});
    // The registered account/settings event starts the normal resource recovery path.
    let resource,cloudStatus;
    for(let attempt=0;attempt<100;attempt++){
      resource=(await invoke('resources','list')).find(row=>row.id===login.resourceId);cloudStatus=await invoke('resources','cloudStatus');
      if(resource?.availability==='ready'&&cloudStatus.lastVerifiedAt&&!cloudStatus.running)break;
      if(!cloudStatus.running)await invoke('resources','cloudPull',{resourceIds:[login.resourceId]});
      await page.waitForTimeout(250);
    }
    assert(resource?.availability==='ready','The real resource never became available');assert(cloudStatus.lastVerifiedAt);assert.equal(cloudStatus.dataMode,'live');assert.equal(resource.contentHash,login.contentHash);
    if(label==='A'){
      const calibration=structuredClone(resource.calibration),actions=structuredClone(resource.actions);calibration.desktop.scale=1.18;calibration.desktop.rotationDeg=3;calibration.desktop.verticalOffset=0.03;calibration.desktop.mirrorX=true;calibration.battle.scale=1.2;actions.wave=actions.idle;
      await invoke('resources','save',{resourceId:resource.id,expectedRevision:resource.revision,calibration,actions});
      for(let attempt=0;attempt<80;attempt++){
        cloudStatus=await invoke('resources','cloudStatus');const pending=cloudStatus.preferenceUploads?.some(row=>['pending','retry','conflict'].includes(row.status));
        if(cloudStatus.lastPreferenceVerifiedAt&&!pending)break;
        if(!cloudStatus.running)await invoke('resources','cloudSync',{actionId:randomUUID(),resourceIds:[]});
        await page.waitForTimeout(250);
      }
    }
    resource=(await invoke('resources','list')).find(row=>row.id===login.resourceId);
    assert.equal(resource.calibration.desktop.scale,1.18);assert.equal(resource.calibration.desktop.rotationDeg,3);assert.equal(resource.calibration.desktop.mirrorX,true);assert.equal(resource.actions.wave,resource.actions.idle);
    const cloudPreview=await invoke('accounts','cloudPreview');
    const cloudRestore=await invoke('accounts','backupRestore',{previewId:cloudPreview.previewId,actionId:randomUUID(),mode:'merge'});
    assert.equal(cloudRestore.restored,true);
    const preserved=JSON.parse(await fs.readFile(cloudRestore.preservedBackup.filePath,'utf8'));
    assert.equal(preserved.data.modules['character-resources'].version,1);
    assert(preserved.data.modules['character-resources'].data.resources.some(row=>row.row.resource_id===resource.id));
    assert.equal((await invoke('resources','list')).find(row=>row.id===resource.id)?.contentHash,login.contentHash);
    const customPet=login.petId?await invoke('companions','get',{petId:login.petId}):null;if(customPet){assert.equal(customPet.resource.resourceId,resource.id);assert.equal(customPet.petId,login.petId);}
    await app.evaluate(({BrowserWindow},label)=>{const window=BrowserWindow.getAllWindows()[0];window.setTitle('灵境 · 真实云端资源恢复 '+label);window.setContentSize(1280,844);},label);
    await page.getByRole('button',{name:'角色资源',exact:true}).click();await page.locator(`.resource-card[data-resource-id="${resource.id}"]`).click();
    await page.waitForFunction(id=>document.querySelector(`.resource-stage[data-resource-id="${id}"]`)?.dataset.status==='ready',resource.id);await page.waitForTimeout(200);
    const host=await page.locator(`.resource-stage[data-resource-id="${resource.id}"] .resource-sprite-host`).evaluate(element=>({...element.dataset}));assert.equal(host.renderer,'pixi-spritesheet');
    const screenshot='client-'+label+'.png';await page.screenshot({path:path.join(directory,screenshot)});
    const startupAfter=await app.evaluate(({app})=>app.getLoginItemSettings().openAtLogin);assert.equal(startupAfter,startupBefore);
    const actor=await page.evaluate(()=>window.lingjing.invoke('accounts','session'));assert(actor.ok);
    const device=JSON.parse(await fs.readFile(path.join(profile,'accounts/device.json'),'utf8'));
    const versions=await app.evaluate(()=>({...process.versions}));
    const readDb=new (require('better-sqlite3'))(path.join(profile,'lingjing.sqlite'),{readonly:true,fileMustExist:true});readDb.pragma('query_only=ON');
    let inspected;
    try{
      const rows=readDb.prepare('SELECT asset_key,file_path FROM lingjing_resource_files WHERE resource_id=? ORDER BY asset_key').all(resource.id),files=[];
      for(const row of rows){const bytes=await fs.readFile(row.file_path),sha256=createHash('sha256').update(bytes).digest('hex');const expected=login.expectedFiles?.find(file=>file.key===row.asset_key);if(expected){assert.equal(sha256,expected.sha256A);assert.equal(bytes.length,expected.bytes);}files.push({key:row.asset_key,bytes:bytes.length,sha256});}
      const {ResourcesService}=require('../service.cjs'),{ResourceCloudSync}=require('../cloud-sync.cjs'),{createResourceBackupAdapter}=require('../../../core/resource-backup.cjs');
      const reader=new ResourcesService({db:readDb,storageRoot:path.join(profile,'character-resources'),seedBuiltin:false});reader.cloud=new ResourceCloudSync({service:reader,getActor:()=>{throw Error('Read-only evidence inspection cannot authenticate');}});
      const adapter=createResourceBackupAdapter({db:readDb,get:name=>name==='resources'?reader:name==='resourceCloud'?reader.cloud:null});
      const view=adapter.cloudModule(session.currentUser.id,{version:1,data:adapter.export(session.currentUser.id)});assert.equal(view.version,2,'A normal verified nonempty preference must normalize to cloud v2');
      inspected={files,imports:readDb.prepare('SELECT import_id,resource_id,owner_account_id FROM lingjing_resource_imports WHERE owner_account_id=? AND resource_id=? ORDER BY import_id').all(session.currentUser.id,resource.id),preferenceState:readDb.prepare('SELECT resource_id,cloud_revision,local_revision,authority_action_id,authority_revision,authority_checksum FROM lingjing_resource_preference_state WHERE owner_account_id=? AND resource_id=?').get(session.currentUser.id,resource.id),resourceCloudView:view};
    }finally{readDb.close();}
    report.views.push({label,pid:app.process().pid,profile:path.relative(root,profile),owner:session.currentUser.id,authUserId:session.currentUser.authUserId,device,resourceId:resource.id,contentHash:resource.contentHash,host,cloudStatus,preferences:{calibration:resource.calibration,actions:resource.actions},inspection:inspected,customPet:customPet?{petId:customPet.petId,resource:customPet.resource,growth:customPet.growth}:null,versions,cloudRestore:{restored:true,cloudRevision:cloudPreview.cloudRevision,modules:cloudPreview.modules,preservedLocalResourceBackupVersion:1},startupBefore,startupAfter,screenshot});
  }
  assert.notEqual(report.views[0].pid,report.views[1].pid);assert.notEqual(report.views[0].device.deviceId,report.views[1].device.deviceId);assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.failure={code:error.code||'LIVE_ELECTRON_FAILED',message:String(error.message).replaceAll(login.password,'[redacted]')};throw error;}
finally{for(const app of open)try{await stop(app);}catch{}await fs.writeFile(path.join(directory,'evidence.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,evidence:path.relative(root,path.join(directory,'evidence.json'))}));}
