// Prepared only: consumes already authenticated, audited holder models and an
// existing server-numbered pet. Never registers/adopts/allocates/starts battle.
import assert from 'node:assert/strict';
import {writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
export function numberedIdentity(pet,identity,owner){
 assert.equal(pet.ownerAccountId,owner);assert.match(pet.petId,/^[A-Za-z0-9:_-]+$/);
 assert.match(String(pet.globalSerial||''),/^[1-9][0-9]*$/);
 assert.equal(identity.instanceNumber,String(pet.globalSerial).padStart(4,'0'));
 assert.ok(typeof identity.roleName==='string'&&identity.roleName.trim().length>0);
 return {petId:pet.petId,templateId:pet.templateId,globalSerial:String(pet.globalSerial),number:identity.instanceNumber,roleName:identity.roleName};
}
export function unchangedIdentity(before,after){assert.deepEqual(after,before);return true;}
export function pureDesktopText(text){return String(text).trim()==='';}
export async function runCloudLiveQaIdentityUiCases({models,expectedActors,relaunch,assertActive,petId,packageBinding,runId,output}){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1');
 assert.equal(expectedActors.a.ownerAccountId,expectedActors.a2.ownerAccountId);
 for(const key of ['sourceCommit','exeSha256','compiledFingerprint'])assert.match(packageBinding?.[key]||'',key==='sourceCommit'?/^[a-f0-9]{40}$/:/^[a-f0-9]{64}$/);
 assert.match(petId,/^[A-Za-z0-9:_-]+$/);
 const file=join(output,'live-identity-ui-evidence.json');assert.ok(!existsSync(file),'No silent rerun of uncertain UI batch');
 const proof={runId,packageBinding,scope:'Existing live numbered pet, actual UI surfaces and normal same-owner relaunch; no adoption, numbering allocation or battle start. Desktop accessibility labels are not visual labels.',fullCasePassed:false,passed:false,checks:[],startedAt:new Date().toISOString()};
 const save=()=>writeFileSync(file,JSON.stringify(proof,null,2));save();
 const deadline=Date.now()+8*60*1000;let changedDesktop=false,baselineDesktop,cleaning=false;
 async function active(){if(!cleaning)assert.ok(Date.now()<deadline,'Budget exhausted');await assertActive();for(const role of ['a','a2']){const s=await models[role].call('accounts','session');assert.equal(s.currentUser?.id,expectedActors[role].ownerAccountId);assert.equal(s.currentUser?.authUserId,expectedActors[role].authUserId);assert.equal(s.currentUser?.authKind,'supabase');assert.equal(s.dataMode,'live');const info=await models[role].call('app','info');assert.equal(info.build.sourceCommit,packageBinding.sourceCommit);assert.equal(info.build.compiledFingerprint,packageBinding.compiledFingerprint);assert.deepEqual(info.build.sourceDirtyFiles,[]);}}
 async function until(fn,accept,label='ui-state-ready'){proof.substage=label;save();const end=Date.now()+25000;while(Date.now()<end){await active();const v=await fn();const ready=Boolean(accept(v));proof.lastObservation={ready,count:Array.isArray(v)?v.length:null};save();if(ready)return v;await new Promise(r=>setTimeout(r,200));}throw Error('UI_READBACK_TIMEOUT');}
 async function call(role,feature,command,payload={}){await active();return models[role].call(feature,command,payload);}
 async function identity(role){const list=await call(role,'companions','list'),pet=list.pets.find(p=>p.petId===petId);assert.ok(pet,'Existing pet required');return numberedIdentity(pet,await call(role,'companions','identity',{petId}),expectedActors[role].ownerAccountId);}
 async function route(role,path){await active();const page=models[role].page;await page.evaluate(path=>{location.hash='#'+path;},path);await page.locator(`.app-page-motion[data-route-key="${path}"][data-current-route="true"]`).waitFor({timeout:20000});return page;}
 async function click(locator){await active();assert.equal(await locator.count(),1);await locator.click({timeout:15000});}
 async function text(locator,expected){await until(()=>locator.innerText({timeout:3000}),v=>v.trim()===expected,'exact-identity-text');}
 async function shot(page,name){await active();await page.screenshot({path:join(output,name),timeout:10000});}
 async function check(id,fn){proof.stage=id;save();const result=await fn();proof.checks.push({id,passed:true,...result});save();}
 try{
  await active();const initialBattle=await call('a','battle','overview');if(initialBattle.session)throw Object.assign(Error(),{code:'PRECONDITION_RETAINED_BATTLE_SESSION'});const expected=await identity('a');proof.identity=expected;unchangedIdentity(expected,await identity('a2'));
  const initial=await call('a','companions','get',{petId});baselineDesktop=initial.desktop.visible;
  await check('list-detail',async()=>{
   const page=await route('a','/companions'),card=page.locator(`.cp-pet-card[data-pet-id="${petId}"]`);
   await text(card.locator('.cp-pet-card-title strong'),expected.roleName);await text(card.locator('.cp-instance-identity code'),'编号 '+expected.number);
   await click(card);await until(()=>card.getAttribute('aria-pressed'),v=>v==='true','selected-roster-card');await shot(page,'C03-list.png');
   await click(page.getByRole('button',{name:'查看伙伴详情',exact:true}));const detail=page.locator(`.cp-detail-layout[data-pet-id="${petId}"]`);await detail.waitFor({timeout:15000});
   await text(detail.locator('.cp-detail-copy h2'),expected.roleName);await text(detail.locator('.cp-detail-copy .cp-instance-identity code'),'编号 '+expected.number);await shot(page,'C03-detail.png');return {samePet:true};
  });
  await check('chat',async()=>{
   const page=await route('a','/chat'),option=page.locator(`.cv-pet-option[data-pet-id="${petId}"]`);await click(option);
   const header=page.locator(`.cv-thread[data-pet-id="${petId}"] .cv-thread-header .cv-identity`);await header.waitFor({timeout:15000});
   // Name has optional element decoration; its first text node is the exact standard role.
   await until(()=>header.locator('.cv-identity-name').evaluate(el=>el.firstChild?.textContent),v=>v===expected.roleName,'chat-standard-name');
   await text(header.locator('.cv-identity-number'),'编号 '+expected.number);await shot(page,'C03-chat.png');return {noMessagesSent:true};
  });
  await check('battle-picker-no-start',async()=>{
   const page=await route('a','/battle'),control=page.getByRole('combobox',{name:'选择出战伙伴',exact:true});
   const before=await call('a','battle','overview');if(before.session)throw Object.assign(Error(),{code:'PRECONDITION_RETAINED_BATTLE_SESSION'});
   const label=`${expected.roleName} · 编号 ${expected.number} ·`;await click(control);await click(page.getByRole('option').filter({hasText:label}));
   await until(()=>control.innerText(),v=>v.includes(label),'battle-picker-identity');const after=await call('a','battle','overview');assert.equal(after.session?.id,before.session?.id);
   assert.equal(after.pets.find(p=>p.petId===petId)?.displayIdentity.instanceNumber,expected.number);await shot(page,'C03-battle.png');return {noBattleStarted:true};
  });
  await check('desktop-pure-image',async()=>{
   const page=await route('a','/companions/'+encodeURIComponent(petId));await page.locator(`.cp-detail-layout[data-pet-id="${petId}"]`).waitFor({timeout:15000});
   if(!baselineDesktop){changedDesktop=true;await click(page.getByRole('button',{name:'开启桌面陪伴',exact:true}));}
   const desktop=await until(()=>models.a.pages().filter(p=>p.url().endsWith('/desktop/'+encodeURIComponent(petId))),v=>v.length===1,'owned-desktop-renderer').then(v=>v[0]);
   const surface=desktop.locator(`.cp-desktop-surface[data-pet-id="${petId}"]`);await surface.waitFor({timeout:15000});await desktop.keyboard.press('Escape');
   await until(()=>surface.locator('.resource-stage canvas').count(),v=>v===1,'desktop-resource-canvas');
   assert.equal(await surface.locator('.cp-desktop-context-menu').count(),0);assert.ok(pureDesktopText(await surface.innerText()));
   // Exact owned BrowserWindow must really be visible (policy suppression is not pass).
   const windows=await models.a.main(({BrowserWindow},id)=>BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().endsWith('/desktop/'+encodeURIComponent(id))).map(w=>({visible:w.isVisible(),destroyed:w.isDestroyed()})),petId);
   assert.equal(windows.length,1);assert.equal(windows[0].visible,true);assert.equal(windows[0].destroyed,false);await shot(desktop,'C03-desktop.png');return {visualTextEmpty:true,accessibilityIdentityRetained:true};
  });
  await check('normal-relaunch-same-identity',async()=>{
   await active();models.a2=await relaunch('a2');await until(()=>identity('a2'),v=>v.petId===expected.petId,'relaunch-same-pet');unchangedIdentity(expected,await identity('a2'));
   const page=await route('a2','/companions'),card=page.locator(`.cp-pet-card[data-pet-id="${petId}"]`);await text(card.locator('.cp-pet-card-title strong'),expected.roleName);await text(card.locator('.cp-instance-identity code'),'编号 '+expected.number);await shot(page,'C03-relaunch.png');return {normalRelaunch:true,sameOwnerPetTemplateAndNumber:true};
  });
  assert.equal(proof.checks.length,5);proof.passed=true;
 }catch(error){proof.errorCode=['AUTH_REQUIRED','GLOBAL_SERIAL_SCOPE_REVOKED','GLOBAL_SERIAL_SCOPE_CONFLICT','PRECONDITION_RETAINED_BATTLE_SESSION'].includes(error?.code)?error.code:'IDENTITY_UI_CHECK_FAILED';}
 finally{
  cleaning=true;
  if(changedDesktop){try{await active();const pet=await call('a','companions','get',{petId});if(pet.desktop.visible){const page=await route('a','/companions/'+encodeURIComponent(petId));await page.locator(`.cp-detail-layout[data-pet-id="${petId}"]`).waitFor({timeout:15000});await click(page.getByRole('button',{name:'关闭桌面陪伴',exact:true}));await until(()=>call('a','companions','get',{petId}),p=>p.desktop.visible===false,'restore-desktop-preference');}proof.desktopPreferenceRestored=true;}catch{proof.desktopPreferenceRestored=false;proof.passed=false;}}
  proof.completedAt=new Date().toISOString();save();
 }
 return proof;
}
