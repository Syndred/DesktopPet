# Fixed protected-environment holder only. Exact PS5 parent/child ancestry.
param([Parameter(Mandatory=$true)][ValidateSet('selftest','start','identity','baseline','warning','final','reconcile','stop')][string]$Action)
$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:GITHUB_RUN_ATTEMPT -ne '1' -or $env:GITHUB_RUN_ID -notmatch '^[0-9]+$') { throw 'PRE_CREDENTIAL_NOT_READY' }
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$directory=Join-Path $root ('artifacts/qa/same-run-entry-'+$env:GITHUB_RUN_ID)
$business=Join-Path $root ('artifacts/qa/same-run-'+$env:GITHUB_RUN_ID)
$pidFile=Join-Path $directory 'holder-process.json'
$reconcilePidFile=Join-Path $directory 'reconcile-process.json'
if($Action -eq 'stop' -and (Test-Path -LiteralPath $reconcilePidFile)){$pidFile=$reconcilePidFile}

if ($env:NODE_OPTIONS -or $env:NODE_PATH) { throw 'NODE_PRELOAD_FORBIDDEN' }
foreach($key in @('TEMP','TMP')) { if (![string]::Equals([IO.Path]::GetFullPath([Environment]::GetEnvironmentVariable($key)),[IO.Path]::GetFullPath($env:RUNNER_TEMP),[StringComparison]::OrdinalIgnoreCase)) { throw 'TEMP_ROOT_MISMATCH' } }
$clockPath=Join-Path $env:RUNNER_TEMP ('same-run-job-clock-'+$env:GITHUB_RUN_ID+'.json')
$clockItem=Get-Item -LiteralPath $clockPath
if(($clockItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $clockItem.Length -gt 2048){throw 'JOB_CLOCK_INVALID'}
$clock=Get-Content -LiteralPath $clockPath -Raw|ConvertFrom-Json
if($clock.version -ne 1 -or [string]$clock.run -cne $env:GITHUB_RUN_ID -or $clock.commit -cne $env:GITHUB_SHA -or ($clock.hardEndMs-$clock.startedAtMs) -ne 19200000){throw 'JOB_CLOCK_INVALID'}
# The original job clock stays truthful. Parent custody is an additional absolute cap.
$custodyPath=Join-Path $directory 'environment-custody-window.json'
function Validate-Custody($value){
 if((($value.PSObject.Properties.Name|Sort-Object)-join ',') -cne 'absoluteCleanupDeadlineMs,custodyStartedAtMs,environmentId,nonce,version' -or $value.version -ne 1 -or $value.environmentId -ne 25567576058 -or $value.nonce -notmatch '^[a-f0-9-]{36}$'){throw 'CUSTODY_BINDING_INVALID'}
 foreach($n in @($value.custodyStartedAtMs,$value.absoluteCleanupDeadlineMs)){if($n -isnot [long] -and $n -isnot [int]){throw 'CUSTODY_TIME_INVALID'};if($n -le 0 -or $n -gt 9007199254740991){throw 'CUSTODY_TIME_INVALID'}}
 if(($value.absoluteCleanupDeadlineMs-$value.custodyStartedAtMs) -ne 19800000 -or $value.custodyStartedAtMs -gt $clock.startedAtMs){throw 'CUSTODY_WINDOW_INVALID'}
}
if(Test-Path -LiteralPath $custodyPath){
 $item=Get-Item -LiteralPath $custodyPath;if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -gt 2048){throw 'CUSTODY_FILE_INVALID'}
 $custody=Get-Content -LiteralPath $custodyPath -Raw|ConvertFrom-Json;Validate-Custody $custody
 if($Action -ne 'stop'){$current=$env:DESKTOPPET_QA_CUSTODY_BINDING_JSON|ConvertFrom-Json;Validate-Custody $current;foreach($k in $custody.PSObject.Properties.Name){if($custody.$k -cne $current.$k){throw 'NO_CUSTODY_DEADLINE_RESTART'}}}
}else{
 if($Action -ne 'selftest'){throw 'ORIGINAL_CUSTODY_WINDOW_REQUIRED'}
 if(!$env:DESKTOPPET_QA_CUSTODY_BINDING_JSON -or $env:DESKTOPPET_QA_CUSTODY_BINDING_JSON.Length -gt 2048){throw 'CUSTODY_BINDING_REQUIRED'}
 $custody=$env:DESKTOPPET_QA_CUSTODY_BINDING_JSON|ConvertFrom-Json;Validate-Custody $custody
 New-Item -ItemType Directory -Path $directory -Force|Out-Null
 $stream=[IO.File]::Open($custodyPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$bytes=[Text.Encoding]::UTF8.GetBytes(($custody|ConvertTo-Json -Compress));$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
}
$effectiveHardEndMs=[Math]::Min([long]$clock.hardEndMs,[long]$custody.absoluteCleanupDeadlineMs)
$hardEnd=[DateTimeOffset]::FromUnixTimeMilliseconds($effectiveHardEndMs).UtcDateTime
# Terminal cleanup remains callable even after the business/custody wait deadline.
if($Action -ne 'stop' -and [DateTime]::UtcNow -ge $hardEnd){throw 'CUSTODY_WINDOW_EXPIRED'}
function Write-Owned($process) {
 $process.Refresh()
 $ticks=$process.StartTime.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture)
 $image=$process.MainModule.FileName
 if ($process.ProcessName -ne 'node' -or ![System.IO.Path]::IsPathRooted($image)) { throw 'Owned holder executable mismatch' }
 # JSON strings containing decimal ticks are not subject to PS7 ISO-DateTime coercion.
 $record=@{schemaVersion=2;pid=$process.Id;startedAtTicks=$ticks;startedAt=$process.StartTime.ToUniversalTime().ToString('O');executablePath=$image;scope='This job holder only'}
 $record | ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding UTF8
 return $record
}
function Resolve-Owned {
 if (!(Test-Path -LiteralPath $pidFile)) { return $null }
 $record=Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
 if ($record.schemaVersion -ne 2 -or $record.startedAtTicks -isnot [string] -or $record.startedAtTicks -notmatch '^[0-9]{1,19}$') { throw 'Invalid owned holder start ticks' }
 [long]$ticks=0
 if (![long]::TryParse($record.startedAtTicks,[Globalization.NumberStyles]::None,[Globalization.CultureInfo]::InvariantCulture,[ref]$ticks) -or $ticks -le 0 -or $ticks -gt [DateTime]::MaxValue.Ticks) { throw 'Invalid owned holder start ticks' }
 if ($record.pid -isnot [int] -and $record.pid -isnot [long]) { throw 'Invalid owned holder PID' }
 if ($record.pid -le 0 -or $record.pid -gt [int]::MaxValue) { throw 'Invalid owned holder PID' }
 if ($record.executablePath -isnot [string] -or ![System.IO.Path]::IsPathRooted($record.executablePath)) { throw 'Invalid owned holder image path' }
 $process=Get-Process -Id ([int]$record.pid) -ErrorAction SilentlyContinue
 if (!$process) { return $null }
 $actualTicks=$process.StartTime.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture)
 if (![string]::Equals($actualTicks,$record.startedAtTicks,[StringComparison]::Ordinal)) { throw 'Owned holder PID was reused; refuse action' }
 if ($process.ProcessName -ne 'node' -or ![string]::Equals($process.MainModule.FileName,$record.executablePath,[StringComparison]::OrdinalIgnoreCase)) { throw 'Owned holder executable mismatch' }
 return $process
}

