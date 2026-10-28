# Synthetic-only DPAPI contract. Never accepts a real credential or outputs plaintext.
param([Parameter(Mandatory=$true)][ValidateSet('init','seal','verify','claim','readback','receipt','cleanup')][string]$Action)
$ErrorActionPreference='Stop'
$plain=$null; $clear=$null; $script:stage='bootstrap'; $script:aclObservation=$null
function Reject { throw 'DPAPI_CONTRACT_REJECTED' }
function Now { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
function CheckBinding($b) {
  $keys=@('version','run','commit','project','owner','issuedAt','expiresAt')
  if(@($b.PSObject.Properties.Name).Count -ne 7){Reject}
  foreach($k in $keys){if($null -eq $b.$k){Reject}}
  if($b.version -ne 1 -or [string]$b.run -cne $env:GITHUB_RUN_ID -or [string]$b.commit -cne $env:GITHUB_SHA -or $b.project -cne 'SYNTHETIC_PROJECT' -or $b.owner -notmatch '^SYNTHETIC_OWNER_[AB]$'){Reject}
  $now=Now
  if([long]$b.issuedAt -gt $now -or [long]$b.expiresAt -le $now -or ([long]$b.expiresAt-[long]$b.issuedAt) -gt 19800000 -or [long]$b.expiresAt -le [long]$b.issuedAt){Reject}
}
function Entropy($b) {
  $stable=[ordered]@{version=1;run=[string]$b.run;commit=[string]$b.commit;project=[string]$b.project;owner=[string]$b.owner;issuedAt=[long]$b.issuedAt;expiresAt=[long]$b.expiresAt}
  $hash=[Security.Cryptography.SHA256]::Create()
  try { return $hash.ComputeHash([Text.Encoding]::UTF8.GetBytes(($stable|ConvertTo-Json -Compress))) } finally {$hash.Dispose()}
}
function CheckRoot {
  $script:stage='root-item-read'
  $item=Get-Item -LiteralPath $script:root -Force
  if(-not $item.PSIsContainer -or (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)){Reject}
  $script:stage='root-acl-read'; $acl=Get-Acl -LiteralPath $script:root
  $script:stage='root-acl-protected'
  if(-not $acl.AreAccessRulesProtected){Reject}
  CheckAcl $acl
}
function CheckAcl($acl) {
  $script:stage='acl-owner-check'
  $actualOwner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
  $script:aclObservation=@{ownerIsRunner=($actualOwner -ceq $script:sid);ownerIsSystem=($actualOwner -ceq 'S-1-5-18');protected=$acl.AreAccessRulesProtected}
  if($actualOwner -cne $script:sid){Reject}
  $rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
  $script:stage='acl-rules-count';$script:aclObservation.ruleCount=$rules.Count
  if($rules.Count -ne 2){Reject}
  $seen=@()
  $script:stage='acl-rule-rights-check'
  foreach($r in $rules){$id=$r.IdentityReference.Value;if($id -notin @($script:sid,'S-1-5-18') -or $r.AccessControlType -ne 'Allow' -or $r.FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl){Reject};$seen+=$id}
  if(@($seen|Select-Object -Unique).Count -ne 2){Reject}
}
function FilePath($name) {
  if($name -notin @('sealed.json','intent.json','receipt.json','terminal.json')){Reject}
  return [IO.Path]::Combine($script:root,$name)
}
function WriteNew($name,$value) {
  CheckRoot; $path=FilePath $name
  $bytes=[Text.Encoding]::UTF8.GetBytes(($value|ConvertTo-Json -Compress -Depth 10))
  $stream=[IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try {$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)} finally {$stream.Dispose();[Array]::Clear($bytes,0,$bytes.Length)}
  CheckAcl (Get-Acl -LiteralPath $path)
}
function ReadOwn($name) {
  CheckRoot; $path=FilePath $name; $item=Get-Item -LiteralPath $path -Force
  if($item.PSIsContainer -or (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or $item.Length -gt 32768){Reject}
  CheckAcl (Get-Acl -LiteralPath $path)
  return ([IO.File]::ReadAllText($path)|ConvertFrom-Json)
}
try {
  if($env:GITHUB_ACTIONS -cne 'true' -or -not $env:RUNNER_TEMP -or -not $env:GITHUB_RUN_ID -or $env:GITHUB_SHA -notmatch '^[a-f0-9]{40}$'){Reject}
  $script:stage='load-system-security';Add-Type -AssemblyName System.Security
  $script:stage='read-synthetic-stdin';$inputText=[Console]::In.ReadToEnd()
  if($inputText.Length -gt 32768){Reject}
  $x=$inputText|ConvertFrom-Json; $inputText=$null
  if($x.syntheticOnly -ne $true -or $x.directoryName -notmatch '^dpapi-synthetic-[a-f0-9-]{36}$'){Reject}
  $script:stage='canonical-temp-root';$base=[IO.Path]::GetFullPath($env:RUNNER_TEMP)
  if(((Get-Item -LiteralPath $base -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){Reject}
  $script:root=[IO.Path]::GetFullPath([IO.Path]::Combine($base,$x.directoryName))
  if([IO.Path]::GetDirectoryName($script:root) -cne $base.TrimEnd('\')){Reject}
  $script:sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  if($script:sid -eq 'S-1-5-18'){Reject}
  if($Action -eq 'init') {
    if(Test-Path -LiteralPath $root){Reject}
    $script:stage='init-create-directory';[void][IO.Directory]::CreateDirectory($root)
    $script:stage='init-directory-security';$acl=New-Object Security.AccessControl.DirectorySecurity
    $script:stage='init-set-owner';$acl.SetOwner((New-Object Security.Principal.SecurityIdentifier($sid)))
    $script:stage='init-protect-dacl';$acl.SetAccessRuleProtection($true,$false)
    $script:stage='init-create-rules'
    foreach($id in @($sid,'S-1-5-18')){$r=New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($id)),[Security.AccessControl.FileSystemRights]::FullControl,([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit),[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow);$acl.AddAccessRule($r)}
    $script:stage='init-apply-acl';Set-Acl -LiteralPath $root -AclObject $acl;CheckRoot
    $result=@{initialized=$true;aclExact=$true}
  } elseif($Action -eq 'cleanup') {
    CheckRoot
    if(-not(Test-Path -LiteralPath (FilePath 'terminal.json'))){WriteNew 'terminal.json' @{state='closed';at=(Now)}}
    foreach($item in @(Get-ChildItem -LiteralPath $root -Force)){if($item.Name -notin @('sealed.json','intent.json','receipt.json','terminal.json') -or $item.PSIsContainer -or (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)){Reject};CheckAcl (Get-Acl -LiteralPath $item.FullName)}
    Remove-Item -LiteralPath $root -Recurse -Force
    if(Test-Path -LiteralPath $root){Reject}
    $result=@{removed=$true;forensicErasureClaim=$false}
  } else {
    CheckRoot;if(Test-Path -LiteralPath (FilePath 'terminal.json')){Reject}
    if(Test-Path -LiteralPath (FilePath 'sealed.json')){
      $existing=ReadOwn 'sealed.json'
      if([long]$existing.binding.expiresAt -le (Now)){
        WriteNew 'terminal.json' @{state='expired';at=(Now)}
        Remove-Item -LiteralPath (FilePath 'sealed.json') -Force
        Reject
      }
    }
    CheckBinding $x.binding
    if($Action -eq 'seal') {
      if($x.syntheticSecret -cne 'SYNTHETIC_ONLY_NOT_A_REAL_PASSWORD'){Reject}
      $plain=[Text.Encoding]::UTF8.GetBytes($x.syntheticSecret)
      $cipher=[Security.Cryptography.ProtectedData]::Protect($plain,(Entropy $x.binding),[Security.Cryptography.DataProtectionScope]::CurrentUser)
      CheckBinding $x.binding;WriteNew 'sealed.json' @{version=1;binding=$x.binding;ciphertext=[Convert]::ToBase64String($cipher)}
      $result=@{sealed=$true;scope='CurrentUser';plaintextOutput=$false}
    } elseif($Action -eq 'verify') {
      $stored=ReadOwn 'sealed.json'
      $clear=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($stored.ciphertext),(Entropy $x.binding),[Security.Cryptography.DataProtectionScope]::CurrentUser)
      CheckBinding $x.binding
      if([Text.Encoding]::UTF8.GetString($clear) -cne 'SYNTHETIC_ONLY_NOT_A_REAL_PASSWORD'){Reject}
      $result=@{restoredSameVm=$true;plaintextOutput=$false}
    } elseif($Action -eq 'claim') {
      $sealed=ReadOwn 'sealed.json';if([Convert]::ToBase64String((Entropy $sealed.binding)) -cne [Convert]::ToBase64String((Entropy $x.binding))){Reject}
      if($x.intent -cne 'SYNTHETIC_FIXED_INTENT'){Reject}
      WriteNew 'intent.json' @{state='consumed-before-action';intent=$x.intent;binding=$x.binding;at=(Now)}
      $result=@{claimed=$true;unknownMustReadback=$true}
    } elseif($Action -eq 'readback') {
      $claim=ReadOwn 'intent.json'
      if($claim.intent -cne 'SYNTHETIC_FIXED_INTENT' -or [Convert]::ToBase64String((Entropy $claim.binding)) -cne [Convert]::ToBase64String((Entropy $x.binding))){Reject}
      $hasReceipt=Test-Path -LiteralPath (FilePath 'receipt.json')
      if($hasReceipt){$receipt=ReadOwn 'receipt.json';if($receipt.state -cne 'confirmed-after-readback' -or $receipt.intent -cne $claim.intent){Reject}}
      $result=@{claimed=$true;requiresAuthoritativeReadback=(-not $hasReceipt);mayBlindRetry=$false}
    } elseif($Action -eq 'receipt') {
      $claim=ReadOwn 'intent.json'
      if($x.outcome -cne 'SYNTHETIC_CONFIRMED_BY_READBACK' -or [Convert]::ToBase64String((Entropy $claim.binding)) -cne [Convert]::ToBase64String((Entropy $x.binding))){Reject}
      WriteNew 'receipt.json' @{state='confirmed-after-readback';intent=$claim.intent;at=(Now)}
      $result=@{recorded=$true;mayBlindRetry=$false}
    } else {Reject}
  }
  [Console]::Out.WriteLine((@{ok=$true;result=$result}|ConvertTo-Json -Compress -Depth 5))
} catch {
  $type=$_.Exception.GetType().FullName
  if($type -notin @('System.Management.Automation.RuntimeException','System.Management.Automation.MethodInvocationException','System.Management.Automation.ParameterBindingException','System.UnauthorizedAccessException','System.Security.Cryptography.CryptographicException','System.IO.IOException')){$type='OTHER'}
  [Console]::Out.WriteLine((@{ok=$false;error='DPAPI_CONTRACT_REJECTED';stage=$script:stage;exceptionType=$type;acl=$script:aclObservation}|ConvertTo-Json -Compress -Depth 4));exit 1
} finally {
  if($null -ne $plain){[Array]::Clear($plain,0,$plain.Length)}
  if($null -ne $clear){[Array]::Clear($clear,0,$clear.Length)}
  $x=$null
}
