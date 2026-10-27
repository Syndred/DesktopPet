$ErrorActionPreference='Stop'
$qaExe='C:\Users\Administrator\Desktop\project\DesktopPet\releases\user-acceptance-c7ad6837\Lingjing-0.1.8-portable-x64.exe'
$qaProfile='C:\Users\Administrator\Desktop\project\DesktopPet\artifacts\qa\user-acceptance\790f5b6d-a900-4c6f-bb3f-e32237136ed1\cloud-b-second-device-native'
$qaOutput=Join-Path $PSScriptRoot 'cloudB2-c7ad-original-normal-launch-20261026.json'
if(Test-Path -LiteralPath $qaOutput){throw 'Launch evidence already exists; do not repeat start'}
if(-not(Test-Path -LiteralPath (Join-Path $qaProfile 'lingjing.sqlite'))){throw 'Original B2 database missing'}
if(Test-Path -LiteralPath (Join-Path $qaProfile '.lingjing-qa-profile.json')){throw 'Ordinary cloud profile must have no QA marker'}
$existing=@(Get-CimInstance Win32_Process -Filter "Name='Lingjing.exe'"|Where-Object {$_.CommandLine-like '*cloud-b-second-device-native*'-or$_.CommandLine-like '*57221*'})
$listeners=@(Get-NetTCPConnection -LocalPort 57221 -State Listen -ErrorAction SilentlyContinue)
if($existing.Count-or$listeners.Count){throw 'Original B2 or debug listener already active'}
if((Get-FileHash -LiteralPath $qaExe -Algorithm SHA256).Hash.ToLowerInvariant()-ne'c6fdf69e7be15176bf0f0416f691cb99b7f394c44f8a12e2d9031c767d93980d'){throw 'Frozen candidate mismatch'}
$qaOldProfile=$env:PET_USER_DATA_DIR
$qaOldScenario=$env:LINGJING_QA_SCENARIO
try{
 $env:PET_USER_DATA_DIR=$qaProfile
 Remove-Item Env:LINGJING_QA_SCENARIO -ErrorAction SilentlyContinue
 $started=Start-Process -FilePath $qaExe -ArgumentList @('--remote-debugging-port=57221','--remote-debugging-address=127.0.0.1') -WindowStyle Hidden -PassThru
}finally{
 $env:PET_USER_DATA_DIR=$qaOldProfile
 $env:LINGJING_QA_SCENARIO=$qaOldScenario
}
$report=[ordered]@{at=[DateTime]::UtcNow.ToString('o');approvalRef='root-c7ad-b2-first-pull-1035';exe=$qaExe;profile=$qaProfile;qaMarkerAbsent=$true;scenarioInjected=$false;debugAddress='127.0.0.1';debugPort=57221;portWasFree=$true;wrapperPid=$started.Id;credentialValuesRead=$false;scope='Once ordinary same-profile start; observe startup pull before any normal refresh; no restore, pending clear, or new preference save'}
$report|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $qaOutput -Encoding UTF8
$report|ConvertTo-Json -Depth 6
