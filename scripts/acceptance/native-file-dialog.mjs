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
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

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
$ProgressPreference='SilentlyContinue'
# Never discover modules through inherited/user/network module search paths.
$PSModuleAutoLoadingPreference='None'
# Literal ASCII phase must not depend on ConvertTo-Json/module autoload.
[Console]::Out.WriteLine('{"phase":"controller-script-entered"}');[Console]::Out.Flush()
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
# Windows PowerShell 5 runs on .NET Framework. DeserializeObject does not
# instantiate caller-specified types; only the flat owned controller JSON is read.
[void][System.Reflection.Assembly]::Load('System.Web.Extensions, Version=4.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35')
$json=[System.Web.Script.Serialization.JavaScriptSerializer]::new()
$json.MaxJsonLength=65536
$json.RecursionLimit=16
function Emit($value){[Console]::Out.WriteLine($json.Serialize($value));[Console]::Out.Flush()}
[Console]::Out.WriteLine('{"phase":"controller-started"}');[Console]::Out.Flush()
# Read only the exact settings file created by this operation. Avoid the
# Management Get-Content/provider initialization path; retain JSON parsing.
$settingsText=[System.IO.File]::ReadAllText($SettingsFile,[System.Text.Encoding]::UTF8)
[Console]::Out.WriteLine('{"phase":"settings-text-read"}');[Console]::Out.Flush()
if($settingsText.Length -gt 65536){throw 'OWNED_SETTINGS_TOO_LARGE'}
$c=$json.DeserializeObject($settingsText)
[Console]::Out.WriteLine('{"phase":"settings-json-parsed"}');[Console]::Out.Flush()
[Console]::Out.WriteLine('{"phase":"settings-read"}');[Console]::Out.Flush()
# Windows PowerShell ships the Utility manifest under PSHOME/Modules; its
# binary may be GAC-resolved, not a DLL directly beside powershell.exe.
# Fixed system manifest only; automatic module discovery remains disabled.
# https://devblogs.microsoft.com/scripting/verify-powershell-module-manifests/
$utilityManifest=[System.IO.Path]::Combine($PSHOME,'Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1')
if(-not [System.IO.File]::Exists($utilityManifest)){throw 'SYSTEM_UTILITY_MANIFEST_MISSING'}
Microsoft.PowerShell.Core\Import-Module -Name $utilityManifest -ErrorAction Stop
Emit @{phase='system-utility-loaded'}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Emit @{phase='uia-assemblies-loaded'}
# Reflection only: never obtain a desktop/root/window element in this preflight.
$apiChecks=0
function Require-Method([Type]$type,[string]$name,[Type[]]$parameters,[Type]$returns,[bool]$static){
 $flags=if($static){[Reflection.BindingFlags]'Public,Static'}else{[Reflection.BindingFlags]'Public,Instance'}
 $m=$type.GetMethod($name,$flags,$null,$parameters,$null)
 if($null -eq $m -or $m.ReturnType -ne $returns){throw ('UIA_API_METHOD_MISSING:'+ $type.FullName+'.'+$name)}
 $script:apiChecks++
}
function Require-Property([Type]$type,[string]$name,[Type]$returns,[bool]$static){
 $flags=if($static){[Reflection.BindingFlags]'Public,Static,FlattenHierarchy'}else{[Reflection.BindingFlags]'Public,Instance'}
 $p=$type.GetProperty($name,$flags)
 if($null -eq $p -or $p.PropertyType -ne $returns -or $null -eq $p.GetGetMethod()){throw ('UIA_API_PROPERTY_MISSING:'+ $type.FullName+'.'+$name)}
 $script:apiChecks++
}
function Require-Field([Type]$type,[string]$name,[Type]$returns){
 $f=$type.GetField($name,[Reflection.BindingFlags]'Public,Static,FlattenHierarchy')
 if($null -eq $f -or $f.FieldType -ne $returns){throw ('UIA_API_FIELD_MISSING:'+ $type.FullName+'.'+$name)}
 $script:apiChecks++
}
$ae=[System.Windows.Automation.AutomationElement]
$tw=[System.Windows.Automation.TreeWalker]
$ct=[System.Windows.Automation.ControlType]
$info=[System.Windows.Automation.AutomationElement+AutomationElementInformation]
Require-Method ([System.Windows.Automation.Automation]) 'Compare' @($ae,$ae) ([bool]) $true
Require-Method $ae 'FromHandle' @([IntPtr]) $ae $true
Require-Method $ae 'FindAll' @([System.Windows.Automation.TreeScope],[System.Windows.Automation.Condition]) ([System.Windows.Automation.AutomationElementCollection]) $false
Require-Method $ae 'TryGetCurrentPattern' @([System.Windows.Automation.AutomationPattern],([object].MakeByRefType())) ([bool]) $false
Require-Method $tw 'GetParent' @($ae) $ae $false
Require-Method ([System.Windows.Automation.ValuePattern]) 'SetValue' @([string]) ([void]) $false
Require-Method ([System.Windows.Automation.InvokePattern]) 'Invoke' @() ([void]) $false
Require-Field $tw 'ControlViewWalker' $tw
Require-Property $ae 'Current' $info $false
foreach($name in @('AutomationId','Name','ClassName')){Require-Property $info $name ([string]) $false}
foreach($name in @('IsEnabled','IsOffscreen')){Require-Property $info $name ([bool]) $false}
Require-Property $info 'ProcessId' ([int]) $false
Require-Property $info 'ControlType' $ct $false
Require-Property $ct 'ProgrammaticName' ([string]) $false
Require-Property ([System.Windows.Automation.AutomationElementCollection]) 'Count' ([int]) $false
Require-Property ([System.Windows.Automation.ValuePattern]) 'Current' ([System.Windows.Automation.ValuePattern+ValuePatternInformation]) $false
Require-Property ([System.Windows.Automation.ValuePattern+ValuePatternInformation]) 'IsReadOnly' ([bool]) $false
Require-Property ([System.Windows.Automation.ValuePattern+ValuePatternInformation]) 'Value' ([string]) $false
Require-Field $ae 'ControlTypeProperty' ([System.Windows.Automation.AutomationProperty])
Require-Field ([System.Windows.Automation.Condition]) 'TrueCondition' ([System.Windows.Automation.Condition])
foreach($name in @('Edit','ComboBox','Button')){Require-Field $ct $name $ct}
Require-Field ([System.Windows.Automation.ValuePattern]) 'Pattern' ([System.Windows.Automation.AutomationPattern])
Require-Field ([System.Windows.Automation.InvokePattern]) 'Pattern' ([System.Windows.Automation.AutomationPattern])
$ctor=[System.Windows.Automation.PropertyCondition].GetConstructor([Type[]]@([System.Windows.Automation.AutomationProperty],[object]))
if($null -eq $ctor){throw 'UIA_API_PROPERTY_CONDITION_CONSTRUCTOR_MISSING'}
$apiChecks++
if(-not [System.Collections.IEnumerable].IsAssignableFrom([System.Windows.Automation.AutomationElementCollection])){throw 'UIA_API_COLLECTION_NOT_ENUMERABLE'}
$apiChecks++
Emit @{phase='uia-api-contract-verified';checks=$apiChecks;reflectionOnly=$true;uiAccessed=$false}
if($c.apiSelftest -eq $true){Emit @{phase='uia-api-selftest-passed';checks=$apiChecks;appStarted=$false;uiAccessed=$false};exit 0}

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
Emit @{phase='native-controller-compiled'}
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
  [System.Threading.Thread]::Sleep(100)
 }
 if($dialog -eq [IntPtr]::Zero){throw 'EXPECTED_NATIVE_DIALOG_NOT_FOUND'}
 Dialog-Still-Exact $dialog
 # A new HWND can precede the provider's filename controls. Re-snapshot ONLY
 # this same verified dialog, within the unchanged operation deadline.
 $controlSnapshots=0;$candidates=@();$actions=@();$controlWaitStarted=[DateTime]::UtcNow
 while([DateTime]::UtcNow -lt $deadline){
  Dialog-Still-Exact $dialog
  $root=[System.Windows.Automation.AutomationElement]::FromHandle($dialog)
  if($root.Current.ProcessId -ne $ownerPid -or $root.Current.ClassName -ne '#32770'){throw 'UIA_ROOT_IDENTITY_MISMATCH'}
  $walker=[System.Windows.Automation.TreeWalker]::ControlViewWalker
  $edits=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,([System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Edit)))
  $candidates=@()
  foreach($edit in $edits){
   $id=$edit.Current.AutomationId;$name=$edit.Current.Name
   $parent=$walker.GetParent($edit)
   # Modern IFileDialog: filename ComboBox 1148 owns Edit 1001. Never
   # accept an arbitrary Edit 1001 (the dialog also has search/address edits).
   $modern=$id -eq '1001' -and $edit.Current.ClassName -eq 'Edit' -and $null -ne $parent -and $parent.Current.ProcessId -eq $ownerPid -and $parent.Current.ControlType -eq [System.Windows.Automation.ControlType]::ComboBox -and $parent.Current.AutomationId -eq '1148' -and $parent.Current.ClassName -eq 'ComboBox'
   $standard=$id -eq '1148' -or $name -match '^(File name:|File name|文件名\(?[Nn]?\)?:|文件名[：:]?)$'
   if($standard -or $modern){
    $pattern=$null
    if($edit.Current.ProcessId -eq $ownerPid -and $edit.Current.IsEnabled -and -not $edit.Current.IsOffscreen -and $edit.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern,[ref]$pattern) -and -not $pattern.Current.IsReadOnly){$candidates+=@{element=$edit;pattern=$pattern;id=$id;name=$name;selector=$(if($modern){'filename-combobox-1148/direct-edit-1001'}else{'standard-filename-edit'})}}
   }
  }
  $buttons=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,([System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Button)))
  $actions=@()
  foreach($button in $buttons){
   $name=($button.Current.Name -replace '&','' -replace '\s*\([A-Za-z]\)\s*$','').Trim()
   $expected=if($c.kind -eq 'save'){@('Save','保存')}else{@('Open','打开')}
   $pattern=$null
   if($button.Current.ProcessId -eq $ownerPid -and $button.Current.AutomationId -eq '1' -and $expected -ccontains $name -and $button.Current.IsEnabled -and -not $button.Current.IsOffscreen -and $button.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$pattern)){$actions+=@{element=$button;pattern=$pattern;name=$name}}
  }
  $controlSnapshots++
  if($candidates.Count -gt 1){throw 'MULTIPLE_STANDARD_FILENAME_EDITS_REFUSED'}
  if($actions.Count -gt 1){throw 'MULTIPLE_EXPECTED_OPEN_SAVE_ACTIONS_REFUSED'}
  if($controlSnapshots -eq 1 -or ($candidates.Count -eq 1 -and $actions.Count -eq 1)){
   Emit @{phase='dialog-controls-snapshot';snapshot=$controlSnapshots;elapsedMs=[int]([DateTime]::UtcNow-$controlWaitStarted).TotalMilliseconds;filenameCandidates=$candidates.Count;actionCandidates=$actions.Count}
  }
  if($candidates.Count -eq 1 -and $actions.Count -eq 1){break}
  [System.Threading.Thread]::Sleep(100)
 }
 if($controlSnapshots -eq 0){throw 'NATIVE_DIALOG_CONTROL_DEADLINE_EXPIRED'}
 Emit @{phase='dialog-controls-wait-finished';snapshots=$controlSnapshots;elapsedMs=[int]([DateTime]::UtcNow-$controlWaitStarted).TotalMilliseconds;filenameCandidates=$candidates.Count;actionCandidates=$actions.Count}
 if($candidates.Count -ne 1 -or $actions.Count -ne 1){
  Dialog-Still-Exact $dialog
  # Bounded metadata ONLY from this already verified dialog. No ValuePattern,
  # text value, file-list item content, desktop/global walk, or input fallback.
  function Control-Metadata($element){
   $v=$element.Current
   return @{controlType=$v.ControlType.ProgrammaticName;id=([string]$v.AutomationId).Substring(0,[Math]::Min(80,([string]$v.AutomationId).Length));name=([string]$v.Name).Substring(0,[Math]::Min(120,([string]$v.Name).Length));class=([string]$v.ClassName).Substring(0,[Math]::Min(80,([string]$v.ClassName).Length));enabled=$v.IsEnabled;offscreen=$v.IsOffscreen}
  }
  $metadata=@()
  # ControlView may skip a provider root: independently prove each diagnostic
  # ancestor belongs to this dialog before reading its display metadata.
  # Compare is on Automation (not AutomationElement):
  # https://learn.microsoft.com/dotnet/api/system.windows.automation.automation.compare
  $dialogMembers=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
  $combos=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,([System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::ComboBox)))
  foreach($group in @($edits,$combos)){
   foreach($element in $group){
    if($metadata.Count -ge 16){break}
    if($element.Current.ProcessId -ne $ownerPid){continue}
    $entry=Control-Metadata $element;$parents=@();$ancestor=$walker.GetParent($element)
    for($depth=0;$depth -lt 3 -and $null -ne $ancestor;$depth++){
     $insideDialog=[System.Windows.Automation.Automation]::Compare($ancestor,$root)
     if(-not $insideDialog -and $dialogMembers.Count -le 512){
      foreach($member in $dialogMembers){if([System.Windows.Automation.Automation]::Compare($ancestor,$member)){$insideDialog=$true;break}}
     }
     if(-not $insideDialog -or $ancestor.Current.ProcessId -ne $ownerPid){break}
     $parents+=Control-Metadata $ancestor
     if([System.Windows.Automation.Automation]::Compare($ancestor,$root)){break}
     $ancestor=$walker.GetParent($ancestor)
    }
    $entry.parents=$parents;$metadata+=$entry
   }
  }
  Emit @{phase='filename-control-diagnostic';candidateCount=$candidates.Count;actionCandidateCount=$actions.Count;controls=$metadata;maxControls=16;maxParentDepth=3;valuesCollected=$false}
  if($candidates.Count -ne 1){throw 'UNIQUE_STANDARD_FILENAME_EDIT_NOT_FOUND'}
  throw 'UNIQUE_EXPECTED_OPEN_SAVE_ACTION_NOT_FOUND'
 }
 if([DateTime]::UtcNow -ge $deadline){throw 'NATIVE_DIALOG_CONTROL_DEADLINE_EXPIRED'}
 Dialog-Still-Exact $dialog
 if($c.kind -eq 'save' -and ([System.IO.File]::Exists([string]$c.filePath) -or [System.IO.Directory]::Exists([string]$c.filePath))){throw 'SAVE_TARGET_APPEARED_REFUSE_OVERWRITE'}
 $candidates[0].pattern.SetValue([string]$c.filePath)
 if($candidates[0].pattern.Current.Value -cne [string]$c.filePath){throw 'FILENAME_VALUE_READBACK_MISMATCH'}
 Dialog-Still-Exact $dialog
 if($c.kind -eq 'save' -and ([System.IO.File]::Exists([string]$c.filePath) -or [System.IO.Directory]::Exists([string]$c.filePath))){throw 'SAVE_TARGET_APPEARED_REFUSE_OVERWRITE'}
 if($c.kind -eq 'open'){
  $hasher=[System.Security.Cryptography.SHA256]::Create()
  try{$actualHash=[System.BitConverter]::ToString($hasher.ComputeHash([System.IO.File]::ReadAllBytes([string]$c.filePath))).Replace('-','').ToLowerInvariant()}finally{$hasher.Dispose()}
  if($actualHash -cne [string]$c.expectedSha256){throw 'OPEN_FIXTURE_CHANGED_BEFORE_INVOKE'}
 }
 Emit @{phase='filename-verified';dialogHandle=$dialog.ToInt64().ToString();editAutomationId=$candidates[0].id;selector=$candidates[0].selector;action=$actions[0].name}
 $actions[0].pattern.Invoke()
 while([DateTime]::UtcNow -lt $deadline){
  Owner-Still-Exact | Out-Null
  if(-not [OwnedDialogNative]::IsWindow($dialog) -or -not [OwnedDialogNative]::IsWindowVisible($dialog)){
   if([OwnedDialogNative]::GetForegroundWindow() -ne $owner){throw 'UNEXPECTED_FOREGROUND_AFTER_DIALOG'}
   Emit @{phase='dialog-closed';ownerPid=$ownerPid;dialogHandle=$dialog.ToInt64().ToString();nativeAction=$actions[0].name;overwriteAccepted=$false};exit 0
  }
  # Includes overwrite/error/credential subdialogs: never accept or type in them.
  if([OwnedDialogNative]::GetForegroundWindow() -ne $dialog){throw 'UNEXPECTED_SECONDARY_DIALOG_OR_FOREGROUND'}
  [System.Threading.Thread]::Sleep(100)
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
 const systemKeys=new Set(['PATH','PATHEXT','SYSTEMROOT','SYSTEMDRIVE','WINDIR','COMSPEC','TEMP','TMP','TMPDIR','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMFILES','PROGRAMFILES(X86)','PROGRAMW6432','RUNNER_TRACKING_ID']);
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>systemKeys.has(key.toUpperCase())));
 // Match the working Windows runner's EncodedCommand launch, with a first
 // literal Console marker before ANY script-file loading or JSON/module cmdlet.
 // Both paths are exact files created in this operation's fresh owned scope;
 // single-quote escaping prevents path text from becoming PowerShell code.
 const psLiteral=value=>"'"+value.replaceAll("'","''")+"'";
 const bootstrap=`[Console]::Out.WriteLine('{"phase":"controller-bootstrap-entered"}');[Console]::Out.Flush(); & ${psLiteral(scriptFile)} -SettingsFile ${psLiteral(settingsFile)}`;
 const child=spawn(shell,['-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(bootstrap,'utf16le').toString('base64')],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let stderr='',buffer='',readyResolve,readyReject,doneResolve,doneReject,timer;const phases=[];
 const ready=new Promise((yes,no)=>{readyResolve=yes;readyReject=no;}),done=new Promise((yes,no)=>{doneResolve=yes;doneReject=no;});
 // Attach rejection handlers before trigger/handshake sequencing.
 ready.catch(()=>{});done.catch(()=>{});
 const fail=error=>{readyReject(error);doneReject(error);};
 child.on('error',fail);child.stderr.on('data',bytes=>{stderr=(stderr+bytes.toString('utf8')).slice(-4000);});
 child.stdout.on('data',bytes=>{buffer+=bytes.toString('utf8');if(buffer.length>32000){fail(Error('Unexpected controller output size'));return;}let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index).trim();buffer=buffer.slice(index+1);if(!line)continue;try{const value=JSON.parse(line);phases.push(value);if(value.phase==='ready')readyResolve(value);if(value.phase==='failed')fail(Error(value.message));}catch{fail(Error('Invalid controller protocol'));}}});
 child.on('exit',(code,signal)=>{if(code===0&&phases.some(row=>row.phase==='dialog-closed'))doneResolve();else fail(Error(`Native controller failed (${code ?? signal}): ${stderr}`));});
 const deadline=Date.now()+timeoutMs+5000;
 const timed=new Promise((_yes,no)=>{timer=setTimeout(()=>{const error=Error('Owned native dialog operation timed out');error.controllerStderr=stderr;fail(error);no(error);},timeoutMs+5000);});timed.catch(()=>{});
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
 }catch(error){error.nativeDialogEvidence={phases,controllerPid:child.pid,selectedFile:file,kind,controllerStderr:stderr.slice(-4000),controllerExitCode:child.exitCode,controllerSignal:child.signalCode};throw error;}
 finally{
  clearTimeout(timer);
  if(child.exitCode===null&&child.signalCode===null)child.kill();
  // Do not clean helper files until the exact child is known to have exited.
  if(child.exitCode===null&&child.signalCode===null)await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,3000))]);
  if(child.pid&&child.exitCode===null&&child.signalCode===null)throw Error('Exact native-dialog helper exit was not confirmed; keep its owned files');
  if(!child.pid||child.exitCode!==null||child.signalCode!==null){rmSync(scriptFile,{force:true});rmSync(settingsFile,{force:true});}
 }
}


