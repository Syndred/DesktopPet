// Actual portable SFX with the supported isolated local QA scenario. No cloud
// credentials, real account, expired grant, production write or legacy helper.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,basename} from 'node:path';
import {launchPortableSession} from './portable-session.mjs';
import {sha256} from '../release/release-store.mjs';
import {pollState} from './poll-state.mjs';
const require=createRequire(import.meta.url),{MARKER,SCENARIO}=require('../../apps/pc-app/runtime/core/qa-scenario.cjs');
const option=name=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const config=JSON.parse(readFileSync('scripts/release/electron-builder.pc.json')),version=JSON.parse(readFileSync('package.json')).version,build=JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json'));
const executable=resolve(option('executable')||join(config.directories.output,`Lingjing-${version}-portable-x64.exe`)),expectedSource=option('source')||build.sourceCommit;
assert.equal(process.platform,'win32','This is actual Windows portable acceptance, not a Linux simulation');assert.match(expectedSource,/^[a-f0-9]{40}$/);
const output=resolve('artifacts/foundation/cloud-engineering/local-account',`run-${Date.now()}`);mkdirSync(output,{recursive:true});
const profile=mkdtempSync(join(tmpdir(),'lingjing-local-acceptance-')),runId=randomUUID();
const marker={schemaVersion:1,application:'lingjing',scenario:SCENARIO,runId,isolated:true,profilePath:realpathSync(profile),createdAt:new Date().toISOString()};
writeFileSync(join(profile,MARKER),JSON.stringify(marker),{flag:'wx'});
const account=`qa_local_${runId.slice(0,8)}`,oldSecret=`Qa-${randomUUID()}!`,newSecret=`Qa-${randomUUID()}!`,wrongSecret=`Wrong-${randomUUID()}!`;
const redact=value=>{let text=String(value);for(const secret of[oldSecret,newSecret,wrongSecret])text=text.split(secret).join('[redacted]');return text;};
const proof={sourceCommit:expectedSource,compiledFingerprint:build.compiledFingerprint,executableSha256:await sha256(executable),scenario:SCENARIO,scenarioRunId:runId,
 scope:'Actual Windows portable + official isolated local QA scenario; simulated offline account only, no real cloud acceptance. Profile and plaintext passwords excluded from artifacts.',startedAt:new Date().toISOString(),cases:[],passed:false};
