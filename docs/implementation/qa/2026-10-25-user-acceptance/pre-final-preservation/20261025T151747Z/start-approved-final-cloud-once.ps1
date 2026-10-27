param(
  [switch]$Run,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-f]{64}$')][string]$ExactExeSha256,
  [Parameter(Mandatory=$true)][string]$ProfilePath,
  [Parameter(Mandatory=$true)][string]$EvidenceDirectory,
  [Parameter(Mandatory=$true)][int]$DebugPort
)
$ErrorActionPreference = 'Stop'
if (-not $Run) { Write-Output 'No launch without -Run.'; return }
$taskExe = 'C:\Users\Administrator\Desktop\project\DesktopPet\releases\user-acceptance-dc7aee3\Lingjing-0.1.8-portable-x64.exe'
$taskSha = $ExactExeSha256
$taskAllowedProfiles = @(
  'C:\Users\Administrator\Desktop\project\DesktopPet\artifacts\qa\user-acceptance\790f5b6d-a900-4c6f-bb3f-e32237136ed1\cloud-a',
  'C:\Users\Administrator\Desktop\project\DesktopPet\artifacts\qa\user-acceptance\790f5b6d-a900-4c6f-bb3f-e32237136ed1\cloud-b-fresh09',
  'C:\Users\Administrator\Desktop\project\DesktopPet\artifacts\qa\user-acceptance\790f5b6d-a900-4c6f-bb3f-e32237136ed1\cloud-b-second-device-native',
  'C:\Users\Administrator\Desktop\project\DesktopPet\artifacts\qa\user-acceptance\790f5b6d-a900-4c6f-bb3f-e32237136ed1\cloud-d-native'
)
if (-not [IO.Path]::IsPathRooted($ProfilePath) -or -not [IO.Path]::IsPathRooted($EvidenceDirectory)) { throw 'Absolute paths required' }
$taskProfile = (Get-Item -LiteralPath $ProfilePath).FullName
if ($taskProfile -notin $taskAllowedProfiles) { throw 'Profile is not an approved original cloud QA profile' }
if ((Test-Path -LiteralPath (Join-Path $taskProfile '.lingjing-qa-profile.json')) -or (Test-Path -LiteralPath (Join-Path $taskProfile 'lingjing-qa-profile.json'))) { throw 'Ordinary cloud profiles must have no client QA marker' }
if (Test-Path -LiteralPath $EvidenceDirectory) { throw 'Never overwrite evidence or retry an uncertain launch' }
if ((Get-FileHash -LiteralPath $taskExe -Algorithm SHA256).Hash -ine $taskSha) { throw 'Frozen EXE hash mismatch' }
if ($DebugPort -lt 1024 -or $DebugPort -gt 65535) { throw 'Invalid port' }
if (@([Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | Where-Object Port -eq $DebugPort).Count) { throw 'Debug port already active' }
$taskProcesses = @(Get-CimInstance Win32_Process -Filter "Name='Lingjing.exe'")
if (@($taskProcesses | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($taskProfile, [StringComparison]::OrdinalIgnoreCase) -ge 0 }).Count) { throw 'A process already uses this exact cloud profile' }
New-Item -ItemType Directory -Path $EvidenceDirectory | Out-Null
$taskNames = @('PET_USER_DATA_DIR','LINGJING_QA_SCENARIO','ELECTRON_RUN_AS_NODE','PET_RUNTIME_DATA_FILE','ELECTRON_RENDERER_URL')
$taskSaved = @{}
foreach ($taskName in $taskNames) {
  $taskSaved[$taskName] = @{ present = [Environment]::GetEnvironmentVariables('Process').Contains($taskName); value = [Environment]::GetEnvironmentVariable($taskName,'Process') }
}
try {
  [Environment]::SetEnvironmentVariable('PET_USER_DATA_DIR',$taskProfile,'Process')
  foreach ($taskName in $taskNames | Where-Object { $_ -ne 'PET_USER_DATA_DIR' }) { Remove-Item -LiteralPath ('Env:' + $taskName) -ErrorAction SilentlyContinue }
  foreach ($taskName in $taskNames | Where-Object { $_ -ne 'PET_USER_DATA_DIR' }) { if ([Environment]::GetEnvironmentVariables('Process').Contains($taskName)) { throw "Environment key remains present: $taskName" } }
  if ([Environment]::GetEnvironmentVariables('Process').Contains('NODE_OPTIONS')) { throw 'Unexpected NODE_OPTIONS requires inspection before launch' }
  foreach ($taskProxyName in @('NODE_USE_ENV_PROXY','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY')) { if ([Environment]::GetEnvironmentVariables('Process').Contains($taskProxyName)) { throw ('Ordinary cloud launch has unexpected child proxy environment: ' + $taskProxyName) } }
  $taskEnvironment = foreach ($taskName in @('ELECTRON_RUN_AS_NODE','NODE_OPTIONS','LINGJING_QA_SCENARIO','PET_RUNTIME_DATA_FILE','ELECTRON_RENDERER_URL')) { @{ name=$taskName; present=[Environment]::GetEnvironmentVariables('Process').Contains($taskName) } }
  $taskIssued = [DateTime]::UtcNow.ToString('o')
  $taskProcess = Start-Process -FilePath $taskExe -ArgumentList "--remote-debugging-port=$DebugPort" -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $EvidenceDirectory 'launcher.stdout.log') -RedirectStandardError (Join-Path $EvidenceDirectory 'launcher.stderr.log')
  $null = $taskProcess.Handle
  $taskLaunch = @{ at=$taskIssued; pid=$taskProcess.Id; executable=$taskExe; sha256=$taskSha; expectedSourceCommit='dc7aee379d0fb241e5c4bd4bf43101fa1a85a678'; profile=$taskProfile; markerAbsent=$true; arguments=@("--remote-debugging-port=$DebugPort"); environmentAtLaunch=$taskEnvironment; shell=@{ ps=$PSVersionTable.PSVersion.ToString(); dotnet=[Environment]::Version.ToString() }; acceptancePassed=$false; automaticRetry=$false }
} finally {
  foreach ($taskName in $taskNames) {
    if ($taskSaved[$taskName].present) { [Environment]::SetEnvironmentVariable($taskName,$taskSaved[$taskName].value,'Process') }
    else { Remove-Item -LiteralPath ('Env:' + $taskName) -ErrorAction SilentlyContinue }
    $taskPresent = [Environment]::GetEnvironmentVariables('Process').Contains($taskName)
    if ($taskPresent -ne $taskSaved[$taskName].present -or ($taskPresent -and [Environment]::GetEnvironmentVariable($taskName,'Process') -cne $taskSaved[$taskName].value)) { throw "Failed to restore exact environment presence/value: $taskName" }
  }
}
$taskLaunch.environmentRestored = $true
$taskLaunch | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $EvidenceDirectory 'launch.json') -Encoding utf8
$taskLaunch | ConvertTo-Json -Depth 6
