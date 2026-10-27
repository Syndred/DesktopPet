# Job-local supervision only. No credentials, runtime tokens or remote operations.
param(
 [Parameter(Mandatory=$true)][ValidateSet('selftest','start','identity','ready','final','stop')][string]$Action,
 [Parameter(Mandatory=$true)][string]$Output,
 [string]$Executable,
 [string]$Source,
 [string]$Scenario,
 [string]$PublicConfig='config/lingjing-cloud-public.json',
 [string]$Project='jbvrdmrkwpznbrvteive'
)
$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Authorized Actions job required' }
$directory=[System.IO.Path]::GetFullPath($Output)
$pidFile=Join-Path $directory 'holder-process.json'
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
function Stop-Owned {
 $owned=Resolve-Owned
 if ($owned) {
  # Exact owned PID/tree, never image-name/global termination. Runner tracking is unchanged.
  & taskkill.exe /PID $owned.Id /T /F | Out-Null
  Start-Sleep -Seconds 2
  if (Resolve-Owned) { throw 'Owned holder is still running' }
 }
}
if ($Action -eq 'selftest') {
 # This mode MUST precede registration. It never loads the holder, remote SDK,
 # project config or any credentials. Only a fresh, bounded timer process runs.
 if (Test-Path -LiteralPath $pidFile) { throw 'Selftest refuses an existing holder record' }
 New-Item -ItemType Directory -Path $directory -Force | Out-Null
 $reportFile=Join-Path $directory 'supervisor-selftest.json'
 if (Test-Path -LiteralPath $reportFile) { throw 'Selftest requires fresh output' }
 $directory=Join-Path $directory ('supervisor-selftest-'+[Guid]::NewGuid().ToString('N'))
 New-Item -ItemType Directory -Path $directory | Out-Null
 $pidFile=Join-Path $directory 'holder-process.json'
 $scriptFile=Join-Path $directory 'owned-timer.cjs'
 # Even an interrupted supervisor cannot leave this child running indefinitely.
 'setTimeout(() => process.exit(0), 60000);' | Set-Content -LiteralPath $scriptFile -Encoding UTF8
 if ($scriptFile -match '["\r\n]') { throw 'Invalid selftest script path' }
 $result=@{scope='Offline owned-node supervisor identity selftest; no account, SDK or network';passed=$false;checks=@();ownedProcessStopped=$false}
 $canonicalRecord=$null
 try {
  # Do not inherit NODE_OPTIONS/preloads or credential environment into selftest.
  $start=[System.Diagnostics.ProcessStartInfo]::new()
  $start.FileName=(Get-Command node).Source
  $start.Arguments='"'+$scriptFile+'"'
  $start.WorkingDirectory=$directory
  $start.UseShellExecute=$false
  $start.CreateNoWindow=$true
  $start.EnvironmentVariables.Clear()
  foreach($name in @('PATH','PATHEXT','SYSTEMROOT','SYSTEMDRIVE','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','RUNNER_TRACKING_ID')) {
   $value=[Environment]::GetEnvironmentVariable($name)
   if ($null -ne $value) { $start.EnvironmentVariables[$name]=$value }
  }
  $process=[System.Diagnostics.Process]::Start($start)
  $canonicalRecord=Write-Owned $process
  for ($i=0;$i -lt 3;$i++) {
   $same=Resolve-Owned
   if (!$same -or $same.Id -ne $process.Id) { throw 'Same owned node failed identity readback' }
   Start-Sleep -Milliseconds 100
  }
  $result.checks+=@{name='repeated-json-start-ticks-roundtrip';passed=$true}
  $bad=$canonicalRecord.Clone();$bad.startedAtTicks=([long]$canonicalRecord.startedAtTicks+1).ToString([Globalization.CultureInfo]::InvariantCulture)
  $bad | ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding UTF8
  $rejected=$false
  try { Resolve-Owned | Out-Null } catch { if ($_.Exception.Message -eq 'Owned holder PID was reused; refuse action') { $rejected=$true } else { throw } }
  if (!$rejected) { throw 'Changed start ticks were accepted' }
  $result.checks+=@{name='changed-start-ticks-rejected';passed=$true}
  $bad=$canonicalRecord.Clone();$bad.startedAtTicks=[long]$canonicalRecord.startedAtTicks
  $bad | ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding UTF8
  $rejected=$false
  try { Resolve-Owned | Out-Null } catch { if ($_.Exception.Message -eq 'Invalid owned holder start ticks') { $rejected=$true } else { throw } }
  if (!$rejected) { throw 'Numeric JSON ticks were accepted' }
  $result.checks+=@{name='numeric-json-ticks-rejected';passed=$true}
  $bad=$canonicalRecord.Clone();$bad.executablePath=Join-Path $directory 'not-the-owned-node.exe'
  $bad | ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding UTF8
  $rejected=$false
  try { Resolve-Owned | Out-Null } catch { if ($_.Exception.Message -eq 'Owned holder executable mismatch') { $rejected=$true } else { throw } }
  if (!$rejected) { throw 'Different image path was accepted' }
  $result.checks+=@{name='different-image-path-rejected';passed=$true}
  $result.passed=$true
 } finally {
  try {
   if (!$canonicalRecord) { throw 'Owned selftest identity not established; bounded child will self-exit' }
   # Restore only our in-memory original record, never an unknown process record.
   $canonicalRecord | ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding UTF8
   Stop-Owned
   $result.ownedProcessStopped=$true
   $result.checks+=@{name='restored-record-exact-pid-stop';passed=$true}
  } catch { $result.passed=$false;$result.cleanupError='Exact selftest process exit not established';throw }
  finally {
   $result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportFile -Encoding UTF8
   if ($result.ownedProcessStopped) { Remove-Item -LiteralPath $directory -Recurse -Force }
  }
 }
 if (!$result.passed) { throw 'Supervisor selftest failed' }
 Write-Output 'Offline supervisor identity selftest passed; no registration performed.'
 exit 0
}
if ($Action -eq 'start') {
 if (Test-Path -LiteralPath $pidFile) { throw 'Refuse duplicate holder launch' }
 New-Item -ItemType Directory -Path $directory -Force | Out-Null
 if (!$Executable -or $Source -notmatch '^[a-f0-9]{40}$' -or $Scenario -notmatch '^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,179}$') { throw 'Missing fixed public launch parameters' }
 $args=@('scripts/acceptance/cloud-live-qa-holder.mjs','--authorized-two-live-accounts',"--output=$directory","--executable=$Executable","--source=$Source","--scenario=$Scenario","--public-config=$PublicConfig","--project=$Project")
 # Windows quoting only; forbid embedded quote/newline so no ambiguous argument.
 foreach($arg in $args) { if ($arg -match '["\r\n]') { throw 'Invalid public argument' } }
 $arguments=($args | ForEach-Object { '"'+$_+'"' }) -join ' '
 $process=Start-Process -FilePath (Get-Command node).Source -ArgumentList $arguments -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -PassThru
 Write-Owned $process | Out-Null
 Write-Output 'Holder started; no credential handoff.'
 exit 0
}
if ($Action -eq 'stop') { Stop-Owned; exit 0 }
$file=Join-Path $directory ($Action+'.json')
$seconds=if($Action -eq 'identity'){240}else{5550}
$deadline=[DateTime]::UtcNow.AddSeconds($seconds)
while (!(Test-Path -LiteralPath $file)) {
 if (Test-Path -LiteralPath (Join-Path $directory 'final.json')) { throw 'Holder ended before requested milestone; inspect fixed-field final receipt' }
 if (!(Resolve-Owned)) { throw 'Holder exited without requested milestone; outcome incomplete' }
 if ([DateTime]::UtcNow -ge $deadline) { throw 'Holder supervision deadline exceeded' }
 Start-Sleep -Seconds 3
}
$receipt=Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
if ($Action -eq 'final' -and $receipt.passed -ne $true) { throw 'Controlled acceptance failed; inspect fixed-field receipt' }
Write-Output "Holder milestone ready: $Action"
