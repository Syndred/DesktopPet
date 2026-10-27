$ErrorActionPreference='Stop'
$qaExe='C:\Users\Administrator\Desktop\project\DesktopPet\releases\user-acceptance-c7ad6837\Lingjing-0.1.8-portable-x64.exe'
$qaProfile='C:\Users\Administrator\Desktop\project\DesktopPet\artifacts\qa\user-acceptance\790f5b6d-a900-4c6f-bb3f-e32237136ed1\cloud-a'
$qaOutput=Join-Path $PSScriptRoot 'cloudA-c7ad-original-normal-launch-20261026.json'
if(Test-Path -LiteralPath $qaOutput){throw 'CloudA launch evidence exists; no second start'}
if(-not(Test-Path -LiteralPath (Join-Path $qaProfile 'lingjing.sqlite'))){throw 'Original CloudA database missing'}
if(Test-Path -LiteralPath (Join-Path $qaProfile '.lingjing-qa-profile.json')){throw 'Ordinary CloudA must have no QA marker'}
$qaProcesses=@(Get-CimInstance Win32_Process | Where-Object {$_.ProcessId -in @(11360,16580) -or $_.ExecutablePath -like '*nsp3B06.tmp*' -or ($_.Name -eq 'Lingjing.exe' -and $_.CommandLine -like '*57218*')})
$qaListeners=@(Get-NetTCPConnection -LocalPort 57218 -State Listen -ErrorAction SilentlyContinue)
if($qaProcesses.Count -or $qaListeners.Count){throw 'Old CloudA process or debug port remains active'}
if((Get-FileHash -LiteralPath $qaExe -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'c6fdf69e7be15176bf0f0416f691cb99b7f394c44f8a12e2d9031c767d93980d'){throw 'Frozen c7ad EXE mismatch'}
$qaOldProfile=$env:PET_USER_DATA_DIR
$qaRemovedEnv=@(Get-ChildItem Env: | Where-Object {$_.Name -match '^(LINGJING_QA.*|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|GLOBAL_AGENT_HTTP_PROXY)$'})
try{
 $env:PET_USER_DATA_DIR=$qaProfile
 foreach($qaEntry in $qaRemovedEnv){Remove-Item -LiteralPath ('Env:'+$qaEntry.Name)}
 $qaStarted=Start-Process -FilePath $qaExe -ArgumentList @('--remote-debugging-port=57218','--remote-debugging-address=127.0.0.1') -WindowStyle Hidden -PassThru
}finally{
 $env:PET_USER_DATA_DIR=$qaOldProfile
 foreach($qaEntry in $qaRemovedEnv){Set-Item -LiteralPath ('Env:'+$qaEntry.Name) -Value $qaEntry.Value}
}
$qaReport=[ordered]@{at=[DateTime]::UtcNow.ToString('o');approvalRef='root-c7ad-cloudA-normal-cutover-warm-reports-1148';exe=$qaExe;profile=$qaProfile;qaMarkerAbsent=$true;scenarioInjected=$false;runInjected=$false;proxyInjected=$false;childQaAndProxyEnvRemoved=$true;debugAddress='127.0.0.1';debugPort=57218;portWasFree=$true;oldMainGone=$true;oldWrapperGone=$true;wrapperPid=$qaStarted.Id;credentialValuesRead=$false;scope='Once ordinary same original profile start; retain secure login and all history; normal closeToTray restoration only then readonly warm reports'}
$qaReport|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $qaOutput -Encoding UTF8
$qaReport|ConvertTo-Json -Depth 5
