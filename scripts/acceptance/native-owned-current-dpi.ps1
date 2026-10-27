
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true'){throw 'Disposable GitHub Windows runner only'}
Add-Type @'
using System; using System.Runtime.InteropServices; using System.Collections.Generic;
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
 [DllImport("kernel32.dll")] static extern void SetLastError(uint code);
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 [DllImport("user32.dll")] public static extern IntPtr GetWindowDpiAwarenessContext(IntPtr h);
 [DllImport("user32.dll")] public static extern int GetAwarenessFromDpiAwarenessContext(IntPtr context);
 [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h,uint flags);
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] public struct MONITORINFOEX {public int size;public RECT monitor;public RECT work;public uint flags;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)]public string device;}
 public delegate bool MonitorEnum(IntPtr h,IntPtr hdc,ref RECT r,IntPtr data);
 [DllImport("user32.dll")] public static extern bool EnumDisplayMonitors(IntPtr hdc,IntPtr clip,MonitorEnum callback,IntPtr data);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern bool GetMonitorInfo(IntPtr h,ref MONITORINFOEX info);
 public class MonitorRecord {public string handle,device;public RECT bounds,workArea;public bool primary;}
 public static MonitorRecord Monitor(IntPtr h){var info=new MONITORINFOEX();info.size=Marshal.SizeOf(typeof(MONITORINFOEX));if(!GetMonitorInfo(h,ref info))throw new Exception("MONITOR_READ_FAILED");return new MonitorRecord{handle=h.ToInt64().ToString(),device=info.device,bounds=info.monitor,workArea=info.work,primary=(info.flags&1)!=0};}
 public static MonitorRecord[] Monitors(){var all=new List<MonitorRecord>();MonitorEnum cb=delegate(IntPtr h,IntPtr hdc,ref RECT r,IntPtr data){all.Add(Monitor(h));return true;};if(!EnumDisplayMonitors(IntPtr.Zero,IntPtr.Zero,cb,IntPtr.Zero))throw new Exception("MONITOR_ENUM_FAILED");GC.KeepAlive(cb);return all.ToArray();}
 public class InputReceipt {public uint flags;public int dx,dy;public uint returnCount;public int lastError;}
 public static List<InputReceipt> receipts=new List<InputReceipt>();
 static void Inject(INPUT i){SetLastError(0);uint count=SendInput(1,new[]{i},Marshal.SizeOf(typeof(INPUT)));int error=Marshal.GetLastWin32Error();receipts.Add(new InputReceipt{flags=i.mi.dwFlags,dx=i.mi.dx,dy=i.mi.dy,returnCount=count,lastError=error});if(count!=1)throw new Exception("NATIVE_INPUT_BLOCKED: SendInput returnCount="+count+" lastError="+error);}
 public static void MoveAbsolute(int x,int y){int left=GetSystemMetrics(76),top=GetSystemMetrics(77),width=GetSystemMetrics(78),height=GetSystemMetrics(79);if(width<2||height<2||x<left||y<top||x>=left+width||y>=top+height)throw new Exception("NATIVE_INPUT_BLOCKED: target outside virtual desktop");var i=new INPUT();i.type=0;i.mi.dx=(int)Math.Floor((x-left+0.5)*65536.0/width);i.mi.dy=(int)Math.Floor((y-top+0.5)*65536.0/height);i.mi.dwFlags=1|0x8000|0x4000;Inject(i);}
 public static void Button(uint flags){var i=new INPUT();i.type=0;i.mi.dwFlags=flags;Inject(i);}
}
'@
$p=([Console]::In.ReadToEnd()|ConvertFrom-Json)
if($p.action -eq 'selftest'){$expected=if([IntPtr]::Size -eq 8){40}else{28};$size=[Runtime.InteropServices.Marshal]::SizeOf([type][QAInput+INPUT]);if($size -ne $expected){throw 'NATIVE_INPUT_LAYOUT_MISMATCH'};foreach($method in @('GetCursorPos','GetWindowRect','WindowFromPoint','GetAncestor','GetWindowThreadProcessId','MoveAbsolute','Button','SetThreadDpiAwarenessContext','GetWindowDpiAwarenessContext','GetAwarenessFromDpiAwarenessContext','GetDpiForWindow','EnumDisplayMonitors','GetMonitorInfo')){if(-not [QAInput].GetMethod($method)){throw 'NATIVE_API_MISSING'}};@{passed=$true;reflectionOnly=$true;inputBytes=$size;osInputPerformed=$false}|ConvertTo-Json -Compress;exit}
# Per-thread measurement/input context only. This does not change display DPI or OS preferences.
$previousContext=[QAInput]::SetThreadDpiAwarenessContext([IntPtr](-4))
if($previousContext -eq [IntPtr]::Zero){throw 'OBSERVER_PER_MONITOR_CONTEXT_UNAVAILABLE'}
try {
if($p.action -eq 'dpi'){
 $h=[IntPtr][long]$p.windowHandle;[uint32]$ownerPid=0;[QAInput]::GetWindowThreadProcessId($h,[ref]$ownerPid)|Out-Null
 if($ownerPid -ne $p.processId -or -not [QAInput]::IsWindowVisible($h)){throw 'OWNED_WINDOW_IDENTITY_MISMATCH'}
 $r=New-Object QAInput+RECT;if(-not [QAInput]::GetWindowRect($h,[ref]$r)){throw 'OWNED_BOUNDS_UNAVAILABLE'}
 $dpi=[QAInput]::GetDpiForWindow($h);$awareness=[QAInput]::GetAwarenessFromDpiAwarenessContext([QAInput]::GetWindowDpiAwarenessContext($h));if($dpi -eq 0 -or $awareness -ne 2){throw 'OWNED_WINDOW_NOT_PER_MONITOR_AWARE'}
 @{processId=$ownerPid;windowHandle=$p.windowHandle;dpi=$dpi;awareness=$awareness;observerContext='PER_MONITOR_AWARE_V2';bounds=@{x=$r.Left;y=$r.Top;width=$r.Right-$r.Left;height=$r.Bottom-$r.Top};windowMonitor=[QAInput]::Monitor([QAInput]::MonitorFromWindow($h,2));monitors=[QAInput]::Monitors();systemSettingsChanged=$false}|ConvertTo-Json -Compress -Depth 6;exit
}
$q=New-Object QAInput+POINT
if($p.action -eq 'read'){[QAInput]::GetCursorPos([ref]$q)|Out-Null;@{x=$q.X;y=$q.Y}|ConvertTo-Json -Compress;exit}
if($p.action -eq 'probe'){
 [QAInput]::GetCursorPos([ref]$q)|Out-Null
 $hit=[QAInput]::WindowFromPoint($q);$rootWindow=[QAInput]::GetAncestor($hit,2);$fg=[QAInput]::GetForegroundWindow()
 function Describe([IntPtr]$h){[uint32]$ownerPid=0;[QAInput]::GetWindowThreadProcessId($h,[ref]$ownerPid)|Out-Null;$r=New-Object QAInput+RECT;[QAInput]::GetWindowRect($h,[ref]$r)|Out-Null;return @{handle=$h.ToInt64().ToString();processId=$ownerPid;visible=[QAInput]::IsWindowVisible($h);minimized=[QAInput]::IsIconic($h);extendedStyle=[QAInput]::GetWindowLong($h,-20);bounds=@{x=$r.Left;y=$r.Top;width=$r.Right-$r.Left;height=$r.Bottom-$r.Top}}}
 @{cursor=@{x=$q.X;y=$q.Y};hit=(Describe $hit);root=(Describe $rootWindow);foreground=(Describe $fg);expected=(Describe ([IntPtr][long]$p.windowHandle))}|ConvertTo-Json -Compress -Depth 5;exit
}
if($p.action -eq 'release'){[QAInput]::Button(4);[QAInput]::Button(16);exit}
if($p.action -eq 'restore'){if(-not [QAInput]::SetCursorPos($p.point.x,$p.point.y)){throw 'CURSOR_RESTORE_BLOCKED'};[QAInput]::GetCursorPos([ref]$q)|Out-Null;if($q.X -ne $p.point.x -or $q.Y -ne $p.point.y){throw 'CURSOR_RESTORE_MISMATCH'};exit}
if($p.action -notin @('move','right','click','drag')){throw 'UNKNOWN_ACTION'}
$actualBounds=New-Object QAInput+RECT;if(-not [QAInput]::GetWindowRect([IntPtr][long]$p.windowHandle,[ref]$actualBounds)){throw 'OWNED_BOUNDS_UNAVAILABLE'}
if($p.from.x -lt $actualBounds.Left -or $p.from.y -lt $actualBounds.Top -or $p.from.x -ge $actualBounds.Right -or $p.from.y -ge $actualBounds.Bottom){throw 'POINT_OUTSIDE_ACTUAL_OWNED_WINDOW'}
[uint32]$expectedOwner=0;[QAInput]::GetWindowThreadProcessId([IntPtr][long]$p.windowHandle,[ref]$expectedOwner)|Out-Null;if($expectedOwner -ne $p.processId -or -not [QAInput]::IsWindowVisible([IntPtr][long]$p.windowHandle)){throw 'OWNED_WINDOW_IDENTITY_MISMATCH'}
[uint32]$foreground=0;[QAInput]::GetWindowThreadProcessId([QAInput]::GetForegroundWindow(),[ref]$foreground)|Out-Null
if($foreground -ne $p.processId){throw 'OWNED_WINDOW_NOT_FOREGROUND'}
if($p.from.x -lt $p.bounds.x -or $p.from.y -lt $p.bounds.y -or $p.from.x -ge ($p.bounds.x+$p.bounds.width) -or $p.from.y -ge ($p.bounds.y+$p.bounds.height)){throw 'START_OUTSIDE_OWNED_WINDOW'}
if($p.action -eq 'move'){
 $warmX=if(($p.from.x+2) -lt ($p.bounds.x+$p.bounds.width)){$p.from.x+2}else{$p.from.x-2}
 if($warmX -lt $p.bounds.x){throw 'START_OUTSIDE_OWNED_WINDOW'}
 [QAInput]::MoveAbsolute($warmX,$p.from.y)
 Start-Sleep -Milliseconds 150
 [QAInput]::GetCursorPos([ref]$q)|Out-Null
 if($q.X -ne $warmX -or $q.Y -ne $p.from.y){throw 'NATIVE_CURSOR_BLOCKED'}
 $warm=@{x=$q.X;y=$q.Y}
}
# Absolute SendInput drives Electron's WH_MOUSE_LL forwarding hook without
# assuming relative motion survives Windows acceleration unchanged.
[QAInput]::MoveAbsolute($p.from.x,$p.from.y)
Start-Sleep -Milliseconds 250
[QAInput]::GetCursorPos([ref]$q)|Out-Null
if($q.X -ne $p.from.x -or $q.Y -ne $p.from.y){throw 'NATIVE_CURSOR_BLOCKED'}
if($p.action -eq 'move'){@{warm=$warm;at=@{x=$q.X;y=$q.Y};physicalDeltaPixels=[Math]::Abs($q.X-$warm.x);motionSource="SendInput-MOUSEEVENTF_MOVE-absolute-virtual-desktop";inputReceipts=([QAInput]::receipts).ToArray();pressed=$false}|ConvertTo-Json -Compress -Depth 3;exit}
$matched=$false
for($attempt=0;$attempt -lt 20;$attempt++){
 $hit=[QAInput]::WindowFromPoint($q);$rootWindow=[QAInput]::GetAncestor($hit,2);[uint32]$hitPid=0;[uint32]$rootPid=0;[QAInput]::GetWindowThreadProcessId($hit,[ref]$hitPid)|Out-Null;[QAInput]::GetWindowThreadProcessId($rootWindow,[ref]$rootPid)|Out-Null
 if($rootWindow.ToInt64().ToString() -eq $p.windowHandle -and $rootPid -eq $p.processId){$matched=$true;break}
 Start-Sleep -Milliseconds 100
}
if(-not $matched){throw ('OWNED_PET_NOT_AT_POINT '+(@{expected=$p.windowHandle;hit=$hit.ToInt64().ToString();root=$rootWindow.ToInt64().ToString();rootPid=$rootPid;x=$q.X;y=$q.Y}|ConvertTo-Json -Compress))}
[uint32]$expectedOwner=0;[QAInput]::GetWindowThreadProcessId([IntPtr][long]$p.windowHandle,[ref]$expectedOwner)|Out-Null;if($expectedOwner -ne $p.processId -or -not [QAInput]::IsWindowVisible([IntPtr][long]$p.windowHandle)){throw 'OWNED_WINDOW_IDENTITY_MISMATCH'}
[uint32]$foreground=0;[QAInput]::GetWindowThreadProcessId([QAInput]::GetForegroundWindow(),[ref]$foreground)|Out-Null
if($foreground -ne $p.processId){throw 'OWNED_WINDOW_NOT_FOREGROUND'}
[QAInput]::GetCursorPos([ref]$q)|Out-Null;if($q.X -ne $p.from.x -or $q.Y -ne $p.from.y){throw 'ACTUAL_CURSOR_CHANGED_BEFORE_PRESS'}
if($p.action -eq 'click' -or $p.action -eq 'right') {
 try{if($p.action -eq 'right'){[QAInput]::Button(8)}else{[QAInput]::Button(2)}}finally{if($p.action -eq 'right'){[QAInput]::Button(16)}else{[QAInput]::Button(4)}}
 @{action=$p.action;rootHandle=$rootWindow.ToInt64().ToString();rootPid=$rootPid;inputReceipts=([QAInput]::receipts).ToArray()}|ConvertTo-Json -Compress -Depth 4;exit
}
if($p.action -ne 'drag'){throw 'UNKNOWN_ACTION'}
try{[QAInput]::Button(2);Start-Sleep -Milliseconds 120;for($i=1;$i -le 16;$i++){[QAInput]::MoveAbsolute([int]($p.from.x+($p.to.x-$p.from.x)*$i/16),[int]($p.from.y+($p.to.y-$p.from.y)*$i/16));Start-Sleep -Milliseconds 45}}
finally{[QAInput]::Button(4)}
[QAInput]::GetCursorPos([ref]$q)|Out-Null;@{x=$q.X;y=$q.Y;foregroundPid=$foreground;hitHandle=$hit.ToInt64().ToString();hitPid=$hitPid;rootHandle=$rootWindow.ToInt64().ToString();rootPid=$rootPid;motionSource="SendInput-MOUSEEVENTF_MOVE-absolute-virtual-desktop";inputReceipts=([QAInput]::receipts).ToArray()}|ConvertTo-Json -Compress -Depth 4

} finally {
 if($previousContext -ne [IntPtr]::Zero){$restoredContext=[QAInput]::SetThreadDpiAwarenessContext($previousContext);if($restoredContext -eq [IntPtr]::Zero){throw 'OBSERVER_CONTEXT_RESTORE_FAILED'}}
}
