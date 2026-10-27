// Opt-in Windows native-file-dialog helper for disposable QA profiles ONLY. No SendKeys, global
// clicks, shell dialogs from other processes, overwrite confirmations, or grants.
// A newly created unparented dialog is allowed ONLY in the verified main PID
// after a no-existing-dialog handshake and normal UI trigger. Nonzero owners
// must chain to the exact main HWND. Current bridge receipts stay partial.
// UIA APIs: https://learn.microsoft.com/dotnet/api/system.windows.automation.valuepattern.setvalue
// https://learn.microsoft.com/dotnet/api/system.windows.automation.invokepattern.invoke
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,realpathSync,lstatSync,existsSync,rmSync} from 'node:fs';
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
Require-Method ([System.Windows.Automation.ClientSettings]) 'RegisterClientSideProviderAssembly' @([System.Reflection.AssemblyName]) ([void]) $true
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
# UIA reflection remains a no-UI API check, but standard Win32 file controls
# use the measured exact HWND/ID chain below. No provider registration/fallback.
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies ([System.Drawing.Bitmap].Assembly.Location) @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class OwnedDialogNative {
 public delegate bool Callback(IntPtr hwnd,IntPtr data);
 [DllImport("user32.dll",CharSet=CharSet.Unicode,EntryPoint="SendMessageTimeoutW",SetLastError=true)] static extern IntPtr MessageText(IntPtr h,uint msg,UIntPtr wp,string text,uint flags,uint timeout,out UIntPtr result);
 [DllImport("user32.dll",CharSet=CharSet.Unicode,EntryPoint="SendMessageTimeoutW",SetLastError=true)] static extern IntPtr MessageRead(IntPtr h,uint msg,UIntPtr wp,StringBuilder text,uint flags,uint timeout,out UIntPtr result);
 [DllImport("user32.dll",EntryPoint="SendMessageTimeoutW",SetLastError=true)] static extern IntPtr MessageAction(IntPtr h,uint msg,UIntPtr wp,IntPtr lp,uint flags,uint timeout,out UIntPtr result);
 [DllImport("user32.dll",EntryPoint="GetWindowLongW")] static extern int GetWindowLong(IntPtr hwnd,int index);
 static bool OwnedControl(IntPtr root,IntPtr h,uint pid,string cls,int id){return h!=IntPtr.Zero && IsWindow(h) && IsChild(root,h) && Pid(h)==pid && Class(h)==cls && GetDlgCtrlID(h)==id && IsWindowVisible(h) && IsWindowEnabled(h);}
 [StructLayout(LayoutKind.Sequential)] struct KeyboardInput {public ushort vk,scan;public uint flags,time;public UIntPtr extra;}
 [StructLayout(LayoutKind.Sequential)] struct MouseInput {public int x,y;public uint data,flags,time;public UIntPtr extra;}
 [StructLayout(LayoutKind.Explicit)] struct InputData {[FieldOffset(0)] public KeyboardInput keyboard;[FieldOffset(0)] public MouseInput mouse;}
 [StructLayout(LayoutKind.Sequential)] struct NativeInput {public uint type;public InputData data;}
 [DllImport("user32.dll",SetLastError=true)] static extern uint SendInput(uint count,NativeInput[] inputs,int size);
 [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
 static NativeInput UnicodeInput(char c,bool up){var input=new NativeInput();input.type=1;input.data.keyboard.scan=c;input.data.keyboard.flags=(uint)(4|(up?2:0));return input;}
 static void NoModifiers(){foreach(int key in new int[]{0x10,0x11,0x12,0x5B,0x5C})if((GetAsyncKeyState(key)&0x8000)!=0)throw new InvalidOperationException("NATIVE_FILENAME_MODIFIER_ALREADY_DOWN");}
 [StructLayout(LayoutKind.Sequential)] struct GuiThreadInfo {public uint cbSize,flags;public IntPtr active,focus,capture,menuOwner,moveSize,caret;public Rect caretRect;}
 public static void VerifyInteropLayouts(){if(Marshal.SizeOf(typeof(GuiThreadInfo))!=(IntPtr.Size==8?72:48))throw new InvalidOperationException("GUI_THREAD_INFO_LAYOUT_MISMATCH");if(Marshal.SizeOf(typeof(NativeInput))!=(IntPtr.Size==8?40:28))throw new InvalidOperationException("SENDINPUT_LAYOUT_MISMATCH");}
 [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint threadId,ref GuiThreadInfo info);
 static bool ExactEdit(IntPtr root,IntPtr edit,uint pid,string kind){
  if(!IsChild(root,edit) || Pid(edit)!=pid || Class(edit)!="Edit" || !IsWindowVisible(edit) || !IsWindowEnabled(edit))return false;
  int style=GetWindowLong(edit,-16);if(style==0 || (style&0x0800)!=0)return false;
  var combo=GetParent(edit);
  if(GetDlgCtrlID(edit)==1148){
   if(!OwnedControl(root,combo,pid,"ComboBox",1148))return false;
   var outer=GetParent(combo);return OwnedControl(root,outer,pid,"ComboBoxEx32",1148) && GetParent(outer)==root;
  }
  // Actual 63ae Save dialog: only its focused filename Edit1001 under the
  // measured FloatNotifySink/DirectUI chain, never address/search Edit1001.
  if(kind!="save" || GetDlgCtrlID(edit)!=1001 || !OwnedControl(root,combo,pid,"ComboBox",0))return false;
  var sink=GetParent(combo);if(!OwnedControl(root,sink,pid,"FloatNotifySink",0))return false;
  var direct=GetParent(sink);if(!OwnedControl(root,direct,pid,"DirectUIHWND",0))return false;
  var view=GetParent(direct);if(!OwnedControl(root,view,pid,"DUIViewWndClassName",0) || GetParent(view)!=root)return false;
  uint processId;uint thread=GetWindowThreadProcessId(root,out processId);
  var info=new GuiThreadInfo();info.cbSize=(uint)Marshal.SizeOf(typeof(GuiThreadInfo));
  return thread!=0 && processId==pid && GetGUIThreadInfo(thread,ref info) && info.active==root && info.focus==edit;
 }
 static bool ExactAction(IntPtr root,IntPtr button,uint pid,string kind){
  if(!OwnedControl(root,button,pid,"Button",1) || GetParent(button)!=root)return false;
  var caption=new StringBuilder(128);UIntPtr chars;
  if(MessageRead(button,0x000D,new UIntPtr(128),caption,34,1000,out chars)==IntPtr.Zero)return false;
  var label=caption.ToString().Replace("&","").Trim();
  return kind=="save" ? label=="Save" || label=="保存" || label=="保存(S)" : label=="Open" || label=="打开" || label=="打开(O)";
 }
 static void ExactRoot(IntPtr root,uint pid){if(root==IntPtr.Zero || !IsWindow(root) || Pid(root)!=pid || Class(root)!="#32770" || GetForegroundWindow()!=root)throw new InvalidOperationException("NATIVE_CONTROL_ROOT_CHANGED");}
 public sealed class FileControls {public IntPtr edit;public IntPtr action;public int editCount;public int actionCount;public string selector;}
 public static FileControls FindFileControls(IntPtr root,uint pid,string kind){
  ExactRoot(root,pid);var result=new FileControls();int count=0;bool limit=false;
  EnumChildWindows(root,(h,d)=>{if(++count>256){limit=true;return false;}if(ExactEdit(root,h,pid,kind)){result.edit=h;result.editCount++;result.selector=GetDlgCtrlID(h)==1148?"Edit1148-Combo1148-ComboEx1148-dialog":"FocusedSaveEdit1001-Combo0-FloatSink0-DirectUI0-DUIView0-dialog";}if(ExactAction(root,h,pid,kind)){result.action=h;result.actionCount++;}return true;},IntPtr.Zero);
  if(limit)throw new InvalidOperationException("NATIVE_CONTROL_SCAN_LIMIT");
  ExactRoot(root,pid);return result;
 }
 public static string SetExactFilename(IntPtr root,IntPtr edit,uint pid,string kind,string path,DateTime deadline){
  ExactRoot(root,pid);if(!ExactEdit(root,edit,pid,kind) || path.Length<1 || path.Length>4096)throw new InvalidOperationException("NATIVE_FILENAME_CHAIN_CHANGED");
  UIntPtr result;string method;
  if(kind=="save" && GetDlgCtrlID(edit)==1001){
   // WM_SETTEXT changed this modern Edit's pixels but the real dialog returned
   // its original name (9aee receipt). Send actual Unicode key events ONLY to
   // its already-focused, independently verified filename edit; never refocus.
   NoModifiers();
   if(MessageAction(edit,0x00B1,UIntPtr.Zero,new IntPtr(-1),34,1000,out result)==IntPtr.Zero)throw new InvalidOperationException("NATIVE_FILENAME_SELECTION_FAILED");
   foreach(char c in path){
    if(DateTime.UtcNow>=deadline)throw new InvalidOperationException("NATIVE_FILENAME_INPUT_DEADLINE");
    ExactRoot(root,pid);if(!ExactEdit(root,edit,pid,kind))throw new InvalidOperationException("NATIVE_FILENAME_FOCUS_CHANGED");NoModifiers();
    var pair=new NativeInput[]{UnicodeInput(c,false),UnicodeInput(c,true)};
    uint inserted=SendInput(2,pair,Marshal.SizeOf(typeof(NativeInput)));
    if(inserted==1){
     // Only release our own submitted Unicode key; no repeated keydown/text
     // and no release/change to any pre-existing user modifier state.
     uint released=SendInput(1,new NativeInput[]{UnicodeInput(c,true)},Marshal.SizeOf(typeof(NativeInput)));
     throw new InvalidOperationException(released==1?"NATIVE_FILENAME_PARTIAL_PAIR_KEYUP_RELEASED":"NATIVE_FILENAME_PARTIAL_PAIR_KEYUP_UNCONFIRMED");
    }
    if(inserted!=2)throw new InvalidOperationException("NATIVE_FILENAME_UNICODE_INPUT_INCOMPLETE");
   }
   method="UnicodeSendInput-exact-focused-save-field";
  }else{
   if(MessageText(edit,0x000C,UIntPtr.Zero,path,34,1000,out result)==IntPtr.Zero || result.ToUInt64()==0)throw new InvalidOperationException("NATIVE_FILENAME_SET_FAILED");
   method="WM_SETTEXT-exact-standard-field";
  }
  var readDeadline=DateTime.UtcNow.AddSeconds(2);if(readDeadline>deadline)readDeadline=deadline;
  while(DateTime.UtcNow<readDeadline){
   ExactRoot(root,pid);if(!ExactEdit(root,edit,pid,kind))throw new InvalidOperationException("NATIVE_FILENAME_CHAIN_CHANGED");
   var readback=new StringBuilder(4097);
   if(MessageRead(edit,0x000D,new UIntPtr(4097),readback,34,1000,out result)==IntPtr.Zero)throw new InvalidOperationException("NATIVE_FILENAME_READBACK_FAILED");
   if(String.Equals(readback.ToString(),path,StringComparison.Ordinal))return method;
   System.Threading.Thread.Sleep(20);
  }
  throw new InvalidOperationException("NATIVE_FILENAME_READBACK_MISMATCH");
 }
 public static void ClickExactAction(IntPtr root,IntPtr button,uint pid,string kind){
  ExactRoot(root,pid);if(!ExactAction(root,button,pid,kind))throw new InvalidOperationException("NATIVE_ACTION_CHAIN_CHANGED");
  UIntPtr result;if(MessageAction(button,0x00F5,UIntPtr.Zero,IntPtr.Zero,2,1000,out result)==IntPtr.Zero)throw new InvalidOperationException("NATIVE_ACTION_INVOKE_UNCONFIRMED");
 }

 [StructLayout(LayoutKind.Sequential)] public struct Rect {public int left,top,right,bottom;}
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd,out Rect rect);
 [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr hwnd,IntPtr hdc,uint flags);
 public static void CaptureDialog(IntPtr hwnd,uint pid,string output){
  if(hwnd==IntPtr.Zero || !IsWindow(hwnd) || Pid(hwnd)!=pid || Class(hwnd)!="#32770" || GetForegroundWindow()!=hwnd)throw new InvalidOperationException("CAPTURE_DIALOG_IDENTITY_MISMATCH");
  Rect r;if(!GetWindowRect(hwnd,out r))throw new InvalidOperationException("CAPTURE_DIALOG_BOUNDS_FAILED");
  int w=r.right-r.left,h=r.bottom-r.top;
  if(w<100 || h<100 || w>4096 || h>4096)throw new InvalidOperationException("CAPTURE_DIALOG_BOUNDS_REFUSED");
  using(var bitmap=new System.Drawing.Bitmap(w,h)){
   using(var graphics=System.Drawing.Graphics.FromImage(bitmap)){
    IntPtr dc=graphics.GetHdc();bool ok;
    try{ok=PrintWindow(hwnd,dc,0);}finally{graphics.ReleaseHdc(dc);}
    if(!ok)throw new InvalidOperationException("CAPTURE_DIALOG_PRINT_FAILED");
   }
   if(!IsWindow(hwnd) || Pid(hwnd)!=pid || GetForegroundWindow()!=hwnd)throw new InvalidOperationException("CAPTURE_DIALOG_CHANGED");
   using(var stream=new System.IO.FileStream(output,System.IO.FileMode.CreateNew,System.IO.FileAccess.Write)){bitmap.Save(stream,System.Drawing.Imaging.ImageFormat.Png);}
  }
 }

 [DllImport("user32.dll")] public static extern bool EnumWindows(Callback callback,IntPtr data);
 // Metadata-only diagnostics, always rooted at a nonzero verified dialog.
 [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent,Callback callback,IntPtr data);
 [DllImport("user32.dll")] static extern bool IsChild(IntPtr parent,IntPtr child);
 [DllImport("user32.dll")] static extern int GetDlgCtrlID(IntPtr hwnd);
 [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr hwnd);
 [DllImport("user32.dll")] static extern bool IsWindowEnabled(IntPtr hwnd);
 public sealed class ChildMetadata {
  public string handle; public string parent; public string className; public int controlId; public bool visible; public bool enabled;
 }
 public static ChildMetadata[] DescribeChildren(IntPtr root,uint pid){
  if(root==IntPtr.Zero || !IsWindow(root) || Pid(root)!=pid || Class(root)!="#32770")throw new InvalidOperationException("CHILD_DIAGNOSTIC_ROOT_INVALID");
  var found=new List<ChildMetadata>();int inspected=0;
  EnumChildWindows(root,(h,d)=>{
   if(++inspected>256 || found.Count>=64)return false;
   if(!IsWindow(root) || Pid(root)!=pid || !IsChild(root,h) || Pid(h)!=pid)return true;
   var parent=GetParent(h);
   if(parent!=root && (!IsChild(root,parent) || Pid(parent)!=pid))return true;
   // No GetWindowText, ValuePattern, WM_GETTEXT, image, or input operation.
   found.Add(new ChildMetadata{handle=h.ToInt64().ToString(),parent=parent.ToInt64().ToString(),className=Class(h),controlId=GetDlgCtrlID(h),visible=IsWindowVisible(h),enabled=IsWindowEnabled(h)});
   return true;
  },IntPtr.Zero);
  return found.ToArray();
 }
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
[OwnedDialogNative]::VerifyInteropLayouts()
Emit @{phase='native-controller-compiled';guiThreadInfoLayoutVerified=$true;sendInputLayoutVerified=$true}
# Compile interop declarations during selftest, but never invoke Win32/UI APIs.
if($c.apiSelftest -eq $true){Emit @{phase='uia-api-selftest-passed';checks=$apiChecks;appStarted=$false;uiAccessed=$false};exit 0}
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
 # Exact measured Win32 chain only; no UIA or keyboard/input fallback.
 $controlSnapshots=0;$controlWaitStarted=[DateTime]::UtcNow;$controls=$null
 while([DateTime]::UtcNow -lt $deadline){
  Dialog-Still-Exact $dialog
  $controls=[OwnedDialogNative]::FindFileControls($dialog,[uint32]$ownerPid,[string]$c.kind)
  $controlSnapshots++
  if($controls.editCount -gt 1 -or $controls.actionCount -gt 1){throw 'MULTIPLE_NATIVE_FILE_CONTROLS_REFUSED'}
  if($controlSnapshots -eq 1 -or ($controls.editCount -eq 1 -and $controls.actionCount -eq 1)){
   Emit @{phase='dialog-controls-snapshot';selector=$controls.selector;snapshot=$controlSnapshots;elapsedMs=[int]([DateTime]::UtcNow-$controlWaitStarted).TotalMilliseconds;filenameCandidates=$controls.editCount;actionCandidates=$controls.actionCount}
  }
  if($controls.editCount -eq 1 -and $controls.actionCount -eq 1){break}
  [System.Threading.Thread]::Sleep(100)
 }
 if($null -eq $controls -or $controls.editCount -ne 1 -or $controls.actionCount -ne 1){
  Dialog-Still-Exact $dialog
  $nativeChildren=[OwnedDialogNative]::DescribeChildren($dialog,[uint32]$ownerPid)
  Dialog-Still-Exact $dialog
  Emit @{phase='owned-dialog-native-child-diagnostic';dialogHandle=$dialog.ToInt64().ToString();children=$nativeChildren;maxControls=64;maxInspected=256;valuesCollected=$false;inputPerformed=$false}
  if($c.dialogCapturePath){try{
   Dialog-Still-Exact $dialog
   [OwnedDialogNative]::CaptureDialog($dialog,[uint32]$ownerPid,[string]$c.dialogCapturePath)
   Dialog-Still-Exact $dialog
   Emit @{phase='owned-dialog-image-captured';path=[string]$c.dialogCapturePath;method='PrintWindow-exact-HWND';dialogHandle=$dialog.ToInt64().ToString();desktopCaptured=$false}
  }catch{Emit @{phase='owned-dialog-image-unavailable';inputPerformed=$false}}}
  throw 'UNIQUE_NATIVE_FILENAME_AND_ACTION_NOT_FOUND'
 }
 if([DateTime]::UtcNow -ge $deadline){throw 'NATIVE_DIALOG_CONTROL_DEADLINE_EXPIRED'}
 Dialog-Still-Exact $dialog
 if($c.kind -eq 'save' -and ([System.IO.File]::Exists([string]$c.filePath) -or [System.IO.Directory]::Exists([string]$c.filePath))){throw 'SAVE_TARGET_APPEARED_REFUSE_OVERWRITE'}
 $entryMethod=[OwnedDialogNative]::SetExactFilename($dialog,$controls.edit,[uint32]$ownerPid,[string]$c.kind,[string]$c.filePath,$deadline)
 Dialog-Still-Exact $dialog
 if([DateTime]::UtcNow -ge $deadline){throw 'NATIVE_DIALOG_CONTROL_DEADLINE_EXPIRED'}
 if($c.kind -eq 'save' -and ([System.IO.File]::Exists([string]$c.filePath) -or [System.IO.Directory]::Exists([string]$c.filePath))){throw 'SAVE_TARGET_APPEARED_REFUSE_OVERWRITE'}
 if($c.kind -eq 'open'){
  $hasher=[System.Security.Cryptography.SHA256]::Create()
  try{$actualHash=[System.BitConverter]::ToString($hasher.ComputeHash([System.IO.File]::ReadAllBytes([string]$c.filePath))).Replace('-','').ToLowerInvariant()}finally{$hasher.Dispose()}
  if($actualHash -cne [string]$c.expectedSha256){throw 'OPEN_FIXTURE_CHANGED_BEFORE_INVOKE'}
 }
 Emit @{phase='filename-verified';textEntry=$entryMethod;dialogHandle=$dialog.ToInt64().ToString();editHandle=$controls.edit.ToInt64().ToString();actionHandle=$controls.action.ToInt64().ToString();selector=$controls.selector;readbackVerified=$true;action=[string]$c.kind}
 Dialog-Still-Exact $dialog
 [OwnedDialogNative]::ClickExactAction($dialog,$controls.action,[uint32]$ownerPid,[string]$c.kind)
 while([DateTime]::UtcNow -lt $deadline){
  Owner-Still-Exact | Out-Null
  if(-not [OwnedDialogNative]::IsWindow($dialog) -or -not [OwnedDialogNative]::IsWindowVisible($dialog)){
   if([OwnedDialogNative]::GetForegroundWindow() -ne $owner){throw 'UNEXPECTED_FOREGROUND_AFTER_DIALOG'}
   Emit @{phase='dialog-closed';ownerPid=$ownerPid;dialogHandle=$dialog.ToInt64().ToString();nativeAction=[string]$c.kind;overwriteAccepted=$false};exit 0
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
 const captureRoot=resolve('artifacts/foundation/cloud-engineering/backup');mkdirSync(captureRoot,{recursive:true});
 const captureDirectory=canonical(mkdtempSync(join(captureRoot,'run-native-dialog-'))),dialogCapturePath=join(captureDirectory,'owned-native-dialog.png');
 writeFileSync(scriptFile,'\ufeff'+controller,{flag:'wx'});writeFileSync(settingsFile,JSON.stringify({kind,filePath:file,ownerPid,ownerWindowHandle:String(ownerWindowHandle),ownerExecutablePath:resolve(ownerExecutablePath),expectedTitle,expectedSha256:kind==='open'?expectedSha256:null,timeoutMs,dialogCapturePath}),{flag:'wx'});
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
  return {nativeDialogCompleted:true,nativePickerUsed:true,nativeControlBackend:"win32-exact-standard-chain",file:fileEvidence,phases,business,controllerPid:child.pid};
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


/** Runner-only reflection and interop-compilation selftest; no application/UI calls. */
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
  assert.ok(phases.some(row=>row.phase==='uia-api-selftest-passed'&&row.uiAccessed===false&&row.checks===31));
  return {passed:true,reflectionChecks:true,nativeControlBackend:"win32-exact-standard-chain",interopCompiled:true,noUiCalls:true,appStarted:false,phases};
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
