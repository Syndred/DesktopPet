$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;
public static class LingjingForeground {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr handle, out Rect rect);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr handle, StringBuilder text, int max);
  public static bool Fullscreen() {
    IntPtr window = GetForegroundWindow();
    if (window == IntPtr.Zero) return false;
    var name = new StringBuilder(256); GetClassName(window, name, 256);
    if (name.ToString() == "Progman" || name.ToString() == "WorkerW" || name.ToString() == "Shell_TrayWnd") return false;
    Rect rect; if (!GetWindowRect(window, out rect)) return false;
    var bounds = Screen.FromHandle(window).Bounds;
    return rect.Left <= bounds.Left && rect.Top <= bounds.Top && rect.Right >= bounds.Right && rect.Bottom >= bounds.Bottom;
  }
}
'@
$previousValue = $null
while ($true) {
  $currentValue = [LingjingForeground]::Fullscreen().ToString().ToLowerInvariant()
  if ($currentValue -ne $previousValue) { [Console]::WriteLine($currentValue); $previousValue = $currentValue }
  Start-Sleep -Milliseconds 1500
}