function Read-SafeJson($path) {
 $item=Get-Item -LiteralPath $path
 if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -gt 65536){throw 'FIXED_SAFE_FILE_REQUIRED'}
 return Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
}

if($Action -eq 'selftest'){& (Join-Path $PSScriptRoot 'process.ps1') -Action selftest -Output (Join-Path $directory 'identity-selftest');if($LASTEXITCODE -and $LASTEXITCODE -ne 0){throw 'IDENTITY_SELFTEST_FAILED'};exit 0}
if($Action -eq 'start'){
 if(Test-Path -LiteralPath $pidFile){throw 'NO_SECOND_HOLDER_START'}
 $self=Join-Path $directory 'identity-selftest/supervisor-selftest.json';if(!(Test-Path -LiteralPath $self) -or (Read-SafeJson $self).passed -ne $true){throw 'IDENTITY_SELFTEST_REQUIRED'}
 New-Item -ItemType Directory -Path $directory -Force|Out-Null
 $entry=Join-Path $PSScriptRoot 'environment-bootstrap.mjs'
 $child=Start-Process -FilePath (Get-Command node).Source -ArgumentList ('"'+$entry+'"') -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $directory 'private-stdout.txt') -RedirectStandardError (Join-Path $directory 'private-stderr.txt')
 $null=$child.Handle;Write-Owned $child|Out-Null
 $until=[DateTime]::UtcNow.AddSeconds(20);if($until -gt $hardEnd){$until=$hardEnd}
 while([DateTime]::UtcNow -lt $until){if(!(Resolve-Owned)){throw 'ENVIRONMENT_ENTRY_STOPPED_BEFORE_READY'};$path=Join-Path $directory 'environment-status.json';if(Test-Path -LiteralPath $path){$r=Read-SafeJson $path;if($r.version -ne 1 -or [string]$r.run -cne $env:GITHUB_RUN_ID -or $r.commit -cne $env:GITHUB_SHA -or $r.source -cne 'github-environment-v1' -or $r.mainCalled -ne $true){throw 'ENVIRONMENT_READY_BINDING_INVALID'};if($r.ticks -ge 1 -and $r.stage -ne 'failed' -and (Resolve-Owned)){@{version=1;run=$env:GITHUB_RUN_ID;commit=$env:GITHUB_SHA;firstTickVerified=$true;ownedPidAlive=$true}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $directory 'environment-start-ready.json') -Encoding UTF8;exit 0}};Start-Sleep -Milliseconds 100}
 throw 'ENVIRONMENT_START_HANDSHAKE_TIMEOUT'
}
if($Action -eq 'reconcile'){
 $bindingPath=Join-Path $directory 'entry-binding.json';if(!(Test-Path -LiteralPath $bindingPath)){Write-Output 'NO_PLATFORM_BINDING_NO_READBACK';exit 0}
 if(Test-Path -LiteralPath $reconcilePidFile){throw 'NO_SECOND_READBACK_HOLDER'}
 $status=Read-SafeJson (Join-Path $directory 'environment-status.json');if($status.stage -eq 'completed' -and $status.passed -eq $true){Write-Output 'COMPLETED_NO_READBACK';exit 0}
 $until=[DateTime]::UtcNow.AddSeconds(45);if($until -gt $hardEnd){$until=$hardEnd};while((Resolve-Owned) -and [DateTime]::UtcNow -lt $until){Start-Sleep -Milliseconds 100};if(Resolve-Owned){throw 'ORIGINAL_HOLDER_EXIT_UNCONFIRMED_NO_RESTART'}
 if([DateTime]::UtcNow -ge $hardEnd){throw 'CUSTODY_WINDOW_EXPIRED_NO_READBACK_START'}
 $pidFile=$reconcilePidFile;$entry=Join-Path $PSScriptRoot 'environment-bootstrap.mjs'
 $child=Start-Process -FilePath (Get-Command node).Source -ArgumentList ('"'+$entry+'" --reconcile-only') -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $directory 'private-readback-stdout.txt') -RedirectStandardError (Join-Path $directory 'private-readback-stderr.txt');$null=$child.Handle;Write-Owned $child|Out-Null
 $until=[DateTime]::UtcNow.AddMinutes(2);if($until -gt $hardEnd){$until=$hardEnd}
 while([DateTime]::UtcNow -lt $until){if(!(Resolve-Owned)){ $r=Read-SafeJson (Join-Path $directory 'environment-reconciliation-status.json');if($r.run -cne $env:GITHUB_RUN_ID -or $r.commit -cne $env:GITHUB_SHA -or $r.stage -cne 'readback-only-completed' -or $r.nodeExitObserved -ne $true -or $r.requestedExitCode -ne 0){throw 'READBACK_ONLY_FAILED_OR_UNKNOWN'};$result=Read-SafeJson (Join-Path $directory 'environment-reconciliation-result.json');$b=Read-SafeJson $bindingPath;if($result.requestDigest -cne $b.requestDigest -or $result.run -cne $b.run -or $result.commit -cne $b.commit -or $result.reconciliationOnly -ne $true -or $result.businessExecuted -ne $false -or $result.newIdentityMutations -ne $false){throw 'READBACK_RESULT_BINDING_INVALID'};Write-Output 'ORIGINAL_INTENT_INSPECTED_NOT_REPLAYED';exit 0};Start-Sleep -Milliseconds 100}
 throw 'READBACK_ONLY_DEADLINE'
}
if($Action -eq 'stop'){
 $bindingFile=Join-Path $directory 'entry-binding.json';$until=[DateTime]::UtcNow.AddSeconds(45)
 while(!(Test-Path -LiteralPath $bindingFile) -and (Resolve-Owned) -and [DateTime]::UtcNow -lt $until){Start-Sleep -Milliseconds 100}
 if(!(Test-Path -LiteralPath $bindingFile)){
  if(Resolve-Owned){throw 'ENVIRONMENT_PREAUTH_EXIT_UNKNOWN'};$r=Read-SafeJson (Join-Path $directory 'environment-status.json');if($r.run -cne $env:GITHUB_RUN_ID -or $r.commit -cne $env:GITHUB_SHA -or $r.credentialEntryAttempted -ne $false -or $r.nodeExitObserved -ne $true -or $r.requestedExitCode -ne 1){throw 'ENVIRONMENT_NO_CUSTODY_UNPROVEN'}
  $prefix='dpapi-authorized-'+$env:GITHUB_RUN_ID+'-';if(@(Get-ChildItem -LiteralPath $env:RUNNER_TEMP -Force|Where-Object {$_.Name.StartsWith($prefix,[StringComparison]::Ordinal)}).Count -ne 0){throw 'ENVIRONMENT_CUSTODY_ROOT_PRESENT'}
  @{version=1;run=$env:GITHUB_RUN_ID;commit=$env:GITHUB_SHA;scope='precredential-no-custody';registeredProfileCleanupNotClaimed=$true}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $directory 'terminal-cleanup.json') -Encoding UTF8;exit 0
 }
 $binding=Read-SafeJson $bindingFile
 if(@($binding.PSObject.Properties.Name).Count -ne 4 -or $binding.version -ne 1 -or [string]$binding.run -cne $env:GITHUB_RUN_ID -or $binding.commit -cne $env:GITHUB_SHA -or $binding.requestDigest -notmatch '^[a-f0-9]{64}$'){throw 'EXACT_PLATFORM_ENTRY_BINDING_REQUIRED'}
 $vaultName='dpapi-authorized-'+$env:GITHUB_RUN_ID+'-'+$binding.requestDigest
 $vaultRoot=Join-Path $env:RUNNER_TEMP $vaultName
 if(Test-Path -LiteralPath $vaultRoot){
  $si=[Diagnostics.ProcessStartInfo]::new();$si.FileName=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
  $helper=Join-Path $PSScriptRoot '../dpapi/authorized-vault.ps1'
  $si.Arguments='-NoLogo -NoProfile -NonInteractive -File "'+$helper+'" -Action request-stop';$si.UseShellExecute=$false;$si.CreateNoWindow=$true;$si.RedirectStandardInput=$true;$si.RedirectStandardOutput=$true;$si.RedirectStandardError=$true
  $request=[Diagnostics.Process]::Start($si)
  $request.StandardInput.WriteLine((@{purpose='same-run-qa-continuity-v1';directoryName=$vaultName;requestDigest=$binding.requestDigest}|ConvertTo-Json -Compress));$request.StandardInput.Close()
  if(!$request.WaitForExit(15000)){try{$request.Kill()}catch{};if(!$request.WaitForExit(5000)){throw 'STOP_REQUEST_HELPER_EXIT_UNCONFIRMED'};throw 'STOP_REQUEST_HELPER_TIMEOUT_NOT_CLEANED'}
  $answer=$request.StandardOutput.ReadToEnd()|ConvertFrom-Json
  if($request.ExitCode -ne 0 -or $answer.result.stopRequested -ne $true -or $answer.result.cleanupConfirmed -ne $false){throw 'STOP_REQUEST_REJECTED'}
 }
 $terminal=Join-Path $root ('artifacts/qa/same-run-watchdog-'+$env:GITHUB_RUN_ID+'/'+$binding.requestDigest+'-terminal.json')
 $deadline=[DateTime]::UtcNow.AddMinutes(2)
 while([DateTime]::UtcNow -lt $deadline){
  if(Test-Path -LiteralPath $terminal){
   $receipt=Read-SafeJson $terminal
   $names=@($receipt.PSObject.Properties.Name|Sort-Object)-join ','
   if($names -cne 'ciphertextRemoved,cleanupConfirmed,closed,commit,endedAt,registeredProfilesOnly,requestDigest,run,version' -or $receipt.version -ne 1 -or [string]$receipt.run -cne [string]$binding.run -or $receipt.commit -cne $binding.commit -or $receipt.requestDigest -cne $binding.requestDigest -or $receipt.closed -ne $true -or $receipt.registeredProfilesOnly -ne $true){throw 'TERMINAL_RECEIPT_BINDING_MISMATCH'}
   if($receipt.cleanupConfirmed -ne $true -or $receipt.ciphertextRemoved -ne $true){throw 'TERMINAL_CLEANUP_NOT_CONFIRMED'}
   if(!(Test-Path -LiteralPath $vaultRoot) -and !(Resolve-Owned)){
    $receipt|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $directory 'terminal-cleanup.json') -Encoding UTF8
    Write-Output 'REGISTERED_WATCHDOG_CLEANUP_CONFIRMED';exit 0
   }
  }
  Start-Sleep -Seconds 1
 }
 throw 'WATCHDOG_CLEANUP_TIMEOUT_NOT_CONFIRMED'
}

