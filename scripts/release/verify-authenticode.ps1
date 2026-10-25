param([Parameter(Mandatory = $true)][string]$Path)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
# A PowerShell 7 parent can pass module paths incompatible with Windows PowerShell 5.
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
$signatureFile = (Resolve-Path -LiteralPath $Path).Path
$signature = Get-AuthenticodeSignature -LiteralPath $signatureFile
$certificate = $signature.SignerCertificate
@{
  kind = 'Authenticode'
  status = [string]$signature.Status
  signed = ($signature.Status -eq 'Valid')
  subject = if ($certificate) { $certificate.Subject } else { $null }
  thumbprint = if ($certificate) { $certificate.Thumbprint } else { $null }
  validUntil = if ($certificate) { $certificate.NotAfter.ToUniversalTime().ToString('o') } else { $null }
} | ConvertTo-Json -Compress
