# Only the fresh cloud runner app's exact main HWND. No hooks or OS settings.
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true'){throw 'Disposable GitHub Windows runner only'}
Add-Type @'
using System; using System.Runtime.InteropServices; using System.Collections.Generic;
public static class QATray {
 [StructLayout(LayoutKind.Sequential)] public struct POINT {public int X; public int Y;}
 [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT {public int dx,dy;public uint mouseData,dwFlags,time;public UIntPtr dwExtraInfo;}
 [StructLayout(LayoutKind.Sequential)] public struct INPUT {public uint type;public MOUSEINPUT mi;}
 [DllImport("user32.dll",SetLastError=true)] public static extern IntPtr SendMessageTimeout(IntPtr h,uint msg,UIntPtr wp,IntPtr lp,uint flags,uint timeout,out UIntPtr result);
 [DllImport("user32.dll",SetLastError=true)] public static extern bool PrintWindow(IntPtr hwnd,IntPtr dc,uint flags);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string cls,string title);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd,System.Text.StringBuilder name,int count);
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
 [DllImport("kernel32.dll")] static extern void SetLastError(uint code);
 public delegate bool EnumProc(IntPtr hwnd,IntPtr param);
 [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr hwnd,EnumProc callback,IntPtr param);
 [DllImport("user32.dll")] static extern int GetDlgCtrlID(IntPtr hwnd);
 public class ChildReceipt {public string hwnd,windowClass;public int controlId,x,y,width,height;public uint processId;public bool visible;}
 public static List<ChildReceipt> Children(IntPtr root,uint expectedPid){var rows=new List<ChildReceipt>();EnumChildWindows(root,(h,p)=>{uint pid;GetWindowThreadProcessId(h,out pid);if(pid!=expectedPid)return true;var cls=new System.Text.StringBuilder(256);GetClassName(h,cls,cls.Capacity);RECT r;GetWindowRect(h,out r);rows.Add(new ChildReceipt{hwnd=h.ToInt64().ToString(),windowClass=cls.ToString(),controlId=GetDlgCtrlID(h),x=r.Left,y=r.Top,width=r.Right-r.Left,height=r.Bottom-r.Top,processId=pid,visible=IsWindowVisible(h)});return rows.Count<120;},IntPtr.Zero);return rows;}
 public class InputReceipt {public uint flags;public int dx,dy;public uint returnCount;public int lastError;}
 public static List<InputReceipt> receipts=new List<InputReceipt>();
 static void Inject(INPUT i){SetLastError(0);uint count=SendInput(1,new[]{i},Marshal.SizeOf(typeof(INPUT)));int error=Marshal.GetLastWin32Error();receipts.Add(new InputReceipt{flags=i.mi.dwFlags,dx=i.mi.dx,dy=i.mi.dy,returnCount=count,lastError=error});if(count!=1)throw new Exception("NATIVE_INPUT_BLOCKED: SendInput returnCount="+count+" lastError="+error);}
 public static void MoveAbsolute(int x,int y){int left=GetSystemMetrics(76),top=GetSystemMetrics(77),width=GetSystemMetrics(78),height=GetSystemMetrics(79);if(width<2||height<2||x<left||y<top||x>=left+width||y>=top+height)throw new Exception("NATIVE_INPUT_BLOCKED: target outside virtual desktop");var i=new INPUT();i.type=0;i.mi.dx=(int)Math.Floor((x-left+0.5)*65536.0/width);i.mi.dy=(int)Math.Floor((y-top+0.5)*65536.0/height);i.mi.dwFlags=1|0x8000|0x4000;Inject(i);}
 public static void Button(uint flags){var i=new INPUT();i.type=0;i.mi.dwFlags=flags;Inject(i);}
}
'@


