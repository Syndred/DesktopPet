// Opt-in Windows UIA helper for disposable QA profiles ONLY. No SendKeys, global
// clicks, shell dialogs from other processes, overwrite confirmations, or grants.
// A newly created unparented dialog is allowed ONLY in the verified main PID
// after a no-existing-dialog handshake and normal UI trigger. Nonzero owners
// must chain to the exact main HWND. Current bridge receipts stay partial.
// UIA APIs: https://learn.microsoft.com/dotnet/api/system.windows.automation.valuepattern.setvalue
// https://learn.microsoft.com/dotnet/api/system.windows.automation.invokepattern.invoke
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,realpathSync,lstatSync,existsSync,rmSync} from 'node:fs';
import {join,resolve,relative,isAbsolute,dirname,sep} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';

const scopes=new WeakSet();
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const inside=(root,file)=>{const rel=relative(root,file);return rel!==''&&rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel);};
const canonical=file=>realpathSync.native(file);
const samePath=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
/** Create a new owned dialog directory beneath an already verified QA profile.
 * Callers may put only synthetic/copy fixtures in it; no existing directory is
 * accepted as a scope. The scope capability is private to this module instance. */
export function createNativeDialogScope({profile,runId}){
 const actual=canonical(profile),marker=JSON.parse(readFileSync(join(actual,'.lingjing-qa-profile.json'),'utf8'));
 assert.equal(marker.application,'lingjing');assert.equal(marker.schemaVersion,1);assert.equal(marker.isolated,true);assert.equal(marker.scenario,'unified-battle');assert.equal(marker.runId,runId);
 assert.match(runId,/^[0-9a-f-]{36}$/i);assert.ok(samePath(canonical(marker.profilePath),actual));
 const directory=canonical(mkdtempSync(join(actual,'native-dialog-')));assert.ok(inside(actual,directory));
 const scope=Object.freeze({profile:actual,runId,directory});scopes.add(scope);return scope;
}
/** Convert Electron's getNativeWindowHandle() bytes to a precise HWND string. */
export function nativeWindowHandleDecimal(bytes){
 const data=Buffer.from(bytes);assert.ok(data.length===4||data.length===8);
 const value=data.length===8?data.readBigUInt64LE():BigInt(data.readUInt32LE());
 assert.ok(value>0n&&value<=0x7fffffffffffffffn);return value.toString();
}
function validateFile(scope,filePath,kind){
 assert.ok(scopes.has(scope),'Only a scope created by this helper is accepted');
 assert.ok(samePath(canonical(scope.directory),scope.directory),'Scope directory moved');
 const file=resolve(filePath);assert.ok(inside(scope.directory,file),'File must be within the fresh owned dialog directory');
 const rel=relative(scope.directory,file);assert.ok(!/[\x00-\x1f]/.test(rel));
 assert.ok(rel.split(sep).every(part=>part&&part!=='.'&&part!=='..'&&!/[:. ]$/.test(part)&&!part.includes(':')),'Unsafe fixture file name');
 assert.ok(/\.json$/i.test(file),'Only JSON backup/resource fixtures are supported');
 let cursor=scope.directory;
 for(const part of relative(scope.directory,dirname(file)).split(sep).filter(Boolean)){
  cursor=join(cursor,part);const stat=lstatSync(cursor);assert.ok(stat.isDirectory()&&!stat.isSymbolicLink(),'No linked fixture directories');
  assert.ok(inside(scope.directory,canonical(cursor)),'Fixture parent escaped scope');
 }
 if(kind==='save')assert.equal(existsSync(file),false,'Refuse an existing save target; never accept overwrite confirmation');
 else {const stat=lstatSync(file);assert.ok(stat.isFile()&&!stat.isSymbolicLink());assert.ok(inside(scope.directory,canonical(file)));}
 return file;
}
const controller=String.raw`param([Parameter(Mandatory=$true)][string]$SettingsFile)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
$c=Get-Content -LiteralPath $SettingsFile -Raw -Encoding UTF8 | ConvertFrom-Json
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class OwnedDialogNative {
 public delegate bool Callback(IntPtr hwnd,IntPtr data);
 [DllImport("user32.dll")] public static extern bool EnumWindows(Callback callback,IntPtr data);
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hwnd,uint command);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd,StringBuilder text,int count);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd,StringBuilder text,int count);
 public static uint Pid(IntPtr hwnd){uint pid;GetWindowThreadProcessId(hwnd,out pid);return pid;}
 public static string Class(IntPtr hwnd){var b=new StringBuilder(256);GetClassName(hwnd,b,b.Capacity);return b.ToString();}
 public static string Title(IntPtr hwnd){var b=new StringBuilder(1024);GetWindowText(hwnd,b,b.Capacity);return b.ToString();}
 public static IntPtr[] Candidates(uint pid,string title){var found=new List<IntPtr>();EnumWindows((h,d)=>{if(IsWindowVisible(h)&&Pid(h)==pid&&Class(h)=="#32770"&&Title(h)==title)found.Add(h);return true;},IntPtr.Zero);return found.ToArray();}
 public static IntPtr[] Dialogs(uint pid){var found=new List<IntPtr>();EnumWindows((h,d)=>{if(Pid(h)==pid&&Class(h)=="#32770")found.Add(h);return true;},IntPtr.Zero);return found.ToArray();}
}
'@ | Out-Null
function Emit($value){[Console]::Out.WriteLine(($value|ConvertTo-Json -Compress -Depth 6));[Console]::Out.Flush()}
$owner=[IntPtr]::new([Int64]::Parse([string]$c.ownerWindowHandle))
$ownerPid=[int]$c.ownerPid
$birth=$null
$deadline=[DateTime]::UtcNow.AddMilliseconds([double]$c.timeoutMs)
function Owner-Still-Exact {
 $p=[Diagnostics.Process]::GetProcessById($ownerPid)
 if($p.HasExited){throw 'OWNED_MAIN_EXITED'}
 if(-not [String]::Equals($p.MainModule.FileName,[string]$c.ownerExecutablePath,[StringComparison]::OrdinalIgnoreCase)){throw 'OWNED_MAIN_IMAGE_CHANGED'}
 if($script:birth -and $p.StartTime.ToUniversalTime().Ticks -ne $script:birth){throw 'OWNED_MAIN_PID_REUSED'}
 if(-not [OwnedDialogNative]::IsWindow($owner) -or [OwnedDialogNative]::Pid($owner) -ne $ownerPid){throw 'OWNED_MAIN_HWND_CHANGED'}
 return $p.StartTime.ToUniversalTime().Ticks
}
function Check-Dialog-Owner([IntPtr]$dialog){
 $parent=[OwnedDialogNative]::GetWindow($dialog,4)
 if($parent -eq [IntPtr]::Zero){return 'unparented'}
 for($depth=0;$depth -lt 16;$depth++){
  if($parent -eq $owner){return 'owned-main-chain'}
  if($parent -eq [IntPtr]::Zero -or [OwnedDialogNative]::Pid($parent) -ne $ownerPid){throw 'DIALOG_HAS_UNRELATED_OWNER_CHAIN'}
  $parent=[OwnedDialogNative]::GetWindow($parent,4)
 }
 throw 'DIALOG_OWNER_CHAIN_TOO_DEEP'
}
function Dialog-Still-Exact([IntPtr]$dialog){
 Owner-Still-Exact | Out-Null
 if(-not [OwnedDialogNative]::IsWindow($dialog) -or -not [OwnedDialogNative]::IsWindowVisible($dialog) -or [OwnedDialogNative]::Pid($dialog) -ne $ownerPid -or [OwnedDialogNative]::Class($dialog) -ne '#32770' -or [OwnedDialogNative]::Title($dialog) -cne [string]$c.expectedTitle){throw 'DIALOG_IDENTITY_CHANGED'}
 Check-Dialog-Owner $dialog | Out-Null
 if([OwnedDialogNative]::GetForegroundWindow() -ne $dialog){throw 'DIALOG_NOT_FOREGROUND'}
}
try{
 $birth=Owner-Still-Exact
 if([OwnedDialogNative]::GetForegroundWindow() -ne $owner){throw 'OWNED_MAIN_NOT_FOREGROUND_BEFORE_TRIGGER'}
 $existing=@([OwnedDialogNative]::Dialogs([uint32]$ownerPid))
 if($existing.Count -ne 0){throw 'PREEXISTING_OWNED_PROCESS_DIALOG_REFUSED'}
 Emit @{phase='ready';ownerPid=$ownerPid;ownerWindowHandle=$owner.ToInt64().ToString();processStartTicks=$birth.ToString()}
 $dialog=[IntPtr]::Zero
 while([DateTime]::UtcNow -lt $deadline){
  Owner-Still-Exact | Out-Null
  $found=@([OwnedDialogNative]::Candidates([uint32]$ownerPid,[string]$c.expectedTitle))
  if($found.Count -gt 1){throw 'AMBIGUOUS_OWNED_DIALOG'}
  if($found.Count -eq 1){
   $dialog=$found[0]
   $ownership=Check-Dialog-Owner $dialog
   Emit @{phase='new-dialog-identified';dialogHandle=$dialog.ToInt64().ToString();owner=([OwnedDialogNative]::GetWindow($dialog,4)).ToInt64().ToString();ownership=$ownership;preexistingDialogs=0}
   break
  }
  $fg=[OwnedDialogNative]::GetForegroundWindow()
  if($fg -ne $owner -and [OwnedDialogNative]::Pid($fg) -ne $ownerPid){throw 'FOREGROUND_LEFT_OWNED_PROCESS'}
  Start-Sleep -Milliseconds 100
 }
 if($dialog -eq [IntPtr]::Zero){throw 'EXPECTED_NATIVE_DIALOG_NOT_FOUND'}
 Dialog-Still-Exact $dialog
 $root=[System.Windows.Automation.AutomationElement]::FromHandle($dialog)
 if($root.Current.ProcessId -ne $ownerPid -or $root.Current.ClassName -ne '#32770'){throw 'UIA_ROOT_IDENTITY_MISMATCH'}
 $edits=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,([System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Edit)))
 $candidates=@()
 foreach($edit in $edits){
  $id=$edit.Current.AutomationId;$name=$edit.Current.Name
  if($id -eq '1148' -or $name -match '^(File name:|File name|文件名\(?[Nn]?\)?:|文件名[：:]?)$'){
   $pattern=$null
   if($edit.Current.ProcessId -eq $ownerPid -and $edit.Current.IsEnabled -and -not $edit.Current.IsOffscreen -and $edit.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern,[ref]$pattern) -and -not $pattern.Current.IsReadOnly){$candidates+=@{element=$edit;pattern=$pattern;id=$id;name=$name}}
  }
 }
 if($candidates.Count -ne 1){throw 'UNIQUE_STANDARD_FILENAME_EDIT_NOT_FOUND'}
 $buttons=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,([System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Button)))
 $actions=@()
 foreach($button in $buttons){
  $name=($button.Current.Name -replace '&','' -replace '\s*\([A-Za-z]\)\s*$','').Trim()
  $expected=if($c.kind -eq 'save'){@('Save','保存')}else{@('Open','打开')}
  $pattern=$null
  if($button.Current.ProcessId -eq $ownerPid -and $button.Current.AutomationId -eq '1' -and $expected -ccontains $name -and $button.Current.IsEnabled -and -not $button.Current.IsOffscreen -and $button.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$pattern)){$actions+=@{element=$button;pattern=$pattern;name=$name}}
 }
 if($actions.Count -ne 1){throw 'UNIQUE_EXPECTED_OPEN_SAVE_ACTION_NOT_FOUND'}
 Dialog-Still-Exact $dialog
 if($c.kind -eq 'save' -and (Test-Path -LiteralPath $c.filePath)){throw 'SAVE_TARGET_APPEARED_REFUSE_OVERWRITE'}
 $candidates[0].pattern.SetValue([string]$c.filePath)
 if($candidates[0].pattern.Current.Value -cne [string]$c.filePath){throw 'FILENAME_VALUE_READBACK_MISMATCH'}
 Dialog-Still-Exact $dialog
 if($c.kind -eq 'save' -and (Test-Path -LiteralPath $c.filePath)){throw 'SAVE_TARGET_APPEARED_REFUSE_OVERWRITE'}
 if($c.kind -eq 'open' -and (Get-FileHash -LiteralPath $c.filePath -Algorithm SHA256).Hash.ToLowerInvariant() -cne [string]$c.expectedSha256){throw 'OPEN_FIXTURE_CHANGED_BEFORE_INVOKE'}
 Emit @{phase='filename-verified';dialogHandle=$dialog.ToInt64().ToString();editAutomationId=$candidates[0].id;action=$actions[0].name}
 $actions[0].pattern.Invoke()
 while([DateTime]::UtcNow -lt $deadline){
  Owner-Still-Exact | Out-Null
  if(-not [OwnedDialogNative]::IsWindow($dialog) -or -not [OwnedDialogNative]::IsWindowVisible($dialog)){
   if([OwnedDialogNative]::GetForegroundWindow() -ne $owner){throw 'UNEXPECTED_FOREGROUND_AFTER_DIALOG'}
   Emit @{phase='dialog-closed';ownerPid=$ownerPid;dialogHandle=$dialog.ToInt64().ToString();nativeAction=$actions[0].name;overwriteAccepted=$false};exit 0
  }
  # Includes overwrite/error/credential subdialogs: never accept or type in them.
  if([OwnedDialogNative]::GetForegroundWindow() -ne $dialog){throw 'UNEXPECTED_SECONDARY_DIALOG_OR_FOREGROUND'}
  Start-Sleep -Milliseconds 100
 }
 throw 'NATIVE_DIALOG_DID_NOT_CLOSE'
}catch{Emit @{phase='failed';message=$_.Exception.Message};exit 1}
`;