const save=()=>writeFileSync(join(output,'evidence.json'),JSON.stringify(proof,null,2));
let model,owner,petId,baseline,persistedBaseline,launchOutcomeUncertain=false;
const ownedPids=new Set();
function processAlive(pid){try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}}
async function verifyOwnedStopped(){return pollState(()=>[...ownedPids].map(pid=>({pid,alive:processAlive(pid)})),rows=>rows.every(row=>!row.alive),{timeoutMs:10000,intervalMs:200,label:'Owned portable processes have not all exited; temporary profile retained'});}
async function stopOwned(){if(model)await model.stop();if(launchOutcomeUncertain)throw Error('A launch failed before owned PIDs were returned; profile retained because process exit cannot be verified');const states=await verifyOwnedStopped();proof.processExitChecks=states;model=null;return states;}
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function launch(){launchOutcomeUncertain=true;model=await launchPortableSession({executable,profile,expectedSource,label:'local-qa',environment:{LINGJING_QA_SCENARIO:SCENARIO}});for(const pid of [model.launcherPid,model.runtime.pid])if(Number.isInteger(pid)&&pid>0)ownedPids.add(pid);launchOutcomeUncertain=false;const session=await model.call('accounts','session');assert.equal(session.dataMode,'simulated');assert.equal(session.scenario.runId,runId);assert.equal(session.defaultProvider,'local');return model;}
async function shot(name){await model.page.screenshot({path:join(output,`${name}.png`),fullPage:true});return `${name}.png`;}
async function step(id,coverage,operation){const row={id,coverage,status:'running',startedAt:new Date().toISOString()};proof.cases.push(row);save();try{Object.assign(row,await operation());row.status='passed';}catch(error){row.status='failed';row.error=redact(error);throw error;}finally{row.completedAt=new Date().toISOString();save();}}
async function accountPage(){await model.page.evaluate(()=>{location.hash='/account';});await model.page.getByRole('heading',{name:'修改密码',exact:true}).waitFor();}
async function login(secret,{remember=false}={}){const page=model.page;await page.getByRole('tab',{name:'登录',exact:true}).click();await page.locator('input[autocomplete="username"]').fill(account);await page.getByLabel('密码',{exact:true}).fill(secret);const checkbox=page.getByRole('checkbox',{name:'记住账号',exact:true});if((await checkbox.getAttribute('aria-checked')==='true')!==remember)await checkbox.click();await page.getByRole('button',{name:'登录进入 →',exact:true}).click();}
async function logout(){await accountPage();await model.page.getByRole('button',{name:'退出登录',exact:true}).click();await model.page.getByRole('heading',{name:'欢迎回来',exact:true}).waitFor();assert.equal((await model.call('accounts','session')).currentUser,null);}
async function persistedData(){return model.main(({app},expectedProfile,owner)=>{const req=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json'),path=process.getBuiltinModule('node:path');if(path.resolve(app.getPath('userData'))!==path.resolve(expectedProfile))throw Error('Profile mismatch');const Database=req('better-sqlite3'),db=new Database(path.join(expectedProfile,'lingjing.sqlite'),{readonly:true,fileMustExist:true});try{db.pragma('query_only=ON');const pets=db.prepare('select * from companion_pets where owner_account_id=? order by pet_id').all(owner),actions=db.prepare('select * from companion_actions where owner_account_id=? order by action_id').all(owner);return {pets:pets.length,actions:actions.length,digest:process.getBuiltinModule('node:crypto').createHash('sha256').update(JSON.stringify({pets,actions})).digest('hex')};}finally{db.close();}},profile,owner);}
async function checkData(){const session=await model.call('accounts','session');assert.equal(session.currentUser.id,owner);const pet=await model.call('companions','get',{petId});assert.equal(digest(pet),baseline);assert.deepEqual(await persistedData(),persistedBaseline);return {sameOwner:true,petId,petDigest:baseline,persistedPetHistory:persistedBaseline};}
try{
 await launch();
 await step('A05','exact local QA account registration via normal product UI; no cloud account',async()=>{
  const page=model.page;await page.getByLabel('测试场景',{exact:true}).first().waitFor();await page.getByRole('tab',{name:'注册',exact:true}).click();await page.getByLabel('用户名',{exact:true}).fill('本机验收');await page.locator('input[autocomplete="username"]').fill(account);await page.getByLabel('密码',{exact:true}).fill(oldSecret);await page.getByLabel('确认密码',{exact:true}).fill(oldSecret);await page.getByRole('button',{name:'创建账号 →',exact:true}).click();await page.getByRole('navigation',{name:'主导航',exact:true}).waitFor();
  const session=await model.call('accounts','session');owner=session.currentUser.id;assert.ok(owner.startsWith(`qa:${runId}:`));assert.equal(session.currentUser.provider,'local');assert.equal(session.persistence,'memory');assert.equal(session.scenario.provenance,'simulated');
  const pet=(await model.call('companions','adopt',{actionId:randomUUID(),templateId:'animal-wood-deer',name:'本机验收',showOnDesktop:false})).pet;petId=pet.petId;baseline=digest(await model.call('companions','get',{petId}));persistedBaseline=await persistedData();
  return {owner,isolatedScenario:session.scenario,sessionPersistence:session.persistence,fixturePetPreparedThroughProductionIpc:petId,screenshot:await shot('A05-local-registration')};
 });
 await step('A14','local synthetic QA account; UI wrong/mismatched/valid password change and old/new login with identity/pet readback',async()=>{
  await accountPage();const page=model.page;
  async function change(oldPassword,next,confirm){await page.getByLabel('当前密码',{exact:true}).fill(oldPassword);await page.getByLabel('新密码',{exact:true}).fill(next);await page.getByLabel('确认新密码',{exact:true}).fill(confirm);await page.getByRole('button',{name:'保存密码',exact:true}).click();}
  await change(wrongSecret,newSecret,newSecret);await page.getByRole('alert').filter({hasText:'当前密码不正确'}).waitFor();await checkData();
  await change(oldSecret,newSecret,wrongSecret);await page.getByRole('alert').filter({hasText:'两次输入的新密码不一致'}).waitFor();await checkData();
  await change(oldSecret,newSecret,newSecret);await page.getByRole('status').filter({hasText:'密码已更新'}).waitFor();await checkData();const screenshot=await shot('A14-password-changed');
  await logout();await login(oldSecret);await page.getByRole('alert').filter({hasText:'账号或密码不正确'}).waitFor();assert.equal((await model.call('accounts','session')).currentUser,null);
  await login(newSecret);await page.getByRole('navigation',{name:'主导航',exact:true}).waitFor();const state=await checkData();return {...state,wrongCurrentRejected:true,mismatchRejected:true,oldPasswordRejected:true,newPasswordAccepted:true,sessionPersistence:(await model.call('accounts','session')).persistence,screenshot};
 });
 await step('A08','local QA remembered-account UI + logout + same-profile restart; cloud-account persistence not covered',async()=>{
  await logout();await login(newSecret,{remember:true});await model.page.getByRole('navigation',{name:'主导航',exact:true}).waitFor();await checkData();await logout();await stopOwned();await launch();
  await model.page.getByRole('heading',{name:'欢迎回来',exact:true}).waitFor();assert.equal(await model.page.locator('input[autocomplete="username"]').inputValue(),account);assert.equal(await model.page.getByLabel('密码',{exact:true}).inputValue(),'');
  const storage=await model.page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)));assert.ok(Object.values(storage).every(value=>!value.includes(oldSecret)&&!value.includes(newSecret)&&!value.includes(wrongSecret)));return {onlyAccountHintRestored:true,passwordFieldEmpty:true,plaintextPasswordAbsentFromLocalStorage:true,profileRestarted:true,screenshot:await shot('A08-remember-account-restarted')};
 });
 await step('A10','partial: local QA explicitly forbids persistent session; does not replace original ordinary/cloud-account case',async()=>{
  await login(newSecret);await model.page.getByRole('navigation',{name:'主导航',exact:true}).waitFor();await checkData();assert.equal((await model.call('accounts','session')).persistence,'memory');await stopOwned();await launch();assert.equal((await model.call('accounts','session')).currentUser,null);
  await model.page.getByRole('heading',{name:'欢迎回来',exact:true}).waitFor();await login(newSecret);await model.page.getByRole('navigation',{name:'主导航',exact:true}).waitFor();return {...await checkData(),restartRequiredLogin:true,secureSessionOverrideUsed:false};
 });
 proof.passed=true;
}catch(error){proof.error=redact(error);process.exitCode=1;}
finally{
 try{await stopOwned();proof.ownedProcessStopped=true;proof.ownedPids=[...ownedPids];}catch(error){proof.stopError=redact(error);proof.ownedPids=[...ownedPids];proof.passed=false;process.exitCode=1;}
 // The only disposable profile created by this script lives outside artifacts.
 // Remove it after owned-process termination; never upload local password hashes.
 try{assert.equal(dirname(resolve(profile)),resolve(tmpdir()));assert.ok(basename(profile).startsWith('lingjing-local-acceptance-'));if(proof.stopError||!proof.ownedProcessStopped)throw Error('Owned process stop not confirmed; profile retained outside artifact directory');rmSync(profile,{recursive:true,force:true});proof.temporaryProfileRemoved=true;}catch(error){proof.cleanupError=redact(error);proof.passed=false;process.exitCode=1;}
 proof.completedAt=new Date().toISOString();save();console.log(JSON.stringify(proof,null,2));
}