[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
$p=([Console]::In.ReadToEnd()|ConvertFrom-Json)
# Pure reflection before any OS input: validate the exact UIA and P/Invoke contracts.
$types=@([System.Windows.Automation.AutomationElement],[System.Windows.Automation.AutomationElement+AutomationElementInformation],[System.Windows.Automation.ControlType],[QATray])
$contracts=@{
 'AutomationElement.RootElement'=([System.Windows.Automation.AutomationElement].GetProperty('RootElement') -ne $null)
 'AutomationElement.FromHandle'=([System.Windows.Automation.AutomationElement].GetMethod('FromHandle',[type[]]@([IntPtr])) -ne $null)
 'AutomationElement.FindAll'=([System.Windows.Automation.AutomationElement].GetMethod('FindAll',[type[]]@([System.Windows.Automation.TreeScope],[System.Windows.Automation.Condition])) -ne $null)
 'AutomationElement.ProcessIdProperty'=([System.Windows.Automation.AutomationElement].GetField('ProcessIdProperty') -ne $null)
}
foreach($property in @('Name','AutomationId','ClassName','BoundingRectangle','ProcessId','IsEnabled','IsOffscreen','ControlType')){$contracts['Current.'+$property]=([System.Windows.Automation.AutomationElement+AutomationElementInformation].GetProperty($property) -ne $null)}
foreach($method in @('PrintWindow','GetCursorPos','WindowFromPoint','GetAncestor','GetWindowRect','GetWindowThreadProcessId','MoveAbsolute','Button','Children')){$contracts['Interop.'+$method]=([QATray].GetMethod($method) -ne $null)}
foreach($key in $contracts.Keys){if(-not $contracts[$key]){throw ('API_CONTRACT_MISSING: '+$key)}}
if($p.action -eq 'selftest'){@{passed=$true;reflectionOnly=$true;osInputPerformed=$false;contracts=$contracts}|ConvertTo-Json -Depth 4 -Compress;exit}
$q=New-Object QATray+POINT
if($p.action -eq 'read'){[QATray]::GetCursorPos([ref]$q)|Out-Null;@{x=$q.X;y=$q.Y}|ConvertTo-Json -Compress;exit}
if($p.action -eq 'release'){[QATray]::Button(4);[QATray]::Button(16);exit}
if($p.action -eq 'restore'){if(-not [QATray]::SetCursorPos($p.point.x,$p.point.y)){throw 'CURSOR_RESTORE_FAILED'};[QATray]::GetCursorPos([ref]$q)|Out-Null;if($q.X -ne $p.point.x -or $q.Y -ne $p.point.y){throw 'CURSOR_RESTORE_MISMATCH'};exit}
$h=[IntPtr][long]$p.windowHandle
function Owner([IntPtr]$w){[uint32]$n=0;[QATray]::GetWindowThreadProcessId($w,[ref]$n)|Out-Null;return $n}
if((Owner $h) -ne $p.processId){throw 'OWNED_MAIN_PID_MISMATCH'}
$taskbar=[QATray]::FindWindow('Shell_TrayWnd',$null)
if($taskbar -eq [IntPtr]::Zero){throw 'TASKBAR_UNAVAILABLE'}
$explorer=Owner $taskbar
$exe=[System.Diagnostics.Process]::GetProcessById($explorer).MainModule.FileName
if(-not [string]::Equals($exe,[System.IO.Path]::Combine($env:WINDIR,'explorer.exe'),[StringComparison]::OrdinalIgnoreCase)){throw 'TASKBAR_NOT_SYSTEM_EXPLORER'}
function Nodes([IntPtr]$w){$root=[System.Windows.Automation.AutomationElement]::FromHandle($w);return $root.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)}
function Short([string]$value){if($value.Length -gt 160){return $value.Substring(0,160)};return $value}
function Rect($e){$r=$e.Current.BoundingRectangle;return @{x=$r.X;y=$r.Y;width=$r.Width;height=$r.Height}}
function Center($e){$r=$e.Current.BoundingRectangle;if($e.Current.IsOffscreen -or $r.Width -le 0 -or $r.Height -le 0){throw 'UIA_TARGET_NOT_VISIBLE'};return @{x=[int]($r.X+$r.Width/2);y=[int]($r.Y+$r.Height/2)}}
function RootAt($pt){$q=New-Object QATray+POINT;$q.X=$pt.x;$q.Y=$pt.y;return [QATray]::GetAncestor([QATray]::WindowFromPoint($q),2)}
function Click($element,[IntPtr]$root,[int]$pidExpected,[bool]$right){
 $pt=Center $element;$expectedName=$element.Current.Name
 if(-not $element.Current.IsEnabled){throw 'UIA_TARGET_DISABLED'}
 if((RootAt $pt) -ne $root -or (Owner $root) -ne $pidExpected){throw 'TARGET_OCCLUDED_OR_OWNER_CHANGED'}
 [QATray]::MoveAbsolute($pt.x,$pt.y);Start-Sleep -Milliseconds 120
 $actual=New-Object QATray+POINT;if(-not [QATray]::GetCursorPos([ref]$actual) -or $actual.X -ne $pt.x -or $actual.Y -ne $pt.y){throw 'ACTUAL_CURSOR_MISMATCH_BEFORE_PRESS'}
 $fresh=Center $element
 if($element.Current.Name -cne $expectedName -or -not $element.Current.IsEnabled -or $fresh.x -ne $pt.x -or $fresh.y -ne $pt.y){throw 'UIA_TARGET_CHANGED_BEFORE_PRESS'}
 if((RootAt $pt) -ne $root -or (Owner $root) -ne $pidExpected){throw 'TARGET_CHANGED_BEFORE_PRESS'}
 if($pidExpected -eq $p.processId){$foreground=[QATray]::GetAncestor([QATray]::GetForegroundWindow(),2);if($foreground -ne $h -and $foreground -ne $root){throw 'OWNED_MENU_NOT_FOREGROUND'}}
 if($right){try{[QATray]::Button(8)}finally{[QATray]::Button(16)}}else{try{[QATray]::Button(2)}finally{[QATray]::Button(4)}}
}
function CaptureOwnedMenu([string]$path,[IntPtr]$menu){
 if($menu -eq [IntPtr]::Zero -or (Owner $menu) -ne $p.processId -or -not [QATray]::IsWindowVisible($menu)){throw 'CAPTURE_NOT_OWNED_MENU'}
 $r=New-Object QATray+RECT;if(-not [QATray]::GetWindowRect($menu,[ref]$r)){throw 'MENU_BOUNDS_UNAVAILABLE'}
 $w=$r.Right-$r.Left;$ht=$r.Bottom-$r.Top;if($w -le 0 -or $ht -le 0 -or $w -gt 2000 -or $ht -gt 2000){throw 'MENU_CAPTURE_BOUNDS_INVALID'}
 $b=[System.Drawing.Bitmap]::new($w,$ht);$g=[System.Drawing.Graphics]::FromImage($b);$dc=[IntPtr]::Zero
 try{$dc=$g.GetHdc();if(-not [QATray]::PrintWindow($menu,$dc,2)){throw 'OWNED_MENU_PRINTWINDOW_FAILED'};$g.ReleaseHdc($dc);$dc=[IntPtr]::Zero;$b.Save($path,[System.Drawing.Imaging.ImageFormat]::Png)}finally{if($dc -ne [IntPtr]::Zero){$g.ReleaseHdc($dc)};$g.Dispose();$b.Dispose()}
}

