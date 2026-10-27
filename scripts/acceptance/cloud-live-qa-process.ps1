# Job-local supervision only. No credentials, runtime tokens or remote operations.
param(
 [Parameter(Mandatory=$true)][ValidateSet('start','identity','ready','final','stop')][string]$Action,
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
function Resolve-Owned {
 if (!(Test-Path -LiteralPath $pidFile)) { return $null }
 $record=Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
 $process=Get-Process -Id ([int]$record.pid) -ErrorAction SilentlyContinue
 if (!$process) { return $null }
 if ($process.StartTime.ToUniversalTime().ToString('O') -ne $record.startedAt) { throw 'Owned holder PID was reused; refuse action' }
 if ($process.ProcessName -ne 'node') { throw 'Owned holder executable mismatch' }
 return $process
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
 @{pid=$process.Id;startedAt=$process.StartTime.ToUniversalTime().ToString('O');scope='This job holder only'} | ConvertTo-Json | Set-Content -LiteralPath $pidFile
 Write-Output 'Holder started; no credential handoff.'
 exit 0
}
if ($Action -eq 'stop') {
 $process=Resolve-Owned
 if ($process) {
  # Exact owned PID/tree, never image-name/global termination. Runner tracking is unchanged.
  & taskkill.exe /PID $process.Id /T /F | Out-Null
  Start-Sleep -Seconds 2
  if (Resolve-Owned) { throw 'Owned holder is still running' }
 }
 exit 0
}
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
