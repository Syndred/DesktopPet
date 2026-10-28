# Purpose-specific same-run watchdog, no credentials or decryption.
param([Parameter(Mandatory=$true)][string]$RequestDigest,[Parameter(Mandatory=$true)][int]$HolderPid,[Parameter(Mandatory=$true)][string]$HolderStartTicks,[Parameter(Mandatory=$true)][string]$HolderImage)
$ErrorActionPreference='Stop'
$mutex=$null;$owns=$false
function Fail {throw 'SAME_RUN_SUPERVISOR_REJECTED'}
function Now {[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}
function Owned {
 $p=Get-Process -Id $HolderPid -ErrorAction SilentlyContinue
 if(-not $p){return $null}
 if($p.StartTime.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture) -cne $HolderStartTicks -or -not [string]::Equals($p.MainModule.FileName,$HolderImage,[StringComparison]::OrdinalIgnoreCase)){Fail}
 return $p
}
try {
 if($env:GITHUB_ACTIONS -cne 'true' -or $env:GITHUB_RUN_ATTEMPT -cne '1' -or $env:GITHUB_RUN_ID -notmatch '^[1-9][0-9]*$' -or $env:GITHUB_SHA -notmatch '^[a-f0-9]{40}$' -or $RequestDigest -notmatch '^[a-f0-9]{64}$' -or $HolderStartTicks -notmatch '^[0-9]{1,19}$' -or $HolderPid -le 0 -or -not [IO.Path]::IsPathRooted($HolderImage)){Fail}
 $root=[IO.Path]::Combine([IO.Path]::GetFullPath($env:RUNNER_TEMP),('dpapi-authorized-'+$env:GITHUB_RUN_ID+'-'+$RequestDigest))
 $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 function CheckFile($p) {
  $item=Get-Item -LiteralPath $p -Force;if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){Fail}
  $acl=if($item.PSIsContainer){[IO.Directory]::GetAccessControl($p)}else{[IO.File]::GetAccessControl($p)}
  if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $sid -or -not $acl.AreAccessRulesProtected){Fail}
  $rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]));if($rules.Count -ne 2){Fail}
  foreach($rule in $rules){if($rule.IdentityReference.Value -notin @($sid,'S-1-5-18') -or $rule.AccessControlType -ne 'Allow' -or $rule.FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl){Fail}}
 }
 CheckFile $root;$leasePath=Join-Path $root 'lease.json';CheckFile $leasePath
 $lease=[IO.File]::ReadAllText($leasePath)|ConvertFrom-Json
 if($lease.run -cne $env:GITHUB_RUN_ID -or $lease.commit -cne $env:GITHUB_SHA -or $lease.requestDigest -cne $RequestDigest -or [long]$lease.expiresAt -le (Now) -or [long]$lease.issuedAt -gt (Now) -or ([long]$lease.expiresAt-[long]$lease.issuedAt) -gt 19800000){Fail}
 $created=$false;$mutex=New-Object Threading.Mutex($true,('Local\LingjingQaCustody-'+$env:GITHUB_RUN_ID+'-'+$RequestDigest),[ref]$created)
 if(-not $created){Fail};$owns=$true
 function ReadRegistryOnce {
  $rows=@();$files=@(Get-ChildItem -LiteralPath $root -File -Force|Where-Object {$_.Name -match '^(holder|supervisor|owned-(a|a2|a3|b|c))-[1-9][0-9]{0,2}\.json$'})
  if($files.Count -gt 500){Fail};foreach($f in $files){CheckFile $f.FullName;if($f.Length -gt 32768){Fail};$rows+=([IO.File]::ReadAllText($f.FullName)|ConvertFrom-Json)};return $rows
 }
 function ReadRegistry {
  $until=[Math]::Min([long]$lease.expiresAt,(Now)+3000)
  while($true){try{return @(ReadRegistryOnce)}catch{$inner=$_.Exception;while($inner.InnerException){$inner=$inner.InnerException};if($inner -isnot [IO.IOException] -or ($inner.HResult -band 0xffff) -ne 32 -or (Now) -ge $until){throw};Start-Sleep -Milliseconds 50}}
 }
 function WriteTerminal([bool]$confirmed,[bool]$ciphertextRemoved){
  $directory=Join-Path ([IO.Path]::GetFullPath((Get-Location).Path)) ('artifacts/qa/same-run-watchdog-'+$env:GITHUB_RUN_ID)
  [void][IO.Directory]::CreateDirectory($directory)
  if(((Get-Item -LiteralPath $directory -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){Fail}
  $file=Join-Path $directory ($RequestDigest+'-terminal.json')
  $receipt=@{version=1;run=$env:GITHUB_RUN_ID;commit=$env:GITHUB_SHA;requestDigest=$RequestDigest;closed=$true;cleanupConfirmed=$confirmed;registeredProfilesOnly=$true;ciphertextRemoved=$ciphertextRemoved;endedAt=[DateTimeOffset]::UtcNow.ToString('O')}
  $bytes=[Text.Encoding]::UTF8.GetBytes(($receipt|ConvertTo-Json -Compress));$stream=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
 }
 function RegisteredModelsGone($records){
  foreach($record in @($records|Where-Object {$_.kind -eq 'model'}|Group-Object role|ForEach-Object {@($_.Group|Sort-Object epoch)[-1]})){
   if(Test-Path -LiteralPath $record.profile){return $false}
   foreach($proc in @($record.runtime,$record.launcher)){$p=Get-Process -Id ([int]$proc.pid) -ErrorAction SilentlyContinue;if($p -and $p.StartTime.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture) -ceq $proc.startTicks -and [string]::Equals($p.MainModule.FileName,$proc.image,[StringComparison]::OrdinalIgnoreCase)){return $false}}
  };return $true
 }
 function StopRegisteredApps($records,[int]$maxHolderEpoch=2147483647){
  $failed=$false
  foreach($record in @($records|Where-Object {$_.kind -eq 'model' -and [int]$_.holderEpoch -le $maxHolderEpoch}|Group-Object role|ForEach-Object {@($_.Group|Sort-Object epoch)[-1]})){
   foreach($proc in @($record.runtime,$record.launcher)){
    try{$p=Get-Process -Id ([int]$proc.pid) -ErrorAction SilentlyContinue;if($p){if($p.StartTime.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture) -cne $proc.startTicks -or -not [string]::Equals($p.MainModule.FileName,$proc.image,[StringComparison]::OrdinalIgnoreCase)){Fail}; & (Join-Path $env:SystemRoot 'System32\taskkill.exe') /PID $p.Id /T /F | Out-Null;if(-not $p.WaitForExit(10000)){Fail}}}catch{$failed=$true}
   }
  }
  if($failed){Fail}
 }
 $rows=@(ReadRegistry);$holders=@($rows|Where-Object {$_.kind -eq 'holder'}|Sort-Object epoch)
 if($holders.Count -eq 0){Fail};$epoch=$holders[-1].epoch
 if($holders[-1].process.pid -ne $HolderPid -or $holders[-1].process.startTicks -cne $HolderStartTicks -or $holders[-1].process.image -cne $HolderImage){Fail}
 $initial=Owned;if(-not $initial){Fail}
 [Console]::Out.WriteLine('{"ready":true,"sameRunOnly":true}')
 $runtimeFailure=$false
 try{
 while((Now) -lt [long]$lease.expiresAt){
  if(-not (Test-Path -LiteralPath $root)){$gone=RegisteredModelsGone $rows;WriteTerminal $gone $true;if(-not $gone){Fail};[Console]::Out.WriteLine('{"closed":true,"cleanupConfirmed":true}');exit 0}
  CheckFile $root
  if(Test-Path -LiteralPath (Join-Path $root 'terminal.json')){break}
  # Stop signed-in apps on holder loss, but preserve profiles/ciphertext for
  # reconciliation until the original custody deadline. Never restart or mutate.
  $rows=@(ReadRegistry);$holders=@($rows|Where-Object {$_.kind -eq 'holder'}|Sort-Object epoch)
  if($holders[-1].epoch -gt $epoch){if(Owned){Fail};StopRegisteredApps $rows $epoch;$epoch=$holders[-1].epoch;$HolderPid=[int]$holders[-1].process.pid;$HolderStartTicks=$holders[-1].process.startTicks;$HolderImage=$holders[-1].process.image}
  if(-not (Owned)){StopRegisteredApps $rows $epoch}
  $businessPath=Join-Path $root 'business-deadline.json'
  if(Test-Path -LiteralPath $businessPath){CheckFile $businessPath;$business=[IO.File]::ReadAllText($businessPath)|ConvertFrom-Json;if([long]$business.expiresAtMs -gt [long]$lease.expiresAt -or ([long]$business.expiresAtMs-[long]$business.insertedAtMs) -gt 7200000 -or $business.scopeDigest -notmatch '^[a-f0-9]{64}$'){Fail};if((Now) -ge [long]$business.expiresAtMs){StopRegisteredApps $rows}}
  Start-Sleep -Milliseconds ([Math]::Min(1000,[Math]::Max(1,[long]$lease.expiresAt-(Now))))
 }
 }catch{$runtimeFailure=$true}
 # After ready, any observation/identity failure closes the lease and destroys
 # ciphertext independently; never exit leaving an unmonitored usable vault.
 $cleanupFailed=$runtimeFailure
 try{$rows=@(ReadRegistry)}catch{$rows=@();$cleanupFailed=$true}
 $records=@($rows|Where-Object {$_.kind -eq 'model'}|Group-Object role|ForEach-Object {@($_.Group|Sort-Object epoch)[-1]})
 $safeProfiles=@()
 foreach($record in $records){
  $stopped=$true
  foreach($proc in @($record.runtime,$record.launcher)){
   try{$p=Get-Process -Id ([int]$proc.pid) -ErrorAction SilentlyContinue;if($p){if($p.StartTime.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture) -cne $proc.startTicks -or -not [string]::Equals($p.MainModule.FileName,$proc.image,[StringComparison]::OrdinalIgnoreCase)){Fail}; & (Join-Path $env:SystemRoot 'System32\taskkill.exe') /PID $p.Id /T /F | Out-Null;if(-not $p.WaitForExit(10000)){Fail}}}catch{$stopped=$false;$cleanupFailed=$true}
  }
  if($stopped){$safeProfiles+=$record.profile}
 }
 # Watchdog may descend from holder: never /T the holder and kill ourselves.
 try{$p=Owned;if($p){$p.Kill();if(-not $p.WaitForExit(10000)){Fail}}}catch{$cleanupFailed=$true}
 $base=[IO.Path]::GetFullPath($env:RUNNER_TEMP)
 foreach($profile in @($safeProfiles|Select-Object -Unique)){
  try{
   if([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($profile)) -cne $base.TrimEnd('\') -or [IO.Path]::GetFileName($profile) -notmatch '^lingjing-live-holder-[A-Za-z0-9]+$'){Fail}
   if(Test-Path -LiteralPath $profile){CheckFile $profile;$count=0;$pending=New-Object 'System.Collections.Generic.Queue[string]';$pending.Enqueue($profile);while($pending.Count -gt 0){$current=$pending.Dequeue();$item=Get-Item -LiteralPath $current -Force;if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){Fail};$count++;if($count -gt 10000){Fail};if($item.PSIsContainer){foreach($child in @(Get-ChildItem -LiteralPath $current -Force)){$pending.Enqueue($child.FullName)}}};Remove-Item -LiteralPath $profile -Recurse -Force;if(Test-Path -LiteralPath $profile){Fail}}
  }catch{$cleanupFailed=$true}
 }
 $requestJson=@{purpose='same-run-qa-continuity-v1';directoryName=[IO.Path]::GetFileName($root);requestDigest=$RequestDigest}|ConvertTo-Json -Compress
 $helper=Join-Path $PSScriptRoot 'authorized-vault.ps1'
 $si=New-Object Diagnostics.ProcessStartInfo
 $si.FileName=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe';$cleanupAction=if($cleanupFailed){'destroy-ciphertext'}else{'cleanup'};$si.Arguments='-NoLogo -NoProfile -NonInteractive -File "'+$helper+'" -Action '+$cleanupAction;$si.UseShellExecute=$false;$si.CreateNoWindow=$true;$si.RedirectStandardInput=$true;$si.RedirectStandardOutput=$true;$si.RedirectStandardError=$true
 $c=[Diagnostics.Process]::Start($si);$c.StandardInput.Write($requestJson);$c.StandardInput.Close()
 if(-not $c.WaitForExit(15000)){$c.Kill();[void]$c.WaitForExit(5000);Fail}
 $safe=$c.StandardOutput.ReadToEnd()|ConvertFrom-Json
 if($c.ExitCode -ne 0 -or $safe.ok -ne $true){Fail}
 if($cleanupFailed){if($safe.result.ciphertextRemoved -ne $true){Fail};WriteTerminal $false $true;[Console]::Out.WriteLine('{"closed":true,"cleanupConfirmed":false,"ciphertextRemoved":true,"registryRetained":true}');exit 1}
 if(Test-Path -LiteralPath $root){Fail}
 WriteTerminal $true $true
 [Console]::Out.WriteLine('{"closed":true,"cleanupConfirmed":true}')
} catch {[Console]::Out.WriteLine('{"ready":false,"error":"SAME_RUN_SUPERVISOR_REJECTED"}');exit 1}
finally {if($owns){$mutex.ReleaseMutex()};if($null -ne $mutex){$mutex.Dispose()}}