/** Disposable runner-only reflection selftest; no application or UI is accessed. */
export async function selftestNativeDialogApis(){
 assert.equal(process.platform,'win32');assert.equal(process.env.GITHUB_ACTIONS,'true');
 const directory=canonical(mkdtempSync(join(tmpdir(),'lingjing-uia-api-selftest-')));
 const scriptFile=join(directory,'api-selftest.ps1'),settingsFile=join(directory,'api-selftest.json');
 writeFileSync(scriptFile,'\ufeff'+controller,{flag:'wx'});
 writeFileSync(settingsFile,JSON.stringify({apiSelftest:true}),{flag:'wx'});
 const keys=new Set(['PATH','PATHEXT','SYSTEMROOT','SYSTEMDRIVE','WINDIR','COMSPEC','TEMP','TMP','TMPDIR','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMFILES','PROGRAMFILES(X86)','PROGRAMW6432','RUNNER_TRACKING_ID']);
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>keys.has(key.toUpperCase())));
 const shell=join(process.env.SystemRoot||process.env.WINDIR||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 const literal=value=>"'"+value.replaceAll("'","''")+"'";
 const bootstrap=`& ${literal(scriptFile)} -SettingsFile ${literal(settingsFile)}`;
 const child=spawn(shell,['-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(bootstrap,'utf16le').toString('base64')],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='',timer;
 try{
  await new Promise((yes,no)=>{
   child.on('error',no);
   child.stdout.on('data',data=>{stdout+=data.toString('utf8');if(stdout.length>32000){stdout=stdout.slice(0,32000);no(Error('Selftest output limit'));}});
   child.stderr.on('data',data=>{stderr=(stderr+data.toString('utf8')).slice(-4000);});
   child.on('close',code=>code===0?yes():no(Error(`UIA API selftest failed (${code}): ${stderr}; phases=${stdout.slice(-4000)}`)));
   timer=setTimeout(()=>no(Error(`UIA API selftest timeout: ${stderr}; phases=${stdout.slice(-4000)}`)),35000);
  });
  const phases=stdout.trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  assert.ok(phases.some(row=>row.phase==='uia-api-selftest-passed'&&row.uiAccessed===false&&row.checks===30));
  return {passed:true,reflectionOnly:true,appStarted:false,phases};
 }finally{
  clearTimeout(timer);
  if(child.exitCode===null&&child.signalCode===null)child.kill();
  if(child.exitCode===null&&child.signalCode===null)await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,3000))]);
  if(child.pid&&child.exitCode===null&&child.signalCode===null)throw Error('Exact UIA selftest helper exit unconfirmed; retain owned directory');
  rmSync(directory,{recursive:true,force:true});
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 assert.deepEqual(process.argv.slice(2),['--selftest']);
 try{console.log(JSON.stringify(await selftestNativeDialogApis()));}catch(error){console.error(error.message);process.exitCode=1;}
}
