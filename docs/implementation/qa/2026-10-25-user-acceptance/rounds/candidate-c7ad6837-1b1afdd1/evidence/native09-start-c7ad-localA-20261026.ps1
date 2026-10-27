$ErrorActionPreference = 'Stop'
$qaExe = 'C:\Users\Administrator\Desktop\project\DesktopPet\releases\user-acceptance-c7ad6837\Lingjing-0.1.8-portable-x64.exe'
$qaProfile = 'C:\Users\Administrator\Desktop\project\DesktopPet\artifacts\qa\user-acceptance\6ff8e38f-9f2b-4872-8747-1fb00bd81655\local-a'
$qaMainAndWrapper = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -in @(17596,3612) })
$qaProfileProcesses = @(Get-CimInstance Win32_Process -Filter "Name='Lingjing.exe'" | Where-Object { $_.CommandLine -like '*6ff8e38f-9f2b-4872-8747-1fb00bd81655*' -or $_.CommandLine -like '*57215*' })
$qaListeners = @(Get-NetTCPConnection -LocalPort 57215 -State Listen -ErrorAction SilentlyContinue)
if ($qaMainAndWrapper.Count -or $qaProfileProcesses.Count -or $qaListeners.Count) { throw 'Old LocalA has not completed normal exit' }
if ((Get-FileHash -LiteralPath $qaExe -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'c6fdf69e7be15176bf0f0416f691cb99b7f394c44f8a12e2d9031c767d93980d') { throw 'New frozen EXE mismatch' }
if ((Get-FileHash -LiteralPath (Join-Path $qaProfile '.lingjing-qa-profile.json') -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'a1cc2d0b6b58e7a736fcbc74dcd75cca65dc7273bc95422e642bf443fd8e4e6d') { throw 'Original marker mismatch' }
$qaOutput = Join-Path $PSScriptRoot 'localA-c7ad-native-launch-20261026.json'
if (Test-Path -LiteralPath $qaOutput) { throw 'Launch evidence already exists' }
$qaOldProfile = $env:PET_USER_DATA_DIR
$qaOldScenario = $env:LINGJING_QA_SCENARIO
try {
  $env:PET_USER_DATA_DIR = $qaProfile
  $env:LINGJING_QA_SCENARIO = 'unified-battle'
  $qaStarted = Start-Process -FilePath $qaExe -ArgumentList @('--remote-debugging-port=57215','--remote-debugging-address=127.0.0.1') -WindowStyle Hidden -PassThru
} finally {
  $env:PET_USER_DATA_DIR = $qaOldProfile
  $env:LINGJING_QA_SCENARIO = $qaOldScenario
}
$qaReport = [ordered]@{ at=(Get-Date).ToUniversalTime().ToString('o'); executable=$qaExe; profile=$qaProfile; scenario='unified-battle'; debugPort=57215; wrapperPid=$qaStarted.Id; oldNativeExitConfirmed=$true; oldMainPid=17596; oldWrapperPid=3612; oldProfileProcessesGone=$true; oldDebugPortFreed=$true; originalMarkerVerified=$true; credentialValuesRead=$false; pendingNormalRestore='closeToTray=true immediately after original existing login' }
$qaReport | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $qaOutput -Encoding utf8
$qaReport | ConvertTo-Json -Depth 5
