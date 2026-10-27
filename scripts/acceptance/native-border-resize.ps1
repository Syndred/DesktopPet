# Only the fresh cloud runner app's exact main HWND. No hooks or OS settings.
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true'){throw 'Disposable GitHub Windows runner only'}
Add-Type @'
using System; using System.Runtime.InteropServices; using System.Collections.Generic;
public static class QAResize {
 [StructLayout(LayoutKind.Sequential)] public struct POINT {public int X; public int Y;}
 [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT {public int dx,dy;public uint mouseData,dwFlags,time;public UIntPtr dwExtraInfo;}
 [StructLayout(LayoutKind.Sequential)] public struct INPUT {public uint type;public MOUSEINPUT mi;}
 [DllImport("user32.dll",SetLastError=true)] public static extern IntPtr SendMessageTimeout(IntPtr h,uint msg,UIntPtr wp,IntPtr lp,uint flags,uint timeout,out UIntPtr result);
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
 public class InputReceipt {public uint flags;public int dx,dy;public uint returnCount;public int lastError;}
 public static List<InputReceipt> receipts=new List<InputReceipt>();
 static void Inject(INPUT i){SetLastError(0);uint count=SendInput(1,new[]{i},Marshal.SizeOf(typeof(INPUT)));int error=Marshal.GetLastWin32Error();receipts.Add(new InputReceipt{flags=i.mi.dwFlags,dx=i.mi.dx,dy=i.mi.dy,returnCount=count,lastError=error});if(count!=1)throw new Exception("NATIVE_INPUT_BLOCKED: SendInput returnCount="+count+" lastError="+error);}
 public static void MoveAbsolute(int x,int y){int left=GetSystemMetrics(76),top=GetSystemMetrics(77),width=GetSystemMetrics(78),height=GetSystemMetrics(79);if(width<2||height<2||x<left||y<top||x>=left+width||y>=top+height)throw new Exception("NATIVE_INPUT_BLOCKED: target outside virtual desktop");var i=new INPUT();i.type=0;i.mi.dx=(int)Math.Floor((x-left+0.5)*65536.0/width);i.mi.dy=(int)Math.Floor((y-top+0.5)*65536.0/height);i.mi.dwFlags=1|0x8000|0x4000;Inject(i);}
 public static void Button(uint flags){var i=new INPUT();i.type=0;i.mi.dwFlags=flags;Inject(i);}
}
'@

$p=([Console]::In.ReadToEnd()|ConvertFrom-Json)
if($p.action -eq 'release'){[QAResize]::Button(4);exit}
$q=New-Object QAResize+POINT
if($p.action -eq 'read'){[QAResize]::GetCursorPos([ref]$q)|Out-Null;@{x=$q.X;y=$q.Y}|ConvertTo-Json -Compress;exit}
if($p.action -eq 'restore'){if(-not [QAResize]::SetCursorPos($p.point.x,$p.point.y)){throw 'CURSOR_RESTORE_FAILED'};[QAResize]::GetCursorPos([ref]$q)|Out-Null;if($q.X -ne $p.point.x -or $q.Y -ne $p.point.y){throw 'CURSOR_RESTORE_MISMATCH'};exit}
$h=[IntPtr][long]$p.windowHandle
function Guard {
 [uint32]$owner=0;[QAResize]::GetWindowThreadProcessId($h,[ref]$owner)|Out-Null
 if($owner -ne $p.processId -or -not [QAResize]::IsWindowVisible($h) -or [QAResize]::IsIconic($h)){throw 'OWNED_MAIN_UNAVAILABLE'}
 if([QAResize]::GetAncestor([QAResize]::GetForegroundWindow(),2) -ne $h){throw 'OWNED_MAIN_NOT_FOREGROUND'}
}
function Hit([int]$x,[int]$y){
 $point=New-Object QAResize+POINT;$point.X=$x;$point.Y=$y
 $root=[QAResize]::GetAncestor([QAResize]::WindowFromPoint($point),2)
 if($root -ne $h){return -1}
 [uint32]$owner=0;[QAResize]::GetWindowThreadProcessId($root,[ref]$owner)|Out-Null
 if($owner -ne $p.processId){return -1}
 [UIntPtr]$answer=[UIntPtr]::Zero
 $packed=([long]($y -band 65535) -shl 16) -bor ($x -band 65535)
 if([QAResize]::SendMessageTimeout($h,0x84,[UIntPtr]::Zero,[IntPtr]$packed,2,1000,[ref]$answer) -eq [IntPtr]::Zero){throw 'WM_NCHITTEST_TIMEOUT'}
 return [int]$answer.ToUInt64()
}
$report=@{pressed=$false;passed=$false;input=@()}
try{
 Guard
 $r=New-Object QAResize+RECT;[QAResize]::GetWindowRect($h,[ref]$r)|Out-Null
 $report.before=@{x=$r.Left;y=$r.Top;width=$r.Right-$r.Left;height=$r.Bottom-$r.Top}
 $found=$null
 foreach($d in 1..16){$x=$r.Right-$d;$y=$r.Bottom-$d;$hit=Hit $x $y;if($hit -eq 17){$found=@{x=$x;y=$y;hit=$hit};break}}
 if($null -eq $found){throw 'NO_UNOCCLUDED_HTBOTTOMRIGHT'}
 $report.start=$found
 [QAResize]::MoveAbsolute($found.x,$found.y);Start-Sleep -Milliseconds 120
 [QAResize]::GetCursorPos([ref]$q)|Out-Null
 if([Math]::Abs($q.X-$found.x) -gt 1 -or [Math]::Abs($q.Y-$found.y) -gt 1){throw 'CURSOR_MISMATCH'}
 Guard
 if((Hit $q.X $q.Y) -ne 17){throw 'BORDER_CHANGED_BEFORE_PRESS'}
 # Shrink 180 physical pixels each axis; the app's real WM_GETMINMAXINFO clamps.
 $tx=[Math]::Max($r.Left+80,$found.x-180);$ty=[Math]::Max($r.Top+80,$found.y-180)
 $report.target=@{x=$tx;y=$ty}
 [QAResize]::Button(2);$report.pressed=$true
 try{for($i=1;$i -le 16;$i++){Guard;[QAResize]::MoveAbsolute([int]($found.x+($tx-$found.x)*$i/16),[int]($found.y+($ty-$found.y)*$i/16));Start-Sleep -Milliseconds 45}}
 finally{[QAResize]::Button(4)}
 Start-Sleep -Milliseconds 250
 [QAResize]::GetWindowRect($h,[ref]$r)|Out-Null
 $report.after=@{x=$r.Left;y=$r.Top;width=$r.Right-$r.Left;height=$r.Bottom-$r.Top};$report.passed=$true
}catch{$report.error=$_.Exception.Message}
finally{$report.input=@([QAResize]::receipts);$report|ConvertTo-Json -Depth 6 -Compress}
