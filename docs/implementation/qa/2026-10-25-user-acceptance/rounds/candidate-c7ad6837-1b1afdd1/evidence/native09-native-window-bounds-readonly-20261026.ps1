param([Parameter(Mandatory=$true)][string]$Label)
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class Native09Bounds {
 public delegate bool EnumProc(IntPtr hwnd,IntPtr data);
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc fn,IntPtr data);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd,out Rect rect);
 [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
 public static List<object> Snapshot(uint target){
  var list=new List<object>();
  EnumWindows((hwnd,data)=>{uint pid;GetWindowThreadProcessId(hwnd,out pid);if(pid==target){Rect r;var ok=GetWindowRect(hwnd,out r);list.Add(new {windowId=hwnd.ToInt64(),ownerPid=pid,rectOk=ok,left=r.Left,top=r.Top,width=r.Right-r.Left,height=r.Bottom-r.Top,dpi=GetDpiForWindow(hwnd),visible=IsWindowVisible(hwnd)});}return true;},IntPtr.Zero);
  return list;
 }
}
'@
$owned = Get-CimInstance Win32_Process -Filter 'ProcessId = 20152'
if (-not $owned -or $owned.ExecutablePath -ne 'C:\Users\ADMINI~1\AppData\Local\Temp\nshFF7A.tmp\app\Lingjing.exe') { throw 'Original c7ad LocalA process identity mismatch' }
$report = [ordered]@{ at=[DateTime]::UtcNow.ToString('o'); readOnly=$true; ownerPid=20152; label=$Label; windows=@([Native09Bounds]::Snapshot(20152)); mainElectronBoundsAndContentBounds='not exposed; not obtained' }
$outputPath=Join-Path $PSScriptRoot "native-window-bounds-$Label-20261026.json"
if(Test-Path -LiteralPath $outputPath){throw 'Evidence already exists'}
$report|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $outputPath -Encoding UTF8
$report|ConvertTo-Json -Depth 6
