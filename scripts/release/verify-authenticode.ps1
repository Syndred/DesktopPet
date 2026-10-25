param([Parameter(Mandatory = $true)][string]$Path)
$ErrorActionPreference = 'Stop'
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
