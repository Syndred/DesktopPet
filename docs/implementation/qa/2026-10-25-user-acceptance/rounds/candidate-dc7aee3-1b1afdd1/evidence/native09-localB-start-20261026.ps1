$ErrorActionPreference = 'Stop'
$qaExe = 'C:\Users\Administrator\Desktop\project\DesktopPet\releases\user-acceptance-dc7aee3\Lingjing-0.1.8-portable-x64.exe'
$qaProfile = 'C:\Users\Administrator\Desktop\project\DesktopPet\artifacts\qa\user-acceptance\e71b9c11-e62a-46a6-aa4d-decdd34c4200\local-b-concurrency'
$qaPort = 57219
if ((Get-FileHash -LiteralPath $qaExe -Algorithm SHA256).Hash.ToLowerInvariant() -ne '90e52d4947d506303bd5741d9e901f1e92b3fa2c948847966c956088724f855d') { throw 'Frozen candidate mismatch' }
if ((Get-FileHash -LiteralPath (Join-Path $qaProfile '.lingjing-qa-profile.json') -Algorithm SHA256).Hash.ToLowerInvariant() -ne '93c4f40ed59fe02854fcbbe7fe600a043b9a684cf9c45ec09ca30fa4142c0fcd') { throw 'Original marker mismatch' }
if (Get-NetTCPConnection -LocalPort $qaPort -State Listen -ErrorAction SilentlyContinue) { throw 'Debug port in use' }
$qaExisting = @(Get-CimInstance Win32_Process -Filter "Name='Lingjing.exe'" | Where-Object { $_.CommandLine -like '*local-b-concurrency*' })
if ($qaExisting.Count) { throw 'Original LocalB process already running' }
$qaOldProfile = $env:PET_USER_DATA_DIR
$qaOldScenario = $env:LINGJING_QA_SCENARIO
try {
  $env:PET_USER_DATA_DIR = $qaProfile
  $env:LINGJING_QA_SCENARIO = 'unified-battle'
  $qaStarted = Start-Process -FilePath $qaExe -ArgumentList @('--remote-debugging-port=57219','--remote-debugging-address=127.0.0.1') -WindowStyle Hidden -PassThru
} finally {
  $env:PET_USER_DATA_DIR = $qaOldProfile
  $env:LINGJING_QA_SCENARIO = $qaOldScenario
}
$qaReport = [ordered]@{ at=(Get-Date).ToUniversalTime().ToString('o'); executable=$qaExe; profile=$qaProfile; scenario='unified-battle'; debugPort=$qaPort; wrapperPid=$qaStarted.Id; originalMarkerUnmodified=$true; credentialValuesRead=$false }
$qaOutput = Join-Path $PSScriptRoot 'localB-native-launch-20261026.json'
if (Test-Path -LiteralPath $qaOutput) { throw 'Launch report already exists; refusing replacement' }
$qaReport | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $qaOutput -Encoding utf8
$qaReport | ConvertTo-Json -Depth 4
