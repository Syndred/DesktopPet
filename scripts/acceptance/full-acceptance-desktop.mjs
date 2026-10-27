// Isolated cloud-Windows desktop subset. No production account/grant/profile.
// Real OS mouse injection is restricted to the owned foreground Electron process.
import { _electron as electron } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync,mkdtempSync,realpathSync,readFileSync,writeFileSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true')throw Error('Only the ephemeral cloud Windows runner is authorized');
const root=resolve('.'), build=JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json'));
assert.equal(build.sourceCommit,execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim());assert.deepEqual(build.sourceDirtyFiles,[]);
const output=resolve('artifacts/foundation/cloud-engineering/desktop-subset',`run-${Date.now()}`);mkdirSync(output,{recursive:true});
const scenario=JSON.parse(execFileSync(process.execPath,['scripts/acceptance/create-scenario-profile.mjs'],{encoding:'utf8'}));
const proof={sourceCommit:build.sourceCommit,startedAt:new Date().toISOString(),scope:'Actual Windows Electron windows and UI on fresh offline QA account. Native OS input records are separate from Chromium control clicks. No physical second display, production data, GPS or old grant.',scenario,checks:[],errors:[],uncovered:['D05 multi-DPI/monitor','D08 physical click-through/fullscreen policy','D09 physical taskbar/tray menu']};
const save=()=>writeFileSync(join(output,'evidence.json'),JSON.stringify(proof,null,2));
const credentials={provider:'local',account:`desktop_${Date.now()}`,username:'隔离桌面验收',password:`Fixture-${randomUUID()}!`,rememberSession:false};
const disposable=realpathSync.native(mkdtempSync(join(realpathSync.native(tmpdir()),'lingjing-offline-desktop-')));
const publicConfig=join(disposable,'offline-public.json');writeFileSync(publicConfig,'{}',{flag:'wx'});
const systemKeys=new Set(['PATH','PATHEXT','SYSTEMROOT','SYSTEMDRIVE','WINDIR','COMSPEC','TEMP','TMP','TMPDIR','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMFILES','PROGRAMFILES(X86)','PROGRAMW6432','DISPLAY','WAYLAND_DISPLAY','XDG_RUNTIME_DIR','LANG','LC_ALL','CI']);
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>systemKeys.has(key.toUpperCase())));
Object.assign(env,scenario.env,{LINGJING_PUBLIC_CONFIG:publicConfig});
const wrapper=join(disposable,'entry.cjs');
writeFileSync(wrapper,`const {app,session}=require('electron');
app.setPath('appData',${JSON.stringify(disposable)});app.setPath('userData',${JSON.stringify(scenario.profilePath)});
globalThis.__desktopOfflineBlocked=[];
const denied=()=>{globalThis.__desktopOfflineBlocked.push('node-network');throw new Error('OFFLINE_QA_NETWORK_FORBIDDEN');};
for(const name of ['node:http','node:https']){const t=require(name);t.request=denied;t.get=denied;}
for(const name of ['node:net','node:tls']){const t=require(name);t.connect=denied;if(t.createConnection)t.createConnection=denied;}
require('node:http2').connect=denied;
const fetch=globalThis.fetch;globalThis.fetch=(input,...args)=>/^(https?|wss?):/i.test(String(input?.url||input))?Promise.reject(new Error('OFFLINE_QA_NETWORK_FORBIDDEN')):fetch(input,...args);
globalThis.WebSocket=class {constructor(){denied();}};
app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(details,callback)=>{globalThis.__desktopOfflineBlocked.push('chromium-network');callback({cancel:true});}));
require(${JSON.stringify(join(root,'apps/pc-app/dist/main/index.cjs'))});
`,{flag:'wx'});
let app,main,pets=[],initialCursor,mouseBlocked=false;
// The helper moves/releases the cursor button only behind owned-window guards;
// diagnostics read window handles, ownership, visibility, styles and bounds only.
// It does not change OS preferences, install hooks, or target foreign process windows.
const nativeSource=String.raw`
$ErrorActionPreference='Stop'
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class QAInput {
 [StructLayout(LayoutKind.Sequential)] public struct POINT {public int X; public int Y;}
 [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT {public int dx,dy;public uint mouseData,dwFlags,time;public UIntPtr dwExtraInfo;}
 [StructLayout(LayoutKind.Sequential)] public struct INPUT {public uint type;public MOUSEINPUT mi;}
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
 [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
 [StructLayout(LayoutKind.Sequential)] public struct RECT {public int Left;public int Top;public int Right;public int Bottom;}
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll",EntryPoint="GetWindowLongW")] public static extern int GetWindowLong(IntPtr h,int index);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT point);
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hwnd,uint flags);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll",SetLastError=true)] static extern uint SendInput(uint n,INPUT[] input,int size);
 public static void MoveRelative(int dx,int dy){var i=new INPUT();i.type=0;i.mi.dx=dx;i.mi.dy=dy;i.mi.dwFlags=1;if(SendInput(1,new[]{i},Marshal.SizeOf(typeof(INPUT)))!=1)throw new Exception("NATIVE_INPUT_BLOCKED");}
 public static void MoveAbsolute(int x,int y){int left=GetSystemMetrics(76),top=GetSystemMetrics(77),width=GetSystemMetrics(78),height=GetSystemMetrics(79);if(width<2||height<2||x<left||y<top||x>=left+width||y>=top+height)throw new Exception("NATIVE_INPUT_BLOCKED: target outside virtual desktop");var i=new INPUT();i.type=0;i.mi.dx=(int)Math.Round((x-left)*65535.0/(width-1));i.mi.dy=(int)Math.Round((y-top)*65535.0/(height-1));i.mi.dwFlags=1|0x8000|0x4000;if(SendInput(1,new[]{i},Marshal.SizeOf(typeof(INPUT)))!=1)throw new Exception("NATIVE_INPUT_BLOCKED");}
 public static void Button(uint flags){var i=new INPUT();i.type=0;i.mi.dwFlags=flags;if(SendInput(1,new[]{i},Marshal.SizeOf(typeof(INPUT)))!=1)throw new Exception("NATIVE_INPUT_BLOCKED");}
}
'@
$p=([Console]::In.ReadToEnd()|ConvertFrom-Json)
$q=New-Object QAInput+POINT
if($p.action -eq 'read'){[QAInput]::GetCursorPos([ref]$q)|Out-Null;@{x=$q.X;y=$q.Y}|ConvertTo-Json -Compress;exit}
if($p.action -eq 'probe'){
 [QAInput]::GetCursorPos([ref]$q)|Out-Null
 $hit=[QAInput]::WindowFromPoint($q);$rootWindow=[QAInput]::GetAncestor($hit,2);$fg=[QAInput]::GetForegroundWindow()
 function Describe([IntPtr]$h){[uint32]$ownerPid=0;[QAInput]::GetWindowThreadProcessId($h,[ref]$ownerPid)|Out-Null;$r=New-Object QAInput+RECT;[QAInput]::GetWindowRect($h,[ref]$r)|Out-Null;return @{handle=$h.ToInt64().ToString();processId=$ownerPid;visible=[QAInput]::IsWindowVisible($h);minimized=[QAInput]::IsIconic($h);extendedStyle=[QAInput]::GetWindowLong($h,-20);bounds=@{x=$r.Left;y=$r.Top;width=$r.Right-$r.Left;height=$r.Bottom-$r.Top}}}
 @{cursor=@{x=$q.X;y=$q.Y};hit=(Describe $hit);root=(Describe $rootWindow);foreground=(Describe $fg);expected=(Describe ([IntPtr][long]$p.windowHandle))}|ConvertTo-Json -Compress -Depth 5;exit
}
if($p.action -eq 'release'){[QAInput]::Button(4);exit}
if($p.action -eq 'restore'){if(-not [QAInput]::SetCursorPos($p.point.x,$p.point.y)){throw 'CURSOR_RESTORE_BLOCKED'};exit}
[uint32]$foreground=0;[QAInput]::GetWindowThreadProcessId([QAInput]::GetForegroundWindow(),[ref]$foreground)|Out-Null
if($foreground -ne $p.processId){throw 'OWNED_WINDOW_NOT_FOREGROUND'}
if($p.from.x -lt $p.bounds.x -or $p.from.y -lt $p.bounds.y -or $p.from.x -ge ($p.bounds.x+$p.bounds.width) -or $p.from.y -ge ($p.bounds.y+$p.bounds.height)){throw 'START_OUTSIDE_OWNED_WINDOW'}
if($p.action -eq 'move'){
 $warmX=if(($p.from.x+2) -lt ($p.bounds.x+$p.bounds.width)){$p.from.x+2}else{$p.from.x-2}
 if($warmX -lt $p.bounds.x){throw 'START_OUTSIDE_OWNED_WINDOW'}
 if(-not [QAInput]::SetCursorPos($warmX,$p.from.y)){throw 'NATIVE_CURSOR_BLOCKED'}
 Start-Sleep -Milliseconds 150
 [QAInput]::GetCursorPos([ref]$q)|Out-Null
 if($q.X -ne $warmX -or $q.Y -ne $p.from.y){throw 'NATIVE_CURSOR_BLOCKED'}
 $warm=@{x=$q.X;y=$q.Y}
}
# SetCursorPos positions the warm point but does not drive Electron's WH_MOUSE_LL
# forwarding hook. This movement must use genuine SendInput MOUSEEVENTF_MOVE.
if($p.action -eq 'move'){[QAInput]::MoveRelative(($p.from.x-$warm.x),0)}else{[QAInput]::MoveAbsolute($p.from.x,$p.from.y)}
Start-Sleep -Milliseconds 250
[QAInput]::GetCursorPos([ref]$q)|Out-Null
if([Math]::Abs($q.X-$p.from.x) -gt 1 -or [Math]::Abs($q.Y-$p.from.y) -gt 1){throw 'NATIVE_CURSOR_BLOCKED'}
if($p.action -eq 'move'){@{warm=$warm;at=@{x=$q.X;y=$q.Y};physicalDeltaPixels=[Math]::Abs($q.X-$warm.x);motionSource="SendInput-MOUSEEVENTF_MOVE-relative";pressed=$false}|ConvertTo-Json -Compress -Depth 3;exit}
$matched=$false
for($attempt=0;$attempt -lt 20;$attempt++){
 $hit=[QAInput]::WindowFromPoint($q);$rootWindow=[QAInput]::GetAncestor($hit,2);[uint32]$hitPid=0;[uint32]$rootPid=0;[QAInput]::GetWindowThreadProcessId($hit,[ref]$hitPid)|Out-Null;[QAInput]::GetWindowThreadProcessId($rootWindow,[ref]$rootPid)|Out-Null
 if($rootWindow.ToInt64().ToString() -eq $p.windowHandle -and $rootPid -eq $p.processId){$matched=$true;break}
 Start-Sleep -Milliseconds 100
}
if(-not $matched){throw ('OWNED_PET_NOT_AT_POINT '+(@{expected=$p.windowHandle;hit=$hit.ToInt64().ToString();root=$rootWindow.ToInt64().ToString();rootPid=$rootPid;x=$q.X;y=$q.Y}|ConvertTo-Json -Compress))}
[uint32]$foreground=0;[QAInput]::GetWindowThreadProcessId([QAInput]::GetForegroundWindow(),[ref]$foreground)|Out-Null
if($foreground -ne $p.processId){throw 'OWNED_WINDOW_NOT_FOREGROUND'}
try{[QAInput]::Button(2);Start-Sleep -Milliseconds 120;for($i=1;$i -le 16;$i++){[QAInput]::MoveAbsolute([int]($p.from.x+($p.to.x-$p.from.x)*$i/16),[int]($p.from.y+($p.to.y-$p.from.y)*$i/16));Start-Sleep -Milliseconds 45}}
finally{[QAInput]::Button(4)}
[QAInput]::GetCursorPos([ref]$q)|Out-Null;@{x=$q.X;y=$q.Y;foregroundPid=$foreground;hitHandle=$hit.ToInt64().ToString();hitPid=$hitPid;rootHandle=$rootWindow.ToInt64().ToString();rootPid=$rootPid;motionSource="SendInput-MOUSEEVENTF_MOVE-absolute-virtual-desktop"}|ConvertTo-Json -Compress
`;
function native(payload){return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(nativeSource,'utf16le').toString('base64')],{input:JSON.stringify(payload),encoding:'utf8',windowsHide:true,timeout:15000}).trim();}
async function open(){app=await electron.launch({args:[wrapper],cwd:root,env});main=await app.firstWindow();main.setDefaultTimeout(15000);main.on('pageerror',error=>proof.errors.push(error.message));await main.waitForFunction(()=>Boolean(window.lingjing));}
async function invoke(feature,command,payload={}){const r=await main.evaluate(x=>window.lingjing.invoke(x.feature,x.command,x.payload),{feature,command,payload});assert.equal(r.ok,true,`${feature}.${command}: ${JSON.stringify(r)}`);return r.data;}
async function poll(read,accept,label){for(let i=0;i<60;i++){const x=await read();if(accept(x))return x;await new Promise(r=>setTimeout(r,100));}throw Error(label);}
async function route(path){await main.evaluate(path=>{location.hash='#'+path;},path);}
async function detail(pet){await route('/companions/'+pet.petId);await main.getByRole('tab',{name:'外观',exact:true}).click();await main.locator('.cp-desktop-controls').waitFor();}
async function visible(pet,wanted){await detail(pet);const toggle=main.locator('.cp-desktop-controls').getByRole('switch');if((await toggle.getAttribute('aria-checked'))!==String(wanted))await toggle.click();await poll(()=>invoke('companions','get',{petId:pet.petId}),p=>p.desktop.visible===wanted,'Desktop preference did not settle');}
async function limit(value){await route('/settings');await main.getByRole('combobox',{name:'桌面陪伴数量',exact:true}).click();await main.getByRole('option',{name:String(value),exact:true}).click();await main.getByRole('button',{name:'保存设置',exact:true}).click();await poll(()=>invoke('accounts','settingsGet'),s=>s.document.desktop.companionLimit===value,'Limit did not save');}
async function inventory(){return app.evaluate(({BrowserWindow,screen})=>BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().includes('/desktop.html')).map(w=>({id:w.id,url:w.webContents.getURL(),visible:w.isVisible(),bounds:w.getBounds(),display:screen.getDisplayMatching(w.getBounds()),focused:w.isFocused()})));}
async function count(n){return poll(inventory,rows=>rows.filter(r=>r.visible).length===n,`Expected ${n} visible companion windows`);}
async function desktop(pet){return poll(async()=>app.windows().find(p=>p.url().endsWith('/desktop/'+encodeURIComponent(pet.petId)))||null,p=>Boolean(p),'Desktop page missing');}
async function metrics(pet){const page=await desktop(pet);await page.locator('.resource-stage[data-status="ready"] canvas').waitFor();const dom=await page.locator('.cp-desktop-visual').evaluate(el=>{const r=el.getBoundingClientRect(),canvas=el.querySelector('canvas');return {visual:{x:r.x,y:r.y,width:r.width,height:r.height},dpr:devicePixelRatio,canvas:{width:canvas.width,height:canvas.height},events:window.__desktopInputs||[]};});const windows=await inventory();return {dom,native:windows.find(w=>w.url.endsWith('/desktop/'+encodeURIComponent(pet.petId))),saved:await invoke('companions','get',{petId:pet.petId})};}
async function caseRun(id,work){try{const detail=await work();proof.checks.push({id,status:'passed-isolated-subset',detail});}catch(error){const blocked=/NATIVE_CURSOR_BLOCKED|NATIVE_INPUT_BLOCKED|OWNED_WINDOW_NOT_FOREGROUND|OWNED_PET_NOT_AT_POINT|START_OUTSIDE_OWNED_WINDOW/.test(String(error));proof.checks.push({id,status:blocked?'blocked':'failed',error:String(error)});if(blocked)mouseBlocked=true;await main?.screenshot({path:join(output,id+'-failure.png'),timeout:10000}).catch(()=>{});}finally{save();}}
async function drag(pet,target){
 const before=await metrics(pet),page=await desktop(pet);await page.evaluate(()=>{window.__desktopInputs=[];if(!window.__desktopObserver){window.__desktopObserver=true;for(const type of ['mousemove','mouseenter','mouseleave','pointermove','pointerenter','pointerleave','pointerdown','pointerup'])document.addEventListener(type,event=>{window.__desktopInputs.push({type:event.type,trusted:event.isTrusted,x:event.screenX,y:event.screenY,clientX:event.clientX,clientY:event.clientY});if(window.__desktopInputs.length>96)window.__desktopInputs.shift();},true);}});
 // Sample compositor PNGs, not the WebGL drawing buffer (which is discarded
 // with preserveDrawingBuffer:false). Animations remain running throughout.
 const geometry=await page.evaluate(()=>{const v=document.querySelector('.cp-desktop-visual').getBoundingClientRect();return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,visual:{x:v.x,y:v.y,width:v.width,height:v.height}};});
 const frames=[];
 for(let frame=0;frame<5;frame++){
   frames.push((await page.screenshot({omitBackground:true,animations:'allow',scale:'device',timeout:10000})).toString('base64'));
   if(frame<4)await new Promise(r=>setTimeout(r,120));
 }
 const opaque=await app.evaluate(({nativeImage},{frames,g})=>{
   const decoded=frames.map(png=>{const image=nativeImage.createFromBuffer(Buffer.from(png,'base64'));return {size:image.getSize(),bytes:image.toBitmap()};});
   const {width,height}=decoded[0].size;
   if(!decoded.every(f=>f.size.width===width&&f.size.height===height))throw Error('NATIVE_INPUT_BLOCKED: compositor frame dimensions changed');
   const sx=width/g.width,sy=height/g.height;
   if(Math.abs(sx-g.dpr)>.02||Math.abs(sy-g.dpr)>.02)throw Error('NATIVE_INPUT_BLOCKED: screenshot DPR mapping ambiguous');
   const v=g.visual,candidates=[];
   for(let y=Math.ceil((v.y+v.height*.12)*sy)+2;y<Math.floor((v.y+v.height*.88)*sy)-2;y+=2){
     for(let x=Math.ceil((v.x+v.width*.18)*sx)+2;x<Math.floor((v.x+v.width*.82)*sx)-2;x+=2){
       if(x<2||y<2||x>=width-2||y>=height-2)continue;
       let minimumAlpha=255;
       for(const f of decoded)for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)minimumAlpha=Math.min(minimumAlpha,f.bytes[((y+dy)*width+x+dx)*4+3]);
       if(minimumAlpha>=240)candidates.push({x:(x+.5)/sx,y:(y+.5)/sy,minimumAlpha,pixel:{x,y}});
     }
   }
   candidates.sort((a,b)=>Math.hypot(a.x-v.x-v.width/2,a.y-v.y-v.height/2)-Math.hypot(b.x-v.x-v.width/2,b.y-v.y-v.height/2));
   if(!candidates.length)throw Error('NATIVE_INPUT_BLOCKED: no common opaque compositor pixel across five animated frames; no OS press attempted');
   return {...candidates[0],sampleSource:'compositor-png',frames:frames.length,neighborhoodPixels:5,screenshot:{width,height},cssViewport:{width:g.width,height:g.height},dpr:g.dpr,scale:{x:sx,y:sy},candidateCount:candidates.length};
 },{frames,g:geometry});
 const points=await app.evaluate(({BrowserWindow,screen},{url,opaque,target})=>{const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()===url),bounds=win.getBounds();const main=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/ui/index.html'));main.show();main.focus();const offset={x:opaque.x,y:opaque.y};return {from:screen.dipToScreenPoint({x:Math.round(bounds.x+offset.x),y:Math.round(bounds.y+offset.y)}),to:screen.dipToScreenPoint({x:Math.round(target.x+offset.x),y:Math.round(target.y+offset.y)}),bounds:screen.dipToScreenRect(win,bounds),processId:process.pid,windowHandle:(()=>{const h=win.getNativeWindowHandle();return (h.length===8?h.readBigInt64LE():BigInt(h.readInt32LE())).toString();})()};},{url:page.url(),opaque,target});
 const observe=async(includeNative=true)=>({
   native:includeNative?JSON.parse(native({action:'probe',windowHandle:points.windowHandle})):null,
   ownedWindows:await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(win=>{const handle=win.getNativeWindowHandle();return {id:win.id,handle:(handle.length===8?handle.readBigInt64LE():BigInt(handle.readInt32LE())).toString(),kind:win.webContents.getURL().includes('/desktop.html')?'pet':'main',visible:win.isVisible(),minimized:win.isMinimized(),alwaysOnTop:win.isAlwaysOnTop(),focused:win.isFocused(),bounds:win.getBounds()};})),
   renderer:await page.evaluate(()=>({events:window.__desktopInputs||[],visualHovered:document.querySelector('.cp-desktop-visual')?.matches(':hover')??false,surfaceHovered:document.querySelector('.cp-desktop-surface')?.matches(':hover')??false,focused:document.hasFocus(),visibility:document.visibilityState,alphaProbe:'Compositor PNG five-frame common opaque point; WebGL drawImage alpha deliberately not used'})),
   host:(await invoke('accounts','settingsGet')).host
 });
 const attempt={petId:pet.petId,points,opaque,at:new Date().toISOString(),before:await observe(false)};
 proof.inputAttempts ||= [];proof.inputAttempts.push(attempt);save();
 let cursor;
 try{
   attempt.moveOnly=JSON.parse(native({action:'move',...points}));
   assert.ok(attempt.moveOnly.physicalDeltaPixels>=2,'Move-only preflight did not produce the required real 2px motion');
   attempt.afterMoveOnly=await observe();save();
   cursor=JSON.parse(native({action:'drag',...points}));attempt.nativeGuard='matched-and-pressed';
 }
 catch(error){attempt.nativeGuard=/OWNED_PET_NOT_AT_POINT|OWNED_WINDOW_NOT_FOREGROUND|START_OUTSIDE_OWNED_WINDOW|NATIVE_CURSOR_BLOCKED/.test(String(error))?'blocked-before-press':'native-operation-failed-outcome-unverified';throw error;}
 finally{native({action:'release'});try{attempt.after=await observe();}catch(error){attempt.observationError=String(error);}save();}

 let after;
 try{after=await poll(()=>metrics(pet),m=>m.dom.events.some(e=>e.type==='pointerup')&&Math.abs(m.saved.desktop.position.x-m.native.bounds.x)<=1&&Math.abs(m.saved.desktop.position.y-m.native.bounds.y)<=1, 'No settled pointerup/position after native drag');}
 catch(error){const observed=await metrics(pet);if(!observed.dom.events.some(e=>e.type==='pointerdown'&&e.trusted))throw Error('NATIVE_INPUT_BLOCKED: physical cursor moved but owned renderer did not receive a trusted press');throw error;}
 assert.ok(after.dom.events.length>=2&&after.dom.events.every(e=>e.trusted),'Native drag must produce trusted pointerdown/up');
 assert.ok(after.native.bounds.x!==before.native.bounds.x||after.native.bounds.y!==before.native.bounds.y,'Trusted drag did not move the native window');
 assert.equal(after.saved.desktop.scale,before.saved.desktop.scale);assert.equal(after.saved.petId,before.saved.petId);
 return {before:{bounds:before.native.bounds,canvas:before.dom.canvas,dpr:before.dom.dpr,scale:before.saved.desktop.scale},after:{bounds:after.native.bounds,canvas:after.dom.canvas,dpr:after.dom.dpr,scale:after.saved.desktop.scale,position:after.saved.desktop.position},points,cursor,events:after.dom.events};
}
try{
 initialCursor=JSON.parse(native({action:'read'}));await open();await invoke('accounts','register',{...credentials,confirmPassword:credentials.password});
 const info=await invoke('app','info');assert.equal(info.scenario.runId,scenario.runId);
 const roster=await invoke('companions','list');for(const template of roster.templates.slice(0,5))pets.push((await invoke('companions','adopt',{templateId:template.templateId,name:template.name,showOnDesktop:false,actionId:randomUUID()})).pet);
 assert.equal(pets.length,5);proof.petIds=pets.map(p=>p.petId);proof.displays=await app.evaluate(({screen})=>screen.getAllDisplays());
 await caseRun('D01-limit-display',async()=>{await limit(4);const samples=[];for(let i=0;i<5;i++){await visible(pets[i],true);samples.push(await count(Math.min(i+1,4)));}await limit(1);const one=await count(1),first=one.find(w=>w.visible);await visible(pets.find(p=>first.url.endsWith('/desktop/'+encodeURIComponent(p.petId))),false);const replacement=await count(1);assert.notEqual(replacement.find(w=>w.visible).url,first.url);for(const pet of pets)await visible(pet,false);await limit(4);await visible(pets[0],true);await visible(pets[1],true);await count(2);return {samples,replacement};});
 await caseRun('D04-per-pet-scale',async()=>{
   const other=await invoke('companions','get',{petId:pets[1].petId});await detail(pets[0]);
   const slider=main.locator('.cp-scale-slider [role="slider"]');
   proof.scaleSteps=[];
   const settled=async expected=>poll(async()=>({
     saved:(await invoke('companions','get',{petId:pets[0].petId})).desktop.scale,
     ui:await slider.evaluate(el=>({value:Number(el.getAttribute('aria-valuenow')),disabled:el.getAttribute('aria-disabled')==='true'||Boolean(el.closest('[data-disabled]')),focused:document.activeElement===el}))
   }),row=>Math.abs(row.saved-expected)<.001&&Math.abs(row.ui.value-expected)<.001&&!row.ui.disabled,'Scale UI and saved value did not settle together');
   const pressScale=async(key,from,to)=>{
     const step={key,expectedBefore:from,expectedAfter:to};proof.scaleSteps.push(step);save();
     step.before=await settled(from);await slider.focus();await slider.press(key);
     try{step.after=await settled(to);}finally{step.observed={saved:(await invoke('companions','get',{petId:pets[0].petId})).desktop.scale,ui:await slider.evaluate(el=>({value:el.getAttribute('aria-valuenow'),disabled:el.getAttribute('aria-disabled')==='true'||Boolean(el.closest('[data-disabled]')),focused:document.activeElement===el}))};save();}
   };
   await pressScale('Home',(await invoke('companions','get',{petId:pets[0].petId})).desktop.scale,.5);const half=await metrics(pets[0]);
   await pressScale('End',.5,2);const twice=await metrics(pets[0]);
   assert.deepEqual(await invoke('companions','get',{petId:pets[1].petId}),other);
   assert.ok(Math.abs(half.native.bounds.width-115)<=1&&Math.abs(twice.native.bounds.width-460)<=1);
   await pressScale('Home',2,.5);
   for(let n=0;n<10;n++)await pressScale('ArrowRight',.5+n*.05,.55+n*.05);
   await settled(1);
   return {half:{bounds:half.native.bounds,scale:half.saved.desktop.scale},twice:{bounds:twice.native.bounds,scale:twice.saved.desktop.scale},otherUnchanged:true};
 });
 await caseRun('D02-ten-native-drags',async()=>{const otherBefore=await invoke('companions','get',{petId:pets[1].petId}),ownGrowth=(await invoke('companions','get',{petId:pets[0].petId})).growth;const records=[];for(let n=0;n<10;n++){const current=await metrics(pets[0]),area=current.native.display.workArea;const x=area.x+Math.min(140+(n%2)*80,area.width-current.native.bounds.width),y=area.y+Math.min(160+(n%2)*60,area.height-current.native.bounds.height);records.push(await drag(pets[0],{x,y}));}const stable=records.map(r=>r.after);assert.ok(Math.max(...stable.map(x=>x.bounds.width))-Math.min(...stable.map(x=>x.bounds.width))<=1);assert.ok(Math.max(...stable.map(x=>x.bounds.height))-Math.min(...stable.map(x=>x.bounds.height))<=1);assert.ok(stable.every(x=>x.scale===1));assert.deepEqual(await invoke('companions','get',{petId:pets[1].petId}),otherBefore);assert.deepEqual((await invoke('companions','get',{petId:pets[0].petId})).growth,ownGrowth);return records;});
 await caseRun('D03-edge-drag',async()=>{if(mouseBlocked)throw Error('NATIVE_INPUT_BLOCKED');const records=[];for(const side of ['left','right','top','bottom']){const m=await metrics(pets[0]),a=m.native.display.workArea,b=m.native.bounds,target={x:b.x,y:b.y};if(side==='left')target.x=a.x;if(side==='right')target.x=a.x+a.width-b.width;if(side==='top')target.y=a.y;if(side==='bottom')target.y=a.y+a.height-b.height;const r=await drag(pets[0],target);assert.ok(r.after.bounds.x>=a.x&&r.after.bounds.y>=a.y&&r.after.bounds.x+r.after.bounds.width<=a.x+a.width+1&&r.after.bounds.y+r.after.bounds.height<=a.y+a.height+1);records.push({side,...r});}return records;});
 await caseRun('D06-restart-same-instance',async()=>{const before=(await invoke('companions','list')).pets.map(p=>({petId:p.petId,desktop:p.desktop,growth:p.growth}));await app.close();app=null;await open();assert.equal((await invoke('accounts','session')).currentUser,null);await invoke('accounts','login',credentials);await count(2);const after=(await invoke('companions','list')).pets.map(p=>({petId:p.petId,desktop:p.desktop,growth:p.growth}));assert.deepEqual(after,before);return {before,after};});
 await caseRun('D07-behavior-ui-subset',async()=>{await detail(pets[0]);const rows=[];for(const [mode,label] of [['sleep','好好休息'],['quiet','安静陪伴']]){await main.locator('.cp-behavior-select').click();await main.getByRole('option',{name:label,exact:true}).click();await poll(()=>invoke('companions','get',{petId:pets[0].petId}),p=>p.desktop.behavior===mode,'Behavior not saved');const page=await desktop(pets[0]);await page.waitForFunction(mode=>document.querySelector('.cp-desktop-surface')?.classList.contains('is-sleeping')===(mode==='sleep'),mode);await page.waitForFunction(action=>document.querySelector('.resource-stage')?.getAttribute('data-action')===action,mode==='sleep'?'sleep':'idle');rows.push({mode,actualClass:await page.locator('.cp-desktop-surface').getAttribute('class'),action:await page.locator('.resource-stage').getAttribute('data-action')});}return {rows,notCovered:['wander/follow physical cursor trajectory','right-click control','physical click-through']};});
 proof.passed=proof.checks.every(c=>c.status==='passed-isolated-subset');
}catch(error){proof.failure=String(error);proof.passed=false;}
finally{try{native({action:'release'});proof.mouseReleased=true;}catch(error){proof.mouseReleaseError=String(error);proof.passed=false;}if(app)await app.close().catch(error=>{proof.closeError=String(error);proof.passed=false;});if(initialCursor)try{native({action:'restore',point:initialCursor});proof.cursorRestored=true;}catch(error){proof.cursorRestoreError=String(error);proof.passed=false;}proof.completedAt=new Date().toISOString();save();console.log(JSON.stringify({output,checks:proof.checks,passed:proof.passed,failure:proof.failure},null,2));if(!proof.passed)process.exitCode=1;}
