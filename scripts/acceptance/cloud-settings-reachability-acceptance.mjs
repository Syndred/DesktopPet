// Focused P01 on the audited portable SFX and a fresh offline QA profile.
// Read-only keyboard/scroll checks; fixture adoption uses normal product IPC. No settings save.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,basename} from 'node:path';
import {launchPortableSession} from './portable-session.mjs';
import {pollState} from './poll-state.mjs';
import {sha256} from '../release/release-store.mjs';
const require=createRequire(import.meta.url),{MARKER,SCENARIO}=require('../../apps/pc-app/runtime/core/qa-scenario.cjs');
const option=name=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const config=JSON.parse(readFileSync('scripts/release/electron-builder.pc.json')),version=JSON.parse(readFileSync('package.json')).version,build=JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json'));
const executable=resolve(option('executable')||join(config.directories.output,`Lingjing-${version}-portable-x64.exe`)),expectedSource=option('source')||build.sourceCommit;
assert.ok(process.platform==='win32'&&process.env.GITHUB_ACTIONS==='true');assert.match(expectedSource,/^[a-f0-9]{40}$/);
const output=resolve('artifacts/foundation/cloud-engineering/settingsReachability',`run-${Date.now()}`);mkdirSync(output,{recursive:true});
const profile=realpathSync.native(mkdtempSync(join(tmpdir(),'lingjing-settingsReachability-'))),runId=randomUUID(),secret=`Qa-${randomUUID()}!`,account=`qa_desktop_${runId.slice(0,8)}`;
writeFileSync(join(profile,MARKER),JSON.stringify({schemaVersion:1,application:'lingjing',scenario:SCENARIO,runId,isolated:true,profilePath:realpathSync.native(profile),createdAt:new Date().toISOString()}),{flag:'wx'});
const offlineConfig=join(profile,'offline-public.json');writeFileSync(offlineConfig,'{}',{flag:'wx'});
const systemKeys=new Set(['PATH','PATHEXT','SYSTEMROOT','SYSTEMDRIVE','WINDIR','COMSPEC','TEMP','TMP','TMPDIR','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMFILES','PROGRAMFILES(X86)','PROGRAMW6432','LANG','LC_ALL','CI']);
const offlineEnvironment=Object.fromEntries(Object.keys(process.env).filter(key=>!systemKeys.has(key.toUpperCase())).map(key=>[key,undefined]));Object.assign(offlineEnvironment,{LINGJING_QA_SCENARIO:SCENARIO,LINGJING_PUBLIC_CONFIG:offlineConfig});
const proof={scope:'P01: actual audited Windows SFX, fresh offline QA pets. Read-only minimum-size keyboard and scroll reachability. Supplements prior navigation evidence; no N02/N03 upgrade.',sourceCommit:expectedSource,compiledFingerprint:build.compiledFingerprint,exeSha256:await sha256(executable),cases:[],passed:false,startedAt:new Date().toISOString()};
let model,uncertain=false,owner;const pids=new Set(),pets=[];const redact=value=>String(value).split(secret).join('[redacted]');const save=()=>writeFileSync(join(output,'evidence.json'),JSON.stringify(proof,null,2));
function alive(pid){try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}}
async function stop(){if(model){proof.offlineBlocked=(proof.offlineBlocked||[]);proof.offlineBlocked.push(await model.main(()=>globalThis.__settingsReachabilityOfflineBlocked).catch(()=>({observation:'unavailable'})));await model.stop();}if(uncertain)throw Error('Launch outcome/PID unknown; keep temporary profile');proof.pidChecks=await pollState(()=>[...pids].map(pid=>({pid,alive:alive(pid)})),rows=>rows.every(row=>!row.alive),{timeoutMs:10000,intervalMs:200,label:'Owned process still alive; keep temporary profile'});model=null;}
async function launch(){uncertain=true;model=await launchPortableSession({executable,profile,expectedSource,label:'settingsReachability-qa',environment:offlineEnvironment});for(const pid of[model.launcherPid,model.runtime.pid])if(Number.isInteger(pid)&&pid>0)pids.add(pid);uncertain=false;assert.equal(model.info.build.compiledFingerprint,build.compiledFingerprint);assert.deepEqual(model.info.build.sourceDirtyFiles,[]);assert.equal((await model.call('accounts','session')).scenario?.runId,runId);await model.main(({session})=>{
  globalThis.__settingsReachabilityOfflineBlocked={node:0,fetch:0,websocket:0,chromium:0};
  const denied=kind=>{globalThis.__settingsReachabilityOfflineBlocked[kind]++;throw Error('OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN');};
  const local=value=>{try{const host=typeof value==='string'||value instanceof URL?new URL(String(value)).hostname:value?.hostname||value?.host||'localhost';return ['localhost','127.0.0.1','::1','[::1]'].includes(String(host).split(':').length===2?String(host).split(':')[0]:String(host));}catch{return false;}};
  for(const name of['node:http','node:https']){const mod=process.getBuiltinModule(name);for(const method of['request','get']){const original=mod[method];mod[method]=function(input,...args){if(!local(input))return denied('node');return original.call(this,input,...args);};}}
  for(const name of['node:net','node:tls']){const transport=process.getBuiltinModule(name);transport.connect=()=>denied('node');if(transport.createConnection)transport.createConnection=()=>denied('node');}
  process.getBuiltinModule('node:http2').connect=()=>denied('node');
  const fetchOriginal=globalThis.fetch;globalThis.fetch=function(input,...args){if(!local(input?.url||input)){globalThis.__settingsReachabilityOfflineBlocked.fetch++;return Promise.reject(Object.assign(Error('OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN'),{code:'OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN'}));}return fetchOriginal.call(this,input,...args);};
  if(globalThis.WebSocket){const Original=globalThis.WebSocket;globalThis.WebSocket=class extends Original{constructor(url,...args){if(!local(url))denied('websocket');super(url,...args);}};}
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_details,callback)=>{globalThis.__settingsReachabilityOfflineBlocked.chromium++;callback({cancel:true});});
 });}
