$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true'){throw 'Disposable GitHub Windows runner only'}
Add-Type @'
using System;using System.Runtime.InteropServices;
public static class OwnedFullscreen {
 [StructLayout(LayoutKind.Sequential)] public struct RECT{public int Left,Top,Right,Bottom;}
 [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO{public int Size;public RECT Monitor,Work;public uint Flags;}
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h,uint flags);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h,uint flags);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern bool GetMonitorInfo(IntPtr h,ref MONITORINFO info);
 [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h,uint attr,out RECT r,int size);
}
'@
$p=([Console]::In.ReadToEnd()|ConvertFrom-Json)
if($p.action -eq 'selftest'){
 foreach($m in @('GetForegroundWindow','GetAncestor','GetWindowThreadProcessId','GetWindowRect','IsWindowVisible','MonitorFromWindow','GetMonitorInfo','DwmGetWindowAttribute')){if(-not [OwnedFullscreen].GetMethod($m)){throw 'NATIVE_API_MISSING'}}
 if([Runtime.InteropServices.Marshal]::SizeOf([type][OwnedFullscreen+MONITORINFO]) -ne 40){throw 'MONITORINFO_LAYOUT_MISMATCH'}
 @{passed=$true;reflectionOnly=$true;osInputPerformed=$false}|ConvertTo-Json -Compress;exit
}
if($p.action -ne 'probe'){throw 'READ_ONLY_PROBE_ACTION_REQUIRED'}
$h=[IntPtr][long]$p.windowHandle;[uint32]$owner=0
[OwnedFullscreen]::GetWindowThreadProcessId($h,[ref]$owner)|Out-Null
if($owner -ne $p.processId -or -not [OwnedFullscreen]::IsWindowVisible($h)){throw 'OWNED_MAIN_IDENTITY_MISMATCH'}
$fg=[OwnedFullscreen]::GetAncestor([OwnedFullscreen]::GetForegroundWindow(),2)
if($fg -ne $h){throw 'OWNED_MAIN_NOT_FOREGROUND'}
$rect=New-Object OwnedFullscreen+RECT;if(-not [OwnedFullscreen]::GetWindowRect($h,[ref]$rect)){throw 'OWNED_MAIN_RECT_FAILED'}
$frame=New-Object OwnedFullscreen+RECT;$dwm=[OwnedFullscreen]::DwmGetWindowAttribute($h,9,[ref]$frame,16)
if($dwm -ne 0){throw 'OWNED_MAIN_DWM_FRAME_FAILED'}
$info=New-Object OwnedFullscreen+MONITORINFO;$info.Size=40
if(-not [OwnedFullscreen]::GetMonitorInfo([OwnedFullscreen]::MonitorFromWindow($h,2),[ref]$info)){throw 'OWNED_MAIN_MONITOR_FAILED'}
if([OwnedFullscreen]::GetAncestor([OwnedFullscreen]::GetForegroundWindow(),2) -ne $h){throw 'FOREGROUND_CHANGED_DURING_PROBE'}
$full=$frame.Left -le $info.Monitor.Left+1 -and $frame.Top -le $info.Monitor.Top+1 -and $frame.Right -ge $info.Monitor.Right-1 -and $frame.Bottom -ge $info.Monitor.Bottom-1
function Rect($r){return @{x=$r.Left;y=$r.Top;width=($r.Right-$r.Left);height=($r.Bottom-$r.Top)}}
@{ownedMain=$true;foregroundMatches=$true;processId=$owner;windowHandle=$h.ToInt64().ToString();window=(Rect $rect);dwmFrame=(Rect $frame);monitor=(Rect $info.Monitor);workArea=(Rect $info.Work);coversMonitor=$full;readOnly=$true}|ConvertTo-Json -Compress -Depth 4
