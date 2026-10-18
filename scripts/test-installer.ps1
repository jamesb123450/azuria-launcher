$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$work = Join-Path ([IO.Path]::GetTempPath()) ('azuria-installer-' + [guid]::NewGuid())
$key = 'HKCU:\Software\AzuriaLauncher\InstallerTests'
$children = @()
function Assert($condition, $message) { if (-not $condition) { throw $message } }
function Start-Fixture([string]$mode) {
  $target = Join-Path $work ([guid]::NewGuid().ToString())
  $p = Start-Process -FilePath (Join-Path $work 'privacy-test.exe') -ArgumentList "$mode /D=$target" -PassThru
  $script:children += $p
  return @{ Process = $p; Target = $target; Marker = (Join-Path $target 'installed.txt') }
}
function Wait-Finished($run) {
  Assert ($run.Process.WaitForExit(15000)) 'Fixture did not finish.'
  $run.Process.Refresh()
}
function Wait-Window($run) {
  for ($i = 0; $i -lt 100; $i++) {
    $run.Process.Refresh()
    if ($run.Process.HasExited) { throw 'Installer exited before requesting privacy acceptance.' }
    if ($run.Process.MainWindowHandle -ne 0) {
      $next = [AzuriaInstallerWindow]::GetDlgItem($run.Process.MainWindowHandle, 1)
      $checkbox = [AzuriaInstallerWindow]::FindCheckbox($run.Process.MainWindowHandle)
      if ($next -ne 0 -and $checkbox -ne 0) { return @{ Parent=$run.Process.MainWindowHandle; Next=$next; Checkbox=$checkbox } }
    }
    Start-Sleep -Milliseconds 100
  }
  throw 'Privacy page was not shown.'
}
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class AzuriaInstallerWindow {
  private delegate bool EnumProc(IntPtr h, IntPtr data);
  [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr parent,int id);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h,uint msg,IntPtr w,IntPtr l);
  [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr h,EnumProc callback,IntPtr data);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetWindowText(IntPtr h,StringBuilder text,int count);
  public static IntPtr FindCheckbox(IntPtr parent) {
    IntPtr found=IntPtr.Zero;
    EnumChildWindows(parent,(h,unused)=>{var text=new StringBuilder(512);GetWindowText(h,text,text.Capacity);if(text.ToString()=="I have read and accept the Privacy Policy"){found=h;return false;}return true;},IntPtr.Zero);
    return found;
  }
  public static void Click(IntPtr h) { SendMessage(h,0xF5,IntPtr.Zero,IntPtr.Zero); }
}
'@
try {
  # A fixture-only registry namespace never changes the real acceptance record.
  Assert (-not (Test-Path $key)) 'A stale installer-test registry key exists; remove it before running.'
  node (Join-Path $PSScriptRoot 'installer-policy.mjs') --check
  Assert ($LASTEXITCODE -eq 0) 'Policy generation check failed.'
  node (Join-Path $PSScriptRoot 'installer-fixture.mjs') $work
  Assert ($LASTEXITCODE -eq 0) 'Could not generate fixture.'
  $compiler = (Get-Command makensis.exe -ErrorAction SilentlyContinue).Source
  if (-not $compiler) {
    $compiler = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'tauri') -Filter makensis.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
  }
  if (-not $compiler) { $compiler = Join-Path ${env:ProgramFiles(x86)} 'NSIS\makensis.exe' }
  Assert (Test-Path $compiler) 'NSIS compiler not found after the desktop build.'
  & $compiler /V2 (Join-Path $work 'privacy-test.nsi')
  Assert ($LASTEXITCODE -eq 0) 'Privacy fixture compilation failed.'
  $version = [regex]::Match((Get-Content (Join-Path $root 'src-tauri\installer\privacy-version.nsh') -Raw), '"([a-f0-9]{64})"').Groups[1].Value
  Assert ($version.Length -eq 64) 'Missing policy fingerprint.'

  $run = Start-Fixture '/S'
  Wait-Finished $run
  Assert ($run.Process.ExitCode -eq 2) 'Silent first install must fail closed.'
  Assert (-not (Test-Path $run.Marker)) 'Silent first install wrote files.'
  Assert (-not (Test-Path $key)) 'Silent first install recorded acceptance.'

  # /P must become interactive; unchecked Next remains disabled, Cancel writes nothing.
  $run = Start-Fixture '/P'
  $window = Wait-Window $run
  Assert (-not [AzuriaInstallerWindow]::IsWindowEnabled($window.Next)) 'Unchecked acceptance allowed Next.'
  [AzuriaInstallerWindow]::Click([AzuriaInstallerWindow]::GetDlgItem($window.Parent,2))
  Wait-Finished $run
  Assert (-not (Test-Path $run.Marker)) 'Cancelling installed files.'
  Assert (-not (Test-Path $key)) 'Cancelling recorded acceptance.'

  # Updates from legacy versions work without a record and never invent one.
  foreach ($mode in @('/S /UPDATE', '/P /UPDATE')) {
    $run = Start-Fixture $mode
    Wait-Finished $run
    Assert ($run.Process.ExitCode -eq 0) 'Legacy automatic update was blocked.'
    Assert (Test-Path $run.Marker) 'Legacy update did not install.'
    Assert (-not (Test-Path $key)) 'Update invented privacy acceptance.'
  }

  # First installation must still request real, unchecked acceptance.
  $run = Start-Fixture '/P'
  $window = Wait-Window $run
  Assert (-not [AzuriaInstallerWindow]::IsWindowEnabled($window.Next)) 'First install had acceptance preselected.'
  [AzuriaInstallerWindow]::Click($window.Checkbox)
  for ($i=0; $i -lt 50 -and -not [AzuriaInstallerWindow]::IsWindowEnabled($window.Next); $i++) { Start-Sleep -Milliseconds 100 }
  Assert ([AzuriaInstallerWindow]::IsWindowEnabled($window.Next)) 'Accepting did not enable Next.'
  [AzuriaInstallerWindow]::Click($window.Next)
  Wait-Finished $run
  Assert (Test-Path $run.Marker) 'Accepted install did not reach its install section.'
  Assert ((Get-ItemProperty $key).AcceptedPolicy -eq $version) 'First installation did not record acknowledgement.'

  # A changed policy never blocks updates or a manual upgrade/reinstall.
  Set-ItemProperty $key -Name AcceptedPolicy -Value 'older-policy'
  foreach ($mode in @('/S /UPDATE', '/P /UPDATE', '/S')) {
    $run = Start-Fixture $mode
    Wait-Finished $run
    Assert ($run.Process.ExitCode -eq 0) 'An existing installation was asked to accept again.'
    Assert (Test-Path $run.Marker) 'Existing installation did not update.'
    Assert ((Get-ItemProperty $key).AcceptedPolicy -eq 'older-policy') 'Upgrade overwrote the original acknowledgement.'
  }

  # A manual upgrade of a legacy installation is recognised by its app file.
  Remove-Item $key -Recurse -Force
  $legacy = Join-Path $work 'legacy'
  New-Item $legacy -ItemType Directory | Out-Null
  Set-Content (Join-Path $legacy 'azuria-test.exe') 'fixture only'
  New-Item "$key\Install" -Force | Out-Null
  Set-Item "$key\Install" -Value $legacy
  $run = Start-Fixture '/S'
  Wait-Finished $run
  Assert ($run.Process.ExitCode -eq 0) 'Legacy manual upgrade required acceptance.'
  Assert (Test-Path $run.Marker) 'Legacy manual upgrade did not install.'
  Assert (-not (Get-ItemProperty $key -Name AcceptedPolicy -ErrorAction SilentlyContinue)) 'Legacy upgrade invented acceptance.'
  Remove-Item (Join-Path $legacy 'azuria-test.exe')
  $run = Start-Fixture '/S'
  Wait-Finished $run
  Assert ($run.Process.ExitCode -eq 2) 'Stale install registration bypassed first-install acceptance.'
  Assert (-not (Test-Path $run.Marker)) 'Stale installation registration wrote files.'
  Write-Output 'Installer privacy checks passed: first-install gate, cancellation, legacy and changed-policy automatic/manual upgrades.'

} finally {
  foreach ($p in $children) { if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } }
  Remove-Item $key -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