async function step(id,coverage,fn){const row={id,coverage,status:'running',startedAt:new Date().toISOString()};proof.cases.push(row);save();try{Object.assign(row,await fn());row.status='passed-original-scope-offline';}catch(error){row.status='failed';row.error=redact(error);try{await model.page.screenshot({path:join(output,id+'-failed.png'),timeout:10000});}catch{}throw error;}finally{row.completedAt=new Date().toISOString();save();}}
async function register(account,password,name){const page=model.page;await page.getByRole('tab',{name:'注册',exact:true}).click();await page.getByLabel('用户名',{exact:true}).fill(name);await page.locator('input[autocomplete="username"]').fill(account);await page.getByLabel('密码',{exact:true}).fill(password);await page.getByLabel('确认密码',{exact:true}).fill(password);await page.getByRole('button',{name:'创建账号 →',exact:true}).click();await page.getByRole('navigation',{name:'主导航',exact:true}).waitFor();const session=await model.call('accounts','session');assert.equal(session.dataMode,'simulated');assert.ok(session.currentUser.id.startsWith(`qa:${runId}:`));return session.currentUser.id;}
async function current(path){await model.page.waitForFunction(path=>location.hash==='#'+path,path);const root=model.page.locator(`.app-page-motion[data-route-key="${path}"][data-current-route="true"]`);await root.waitFor();await root.locator('h1').first().waitFor();return root;}
// Traverse the real document focus chain, never focus() the target or assign hash.
async function tabTo(target){await target.waitFor();for(let n=0;n<180;n++){await model.page.keyboard.press('Tab');if(await target.evaluate(el=>document.activeElement===el))return n+1;}throw Error('P01_TARGET_NOT_KEYBOARD_REACHABLE');}
async function enter(target,path){const tabs=await tabTo(target);await model.page.keyboard.press('Enter');await current(path);return tabs;}
async function inspect(target,label){
 await target.waitFor();await target.scrollIntoViewIfNeeded();const disabled=await target.isDisabled();const tabs=disabled?null:await tabTo(target);
 const data=await target.evaluate(el=>{const rect=el.getBoundingClientRect(),style=getComputedStyle(el),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2),clips=[];for(let p=el.parentElement;p;p=p.parentElement){const c=getComputedStyle(p);if(/auto|scroll|hidden|clip/.test(c.overflowX+' '+c.overflowY)){const r=p.getBoundingClientRect();clips.push({x:r.x,y:r.y,width:r.width,height:r.height,overflowX:c.overflowX,overflowY:c.overflowY,insideX:rect.left>=r.left-1&&rect.right<=r.right+1,insideY:rect.top>=r.top-1&&rect.bottom<=r.bottom+1});}}return {rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},viewport:{width:innerWidth,height:innerHeight},insideViewport:rect.left>=0&&rect.top>=0&&rect.right<=innerWidth+1&&rect.bottom<=innerHeight+1,hit:hit===el||el.contains(hit),focused:document.activeElement===el,focusVisible:el.matches(':focus-visible'),outline:style.outlineStyle,outlineWidth:style.outlineWidth,shadow:style.boxShadow,clips};});
 proof.latestInspection={label,disabled,tabs,...data};save();
 assert.ok(data.rect.width>0&&data.rect.height>0&&data.insideViewport&&(disabled||data.hit),label+' visual target clipped/covered');for(const clip of data.clips)assert.ok(clip.insideX&&clip.insideY,label+' ancestor clips target');if(!disabled){assert.ok(data.focused&&data.focusVisible,label+' keyboard focus missing');assert.ok((data.outline!=='none'&&parseFloat(data.outlineWidth)>0)||data.shadow!=='none',label+' focus indicator not rendered');}
 return {label,disabled,tabs,...data};
}
async function category(name,path){const page=model.page;await enter(page.locator('.sidebar-bottom').getByRole('button',{name:'设置',exact:true}),'/settings');return enter(page.getByRole('navigation',{name:'设置分类',exact:true}).getByRole('link',{name,exact:true}),path);}
try{
 await launch();owner=await register(account,secret,'设置可达性验收');
 for(let n=0;n<2;n++){const result=await model.call('companions','adopt',{templateId:'animal-wood-deer',name:`可达性${n+1}`,showOnDesktop:false,actionId:randomUUID()});pets.push(result.pet);}
 proof.fixture={owner,petIds:pets.map(p=>p.petId),preparation:'normal local QA product IPC; hidden pets'};
 proof.bounds=await model.main(({BrowserWindow})=>{const wins=BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().includes('/ui/index.html'));if(wins.length!==1)throw Error('OWNED_MAIN_NOT_UNIQUE');const w=wins[0];if(w.isMaximized())w.unmaximize();w.setSize(960,700);return w.getBounds();});assert.equal(proof.bounds.width,960);assert.equal(proof.bounds.height,700);
 const before=await model.call('accounts','settingsGet'),page=model.page;
 await step('P01','Minimum-size real keyboard category entry and bottom control reachability; no settings mutations',async()=>{
  const groups=[];const button=name=>page.getByRole('button',{name,exact:true});
  for(const[name,path,targets]of[
   ['桌面与行为','/settings',()=>[button('恢复默认设置'),page.getByRole('switch',{name:'界面动效',exact:true}),button('保存设置')]],
   ['通知与隐私','/settings/privacy',()=>[page.getByRole('switch',{name:'情绪统计',exact:true}),button('测试已保存的通知设置')]],
   ['账号与云端','/account',()=>[button('导出本地备份'),button('恢复本地备份'),button('退出登录')]],
   ['AI 对话','/settings/ai',()=>[page.getByRole('combobox',{name:'服务提供商',exact:true}),page.getByLabel('接口地址',{exact:true}),button('保存连接'),page.getByRole('textbox',{name:'性格设定',exact:true}),button('保存伙伴人设'),button('添加记忆')]],
   ['角色资源','/resources',()=>[button('填写来源与许可'),button('选择文件并导入')]],
   ['关于与诊断','/settings/about',()=>[button('显示程序文件'),button('打开本地日志目录'),page.getByRole('link',{name:'← 返回设置',exact:true})]],
  ]){const tabs=await category(name,path),checks=[];for(const target of targets()){const label=await target.getAttribute('aria-label')||await target.textContent()||await target.getAttribute('type');checks.push(await inspect(target,label));}groups.push({name,path,entryTabCount:tabs,checks});await page.screenshot({path:join(output,`P01-${groups.length}.png`),timeout:10000});proof.progress=groups;save();}
  const after=await model.call('accounts','settingsGet');assert.deepEqual(after.document,before.document);assert.equal(after.revision,before.revision);assert.equal((await model.call('companions','list')).pets.length,2);
  return {groups,settingsDocumentAndRevisionUnchanged:true,actionsNotActivated:'No save/export/import/logout/diagnostic/permission buttons activated; only categories navigated',priorEvidence:'0fd navigation supplies existing six-category route and native size/maximize checks; this run supplies missing keyboard/focus/scroll checks only',notClaimed:['N02 mouse-border resizing','N03 cloud draft semantics','physical multi-DPI']};
 });proof.passed=true;
}catch(error){proof.error=redact(error);proof.passed=false;process.exitCode=1;}
finally{try{await stop();proof.ownedProcessStopped=true;}catch(error){proof.stopError=redact(error);proof.passed=false;process.exitCode=1;}try{assert.equal(dirname(profile),realpathSync.native(tmpdir()));assert.ok(basename(profile).startsWith('lingjing-settingsReachability-'));assert.ok(proof.ownedProcessStopped);rmSync(profile,{recursive:true,force:true});proof.temporaryProfileRemoved=true;}catch(error){proof.cleanupError=redact(error);proof.passed=false;process.exitCode=1;}proof.completedAt=new Date().toISOString();save();console.log(JSON.stringify({output,passed:proof.passed,error:proof.error}));}
