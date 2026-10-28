# No entry/ticket/custody. Exact original Start-Process shape, fixed timer only.
param([Parameter(Mandatory=$true)][ValidateSet('start-cross-step','observe-cross-step','same-step')][string]$Action)
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -cne 'true' -or $env:GITHUB_RUN_ATTEMPT -cne '1' -or $env:GITHUB_RUN_ID -notmatch '^\d+$' -or $env:GITHUB_SHA -notmatch '^[a-f0-9]{40}$'){throw 'TIMER_CONTRACT_ENVIRONMENT_REQUIRED'}
if($env:NODE_OPTIONS -or $env:NODE_PATH){throw 'NODE_PRELOAD_FORBIDDEN'}
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$dir=Join-Path $root ('artifacts/qa/same-run-lifetime-'+$env:GITHUB_RUN_ID)
New-Item -ItemType Directory -Path $dir -Force|Out-Null
$mode=if($Action -eq 'same-step'){'same-step'}else{'cross-step'}
$ownership=Join-Path $dir ($mode+'-ownership-private.json')
$timer=Join-Path $PSScriptRoot 'same-run-lifetime-timer.mjs'
$ticks=Join-Path $dir ($mode+'-ticks.json')
$receipt=Join-Path $dir ($mode+'-evidence.json')
$proof=@{version=1;run=$env:GITHUB_RUN_ID;commit=$env:GITHUB_SHA;mode=$mode;scope='Fixed timer lifetime observation only, no identity or custody';observed=$false;ownedProcessStopped=$false}
function Save { $proof|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $receipt -Encoding UTF8 }
function Read-Ticks {
 $x=Get-Content -LiteralPath $ticks -Raw|ConvertFrom-Json
 if($x.version -ne 1 -or [string]$x.run -cne $env:GITHUB_RUN_ID -or $x.commit -cne $env:GITHUB_SHA -or $x.mode -cne $mode -or $x.ticks -lt 0 -or $x.ticks -gt 26 -or $x.exitObserved -isnot [bool]){throw 'TIMER_TICKS_BINDING_MISMATCH'}
 return $x
}
function Resolve-Exact {
 $r=Get-Content -LiteralPath $ownership -Raw|ConvertFrom-Json
 if($r.run -cne $env:GITHUB_RUN_ID -or $r.commit -cne $env:GITHUB_SHA -or $r.mode -cne $mode -or $r.startedAtTicks -isnot [string] -or $r.startedAtTicks -notmatch '^\d+$' -or $r.pid -le 0 -or ![IO.Path]::IsPathRooted($r.image)){throw 'TIMER_OWNERSHIP_INVALID'}
 $p=Get-Process -Id $r.pid -ErrorAction SilentlyContinue;if(!$p){return $null}
 if($p.ProcessName -cne 'node' -or $p.StartTime.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture) -cne $r.startedAtTicks -or ![string]::Equals($p.MainModule.FileName,$r.image,[StringComparison]::OrdinalIgnoreCase)){throw 'TIMER_PID_REUSED_REFUSE_ACTION'}
 return $p
}
function Read-SyntheticRequest {
 $reqPath=Join-Path $dir ($mode+'-synthetic-request.json');$req=Get-Content -LiteralPath $reqPath -Raw|ConvertFrom-Json
 if(@($req.PSObject.Properties.Name).Count -ne 5 -or $req.version -ne 1 -or $req.purpose -cne 'fixed-synthetic-lifetime-only' -or [string]$req.run -cne $env:GITHUB_RUN_ID -or $req.commit -cne $env:GITHUB_SHA -or $req.mode -cne $mode){throw 'FIXED_SYNTHETIC_REQUEST_MISMATCH'}
 return $req
}
$script:launchStage='NOT_STARTED'
function Safe-Failure($errorRecord) {
 $known=@('NO_SECOND_TIMER_START','INVALID_FIXED_TIMER','TIMER_IMAGE_INVALID','TIMER_TICKS_BINDING_MISMATCH','TIMER_OWNERSHIP_INVALID','TIMER_PID_REUSED_REFUSE_ACTION','FIXED_SYNTHETIC_REQUEST_MISMATCH','TIMER_NOT_READY_FOR_SYNTHETIC_ACK','TIMER_INITIAL_TICK_NOT_OBSERVED')
 $message=[string]$errorRecord.Exception.Message
 $proof.fixedFailureCode=if($message -cin $known){$message}else{'UNCLASSIFIED_TIMER_DRIVER_ERROR'}
 $proof.failureSourceLine=[int]$errorRecord.InvocationInfo.ScriptLineNumber
 $proof.launchStage=$script:launchStage
}
function Launch {
 $script:launchStage='CHECK_UNUSED_FILES'
 if((Test-Path -LiteralPath $ownership) -or (Test-Path -LiteralPath $ticks)){throw 'NO_SECOND_TIMER_START'}
 if($timer -match '["\r\n]'){throw 'INVALID_FIXED_TIMER'}
 $script:launchStage='START_FIXED_PROCESS'
 $p=Start-Process -FilePath (Get-Command node).Source -ArgumentList ('"'+$timer+'" '+$mode) -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dir ($mode+'-stdout-private.txt')) -RedirectStandardError (Join-Path $dir ($mode+'-stderr-private.txt'))
 $script:launchStage='CAPTURE_OWNED_IDENTITY';$null=$p.Handle
 $p.Refresh();if($p.ProcessName -cne 'node'){throw 'TIMER_IMAGE_INVALID'}
 @{run=$env:GITHUB_RUN_ID;commit=$env:GITHUB_SHA;mode=$mode;pid=$p.Id;startedAtTicks=$p.StartTime.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture);image=$p.MainModule.FileName}|ConvertTo-Json|Set-Content -LiteralPath $ownership -Encoding UTF8
 $until=[DateTime]::UtcNow.AddSeconds(10)
 while([DateTime]::UtcNow -lt $until){$script:launchStage='WAIT_INITIAL_TICKS';if(Test-Path -LiteralPath $ticks){$script:launchStage='READ_INITIAL_TICKS';$t=Read-Ticks;if($t.ticks -ge 1){$script:launchStage='VERIFY_INITIAL_PID';if(Resolve-Exact){$script:launchStage='READ_INITIAL_SYNTHETIC_REQUEST';[void](Read-SyntheticRequest);if($t.phase -cne 'WAITING_SYNTHETIC_RECEIPT'){throw 'TIMER_NOT_READY_FOR_SYNTHETIC_ACK'};$script:launchStage='INITIAL_HANDSHAKE_CONFIRMED';return $p}}};Start-Sleep -Milliseconds 100}
 throw 'TIMER_INITIAL_TICK_NOT_OBSERVED'
}
if($Action -eq 'start-cross-step'){
 try{$p=Launch;$proof.startedAlive=$true;$proof.syntheticRequestReadBeforeParentExit=$true;$proof.initialTicks=(Read-Ticks).ticks;$proof.parentStepIntentionallyExits=$true;Save;Write-Output 'FIXED_CROSS_STEP_TIMER_STARTED';exit 0}catch{Safe-Failure $_;$proof.errorCode='TIMER_START_FAILED';try{$p=Resolve-Exact;if($p){$p.Kill();[void]$p.WaitForExit(5000)};$proof.ownedProcessStopped=!(Resolve-Exact)}catch{};Save;throw 'TIMER_START_FAILED'}
}
try{
 if($Action -eq 'same-step'){$p=Launch;$proof.keptOriginalProcessHandle=$true;$initial=(Read-Ticks).ticks;Start-Sleep -Seconds 5}
 else{
  $prior=Get-Content -LiteralPath $receipt -Raw|ConvertFrom-Json;if($prior.startedAlive -ne $true -or $prior.syntheticRequestReadBeforeParentExit -ne $true -or $prior.run -cne $env:GITHUB_RUN_ID -or $prior.commit -cne $env:GITHUB_SHA){throw 'CROSS_STEP_INITIAL_PROOF_REQUIRED'}
  $initial=$prior.initialTicks;Start-Sleep -Seconds 5;$p=Resolve-Exact
 }
 $t=Read-Ticks;$proof.aliveAfterFiveSeconds=[bool]$p;$proof.ticksAdvanced=$t.ticks -gt $initial;$proof.ticksAfterFiveSeconds=$t.ticks;$proof.phaseObserved=$t.phase;$proof.actualChildExitCode=$null;$proof.observed=$true
 [void](Read-SyntheticRequest);$proof.syntheticRequestVerified=$true
 if($p){
  $ack=Join-Path $dir ($mode+'-synthetic-receipt.json');if(Test-Path -LiteralPath $ack){throw 'NO_SECOND_SYNTHETIC_ACK'}
  @{version=1;purpose='fixed-synthetic-lifetime-only';run=$env:GITHUB_RUN_ID;commit=$env:GITHUB_SHA;mode=$mode;syntheticAcknowledged=$true}|ConvertTo-Json|Set-Content -LiteralPath $ack -Encoding UTF8
  $proof.syntheticAckWritten=$true;$proof.waitForExitReturned=$p.WaitForExit(30000)
  if($Action -eq 'same-step' -and $proof.waitForExitReturned){$p.Refresh();$proof.actualChildExitCode=$p.ExitCode}
 }
 $t=Read-Ticks;$proof.finalTicks=$t.ticks;$proof.nodeExitObserved=$t.exitObserved;$proof.nodeRequestedExitCode=$t.requestedExitCode;$proof.syntheticReceiptConfirmed=$t.syntheticReceiptConfirmed;$proof.finalPhase=$t.phase;$proof.stdinDestroyed=$t.stdinDestroyed;$proof.stdoutDestroyed=$t.stdoutDestroyed
} catch{Safe-Failure $_;$proof.errorCode='FIXED_TIMER_OBSERVATION_FAILED'}
finally{
 try{$p=Resolve-Exact;if($p){$proof.forcedOwnTimerStop=$true;$p.Kill();if(!$p.WaitForExit(5000)){throw 'OWN_TIMER_EXIT_UNCONFIRMED'}};$proof.ownedProcessStopped=!(Resolve-Exact)}catch{$proof.cleanupErrorCode='EXACT_TIMER_CLEANUP_UNCONFIRMED'}
 Save
}
if($proof.errorCode -or !$proof.ownedProcessStopped){throw 'FIXED_TIMER_CONTRACT_FAILED'}
if($Action -eq 'same-step' -and ($proof.forcedOwnTimerStop -eq $true -or ($null -ne $proof.actualChildExitCode -and $proof.actualChildExitCode -ne 0) -or $proof.nodeRequestedExitCode -ne 0 -or $proof.nodeExitObserved -ne $true -or $proof.finalTicks -lt 5 -or $proof.syntheticReceiptConfirmed -ne $true)){throw 'SAME_STEP_TIMER_POSITIVE_CONTROL_FAILED'}
Write-Output 'FIXED_TIMER_OBSERVATION_RECORDED'