$bindingPath=Join-Path $directory 'entry-binding.json';$bindingUntil=[DateTime]::UtcNow.AddMinutes(2);if($bindingUntil -gt $hardEnd){$bindingUntil=$hardEnd}
while(!(Test-Path -LiteralPath $bindingPath) -and [DateTime]::UtcNow -lt $bindingUntil){if(!(Resolve-Owned)){throw 'ENVIRONMENT_STOPPED_BEFORE_BINDING'};Start-Sleep -Milliseconds 100}
$binding=Read-SafeJson $bindingPath;if($binding.version -ne 1 -or [string]$binding.run -cne $env:GITHUB_RUN_ID -or $binding.commit -cne $env:GITHUB_SHA -or $binding.requestDigest -notmatch '^[a-f0-9]{64}$'){throw 'PLATFORM_PHASE_BINDING_REQUIRED'}
if($Action -eq 'baseline'){
 if(!(Resolve-Owned)){throw 'PLATFORM_HOLDER_NOT_ALIVE'}
 $path=Join-Path $business 'identity-upload-complete.json';$bytes=[Text.Encoding]::UTF8.GetBytes((@{version=1;run=$env:GITHUB_RUN_ID;commit=$env:GITHUB_SHA;requestDigest=$binding.requestDigest;purpose='identity-upload-complete-no-authority'}|ConvertTo-Json -Compress));$stream=[IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
}
$until=[DateTime]::UtcNow.AddMinutes(130);if($until -gt $hardEnd){$until=$hardEnd}
while([DateTime]::UtcNow -lt $until){
 $alive=Resolve-Owned;$status=Read-SafeJson (Join-Path $directory 'environment-status.json');if($status.run -cne $env:GITHUB_RUN_ID -or $status.commit -cne $env:GITHUB_SHA){throw 'ENVIRONMENT_STATUS_BINDING_INVALID'}
 if($Action -eq 'final'){if(!$alive){if($status.stage -ne 'completed' -or $status.passed -ne $true -or $status.nodeExitObserved -ne $true -or $status.requestedExitCode -ne 0){throw 'ENVIRONMENT_COMPLETION_FAILED'};exit 0}}
 else{
  $name=switch($Action){'identity'{'identity-manifest.json'}'baseline'{'awaiting-platform-grant-transition.json'}'warning'{'s06-platform-warning.json'}}
  $path=Join-Path $business $name
  if(Test-Path -LiteralPath $path){$r=Read-SafeJson $path;if([string]$r.run -cne $env:GITHUB_RUN_ID -or $r.commit -cne $env:GITHUB_SHA -or $r.requestDigest -cne $binding.requestDigest){throw 'ENVIRONMENT_PHASE_BINDING_INVALID'};if($Action -eq 'identity' -and ($r.registrationConfirmed -ne $true -or @($r.devices).Count -ne 5)){Start-Sleep -Milliseconds 100;continue};if($Action -eq 'baseline' -and ($r.baselineFiveFalse -ne $true -or [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -ge $r.windowClosesAt)){throw 'FRESH_WINDOW_ALREADY_EXPIRED'};if($Action -eq 'warning' -and ($r.realOriginalWarningObserved -ne $true -or $r.originalSnapshotCount -ne 1)){throw 'ORIGINAL_S06_WARNING_REQUIRED'};if(!$alive){throw 'HOLDER_DIED_AT_PHASE'};Write-Output 'FIXED_PLATFORM_PHASE_READY';exit 0}
 }
 if(!$alive -or $status.stage -eq 'failed'){throw 'ENVIRONMENT_HOLDER_STOPPED'};Start-Sleep -Milliseconds 100
}
throw 'ENVIRONMENT_PHASE_DEADLINE'
