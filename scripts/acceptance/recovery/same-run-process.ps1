# Fixed same-run entry only; never kills a holder or its independent watchdog.
param([Parameter(Mandatory=$true)][ValidateSet('selftest','start','status','authorization','reset-a','reset-b','s06-pregrant','c-absent','grant-manifest','s02-empty-cell','final','reconcile','reconcile-A','reconcile-B','reconcile-C','reconcile-final','stop')][string]$Action)
$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:GITHUB_RUN_ATTEMPT -ne '1' -or $env:GITHUB_RUN_ID -notmatch '^[0-9]+$') { throw 'PRE_CREDENTIAL_NOT_READY' }
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$directory=Join-Path $root ('artifacts/qa/same-run-entry-'+$env:GITHUB_RUN_ID)
$business=Join-Path $root ('artifacts/qa/same-run-'+$env:GITHUB_RUN_ID)
$pidFile=Join-Path $directory 'holder-process.json'
$reconcilePidFile=Join-Path $directory 'reconcile-process.json'
if($Action -ne 'start' -and $Action -ne 'selftest' -and $Action -ne 'reconcile' -and (Test-Path -LiteralPath $reconcilePidFile)){$pidFile=$reconcilePidFile}
if ($env:NODE_OPTIONS -or $env:NODE_PATH) { throw 'NODE_PRELOAD_FORBIDDEN' }
foreach($key in @('TEMP','TMP')) { if (![string]::Equals([IO.Path]::GetFullPath([Environment]::GetEnvironmentVariable($key)),[IO.Path]::GetFullPath($env:RUNNER_TEMP),[StringComparison]::OrdinalIgnoreCase)) { throw 'TEMP_ROOT_MISMATCH' } }
$clockPath=Join-Path $env:RUNNER_TEMP ('same-run-job-clock-'+$env:GITHUB_RUN_ID+'.json')
$clockItem=Get-Item -LiteralPath $clockPath
if(($clockItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $clockItem.Length -gt 2048){throw 'JOB_CLOCK_INVALID'}
$clock=Get-Content -LiteralPath $clockPath -Raw|ConvertFrom-Json
if($clock.version -ne 1 -or [string]$clock.run -cne $env:GITHUB_RUN_ID -or $clock.commit -cne $env:GITHUB_SHA -or ($clock.hardEndMs-$clock.startedAtMs) -ne 19200000){throw 'JOB_CLOCK_INVALID'}
$hardEnd=[DateTimeOffset]::FromUnixTimeMilliseconds([long]$clock.hardEndMs).UtcDateTime
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

if($Action -eq 'selftest') {
 # Existing timer-only exact-PID negative tests. Its stop acts ONLY on its synthetic timer.
 & (Join-Path $PSScriptRoot 'process.ps1') -Action selftest -Output (Join-Path $directory 'identity-selftest')
 if($LASTEXITCODE -and $LASTEXITCODE -ne 0){throw 'IDENTITY_SELFTEST_FAILED'}
 exit 0
}
if($Action -eq 'start') {
 if(Test-Path -LiteralPath $pidFile){throw 'NO_SECOND_HOLDER_START'}
 $self=Join-Path $directory 'identity-selftest/supervisor-selftest.json'
 if(!(Test-Path -LiteralPath $self) -or (Get-Content -LiteralPath $self -Raw | ConvertFrom-Json).passed -ne $true){throw 'IDENTITY_SELFTEST_REQUIRED'}
 New-Item -ItemType Directory -Path $directory -Force | Out-Null
 $entry=Join-Path $PSScriptRoot 'same-run-bootstrap.mjs'
 if($entry -match '["\r\n]'){throw 'INVALID_FIXED_ENTRY'}
 # These private streams are deliberately NEVER artifact paths.
 $child=Start-Process -FilePath (Get-Command node).Source -ArgumentList ('"'+$entry+'"') -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $directory 'private-stdout.txt') -RedirectStandardError (Join-Path $directory 'private-stderr.txt')
 Write-Owned $child | Out-Null
 Write-Output 'SAME_RUN_FIXED_ENTRY_STARTED'
 exit 0
}
function Read-SafeJson($path) {
 $item=Get-Item -LiteralPath $path
 if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -gt 65536){throw 'FIXED_SAFE_FILE_REQUIRED'}
 return Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
}
function Assert-NoPrecredentialCustody {
 if(Resolve-Owned){throw 'PREAUTH_HOLDER_STILL_ALIVE'}
 if(Test-Path -LiteralPath (Join-Path $directory 'entry-binding.json')){throw 'PREAUTH_BINDING_EXISTS'}
 $boot=Read-SafeJson (Join-Path $directory 'entry-bootstrap.json')
 $allowed=@('IMPORT_FIXED_ENTRY','ARGUMENTS','TEMP','REQUEST','JOB_CLOCK','PUBLIC_INPUT','PRIVATE_FIXTURE','AWAIT_SIGNED_AUTHORIZATION')
 if($boot.version -ne 1 -or [string]$boot.run -cne $env:GITHUB_RUN_ID -or $boot.commit -cne $env:GITHUB_SHA -or $boot.started -isnot [bool] -or $boot.started -ne $true -or $boot.mainCalled -isnot [bool] -or $boot.phase -cnotin $allowed -or $boot.credentialOperationsStarted -isnot [bool] -or $boot.credentialOperationsStarted -ne $false -or $boot.nodeExitObserved -isnot [bool] -or $boot.nodeExitObserved -ne $true -or $boot.requestedExitCode -ne 1 -or $null -ne $boot.actualExitCode -or $boot.errorCode -cne 'PRE_CREDENTIAL_NOT_READY'){throw 'PREAUTH_SAFE_BOOTSTRAP_PROOF_REQUIRED'}
 # Registry lives only under an authorized-vault root. Match this run exactly;
 # enumerate metadata only, never read another run's directory or any ciphertext.
 $prefix='dpapi-authorized-'+$env:GITHUB_RUN_ID+'-'
 $roots=@(Get-ChildItem -LiteralPath $env:RUNNER_TEMP -Force | Where-Object {$_.Name.StartsWith($prefix,[StringComparison]::Ordinal)})
 if($roots.Count -ne 0){throw 'PREAUTH_CUSTODY_ROOT_OR_REGISTRY_PRESENT'}
 return $true
}
if($Action -eq 'reconcile') {
 if([DateTime]::UtcNow -ge $hardEnd.AddMinutes(-2)){throw 'ORIGINAL_RECONCILIATION_WINDOW_EXPIRED'}
 if(Test-Path -LiteralPath $reconcilePidFile){throw 'NO_REPEATED_RECONCILIATION_HOLDER'}
 $bindingFile=Join-Path $directory 'entry-binding.json'
 $old=Resolve-Owned
 $statusFile=Join-Path $directory 'entry-status.json'
 $status=if(Test-Path -LiteralPath $statusFile){Read-SafeJson $statusFile}else{$null}
 if($status -and $status.state -eq 'completed' -and $status.passed -eq $true){if($env:GITHUB_OUTPUT){'started=false'|Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8};exit 0}
 if(!(Test-Path -LiteralPath $bindingFile)){
  [void](Assert-NoPrecredentialCustody)
  if($env:GITHUB_OUTPUT){'started=false'|Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8};exit 0
 }
 $binding=Read-SafeJson $bindingFile
 if($binding.version -ne 1 -or [string]$binding.run -cne $env:GITHUB_RUN_ID -or $binding.commit -cne $env:GITHUB_SHA -or $binding.requestDigest -notmatch '^[a-f0-9]{64}$'){throw 'RECONCILIATION_BINDING_MISMATCH'}
 $vaultRoot=Join-Path $env:RUNNER_TEMP ('dpapi-authorized-'+$env:GITHUB_RUN_ID+'-'+$binding.requestDigest)
 if(!(Test-Path -LiteralPath $vaultRoot)) {if($old){throw 'RUNNING_ENTRY_WITHOUT_CUSTODY'};if($env:GITHUB_OUTPUT){'started=false'|Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8};exit 0}
 if($old){
  if(!$status -or $status.state -ne 'stopped'){throw 'DO_NOT_INTERRUPT_RECOVERABLE_ACTIVE_HOLDER'}
  # Kill ONLY the already-failed exact holder, not /T; independent watchdog lives.
  $old.Kill();if(!$old.WaitForExit(10000)){throw 'OLD_HOLDER_EXIT_UNCONFIRMED'}
 }
 if(Resolve-Owned){throw 'OLD_HOLDER_STILL_PRESENT'}
 $entry=Join-Path $PSScriptRoot 'same-run-bootstrap.mjs'
 $child=Start-Process -FilePath (Get-Command node).Source -ArgumentList ('"'+$entry+'" --reconcile-only') -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $directory 'private-reconcile-stdout.txt') -RedirectStandardError (Join-Path $directory 'private-reconcile-stderr.txt')
 $pidFile=$reconcilePidFile;Write-Owned $child|Out-Null
 if($env:GITHUB_OUTPUT){'started=true'|Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8}
 Write-Output 'ORIGINAL_INTENT_READBACK_ONLY_STARTED';exit 0
}
if($Action -eq 'stop') {
 $owned=Resolve-Owned
 $bindingFile=Join-Path $directory 'entry-binding.json'
 if(!(Test-Path -LiteralPath $bindingFile)){
  [void](Assert-NoPrecredentialCustody)
  @{version=1;run=$env:GITHUB_RUN_ID;commit=$env:GITHUB_SHA;scope='precredential-no-custody';credentialOperationsStarted=$false;holderExited=$true;bindingAbsent=$true;thisRunVaultAndRegistryAbsent=$true;actualExitCode=$null;registeredProfileCleanupNotClaimed=$true}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $directory 'terminal-cleanup.json') -Encoding UTF8
  exit 0
 }
 $binding=Read-SafeJson $bindingFile
 if(@($binding.PSObject.Properties.Name).Count -ne 4 -or $binding.version -ne 1 -or [string]$binding.run -cne $env:GITHUB_RUN_ID -or $binding.commit -cne $env:GITHUB_SHA -or $binding.requestDigest -notmatch '^[a-f0-9]{64}$'){throw 'EXACT_SIGNED_ENTRY_BINDING_REQUIRED'}
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
if($Action -eq 'status') { if(Resolve-Owned){Write-Output 'OWNED_ENTRY_RUNNING'}else{Write-Output 'OWNED_ENTRY_STOPPED'};exit 0 }
if($Action -like 'reconcile-*') {
 $binding=Read-SafeJson (Join-Path $directory 'entry-binding.json')
 if(@($binding.PSObject.Properties.Name).Count -ne 4 -or $binding.version -ne 1 -or [string]$binding.run -cne $env:GITHUB_RUN_ID -or $binding.commit -cne $env:GITHUB_SHA -or $binding.requestDigest -notmatch '^[a-f0-9]{64}$'){throw 'ORIGINAL_ENTRY_BINDING_REQUIRED'}
 $deadline=[DateTime]::UtcNow.AddMinutes(21);if($deadline -gt $hardEnd){$deadline=$hardEnd}
 while([DateTime]::UtcNow -lt $deadline){
  $owned=Resolve-Owned
  $resultFile=Join-Path $directory 'reconciliation-result.json'
  if($Action -ne 'reconcile-final'){
   $slot=$Action.Substring(10);$checkpointPath=Join-Path $business ('reconciliation-'+$slot+'-result.json')
   if(Test-Path -LiteralPath $checkpointPath){
    $checkpoint=Read-SafeJson $checkpointPath
    if($checkpoint.version -ne 1 -or [string]$checkpoint.run -cne [string]$binding.run -or $checkpoint.commit -cne $binding.commit -or $checkpoint.requestDigest -cne $binding.requestDigest -or $checkpoint.slot -cne $slot -or $checkpoint.noNewIdentityMutation -isnot [bool] -or $checkpoint.noNewIdentityMutation -ne $true){throw 'SLOT_CHECKPOINT_BINDING_MISMATCH'}
    $keys=@($checkpoint.PSObject.Properties.Name|Sort-Object)-join ','
    if($keys -ceq 'commit,noNewIdentityMutation,reason,requestDigest,run,skipped,slot,version'){
     if($checkpoint.skipped -isnot [bool] -or $checkpoint.skipped -ne $true -or $checkpoint.reason -cnotin @('not-sealed','sealed-not-submitted','locally-confirmed','locally-rejected')){throw 'SLOT_SKIP_NOT_CONFIRMED'}
    }elseif($keys -ceq 'commit,confirmed,noNewIdentityMutation,requestDigest,run,slot,version'){
     if($checkpoint.confirmed -isnot [bool] -or $checkpoint.confirmed -ne $true){throw 'SLOT_READBACK_NOT_CONFIRMED'}
    }else{throw 'SLOT_CHECKPOINT_SCHEMA_MISMATCH'}
    $checkpoint|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $directory ($Action+'-request.json')) -Encoding UTF8
    Write-Output 'ORIGINAL_SLOT_READBACK_CHECKPOINT_CONFIRMED';exit 0
   }
  }
  if(Test-Path -LiteralPath $resultFile){
   $r=Read-SafeJson $resultFile
   if($r.reconciliationOnly -ne $true -or $r.businessExecuted -ne $false -or $r.newIdentityMutations -ne $false){throw 'RECONCILIATION_RESULT_SCOPE_MISMATCH'}
   if($Action -eq 'reconcile-final'){if(!$owned){Write-Output 'READBACK_ONLY_FINISHED';exit 0}}
   else {throw 'ORIGINAL_SLOT_CHECKPOINT_MISSING'}
  }
  if($Action -ne 'reconcile-final'){
   $waiting=Join-Path $business 'awaiting-parent-proof.json'
   if(Test-Path -LiteralPath $waiting){$p=Read-SafeJson $waiting;if($p.purpose -ceq $Action -and [string]$p.run -ceq $env:GITHUB_RUN_ID){$p|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $directory ($Action+'-request.json')) -Encoding UTF8;exit 0}}
  }
  if(!$owned){throw 'READBACK_ONLY_HOLDER_STOPPED_WITHOUT_TERMINAL_RESULT'}
  Start-Sleep -Seconds 1
 }
 throw 'ORIGINAL_READBACK_WINDOW_EXPIRED'
}
$limit=if($Action -eq 'final'){[DateTime]::UtcNow.AddMinutes(130)}else{[DateTime]::UtcNow.AddMinutes(25)}
if($limit -gt $hardEnd){$limit=$hardEnd}
while([DateTime]::UtcNow -lt $limit){
 $owned=Resolve-Owned
 $statusFile=Join-Path $directory 'entry-status.json'
 $status=if(Test-Path -LiteralPath $statusFile){Get-Content -LiteralPath $statusFile -Raw | ConvertFrom-Json}else{$null}
 if($Action -eq 'final'){
  if(!$owned){if($status -and $status.state -eq 'completed' -and $status.passed -eq $true){Write-Output 'SAME_RUN_FINAL_CONFIRMED';exit 0};throw 'ENTRY_STOPPED_WITHOUT_COMPLETE_RECEIPT'}
 }else{
  if(!$owned){throw 'ENTRY_STOPPED_BEFORE_FIXED_PHASE'}
  if($Action -eq 'authorization'){if(Test-Path -LiteralPath (Join-Path $directory 'authorization-request.json')){Write-Output 'FIXED_AUTHORIZATION_REQUEST_READY';exit 0}}
  elseif($Action -eq 'reset-a' -or $Action -eq 'reset-b'){
   $file=Join-Path $business ($Action+'-capsule.json')
   if(Test-Path -LiteralPath $file){Write-Output ('FIXED_PHASE_READY_'+$Action);exit 0}
  }else{
   $file=Join-Path $business 'awaiting-parent-proof.json'
   if(Test-Path -LiteralPath $file){$proof=Get-Content -LiteralPath $file -Raw | ConvertFrom-Json;if($proof.purpose -eq $Action -and [string]$proof.run -eq $env:GITHUB_RUN_ID){Write-Output ('FIXED_PHASE_READY_'+$Action);exit 0}}
  }
 }
 Start-Sleep -Seconds 2
}
# The watchdog owns terminal cleanup. Never taskkill /T or pretend a wait timeout cleaned custody.
throw 'FIXED_PHASE_TIMEOUT_WATCHDOG_CLEANUP_NOT_CONFIRMED'
