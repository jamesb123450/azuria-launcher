# Exercise the actual built launcher; no migration acknowledgement or account is needed.
param([string]$Executable = '')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
if (-not $Executable) { $Executable = Join-Path $root 'src-tauri\target\debug\azuria-launcher.exe' }
$Executable = (Resolve-Path $Executable).Path
$work = Join-Path ([IO.Path]::GetTempPath()) ('azuria-single-instance-' + [guid]::NewGuid())
$originalAppData = $env:APPDATA
$originalLocalAppData = $env:LOCALAPPDATA
$children = @()
function Assert($condition, $message) { if (-not $condition) { throw $message } }
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class AzuriaSingleInstanceWindow {
  private delegate bool EnumProc(IntPtr h, IntPtr data);
  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc callback, IntPtr data);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetWindowText(IntPtr h, StringBuilder title, int count);
  public static IntPtr FindLauncherWindow(uint processId) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, unused) => {
      uint owner;
      GetWindowThreadProcessId(h, out owner);
      if (owner != processId) return true;
      var title = new StringBuilder(512);
      GetWindowText(h, title, title.Capacity);
      if (title.ToString() != "Azuria Launcher") return true;
      found = h;
      return false;
    }, IntPtr.Zero);
    return found;
  }
  [DllImport("user32.dll", SetLastError=true)] public static extern bool PostMessage(IntPtr h, uint message, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint processId);
}
'@
try {
  New-Item $work -ItemType Directory | Out-Null
  $env:APPDATA = Join-Path $work 'Roaming'
  $env:LOCALAPPDATA = Join-Path $work 'Local'
  New-Item $env:APPDATA, $env:LOCALAPPDATA -ItemType Directory | Out-Null
  $primary = Start-Process $Executable -PassThru
  $children += $primary
  $window = [IntPtr]::Zero
  for ($i = 0; $i -lt 300; $i++) {
    $primary.Refresh()
    Assert (-not $primary.HasExited) 'Primary launcher exited during startup.'
    # Debug executables can have a console as well as the launcher window.
    # Process.MainWindowHandle does not identify which one it returns.
    $window = [AzuriaSingleInstanceWindow]::FindLauncherWindow($primary.Id)
    if ($window -ne 0 -and [AzuriaSingleInstanceWindow]::IsWindowVisible($window)) {
      break
    }
    Start-Sleep -Milliseconds 200
  }
  Assert ($window -ne 0 -and [AzuriaSingleInstanceWindow]::IsWindowVisible($window)) 'The launcher did not create its visible main window.'
  Write-Output "Testing Azuria main window $window in original PID $($primary.Id)."

  # Use application/window messages rather than ShowWindow(SW_HIDE): hiding
  # behind Tauri's back leaves its cached VISIBLE flag set, so show() is a no-op.
  # CloseRequested also waits for normal startup storage checks to finish;
  # this test must not bypass the application's migration acknowledgement guard.
  foreach ($state in @('hidden', 'minimised', 'visible')) {
    switch ($state) {
      'hidden' {
        for ($i = 0; $i -lt 300; $i++) {
          Assert ([AzuriaSingleInstanceWindow]::PostMessage($window, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)) 'Could not request close-to-tray.'
          Start-Sleep -Milliseconds 200
          $primary.Refresh()
          Assert (-not $primary.HasExited) 'Closing the window exited Azuria instead of sending it to the tray.'
          if (-not [AzuriaSingleInstanceWindow]::IsWindowVisible($window)) { break }
        }
        Assert (-not [AzuriaSingleInstanceWindow]::IsWindowVisible($window)) 'Azuria did not close to tray after startup.'
      }
      'minimised' {
        Assert ([AzuriaSingleInstanceWindow]::PostMessage($window, 0x0112, [IntPtr]0xF020, [IntPtr]::Zero)) 'Could not request minimise.'
        for ($i = 0; $i -lt 100 -and -not [AzuriaSingleInstanceWindow]::IsIconic($window); $i++) { Start-Sleep -Milliseconds 100 }
        Assert ([AzuriaSingleInstanceWindow]::IsIconic($window)) 'Azuria did not minimise before the restore check.'
      }
    }
    # A different working directory must still find the original application.
    $secondary = Start-Process $Executable -WorkingDirectory $work -PassThru
    $children += $secondary
    Assert ($secondary.WaitForExit(20000)) "Second launcher stayed running ($state)."
    $secondary.Refresh()
    Assert ($secondary.ExitCode -eq 0) "Second launcher failed instead of handing off ($state)."
    for ($i = 0; $i -lt 100; $i++) {
      $primary.Refresh()
      Assert (-not $primary.HasExited) "Original launcher was replaced ($state)."
      if ([AzuriaSingleInstanceWindow]::IsWindowVisible($window) -and -not [AzuriaSingleInstanceWindow]::IsIconic($window)) { break }
      Start-Sleep -Milliseconds 100
    }
    Assert ([AzuriaSingleInstanceWindow]::IsWindowVisible($window)) "Original launcher remained hidden ($state)."
    Assert (-not [AzuriaSingleInstanceWindow]::IsIconic($window)) "Original launcher remained minimised ($state)."
    [uint32]$owner = 0
    [void][AzuriaSingleInstanceWindow]::GetWindowThreadProcessId($window, [ref]$owner)
    Assert ($owner -eq $primary.Id) 'Restored window belongs to a different process.'
  }
  Write-Output 'Single-instance checks passed: hidden, minimised and visible launchers reuse the original PID.'
} finally {
  foreach ($child in $children) {
    if (-not $child.HasExited) { Stop-Process -Id $child.Id -Force -ErrorAction SilentlyContinue }
  }
  $env:APPDATA = $originalAppData
  $env:LOCALAPPDATA = $originalLocalAppData
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
