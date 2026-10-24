$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class LingjingForeground {
  public static string LastDiagnostic = "";
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct MonitorInfo { public int Size; public Rect Monitor, Work; public uint Flags; }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr handle, out Rect rect);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr handle, uint flags);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr handle, ref MonitorInfo info);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr handle, StringBuilder text, int max);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr handle, uint attribute, out Rect rect, int size);
  public static bool Fullscreen() {
    IntPtr window = GetForegroundWindow();
    if (window == IntPtr.Zero) return false;
    var name = new StringBuilder(256); GetClassName(window, name, 256);
    if (name.ToString() == "Progman" || name.ToString() == "WorkerW" || name.ToString() == "Shell_TrayWnd") return false;
    Rect rect;
    // DWM frame bounds and MONITORINFO both use physical pixels. Mixing WinForms
    // logical screen bounds with a physical window rect breaks mixed-DPI desktops.
    if (DwmGetWindowAttribute(window, 9, out rect, Marshal.SizeOf(typeof(Rect))) != 0 && !GetWindowRect(window, out rect)) return false;
    var monitor = new MonitorInfo(); monitor.Size = Marshal.SizeOf(typeof(MonitorInfo));
    if (!GetMonitorInfo(MonitorFromWindow(window, 2), ref monitor)) return false;
    LastDiagnostic = String.Format("{0}: window={1},{2},{3},{4}; monitor={5},{6},{7},{8}", name,
      rect.Left, rect.Top, rect.Right, rect.Bottom, monitor.Monitor.Left, monitor.Monitor.Top, monitor.Monitor.Right, monitor.Monitor.Bottom);
    return rect.Left <= monitor.Monitor.Left + 1 && rect.Top <= monitor.Monitor.Top + 1
      && rect.Right >= monitor.Monitor.Right - 1 && rect.Bottom >= monitor.Monitor.Bottom - 1;
  }
}
'@
$previousValue = $null
while ($true) {
  $currentValue = [LingjingForeground]::Fullscreen().ToString().ToLowerInvariant()
  if ($env:ACCOUNTS_DEBUG_HOST -eq '1') { [Console]::WriteLine('diag:' + [LingjingForeground]::LastDiagnostic) }
  if ($currentValue -ne $previousValue) { [Console]::WriteLine($currentValue); $previousValue = $currentValue }
  Start-Sleep -Milliseconds 1500
}
