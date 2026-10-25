import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createServer} from 'node:http';
import {connect} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';

// Actual default production entrypoint, preload IPC and rendered/native windows.
// HTTPS is end-to-end TLS through a test-process-only CONNECT proxy. This does
// not replace Auth, command replies or any server with a simulated provider.
const require=createRequire(import.meta.url),{_electron}=require('playwright');
const {SupabaseRemote,publicConfig,decodeProof}=require('../../accounts/supabase-remote.cjs');
const root=resolve('.'),config=publicConfig();assert.equal(new URL(config.url).hostname,'jbvrdmrkwpznbrvteive.supabase.co');
const credentialFile=process.env.LINGJING_COMPANION_VERIFY_CREDENTIALS_DPAPI||process.env.LINGJING_COMPANION_VERIFY_CREDENTIALS;
assert.ok(credentialFile,'Explicit coordinator-created test credentials are required');
let bytes=readFileSync(credentialFile);
if(credentialFile.toLowerCase().endsWith('.dpapi')){
  const decrypt="Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $c=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($c))";
  bytes=Buffer.from(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',decrypt],{input:bytes.toString('base64'),encoding:'utf8',windowsHide:true}).trim(),'base64');
}
const credentials=JSON.parse(bytes.toString('utf8'));bytes.fill(0);assert.equal(credentials.testOnly,true);
const safe=value=>{let result=String(value);for(const c of[credentials.a,credentials.b])for(const secret of[c?.account,c?.password])if(secret)result=result.split(secret).join('[redacted]');return result;};
const parent=resolve('artifacts/companions');mkdirSync(parent,{recursive:true});const output=mkdtempSync(join(parent,'cloud-native-')),runId=randomUUID(),short=runId.slice(0,8);
const git=args=>execFileSync('git',args,{encoding:'utf8',windowsHide:true}).trim();
const evidence={at:new Date().toISOString(),runId,output,sourceCommit:git(['rev-parse','HEAD']),dirty:git(['status','--porcelain']),
  mode:'live',simulatedProvider:false,entrypoint:root,defaultProductionEntrypoint:true,physicalDevices:1,
  topology:'Two independent production Electron processes and SQLite/userData roots on one Windows host; independent Node HTTPS receipt reader',
  networkInterruption:'Only A uses a TLS CONNECT proxy; refusing/destroying A tunnels does not disable the host network or change HTTPS responses',checks:[],errors:[],passed:false};
const save=()=>writeFileSync(join(output,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
const pass=(name,detail={})=>{evidence.checks.push({name,...detail});save();console.log('PASS',name);};
const sockets=new Set();let proxyEnabled=true,connections=0,refused=0;
const proxy=createServer((_req,res)=>{res.writeHead(405);res.end();});
proxy.on('connect',(request,client,head)=>{
  sockets.add(client);client.on('error',()=>{});client.on('close',()=>sockets.delete(client));
  if(request.url!==new URL(config.url).hostname+':443'||!proxyEnabled){refused++;client.end('HTTP/1.1 502 Test connection refused\r\n\r\n');return;}
  const upstream=connect(443,new URL(config.url).hostname);sockets.add(upstream);connections++;
  upstream.on('error',()=>client.destroy());upstream.on('close',()=>{sockets.delete(upstream);client.destroy();});client.on('close',()=>upstream.destroy());
  upstream.once('connect',()=>{client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);client.pipe(upstream);upstream.pipe(client);});
});
await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));const proxyUrl=`http://127.0.0.1:${proxy.address().port}`;
const models=[];let a,b,reader;
const invoke=async(model,feature,command,payload={},ok=true)=>{
  const reply=await model.page.evaluate(input=>window.lingjing.invoke(input.feature,input.command,input.payload),{feature,command,payload});
  if(ok)assert.equal(reply.ok,true,`${feature}:${command} ${reply.code}: ${safe(reply.message)}`);return ok?reply.data:reply;
};
async function launch(label,proxied=false){
  const profile=join(output,label);mkdirSync(profile,{recursive:true});const env={...process.env,PET_USER_DATA_DIR:profile};
  for(const key of['ELECTRON_RUN_AS_NODE','LINGJING_QA_SCENARIO','LINGJING_LEGACY_AUTH','PET_RUNTIME_DATA_FILE','ELECTRON_RENDERER_URL'])delete env[key];
  if(proxied)Object.assign(env,{NODE_USE_ENV_PROXY:'1',HTTPS_PROXY:proxyUrl,HTTP_PROXY:proxyUrl,https_proxy:proxyUrl,http_proxy:proxyUrl,NO_PROXY:'',no_proxy:''});
  const app=await _electron.launch({executablePath:require('electron'),args:[root,'--force-device-scale-factor=1'],cwd:root,env,timeout:30000});
  const page=await app.firstWindow();page.setDefaultTimeout(20000);page.on('pageerror',error=>{evidence.errors.push({label,message:safe(error.message)});save();});await page.waitForFunction(()=>Boolean(window.lingjing));
  await app.evaluate(({BrowserWindow},label)=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html'));w.setContentSize(1280,844);w.setTitle('灵境 · 伙伴真实云同步 '+label);},label);
  const model={app,page,profile,label,pid:app.process().pid,stopped:false};models.push(model);return model;
}
async function stop(model){if(!model||model.stopped)return;model.stopped=true;const child=model.app.process(),done=child.exitCode===null?new Promise(resolve=>child.once('exit',resolve)):Promise.resolve();await model.app.evaluate(({app})=>app.exit(0)).catch(()=>{});await done;}
async function until(model,predicate,label){for(let i=0;i<45;i++){const data=await invoke(model,'companions','list');if(predicate(data))return data;await delay(350);}throw Error(label);}
function query(model,sql,args=[]){const db=new DatabaseSync(join(model.profile,'lingjing.sqlite'),{readOnly:true});try{db.exec('PRAGMA query_only=ON');return db.prepare(sql).all(...args);}finally{db.close();}}
const savedPet=(model,owner,petId)=>JSON.parse(query(model,'SELECT data_json FROM companion_pets WHERE owner_account_id=? AND pet_id=?',[owner,petId])[0].data_json);
async function native(model,petId){
  for(let i=0;i<50;i++){const page=model.app.windows().find(p=>p.url().includes(`#/desktop/${petId}`));if(page){await page.locator('.resource-stage[data-status="ready"] canvas').waitFor({timeout:20000});return page;}await delay(200);}throw Error('Actual native window not ready');
}
async function drag(model,petId,dx,dy,ok=true){
  const page=await native(model,petId),bounds=await model.app.evaluate(({BrowserWindow},id)=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes(`#/desktop/${id}`)).getBounds(),petId);
  const request=(action,point={})=>page.evaluate(payload=>window.lingjing.invoke('companions','desktopInput',payload),{petId,action,...point});
  assert.equal((await request('drag-start',{screenX:bounds.x+80,screenY:bounds.y+90})).ok,true);
  assert.equal((await request('drag-move',{screenX:bounds.x+80+dx,screenY:bounds.y+90+dy})).ok,true);
  const result=await request('drag-end');assert.equal(result.ok,ok,`${result.code}: ${safe(result.message)}`);return result;
}
async function capture(model,petId,name,resourceId){
  const page=await native(model,petId);
  if(resourceId)await page.locator(`.cp-desktop-surface[data-resource-id="${resourceId}"] .resource-stage[data-status="ready"][data-resource-id="${resourceId}"] canvas`).waitFor();
  await delay(400);
  const frame=await model.app.evaluate(async({BrowserWindow},id)=>{const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes(`#/desktop/${id}`)),image=await win.capturePage(),bitmap=image.toBitmap();let visible=0,colored=0;for(let i=0;i<bitmap.length;i+=4){if(bitmap[i+3]>10)visible++;if(bitmap[i+3]>10&&Math.max(bitmap[i],bitmap[i+1],bitmap[i+2])-Math.min(bitmap[i],bitmap[i+1],bitmap[i+2])>20)colored++;}return{windowId:win.id,visible:win.isVisible(),bounds:win.getBounds(),size:image.getSize(),visiblePixels:visible,coloredPixels:colored,png:image.toPNG().toString('base64')};},petId);
  assert.ok(frame.visible&&frame.visiblePixels>1000&&frame.coloredPixels>500);const png=Buffer.from(frame.png,'base64');delete frame.png;writeFileSync(join(output,name),png);return{...frame,file:name,sha256:createHash('sha256').update(png).digest('hex')};
}
try{
  a=await launch('A',true);b=await launch('B');assert.notEqual(a.pid,b.pid);
  for(const model of[a,b]){await invoke(model,'accounts','login',{provider:'runtime',...credentials.a,rememberSession:true});const session=await invoke(model,'accounts','session');assert.equal(session.currentUser.authKind,'supabase');assert.equal(session.persistence,'secure');assert.ok(!JSON.stringify(session).includes(credentials.a.password));}
  assert.ok(connections>0,'A production Node HTTPS must actually traverse the test proxy before any offline claim');
  const session=await invoke(a,'accounts','session'),owner=session.currentUser.id;
  const devices=[a,b].map(m=>JSON.parse(readFileSync(join(m.profile,'accounts/device.json'),'utf8')).deviceId);assert.notEqual(devices[0],devices[1]);
  pass('Two default production Electron processes authenticate via actual HTTPS and retain separate encrypted device sessions',{owner,pids:[a.pid,b.pid],devices,proxyConnections:connections});
  const baseline=await until(a,s=>s.sync?.status==='ready','Initial cloud snapshot did not settle'),originalIds=baseline.pets.map(p=>p.petId);
  const firstInput={actionId:randomUUID(),templateId:'big-fish-gentle',name:'桌面甲'+short,showOnDesktop:false};
  const first=(await invoke(a,'companions','adopt',firstInput)).pet;
  const replay=await invoke(b,'companions','adopt',firstInput);assert.equal(replay.pet.petId,first.petId);
  const second=(await invoke(b,'companions','adopt',{...firstInput,actionId:randomUUID(),name:'桌面乙'+short})).pet;
  assert.notEqual(first.petId,second.petId);let state=await until(a,s=>s.pets.some(p=>p.petId===second.petId),'Second client pet missing');
  assert.equal(state.pets.length,originalIds.length+2);assert.ok(originalIds.every(id=>state.pets.some(p=>p.petId===id)));
  for(const[model,slot,petId]of[[a,'chatPetId',first.petId],[b,'battlePetId',second.petId],[a,'guardPetId',first.petId]])await invoke(model,'companions','select',{actionId:randomUUID(),slot,petId});
  state=await until(b,s=>s.selections.guardPetId===first.petId,'Independent selections missing');assert.deepEqual(state.selections,{chatPetId:first.petId,battlePetId:second.petId,guardPetId:first.petId});
  pass('Real production IPC adopts independent same-template pets, replays one original action and preserves three independent selections',{petIds:[first.petId,second.petId],originalActionId:firstInput.actionId,preservedExistingIds:originalIds.length});
  const old=(await invoke(a,'companions','list')).pets.find(p=>p.petId===first.petId);
  const races=await Promise.all([a,b].map((m,i)=>invoke(m,'companions','rename',{actionId:randomUUID(),petId:first.petId,expectedRevision:old.revision,name:'并发'+i+short},false)));
  assert.equal(races.filter(r=>r.ok).length,1);assert.ok(races.some(r=>['REVISION_CONFLICT','SYNC_CONFLICT'].includes(r.code)));
  pass('Actual concurrent stale-revision rename has one winner and a visible conflict',{results:races.map(r=>r.ok?'ok':r.code)});
  const display=await a.app.evaluate(({screen})=>String(screen.getPrimaryDisplay().id));
  await invoke(a,'companions','desktop',{actionId:randomUUID(),petId:first.petId,visible:true,behavior:'quiet',scale:1,position:{x:140,y:160,displayId:display}});
  await drag(a,first.petId,75,40);let position=savedPet(a,owner,first.petId).desktop.position;
  await until(b,s=>JSON.stringify(s.pets.find(p=>p.petId===first.petId)?.desktop.position)===JSON.stringify(position),'Native drag not independently read back');
  const frame=await capture(a,first.petId,'native-builtin.png',first.resource.resourceId);pass('Real native 2D pixels render and drag traverses renderer IPC, cloud receipt and independent client readback',{position,frame});
  proxyEnabled=false;for(const socket of sockets)socket.destroy();
  const refusedDrag=await drag(a,first.petId,45,30,false);assert.equal(refusedDrag.code,'CLOUD_UNAVAILABLE');assert.ok(refused>0);
  const pending=query(a,"SELECT action_id,input_hash,result FROM account_actions WHERE owner_account_id=? AND kind='companions-cloud-command' AND json_extract(result,'$.status') IN ('pending','retry')",[owner]);assert.ok(pending.length);
  const intent=pending.find(row=>JSON.parse(row.result).nativePosition);assert.ok(intent);const draft=JSON.parse(intent.result);assert.equal(draft.sentAt,undefined);assert.equal(draft.baseRevision,null);
  await a.page.evaluate(()=>{location.hash='#/companions';});await a.page.locator('.cp-cloud-notice').filter({hasText:'待云端确认'}).waitFor();await a.page.screenshot({path:join(output,'offline-pending.png')});
  const priorPid=a.pid,deviceBefore=devices[0];await stop(a);
  await invoke(b,'companions','rename',{actionId:randomUUID(),petId:second.petId,name:'联网乙'+short});
  proxyEnabled=true;a=await launch('A',true);
  const resumed=await invoke(a,'accounts','session');assert.equal(resumed.currentUser.id,owner);assert.equal(resumed.persistence,'secure');assert.notEqual(a.pid,priorPid);
  await until(a,s=>s.sync?.pending===0&&JSON.stringify(s.pets.find(p=>p.petId===first.petId)?.desktop.position)===JSON.stringify(draft.input.position),'Original offline position did not resume after restart');
  const after=query(a,'SELECT input_hash,result FROM account_actions WHERE owner_account_id=? AND action_id=?',[owner,intent.action_id])[0];assert.equal(after.input_hash,intent.input_hash);assert.equal(JSON.parse(after.result).status,'verified');assert.deepEqual(JSON.parse(after.result).input,draft.input);
  assert.equal(JSON.parse(readFileSync(join(a.profile,'accounts/device.json'),'utf8')).deviceId,deviceBefore);
  await until(b,s=>JSON.stringify(s.pets.find(p=>p.petId===first.petId)?.desktop.position)===JSON.stringify(draft.input.position),'B did not read restarted original position');
  pass('A-only TLS interruption preserves the original position intent across actual process restart while B stays online',{oldPid:priorPid,newPid:a.pid,deviceId:deviceBefore,actionId:intent.action_id,inputHash:intent.input_hash,position:draft.input.position,refusedConnections:refused,proxyConnections:connections});
  for(const model of[a,b]){const settings=await invoke(model,'accounts','settingsGet');settings.document.sync.enabled=true;await invoke(model,'accounts','settingsSave',{actionId:randomUUID(),revision:settings.revision,document:settings.document});}
  await a.app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},resolve('apps/pc-app/runtime/features/resources/assets/roster-v2/qingya/character.json'));
  const imported=await invoke(a,'resources','import'),resourceId=imported.resource.id;
  let published=false;for(let i=0;i<50;i++){const rows=query(a,"SELECT authority_revision,authority_action_id FROM lingjing_resource_cloud_receipts WHERE owner_account_id=? AND resource_id=? AND data_mode='live' AND authority_revision>0",[owner,resourceId]);if(rows.length){published=true;break;}const status=await invoke(a,'resources','cloudStatus');if(!status.running)await invoke(a,'resources','cloudSync',{actionId:randomUUID(),resourceIds:[resourceId]});await delay(400);}assert.ok(published,'Real resource authority receipt missing');
  await invoke(a,'companions','appearance',{actionId:randomUUID(),petId:first.petId,resourceId});
  for(let i=0;i<40;i++){const list=await invoke(b,'resources','list');if(list.some(r=>r.id===resourceId&&r.availability==='ready'))break;await invoke(b,'resources','cloudPull',{resourceIds:[resourceId]});await delay(300);}
  state=await until(b,s=>s.pets.find(p=>p.petId===first.petId)?.resource.resourceId===resourceId,'Verified custom appearance missing');
  assert.equal((await invoke(b,'resources','list')).find(r=>r.id===resourceId)?.availability,'ready');
  const customFrame=await capture(a,first.petId,'native-custom.png',resourceId),secondFrame=await capture(b,first.petId,'native-custom-B.png',resourceId);pass('Actual private resource upload/reference authorizes custom 2D appearance and a fresh second-client resource becomes ready',{resourceId,contentHash:imported.resource.contentHash,frame:customFrame,secondFrame});
  const readProfile=join(output,'independent-reader');mkdirSync(readProfile);const remote=new SupabaseRemote({userData:readProfile,config}),user=await remote.login(credentials.a.account,credentials.a.password),privateSession={...user,ownerAccountId:user.id,cloudProof:user.proof};remote.setCurrentUser(privateSession);reader={remote,privateSession};
  const exact=await remote.invoke(privateSession,'lingjing-save',{op:'read',actionId:intent.action_id});assert.equal(exact.checksum,JSON.parse(after.result).result.cloud.checksum);assert.equal(exact.kind,'authority');
  const cloud=await remote.invoke(privateSession,'companions-sync',{op:'snapshot'});assert.equal(cloud.module.data.tables.companion_actions.filter(row=>row.action_id===draft.input.actionId).length,1);
  for(const model of[a,b]){const data=savedPet(model,owner,first.petId);assert.equal(data.petId,first.petId);assert.deepEqual(data.desktop.position,draft.input.position);await model.page.evaluate(()=>{location.hash='#/companions';});await model.page.locator('.cp-pet-card').first().waitFor();await model.page.screenshot({path:join(output,`client-${model.label}.png`)});}
  const finalFrame=await capture(a,first.petId,'native-after-restart.png',resourceId);pass('Independent actual HTTPS receipt reader and query-only SQLite confirm one original position action, stable pet IDs and rendered restart state',{actionId:intent.action_id,revision:exact.revision,checksum:exact.checksum,readerDevice:decodeProof(user.proof).actor.deviceId,frame:finalFrame});
  await invoke(a,'companions','desktop',{actionId:randomUUID(),petId:first.petId,visible:false});
  evidence.cleanup={onlyThisRunsVisiblePetHidden:first.petId,historyAndResourcesRetained:true};evidence.passed=true;save();
}catch(error){evidence.failure={name:error.name,message:safe(error.message),stack:safe(error.stack)};process.exitCode=1;}
finally{
  proxyEnabled=true;
  if(reader)await reader.remote.signOut(reader.privateSession).catch(error=>evidence.errors.push({cleanup:'reader-signout',message:safe(error.message)}));
  for(const model of models)await stop(model).catch(error=>evidence.errors.push({message:safe(error.message)}));
  for(const socket of sockets)socket.destroy();await new Promise(resolve=>proxy.close(resolve));save();console.log(JSON.stringify({passed:evidence.passed,output,checks:evidence.checks.length,failure:evidence.failure?.message}));
}