$report=@{passed=$false;explorerPid=$explorer;action=$p.action;input=@();openedOverflow=$false}
try{
 $roots=@($taskbar)
 foreach($cls in @('NotifyIconOverflowWindow','TopLevelWindowForOverflowXamlIsland')){$w=[QATray]::FindWindow($cls,$null);if($w -ne [IntPtr]::Zero -and [QATray]::IsWindowVisible($w) -and (Owner $w) -eq $explorer){$roots+= $w}}
 # Read-only bounded provider diagnostics, restricted to verified Explorer roots.
 $report.discovery=@{trayBounds=$p.trayBounds;roots=@()}
 foreach($root in $roots){
  $all=Nodes $root;$rows=@();$count=0;$skipped=0
  foreach($element in $all){$count++;$current=$element.Current;if($current.ProcessId -ne $explorer){$skipped++;continue};if($rows.Count -lt 120){$rows+=@{name=(Short $current.Name);automationId=(Short $current.AutomationId);className=(Short $current.ClassName);controlType=$current.ControlType.ProgrammaticName;pid=$current.ProcessId;offscreen=$current.IsOffscreen;bounds=(Rect $element)}}}
  $report.discovery.roots+=@{hwnd=$root.ToInt64().ToString();count=$count;skippedForeignProvider=$skipped;truncated=($count -gt 120);elements=$rows;nativeChildren=@([QATray]::Children($root,$explorer))}
 }
 $icons=@()
 foreach($root in $roots){foreach($e in (Nodes $root)){if($e.Current.ProcessId -eq $explorer -and $e.Current.Name -ceq '灵境 · 桌面伙伴' -and -not $e.Current.IsOffscreen){$icons+=@{element=$e;root=$root}}}}
 if($icons.Count -eq 0 -and $p.allowOverflow -eq $true){
  $buttons=@((Nodes $taskbar)|Where-Object {$_.Current.ProcessId -eq $explorer -and ($_.Current.Name -ceq 'Show Hidden Icons') -and $_.Current.AutomationId -ceq 'SystemTrayIcon' -and $_.Current.ClassName -ceq 'SystemTray.NormalButton' -and $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and -not $_.Current.IsOffscreen})
  if($buttons.Count -ne 1){throw 'UNIQUE_OVERFLOW_BUTTON_UNAVAILABLE'}
  Click $buttons[0] $taskbar $explorer $false;$report.openedOverflow=$true;$report.needsFreshTrayBounds=$true;$report.passed=$true
 }else{
  if($icons.Count -ne 1){throw 'EXACT_UNIQUE_APP_TRAY_ICON_UNAVAILABLE'}
  $e=$icons[0].element;$pt=Center $e;$b=$p.trayBounds
  if($b.width -le 0 -or $b.height -le 0 -or $pt.x -lt $b.x -or $pt.y -lt $b.y -or $pt.x -ge ($b.x+$b.width) -or $pt.y -ge ($b.y+$b.height)){throw 'UIA_ICON_DOES_NOT_MATCH_OWN_TRAY_BOUNDS'}
  $report.icon=@{name=$e.Current.Name;bounds=(Rect $e);nativeRoot=$icons[0].root.ToInt64().ToString();trayBounds=$b}
  Click $e $icons[0].root $explorer $true;Start-Sleep -Milliseconds 250
  # Search only top-level UIA roots of the exact fresh app PID; never invoke UIA.
  $name=if($p.action -eq 'open'){'打开灵境'}elseif($p.action -eq 'exit'){'退出灵境'}else{throw 'UNSUPPORTED_ACTION'}
  $items=@()
  $condition=[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ProcessIdProperty,[int]$p.processId)
  $tops=[System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,$condition)
  foreach($top in $tops){foreach($item in $top.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)){if($item.Current.ProcessId -eq $p.processId -and $item.Current.Name -ceq $name -and $item.Current.ControlType -eq [System.Windows.Automation.ControlType]::MenuItem -and -not $item.Current.IsOffscreen){$items+=$item}}}
  if($items.Count -ne 1){throw 'EXACT_OWNED_MENU_ITEM_UNAVAILABLE'}
  $item=$items[0];$menuRoot=RootAt (Center $item)
  if((Owner $menuRoot) -ne $p.processId){throw 'MENU_NOT_OWNED_BY_APP'}
  $report.menu=@{name=$name;bounds=(Rect $item);nativeRoot=$menuRoot.ToInt64().ToString();pid=(Owner $menuRoot)}
  CaptureOwnedMenu $p.screenshot $menuRoot
  Click $item $menuRoot $p.processId $false;$report.passed=$true
 }
}catch{$report.error=$_.Exception.Message}
finally{$report.input=@([QATray]::receipts);$report|ConvertTo-Json -Depth 7 -Compress}
