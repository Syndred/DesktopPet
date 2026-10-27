$ErrorActionPreference = 'Stop'
$taskEvidence = 'C:\Users\Administrator\Desktop\project\DesktopPet\docs\implementation\qa\2026-10-25-user-acceptance\pre-final-preservation\20261025T151747Z'
$taskWrapperExe = 'C:\Users\Administrator\Desktop\project\DesktopPet\releases\final-a9acd7f\Lingjing-0.1.8-portable-x64.exe'
$taskPayloadExe = 'C:\Users\ADMINI~1\AppData\Local\Temp\3LBAQALUKgWr1yvvvscHsCaqSpQ\Lingjing.exe'
$taskProfile = 'C:\Users\Administrator\Desktop\project\DesktopPet\artifacts\qa\user-acceptance\790f5b6d-a900-4c6f-bb3f-e32237136ed1\local-a'
$taskOldManifest = Get-Content -LiteralPath 'C:\Users\Administrator\Desktop\project\DesktopPet\docs\implementation\qa\2026-10-25-user-acceptance\evidence\QA-006-duplicate-cleanup.json' -Raw | ConvertFrom-Json
if ($taskOldManifest.ownedLauncher -ne 16196 -or $taskOldManifest.ownedMain -ne 18500 -or [IO.Path]::GetFullPath($taskOldManifest.profile) -ine $taskProfile) { throw 'Old QA identity manifest mismatch' }
$taskBackup = Get-Content -LiteralPath (Join-Path $taskEvidence 'a9-before-stale-stop-backup-manifest.json') -Raw | ConvertFrom-Json
if (-not $taskBackup.allLogicalTablesMatch -or $taskBackup.tableCount -ne 68 -or (Get-FileHash -LiteralPath $taskBackup.backup -Algorithm SHA256).Hash -ine $taskBackup.backupSha256) { throw 'Verified SQLite backup missing or changed' }
function Confirm-ExactOwnedProcess($taskProc, [int]$taskPid, [int]$taskParent, [string]$taskExe, [string]$taskCreated) {
  if (-not $taskProc -or $taskProc.ProcessId -ne $taskPid -or $taskProc.ParentProcessId -ne $taskParent -or $taskProc.ExecutablePath -ine $taskExe -or $taskProc.CreationDate.ToUniversalTime().ToString('o') -cne $taskCreated) { throw "Exact stale process identity mismatch: $taskPid" }
  if ($taskProc.CommandLine -notlike '*--remote-debugging-port=54995*' -or $taskProc.CommandLine -notlike '*--force-renderer-accessibility*') { throw "Stale process arguments mismatch: $taskPid" }
}
$taskMain = Get-CimInstance Win32_Process -Filter 'ProcessId=18500'
$taskWrapper = Get-CimInstance Win32_Process -Filter 'ProcessId=16196'
Confirm-ExactOwnedProcess $taskMain 18500 16196 $taskPayloadExe '2026-10-25T09:52:25.4166610Z'
Confirm-ExactOwnedProcess $taskWrapper 16196 28540 $taskWrapperExe '2026-10-25T09:51:56.6325420Z'
if ((Get-Process -Id 18500).MainWindowHandle -ne 0 -or (Get-Process -Id 16196).MainWindowHandle -ne 0) { throw 'A normal owned window exists; use its UI first' }
$taskListener = @(Get-NetTCPConnection -LocalPort 54995 -State Listen -ErrorAction Stop)
if ($taskListener.Count -ne 1 -or $taskListener[0].OwningProcess -ne 18500) { throw 'Debug port no longer belongs to the exact stale QA main' }
$taskChildren = @(Get-CimInstance Win32_Process -Filter 'ParentProcessId=18500')
foreach ($taskChild in $taskChildren) {
  if ($taskChild.ExecutablePath -ine $taskPayloadExe -or $taskChild.CommandLine.IndexOf($taskProfile, [StringComparison]::OrdinalIgnoreCase) -lt 0) { throw 'An unverified child exists; refuse stale cleanup' }
}
$taskBefore = [ordered]@{
  at=[DateTime]::UtcNow.ToString('o'); authority='Root explicit exact-PID stale QA authorization on 2026-10-25';
  nativeWindowInventory='CUA listWindows: only ChatGPT 23528694; no product windows';
  oldNormalExitAttempt=$taskOldManifest; backup=$taskBackup.backup; backupVerified=$true;
  processes=@(@($taskWrapper,$taskMain)+$taskChildren | Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine,@{Name='CreationUtc';Expression={$_.CreationDate.ToUniversalTime().ToString('o')}})
}
$taskBefore | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $taskEvidence 'a9-stale-exact-pid-before.json') -Encoding utf8
$taskMainHandle = Get-Process -Id 18500
Stop-Process -Id 18500 -ErrorAction Stop
$null = $taskMainHandle.WaitForExit(5000)
$taskWrapperNow = Get-CimInstance Win32_Process -Filter 'ProcessId=16196'
if ($taskWrapperNow) {
  Confirm-ExactOwnedProcess $taskWrapperNow 16196 28540 $taskWrapperExe '2026-10-25T09:51:56.6325420Z'
  Stop-Process -Id 16196 -ErrorAction Stop
}
$taskStoppedChildren = @()
foreach ($taskChild in $taskChildren) {
  $taskChildNow = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $taskChild.ProcessId)
  if ($taskChildNow) {
    if ($taskChildNow.ParentProcessId -ne 18500 -or $taskChildNow.ExecutablePath -ine $taskPayloadExe -or $taskChildNow.CreationDate -ne $taskChild.CreationDate -or $taskChildNow.CommandLine -cne $taskChild.CommandLine) { throw 'Child identity changed after main exit; refuse further stops' }
    Stop-Process -Id $taskChildNow.ProcessId -ErrorAction Stop
    $taskStoppedChildren += $taskChildNow.ProcessId
  }
}
$taskOwnedIds = @(16196,18500) + @($taskChildren.ProcessId)
$taskRemaining = @(Get-CimInstance Win32_Process | Where-Object ProcessId -in $taskOwnedIds | Select-Object ProcessId,ParentProcessId,ExecutablePath)
$taskAfter = [ordered]@{ at=[DateTime]::UtcNow.ToString('o'); method='owned-stale-exact-pid'; mainStopped=18500; wrapperWasStillPresent=[bool]$taskWrapperNow; explicitlyStoppedChildren=$taskStoppedChildren; ownedIds=$taskOwnedIds; remaining=$taskRemaining; listeners=@(Get-NetTCPConnection -LocalPort 54995 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalPort,OwningProcess); ordinaryUserProcessesTouched=$false; oldNormalExitFailureRetained=$true }
$taskAfter | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $taskEvidence 'a9-stale-exact-pid-after.json') -Encoding utf8
if ($taskRemaining.Count -or $taskAfter.listeners.Count) { throw 'Owned stale cleanup incomplete' }
$taskAfter | ConvertTo-Json -Depth 6
