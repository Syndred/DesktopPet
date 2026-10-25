import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=resolve('.'),configFile=resolve(process.argv[2]||'artifacts/garden/cloud/private-clients.json'),config=JSON.parse(readFileSync(configFile,'utf8'));
assert.equal(config.testOnly,true);assert.equal(config.projectUrl,'https://jbvrdmrkwpznbrvteive.supabase.co');
config.native||={account:`gardennative_${config.runId.slice(0,8)}`,password:`Garden-${randomBytes(20).toString('base64url')}`,username:'园地桌面验收',scenarioId:`native-${config.runId.slice(0,8)}`,profiles:[resolve(config.output,'electron-a'),resolve(config.output,'electron-b')]};
const settings=config.native;writeFileSync(configFile,JSON.stringify(config,null,2)+'\n');
const output=resolve(config.output,'electron');mkdirSync(output,{recursive:true});const evidenceFile=join(output,'evidence.json');
const evidence=existsSync(evidenceFile)?JSON.parse(readFileSync(evidenceFile,'utf8')):{at:new Date().toISOString(),sourceSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),kind:'two actual Electron44 processes, production TypeScript main/preload and React renderer, real Supabase HTTPS, isolated profiles on one Windows host',locationSource:'explicit simulated QA fix signed by real main-process CloudLocationProofs with Windows safeStorage key; coordinator-only server grant required',physicalTwoDeviceAcceptance:false,checks:[],actors:[],passed:false};
const models=[],save=()=>writeFileSync(evidenceFile,JSON.stringify(evidence,null,2)+'\n');
evidence.runs||=[];evidence.runs.push({at:new Date().toISOString(),sourceSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),runtimeFiles:Object.fromEntries(['garden/cloud-authority.cjs','garden/index.cjs','garden/migrations.cjs','battle/index.cjs'].map(path=>[path,createHash('sha256').update(readFileSync(resolve('apps/pc-app/runtime/features',path))).digest('hex')])),buildManifest:JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json','utf8'))});save();
function pass(name,data={}){evidence.checks.push({name,...data});save();console.log(JSON.stringify({passed:name,...data}));}
async function invoke(model,feature,command,payload={},expect=true){const result=await model.page.evaluate(({feature,command,payload})=>window.lingjing.invoke(feature,command,payload),{feature,command,payload});if(expect)assert.equal(result.ok,true,`${result.code}: ${result.message}`);return expect?result.data:result;}
async function launch(index){
  const profile=settings.profiles[index];mkdirSync(profile,{recursive:true});const env={...process.env,PET_USER_DATA_DIR:profile,LINGJING_PUBLIC_CONFIG:resolve('config/lingjing-cloud-public.json')};
  for(const key of ['ELECTRON_RUN_AS_NODE','LINGJING_QA_SCENARIO','LINGJING_LEGACY_AUTH','PET_RUNTIME_DATA_FILE','LINGJING_SUPABASE_URL','LINGJING_SUPABASE_PUBLISHABLE_KEY','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY'])delete env[key];
  const app=await electron.launch({args:[resolve('apps/pc-app/runtime/features/accounts/tests/native-cloud.fixture.cjs')],cwd:root,env});
  const page=await app.firstWindow();page.setDefaultTimeout(30_000);await page.waitForFunction(()=>Boolean(window.lingjing));
  const model={app,page,index,profile,pid:app.process().pid};models.push(model);page.on('pageerror',error=>{evidence.rendererErrors||=[];evidence.rendererErrors.push({index,message:error.message});});
  await app.evaluate(({BrowserWindow},index)=>{const win=BrowserWindow.getAllWindows()[0];win.setSize(1280,844);win.setTitle(`灵境 · 云端模拟定位验收 ${index?'B':'A'}`);},index);
  await page.evaluate(()=>{location.hash='#/account';});return model;
}
async function login(model){
  let state=await invoke(model,'accounts','session');
  if(!state.currentUser){
    const {page}=model;await page.getByRole('heading',{name:'欢迎回来',exact:true}).waitFor();
    const register=model.index===0&&!settings.registered;
    if(register){await page.getByRole('tab',{name:'注册',exact:true}).click();await page.getByLabel('用户名',{exact:true}).fill(settings.username);}
    await page.getByLabel('账号',{exact:true}).fill(settings.account);await page.getByLabel('密码',{exact:true}).fill(settings.password);
    if(register)await page.getByLabel('确认密码',{exact:true}).fill(settings.password);
    await page.getByRole('checkbox',{name:'保持登录',exact:true}).check();await page.getByRole('button',{name:register?'创建账号 →':'登录进入 →',exact:true}).click();
    await page.locator('.app-shell:not(.is-auth)').waitFor();state=await invoke(model,'accounts','session');
    if(register){settings.registered=true;writeFileSync(configFile,JSON.stringify(config,null,2)+'\n');}
  }
  assert.equal(state.persistence,'secure');
  const native=await model.app.evaluate(async({app,safeStorage})=>{
    const s=globalThis.__accountsCloudAcceptanceServices,a=s.get('accounts'),actor=await a.requireCloudActor(),fs=globalThis.__accountsCloudAcceptanceRequire('node:fs'),bytes=fs.readFileSync(a.vault.file),proof=a.remote.active;
    return {actor:actor.actor||JSON.parse(JSON.stringify(actor)),electron:process.versions.electron,userData:app.getPath('userData'),encrypted:safeStorage.isEncryptionAvailable()&&!bytes.includes(Buffer.from(proof.accessToken))&&!bytes.includes(Buffer.from(proof.refreshToken)),qaScenarioPresent:Boolean(s.get('qaScenario'))};
  });
  assert.equal(native.electron,'44.9.3');assert.equal(native.userData,model.profile);assert.equal(native.encrypted,true);assert.equal(native.qaScenarioPresent,false);evidence.actors[model.index]={...native,pid:model.pid};save();return native.actor;
}
async function productCall(model,name,body){const result=await model.app.evaluate(async(_electron,{name,body})=>{
  const services=globalThis.__accountsCloudAcceptanceServices,remote=services.get('accounts').remote,trace=[],original=remote.fetcher;
  remote.fetcher=async(url,options)=>{const response=await original(url,options);trace.push({path:new URL(String(url)).pathname,status:response.status});return response;};
  try{return{ok:true,data:await services.get('cloudActor').invoke(name,body)};}catch(error){return{ok:false,code:error.code,status:error.httpStatus,trace};}finally{remote.fetcher=original;}
},{name,body});if(!result.ok)throw Object.assign(new Error(`${name}: ${result.code} HTTP ${result.status} ${JSON.stringify(result.trace)}`),{code:result.code});return result.data;}
async function installSigner(model){
  const fix={lat:config.location.lat+.018,lng:config.location.lng+.018,coordinateSystem:'wgs84',source:'simulated',provider:'qa-discovery',scenarioId:settings.scenarioId,accuracyMeters:12};
  await model.app.evaluate(({app,safeStorage},fix)=>{
    const s=globalThis.__accountsCloudAcceptanceServices,load=globalThis.__accountsCloudAcceptanceRequire;
    const {CloudDiscoveryAuthority}=load(load('node:path').resolve('apps/pc-app/runtime/features/discovery/cloud-adapter.cjs'));
    const {CloudLocationProofs}=load(load('node:path').resolve('apps/pc-app/runtime/features/discovery/cloud-location.cjs'));
    const authority=new CloudDiscoveryAuthority({requireActor:()=>s.get('cloudActor').requireActor()}),proofs=new CloudLocationProofs({authority,getFix:()=>({...fix,timestampMs:Date.now()}),safeStorage,userData:app.getPath('userData')});
    s.provide('locationProofs',Object.freeze({prove:(purpose,reference)=>proofs.prove(purpose,reference)}));
  },fix);
}
async function snapshot(model){return invoke(model,'garden','snapshot');}
async function command(model,kind,input){const current=await snapshot(model);return invoke(model,'garden',kind,{...input,actionId:input.actionId||randomUUID(),sessionOwnerAccountId:current.ownerAccountId,expectedRevision:input.expectedRevision??current.revision});}
async function capture(model,name){
  await model.page.bringToFront();
  if(await model.page.locator('.battle-stage').count()){
    await model.page.waitForFunction(()=>document.querySelectorAll('.battle-stage .resource-stage[data-status="ready"]').length===2);
    const rendered=await model.page.evaluate(async()=>{
      const stages=[...document.querySelectorAll('.battle-stage .resource-stage')],canvases=stages.map(s=>s.querySelector('canvas'));let pixels=[];
      for(let attempt=0;attempt<30;attempt++){
        await new Promise(resolve=>requestAnimationFrame(resolve));pixels=canvases.map(canvas=>{const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);const data=ctx.getImageData(0,0,copy.width,copy.height).data;let count=0;for(let i=3;i<data.length;i+=4)if(data[i]>20)count++;return count;});if(pixels.every(n=>n>2500))break;
      }
      return stages.map((s,i)=>({resourceId:s.getAttribute('data-resource-id'),petId:s.getAttribute('data-pet-id'),status:s.getAttribute('data-status'),action:s.getAttribute('data-action'),textureFrame:s.querySelector('.resource-sprite-host')?.getAttribute('data-texture-frame'),visiblePixels:pixels[i]}));
    });
    assert.equal(rendered.length,2);assert.ok(rendered.every(actor=>actor.visiblePixels>2500&&actor.textureFrame));pass(`${name}:actual-rendered-actors`,{actors:rendered});
  }
  await model.page.screenshot({path:join(output,`${name}.png`)});
  const visible=await model.page.evaluate(()=>({text:document.body.innerText.slice(0,500),canvas:[...document.querySelectorAll('canvas')].map(c=>({width:c.width,height:c.height})),images:[...document.images].map(img=>({ready:img.complete&&img.naturalWidth>0,src:img.src.slice(0,100)}))}));
  pass(name,{renderer:visible});
}
try{
  const a=await launch(0),actorA=await login(a),b=await launch(1),actorB=await login(b);assert.notEqual(a.pid,b.pid);assert.equal(actorA.ownerAccountId,actorB.ownerAccountId);assert.notEqual(actorA.deviceId,actorB.deviceId);assert.notEqual(actorA.sessionId,actorB.sessionId);
  for(let pet=0;pet<2;pet++){
    const id=`native-adopt:${config.runId}:${pet}`;const receipt=await productCall(a,'companions-sync',{op:'command',command:'adopt',input:{actionId:id,templateId:pet?'big-fish-gentle':'animal-hat-cat',name:pet?'桌面原伙伴':'桌面出战喵',showOnDesktop:false}});
    evidence.petIds||=[];evidence.petIds[pet]=receipt.result.data.pet.petId;save();
  }
  await snapshot(a);await snapshot(b);
  if(process.argv.includes('--prepare')){
    const request={purpose:'coordinator-only discovery location_test_grants',scenarioId:settings.scenarioId,projectRef:'jbvrdmrkwpznbrvteive',source:'simulated',worldNamespace:`qa:${settings.scenarioId}:territory:`,actors:[actorA,actorB].map(({authUserId,ownerAccountId,deviceId,sessionId})=>({authUserId,ownerAccountId,deviceId,sessionId})),requestedDurationMinutes:90};
    writeFileSync(join(output,'location-grant-request.json'),JSON.stringify(request,null,2)+'\n');pass('two normal product-Auth Electron profiles and legal adopted pets prepared',{grantRequest:join(output,'location-grant-request.json'),actors:request.actors});
  }else{
    await installSigner(a);await installSigner(b);
    const before=await snapshot(a),located=await command(a,'territoryLocate',{});assert.ok(located.id.startsWith(`qa:${settings.scenarioId}:territory:`));
    const startInput={actionId:`native-challenge:${config.runId}`,territoryId:located.id,expectedTerritoryRevision:located.revision,petId:evidence.petIds[0]};
    let sessionId=evidence.sessionId;
    if(!sessionId){const started=await command(a,'territoryChallenge',startInput);sessionId=started.sessionId;evidence.sessionId=sessionId;save();}
    await a.page.evaluate(id=>{location.hash=`#/battle/session/${id}`;},sessionId);
    let battle=await invoke(a,'battle','snapshot',{sessionId});assert.equal(battle.context.authority,'cloud');assert.equal(battle.player.petId,evidence.petIds[0]);
    await a.page.waitForFunction(()=>document.querySelectorAll('canvas').length>0);await capture(a,'cloud-battle-before-action');
    if(!evidence.lostResponse){
      await a.page.evaluate(()=>{location.hash='#/garden';});
      await a.app.evaluate(()=>{const remote=globalThis.__accountsCloudAcceptanceServices.get('accounts').remote,original=remote.fetcher;remote.fetcher=async(url,options)=>{
        const response=await original(url,options);let body;try{body=JSON.parse(options.body);}catch{}
        if(!remote.__gardenLostReply&&String(url).endsWith('/territory-sync')&&body?.op==='act'){remote.__gardenLostReply=true;await response.body?.cancel();throw new Error('Controlled real response stream loss after headers');}return response;
      };});
      const payload={sessionId,actionId:`native-lost-act:${config.runId}`,expectedRound:battle.snapshot.round+1,action:'normal_attack'};
      const reply=await invoke(a,'battle','act',payload,false);assert.equal(reply.ok,false);assert.equal(reply.code,'GARDEN_CLOUD_UNAVAILABLE');
      const journal=await a.app.evaluate((_electron,actionId)=>{const s=globalThis.__accountsCloudAcceptanceServices;return s.db.prepare('select action_id,wire_input_json,request_hash,status from garden_cloud_requests where action_id=?').get(actionId);},payload.actionId);assert.equal(journal.status,'pending');
      evidence.lostResponse={payload,journal,scope:'real HTTPS response body cancelled after headers; host network unchanged'};save();
      await a.app.close();a.closed=true;
      const resumed=await launch(0);await login(resumed);await installSigner(resumed);await resumed.page.evaluate(id=>{location.hash=`#/battle/session/${id}`;},sessionId);
      battle=await invoke(resumed,'battle','snapshot',{sessionId});assert.equal(battle.snapshot.round,payload.expectedRound);
      const recovered=await resumed.app.evaluate((_electron,actionId)=>globalThis.__accountsCloudAcceptanceServices.db.prepare('select action_id,wire_input_json,request_hash,status from garden_cloud_requests where action_id=?').get(actionId),payload.actionId);
      assert.equal(recovered.status,'committed');assert.equal(recovered.wire_input_json,journal.wire_input_json);assert.equal(recovered.request_hash,journal.request_hash);assert.notEqual(a.pid,resumed.pid);evidence.restartedClientPid=resumed.pid;pass('actual Electron restart replays exact pending action without another round',{oldPid:a.pid,newPid:resumed.pid,round:battle.snapshot.round});
    }
    const liveA=models.filter(m=>m.index===0&&!m.closed).at(-1);await b.page.evaluate(id=>{location.hash=`#/battle/session/${id}`;},sessionId);
    for(let i=0;i<150&&battle.status==='active';i++){
      const client=i%2?liveA:b,action=battle.snapshot.player.anger>=battle.rules.ultimateAnger?'ultimate':'normal_attack';
      battle=await invoke(client,'battle','act',{sessionId,actionId:`native-act:${config.runId}:${battle.snapshot.round+1}`,expectedRound:battle.snapshot.round+1,action});
    }
    assert.equal(battle.status,'finished');assert.equal(battle.winner,'player','Preserve a natural defeat if it occurs; never edit the outcome');
    await liveA.page.evaluate(id=>{location.hash=`#/battle/session/${id}`;},sessionId);await invoke(liveA,'battle','snapshot',{sessionId});await capture(liveA,'cloud-battle-natural-win');
    const confirmed=await invoke(liveA,'battle','settleContext',{sessionId,actionId:`native-confirm:${config.runId}`});assert.equal(confirmed.won,true);assert.equal(confirmed.resultPath,'/garden');
    const finalA=await snapshot(liveA),finalB=await snapshot(b);assert.deepEqual(finalA.items,finalB.items);assert.deepEqual(finalA.pets,finalB.pets);assert.deepEqual(finalA.plots,before.plots);
    const untouched=before.pets.find(p=>p.petId===evidence.petIds[1]);assert.deepEqual(finalA.pets.find(p=>p.petId===untouched.petId),untouched);
    const after=JSON.stringify(finalA.items),petState=JSON.stringify(finalA.pets);await invoke(b,'battle','settleContext',{sessionId,actionId:`native-confirm:${config.runId}`});const repeated=await snapshot(b);assert.equal(JSON.stringify(repeated.items),after);assert.equal(JSON.stringify(repeated.pets),petState);
    for(const model of [liveA,b]){await model.page.evaluate(()=>{location.hash='#/garden';});await model.page.getByRole('heading',{name:'给伙伴，留一片小天地。',exact:true}).waitFor();await capture(model,`cloud-garden-${model.index?'b':'a'}`);}
    evidence.final={sessionId,rounds:battle.snapshot.round,ownerAccountId:actorA.ownerAccountId,items:finalA.items,pets:finalA.pets,territories:finalA.territories};assert.deepEqual(evidence.rendererErrors||[],[]);if(evidence.failure){evidence.resolvedIncidents||=[];evidence.resolvedIncidents.push(evidence.failure);delete evidence.failure;}evidence.passed=true;save();console.log(JSON.stringify({passed:true,evidence:evidenceFile}));
  }
}catch(error){evidence.failure={at:new Date().toISOString(),message:error.message};evidence.passed=false;save();console.error(JSON.stringify({evidence:evidenceFile,failure:evidence.failure}));process.exitCode=1;}
finally{for(const model of models)if(!model.closed)await model.app.close().catch(()=>{});}