/** Drive one real native dialog after a normal production UI trigger.
 * ownerWindowHandle/executablePath must come from the already ownership-verified
 * SFX main process. Caller first focuses that exact main window; this helper
 * never steals focus. verifyResult MUST inspect the actual UI/receipt or expected
 * product rejection. Dialog closure alone is never a business success.
 * On failure only our PowerShell helper is stopped. The caller remains responsible
 * for its exact app-PID cleanup; an unknown/modal dialog is left untouched. */
export async function driveNativeFileDialog({scope,kind,filePath,ownerPid,ownerWindowHandle,ownerExecutablePath,expectedTitle,expectedSha256,timeoutMs=30000},trigger,verifyResult){
 assert.equal(process.platform,'win32');assert.equal(process.env.GITHUB_ACTIONS,'true','Native dialog automation is authorized only on the disposable GitHub runner');assert.ok(kind==='open'||kind==='save');assert.equal(typeof trigger,'function');assert.equal(typeof verifyResult,'function');
 assert.ok(Number.isSafeInteger(ownerPid)&&ownerPid>0);assert.match(String(ownerWindowHandle),/^[1-9][0-9]*$/);assert.ok(BigInt(ownerWindowHandle)<=0x7fffffffffffffffn);
 assert.ok(isAbsolute(ownerExecutablePath));assert.ok(lstatSync(ownerExecutablePath).isFile());
 assert.ok(typeof expectedTitle==='string'&&expectedTitle.length>0&&expectedTitle.length<=120&&!/[\r\n\x00]/.test(expectedTitle));
 assert.ok(Number.isSafeInteger(timeoutMs)&&timeoutMs>=5000&&timeoutMs<=60000);
 const file=validateFile(scope,filePath,kind);const original=kind==='open'?readFileSync(file):null;
 if(kind==='open'){assert.match(expectedSha256||'',/^[a-f0-9]{64}$/);assert.equal(sha(original),expectedSha256,'Open fixture must match caller-selected exact bytes');}
 const id=randomUUID(),scriptFile=join(scope.directory,`dialog-controller-${id}.ps1`),settingsFile=join(scope.directory,`dialog-controller-${id}.json`);
 writeFileSync(scriptFile,'\ufeff'+controller,{flag:'wx'});writeFileSync(settingsFile,JSON.stringify({kind,filePath:file,ownerPid,ownerWindowHandle:String(ownerWindowHandle),ownerExecutablePath:resolve(ownerExecutablePath),expectedTitle,expectedSha256:kind==='open'?expectedSha256:null,timeoutMs}),{flag:'wx'});
 const shell=join(process.env.SystemRoot||process.env.WINDIR||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 const systemKeys=new Set(['PATH','PATHEXT','SYSTEMROOT','SYSTEMDRIVE','WINDIR','COMSPEC','TEMP','TMP','TMPDIR','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMFILES','PROGRAMFILES(X86)','PROGRAMW6432']);
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>systemKeys.has(key.toUpperCase())));
 const child=spawn(shell,['-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File',scriptFile,'-SettingsFile',settingsFile],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let stderr='',buffer='',readyResolve,readyReject,doneResolve,doneReject,timer;const phases=[];
 const ready=new Promise((yes,no)=>{readyResolve=yes;readyReject=no;}),done=new Promise((yes,no)=>{doneResolve=yes;doneReject=no;});
 // Attach rejection handlers before trigger/handshake sequencing.
 ready.catch(()=>{});done.catch(()=>{});
 const fail=error=>{readyReject(error);doneReject(error);};
 child.on('error',fail);child.stderr.on('data',bytes=>{stderr=(stderr+bytes.toString('utf8')).slice(-4000);});
 child.stdout.on('data',bytes=>{buffer+=bytes.toString('utf8');if(buffer.length>32000){fail(Error('Unexpected controller output size'));return;}let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index).trim();buffer=buffer.slice(index+1);if(!line)continue;try{const value=JSON.parse(line);phases.push(value);if(value.phase==='ready')readyResolve(value);if(value.phase==='failed')fail(Error(value.message));}catch{fail(Error('Invalid controller protocol'));}}});
 child.on('exit',(code,signal)=>{if(code===0&&phases.some(row=>row.phase==='dialog-closed'))doneResolve();else fail(Error(`Native controller failed (${code ?? signal}): ${stderr}`));});
 const deadline=Date.now()+timeoutMs+5000;
 const timed=new Promise((_yes,no)=>{timer=setTimeout(()=>{const error=Error('Owned native dialog operation timed out');fail(error);no(error);},timeoutMs+5000);});timed.catch(()=>{});
 try{
  await Promise.race([ready,timed]);
  const triggered=Promise.resolve().then(trigger);triggered.catch(()=>{});
  await Promise.race([Promise.all([triggered,done]),timed]);
  if(kind==='save')while(!existsSync(file)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
  assert.ok(existsSync(file),'Product did not create/retain the expected selected file');
  const stat=lstatSync(file);assert.ok(stat.isFile()&&!stat.isSymbolicLink());assert.ok(inside(scope.directory,canonical(file)));
  const bytes=readFileSync(file);assert.ok(bytes.length>0);
  if(kind==='open')assert.deepEqual(bytes,original,'Opening a backup must not alter original bytes');
  const fileEvidence={filePath:file,bytes:bytes.length,sha256:sha(bytes)};
  const business=await Promise.race([Promise.resolve().then(()=>verifyResult(fileEvidence)),timed]);
  assert.equal(business?.verified,true,'Caller must independently verify product UI/receipt');
  return {nativeDialogCompleted:true,nativePickerUsed:true,file:fileEvidence,phases,business,controllerPid:child.pid};
 }catch(error){error.nativeDialogEvidence={phases,controllerPid:child.pid,selectedFile:file,kind};throw error;}
 finally{
  clearTimeout(timer);
  if(child.exitCode===null&&child.signalCode===null)child.kill();
  // Do not clean helper files until the exact child is known to have exited.
  if(child.exitCode===null&&child.signalCode===null)await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,3000))]);
  if(child.pid&&child.exitCode===null&&child.signalCode===null)throw Error('Exact native-dialog helper exit was not confirmed; keep its owned files');
  if(!child.pid||child.exitCode!==null||child.signalCode!==null){rmSync(scriptFile,{force:true});rmSync(settingsFile,{force:true});}
 }
}
