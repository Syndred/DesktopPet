# Purpose-specific same-run vault. Invoked ONLY via reviewed authorized-vault-client private pipes.
# No console/CLI plaintext consumer; restore payload is captured internally by the owned Node holder.
param([Parameter(Mandatory=$true)][ValidateSet('init','seal','restore','claim','readback','receipt','cleanup','bind-holder','bind-supervisor','register-owned','registry','business-deadline','request-stop','inspect-intent','destroy-ciphertext')][string]$Action)
$ErrorActionPreference='Stop'
$plain=$null; $clear=$null; $script:stage='bootstrap'; $script:aclObservation=$null
function Reject { throw 'AUTHORIZED_VAULT_REJECTED' }
function Now { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
function CheckBinding($b) {
  $keys=@('version','run','commit','project','owner','authUid','accountKey','slot','credentialVersion','requestDigest','issuedAt','expiresAt')
  if(@($b.PSObject.Properties.Name).Count -ne 12){Reject}
  foreach($k in $keys){if($null -eq $b.$k){Reject}}
  if($b.version -ne 1 -or [string]$b.run -cne $env:GITHUB_RUN_ID -or [string]$b.commit -cne $env:GITHUB_SHA -or $b.project -cne 'jbvrdmrkwpznbrvteive' -or $b.requestDigest -notmatch '^[a-f0-9]{64}$' -or $b.credentialVersion -notmatch '^[a-f0-9]{64}$'){Reject}
  if($b.slot -eq 'A'){if($b.accountKey -cne 'qa20261027a8be246d1' -or $b.owner -cne 'account:354d8831-51fc-417b-bc69-19a18b74387b' -or $b.authUid -cne '65dd4c6b-7bfb-435f-840e-d2457c42e692'){Reject}}
  elseif($b.slot -eq 'B'){if($b.accountKey -cne 'qa20261027b8be246d1' -or $b.owner -cne 'account:bbf15c56-2c37-4738-9a49-2c0cb7b971ab' -or $b.authUid -cne '751587c1-bb93-4f6d-bf8a-b845e9e4cf62'){Reject}}
  elseif($b.slot -eq 'C'){if($b.accountKey -cne 'qa20261028c8be246d1' -or (($b.owner -cne 'PRE_REGISTRATION' -or $b.authUid -cne 'PRE_REGISTRATION') -and ($b.owner -notmatch '^account:[a-f0-9-]{36}$' -or $b.authUid -notmatch '^[a-f0-9-]{36}$'))){Reject}}
  else {Reject}
  $now=Now
  if([long]$b.issuedAt -gt $now -or [long]$b.expiresAt -le $now -or ([long]$b.expiresAt-[long]$b.issuedAt) -gt 19800000 -or [long]$b.expiresAt -le [long]$b.issuedAt){Reject}
}
function Entropy($b) {
  $stable=[ordered]@{version=1;run=[string]$b.run;commit=[string]$b.commit;project=[string]$b.project;owner=[string]$b.owner;authUid=[string]$b.authUid;accountKey=[string]$b.accountKey;slot=[string]$b.slot;credentialVersion=[string]$b.credentialVersion;requestDigest=[string]$b.requestDigest;issuedAt=[long]$b.issuedAt;expiresAt=[long]$b.expiresAt}
  $hash=[Security.Cryptography.SHA256]::Create()
  try { return $hash.ComputeHash([Text.Encoding]::UTF8.GetBytes(($stable|ConvertTo-Json -Compress))) } finally {$hash.Dispose()}
}
function CheckRoot {
  $script:stage='root-item-read'
  $item=Get-Item -LiteralPath $script:root -Force
  if(-not $item.PSIsContainer -or (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)){Reject}
  $script:stage='root-acl-read'; $acl=[IO.Directory]::GetAccessControl($script:root)
  $script:stage='root-acl-protected'
  if(-not $acl.AreAccessRulesProtected){Reject}
  CheckAcl $acl
}
function CheckAcl($acl) {
  $script:stage='acl-owner-check'
  if(-not $acl.AreAccessRulesProtected){Reject}
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
  if($name -notin @('terminal.json','lease.json','business-deadline.json') -and $name -notmatch '^(sealed|intent|receipt)-[a-f0-9]{64}\.json$' -and $name -notmatch '^(holder|supervisor|owned-(a|a2|a3|b|c))-[1-9][0-9]{0,2}\.json$'){Reject}
  return [IO.Path]::Combine($script:root,$name)
}
function WriteNew($name,$value) {
  CheckRoot; $path=FilePath $name
  $bytes=[Text.Encoding]::UTF8.GetBytes(($value|ConvertTo-Json -Compress -Depth 10))
  # Set owner AND protected DACL at CreateNew, not after an inherited-token-owner file exists.
  $script:stage='file-explicit-security-create'
  $security=New-Object Security.AccessControl.FileSecurity
  $security.SetOwner((New-Object Security.Principal.SecurityIdentifier($script:sid)))
  $security.SetAccessRuleProtection($true,$false)
  foreach($id in @($script:sid,'S-1-5-18')){$rule=New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($id)),[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.AccessControlType]::Allow);$security.AddAccessRule($rule)}
  $stream=[IO.FileStream]::new($path,[IO.FileMode]::CreateNew,[Security.AccessControl.FileSystemRights]::FullControl,[IO.FileShare]::None,4096,[IO.FileOptions]::None,$security)
  try {$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)} finally {$stream.Dispose();[Array]::Clear($bytes,0,$bytes.Length)}
  CheckAcl ([IO.File]::GetAccessControl($path))
}
function ReadOwn($name) {
  CheckRoot; $path=FilePath $name; $item=Get-Item -LiteralPath $path -Force
  if($item.PSIsContainer -or (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or $item.Length -gt 32768){Reject}
  CheckAcl ([IO.File]::GetAccessControl($path))
  return ([IO.File]::ReadAllText($path)|ConvertFrom-Json)
}
try {
  if($env:GITHUB_ACTIONS -cne 'true' -or -not $env:RUNNER_TEMP -or -not $env:GITHUB_RUN_ID -or $env:GITHUB_SHA -notmatch '^[a-f0-9]{40}$'){Reject}
  $script:stage='load-system-security';Add-Type -AssemblyName System.Security
  $script:stage='acl-framework-api-contract'
  if($null -eq [IO.Directory].GetMethod('SetAccessControl',[type[]]@([string],[Security.AccessControl.DirectorySecurity])) -or $null -eq [IO.Directory].GetMethod('GetAccessControl',[type[]]@([string])) -or $null -eq [IO.File].GetMethod('GetAccessControl',[type[]]@([string]))){Reject}
  if($null -eq [IO.FileStream].GetConstructor([type[]]@([string],[IO.FileMode],[Security.AccessControl.FileSystemRights],[IO.FileShare],[int],[IO.FileOptions],[Security.AccessControl.FileSecurity]))){Reject}
  $script:stage='read-synthetic-stdin';$inputText=[Console]::In.ReadToEnd()
  if($inputText.Length -gt 32768){Reject}
  $x=$inputText|ConvertFrom-Json; $inputText=$null
  if($x.purpose -cne 'same-run-qa-continuity-v1' -or $x.directoryName -cne ('dpapi-authorized-'+$env:GITHUB_RUN_ID+'-'+$x.requestDigest) -or $x.requestDigest -notmatch '^[a-f0-9]{64}$'){Reject}
  $script:sealedName='sealed-'+$x.binding.credentialVersion+'.json'
  if($x.intentDigest -and $x.intentDigest -notmatch '^[a-f0-9]{64}$'){Reject}
  $script:intentName='intent-'+$x.intentDigest+'.json';$script:receiptName='receipt-'+$x.intentDigest+'.json'
  if($Action -notin @('init','cleanup','destroy-ciphertext','bind-holder','bind-supervisor','register-owned','registry','business-deadline','request-stop') -and $x.binding.requestDigest -cne $x.requestDigest){Reject}
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
    $script:stage='init-apply-acl';[IO.Directory]::SetAccessControl($root,$acl);CheckRoot
    if($x.lease.run -cne $env:GITHUB_RUN_ID -or $x.lease.commit -cne $env:GITHUB_SHA -or $x.lease.requestDigest -cne $x.requestDigest -or [long]$x.lease.issuedAt -gt (Now) -or [long]$x.lease.expiresAt -le (Now) -or ([long]$x.lease.expiresAt-[long]$x.lease.issuedAt) -gt 19800000){Reject}
    WriteNew 'lease.json' $x.lease
    $result=@{initialized=$true;aclExact=$true}
  } elseif($Action -eq 'request-stop') {
    CheckRoot;$lease=ReadOwn 'lease.json';if($lease.requestDigest -cne $x.requestDigest -or $lease.run -cne $env:GITHUB_RUN_ID -or $lease.commit -cne $env:GITHUB_SHA){Reject}
    if(-not(Test-Path -LiteralPath (FilePath 'terminal.json'))){WriteNew 'terminal.json' @{state='closed';at=(Now)}}else{$terminal=ReadOwn 'terminal.json';if($terminal.state -cne 'closed'){Reject}}
    $result=@{stopRequested=$true;cleanupConfirmed=$false}
  } elseif($Action -in @('cleanup','destroy-ciphertext')) {
    CheckRoot
    if(-not(Test-Path -LiteralPath (FilePath 'terminal.json'))){WriteNew 'terminal.json' @{state='closed';at=(Now)}}
    foreach($item in @(Get-ChildItem -LiteralPath $root -Force)){if(($item.Name -notin @('terminal.json','lease.json','business-deadline.json') -and $item.Name -notmatch '^(sealed|intent|receipt)-[a-f0-9]{64}\.json$' -and $item.Name -notmatch '^(holder|supervisor|owned-(a|a2|a3|b|c))-[1-9][0-9]{0,2}\.json$') -or $item.PSIsContainer -or (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)){Reject};CheckAcl ([IO.File]::GetAccessControl($item.FullName))}
    if($Action -eq 'destroy-ciphertext'){foreach($f in @(Get-ChildItem -LiteralPath $root -File -Force|Where-Object {$_.Name -match '^sealed-[a-f0-9]{64}\.json$'})){Remove-Item -LiteralPath $f.FullName -Force};if(@(Get-ChildItem -LiteralPath $root -File -Force|Where-Object {$_.Name -match '^sealed-[a-f0-9]{64}\.json$'}).Count -ne 0){Reject};$result=@{ciphertextRemoved=$true;registryRetained=$true;forensicErasureClaim=$false}}
    else{Remove-Item -LiteralPath $root -Recurse -Force;if(Test-Path -LiteralPath $root){Reject};$result=@{removed=$true;forensicErasureClaim=$false}}
  } elseif($Action -in @('bind-holder','bind-supervisor','register-owned','registry','business-deadline')) {
    CheckRoot;if(Test-Path -LiteralPath (FilePath 'terminal.json')){Reject}
    $lease=ReadOwn 'lease.json';if($lease.requestDigest -cne $x.requestDigest -or [long]$lease.expiresAt -le (Now)){Reject}
    if($Action -eq 'business-deadline'){
      if(@($x.deadline.PSObject.Properties.Name).Count -ne 3 -or $x.deadline.scopeDigest -notmatch '^[a-f0-9]{64}$' -or [long]$x.deadline.insertedAtMs -gt (Now) -or [long]$x.deadline.expiresAtMs -le (Now) -or [long]$x.deadline.expiresAtMs -gt [long]$lease.expiresAt -or ([long]$x.deadline.expiresAtMs-[long]$x.deadline.insertedAtMs) -gt 7200000){Reject}
      WriteNew 'business-deadline.json' $x.deadline;$result=@{registered=$true;expiresAtMs=[long]$x.deadline.expiresAtMs}
    } else {
    if($Action -eq 'register-owned' -and (Test-Path -LiteralPath (FilePath 'business-deadline.json'))){$deadline=ReadOwn 'business-deadline.json';if([long]$deadline.expiresAtMs -le (Now)){Reject}}
    function CheckProcess($r,[bool]$mustLive) {
      if($r.pid -isnot [int] -and $r.pid -isnot [long]){Reject}
      if($r.pid -le 0 -or $r.startTicks -isnot [string] -or $r.startTicks -notmatch '^[0-9]{1,19}$' -or -not [IO.Path]::IsPathRooted($r.image)){Reject}
      $p=Get-Process -Id ([int]$r.pid) -ErrorAction SilentlyContinue
      if(-not $p){if($mustLive){Reject};return $false}
      if($p.StartTime.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture) -cne $r.startTicks -or -not [string]::Equals($p.MainModule.FileName,$r.image,[StringComparison]::OrdinalIgnoreCase)){Reject}
      return $true
    }
    $all=@(Get-ChildItem -LiteralPath $root -File -Force|Where-Object {$_.Name -match '^(holder|supervisor|owned-(a|a2|a3|b|c))-[1-9][0-9]{0,2}\.json$'})
    if($all.Count -gt 500){Reject}
    if($Action -eq 'registry'){$records=@();foreach($f in $all){$records+=ReadOwn $f.Name};$result=@{records=$records;closed=$false}}
    else {
      $prefix=if($Action -eq 'bind-holder'){'holder'}elseif($Action -eq 'bind-supervisor'){'supervisor'}else{if($x.record.role -notin @('a','a2','a3','b','c')){Reject};'owned-'+$x.record.role}
      $prior=@($all|Where-Object {$_.Name -match ('^'+[regex]::Escape($prefix)+'-') }|Sort-Object {[int]($_.BaseName.Split('-')[-1])})
      $epoch=1
      if($Action -eq 'bind-supervisor' -and $prior.Count -gt 0){Reject}
      if($prior.Count -gt 0){$old=ReadOwn $prior[-1].Name;$epoch=[int]$old.epoch+1;if($Action -eq 'bind-holder'){if(CheckProcess $old.process $false){Reject}}else{if((CheckProcess $old.launcher $false) -or (CheckProcess $old.runtime $false)){Reject};if($old.profile -cne $x.record.profile){Reject}}}
      if($epoch -gt 100){Reject}
      if($Action -in @('bind-holder','bind-supervisor')){[void](CheckProcess $x.record $true);$kind=if($Action -eq 'bind-holder'){'holder'}else{'supervisor'};$record=@{epoch=$epoch;kind=$kind;process=$x.record}}
      else {
        [void](CheckProcess $x.record.launcher $true);[void](CheckProcess $x.record.runtime $true)
        $profile=[IO.Path]::GetFullPath($x.record.profile)
        if([IO.Path]::GetDirectoryName($profile) -cne $base.TrimEnd('\') -or [IO.Path]::GetFileName($profile) -notmatch '^lingjing-live-holder-[A-Za-z0-9]+$'){Reject}
        $items=@();$pending=New-Object 'System.Collections.Generic.Queue[string]';$pending.Enqueue($profile)
        while($pending.Count -gt 0){$current=$pending.Dequeue();$item=Get-Item -LiteralPath $current -Force;if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){Reject};$items+=$item;if($items.Count -gt 10000){Reject};if($item.PSIsContainer){foreach($child in @(Get-ChildItem -LiteralPath $current -Force)){$pending.Enqueue($child.FullName)}}}
        # Only this allocated fresh profile tree, before credentials are admitted.
        foreach($item in $items){
          if($item.PSIsContainer){$sec=New-Object Security.AccessControl.DirectorySecurity;$sec.SetOwner((New-Object Security.Principal.SecurityIdentifier($sid)));$sec.SetAccessRuleProtection($true,$false);foreach($id in @($sid,'S-1-5-18')){$rule=New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($id)),[Security.AccessControl.FileSystemRights]::FullControl,([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit),[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow);$sec.AddAccessRule($rule)};[IO.Directory]::SetAccessControl($item.FullName,$sec)}
          else{$sec=New-Object Security.AccessControl.FileSecurity;$sec.SetOwner((New-Object Security.Principal.SecurityIdentifier($sid)));$sec.SetAccessRuleProtection($true,$false);foreach($id in @($sid,'S-1-5-18')){$rule=New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($id)),[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.AccessControlType]::Allow);$sec.AddAccessRule($rule)};[IO.File]::SetAccessControl($item.FullName,$sec)}
        }
        $registeredHolders=@($all|Where-Object {$_.Name -match '^holder-'}|ForEach-Object {ReadOwn $_.Name}|Sort-Object epoch);if($registeredHolders.Count -eq 0){Reject};$registeredHolder=$registeredHolders[-1];[void](CheckProcess $registeredHolder.process $true);$record=@{epoch=$epoch;holderEpoch=[int]$registeredHolder.epoch;kind='model';role=$x.record.role;profile=$profile;launcher=$x.record.launcher;runtime=$x.record.runtime}
      }
      WriteNew ($prefix+'-'+$epoch+'.json') $record;$result=@{registered=$true;epoch=$epoch}
    }
    }
  } else {
    CheckRoot;if(Test-Path -LiteralPath (FilePath 'terminal.json')){Reject}
    if(Test-Path -LiteralPath (FilePath $script:sealedName)){
      $existing=ReadOwn $script:sealedName
      if([long]$existing.binding.expiresAt -le (Now)){
        WriteNew 'terminal.json' @{state='expired';at=(Now)}
        Remove-Item -LiteralPath (FilePath $script:sealedName) -Force
        Reject
      }
    }
    CheckBinding $x.binding
    $lease=ReadOwn 'lease.json';if($lease.requestDigest -cne $x.requestDigest -or [long]$lease.expiresAt -ne [long]$x.binding.expiresAt -or [long]$lease.issuedAt -ne [long]$x.binding.issuedAt){Reject}
    if($Action -eq 'inspect-intent') {
      if($x.intentDigest -notmatch '^[a-f0-9]{64}$' -or $x.operation -notin @('reset','register')){Reject}
      $hasSeal=Test-Path -LiteralPath (FilePath $script:sealedName);$hasClaim=Test-Path -LiteralPath (FilePath $script:intentName);$hasReceipt=Test-Path -LiteralPath (FilePath $script:receiptName)
      if($hasSeal){$sealed=ReadOwn $script:sealedName;if([Convert]::ToBase64String((Entropy $sealed.binding)) -cne [Convert]::ToBase64String((Entropy $x.binding))){Reject}}
      if($hasReceipt -and -not $hasClaim){Reject};if($hasClaim -and -not $hasSeal){Reject}
      if(-not $hasClaim){$state=if($hasSeal){'sealed-not-submitted'}else{'not-sealed'};$result=@{state=$state;claimed=$false;requiresAuthoritativeReadback=$false;mayBlindRetry=$false}}
      else{$claim=ReadOwn $script:intentName;if($claim.intent -cne $x.intentDigest -or $claim.operation -cne $x.operation -or [Convert]::ToBase64String((Entropy $claim.binding)) -cne [Convert]::ToBase64String((Entropy $x.binding))){Reject};$state='claimed-unknown';if($hasReceipt){$receipt=ReadOwn $script:receiptName;if($receipt.state -cne 'confirmed-after-readback' -or $receipt.intent -cne $claim.intent -or $receipt.outcome -notin @('confirmed','rejected')){Reject};$state='locally-'+$receipt.outcome};$result=@{state=$state;claimed=$true;requiresAuthoritativeReadback=(-not $hasReceipt);mayBlindRetry=$false}}
    } elseif($Action -eq 'seal') {
      if($x.secret -isnot [string] -or $x.secret.Length -lt 40 -or $x.secret.Length -gt 64 -or $x.secret -match '[\x00-\x1f]'){Reject}
      $plain=[Text.Encoding]::UTF8.GetBytes($x.secret)
      $cipher=[Security.Cryptography.ProtectedData]::Protect($plain,(Entropy $x.binding),[Security.Cryptography.DataProtectionScope]::CurrentUser)
      CheckBinding $x.binding;WriteNew $script:sealedName @{version=1;binding=$x.binding;ciphertext=[Convert]::ToBase64String($cipher)}
      $result=@{sealed=$true;scope='CurrentUser';plaintextOutput=$false}
    } elseif($Action -eq 'restore') {
      $stored=ReadOwn $script:sealedName
      $clear=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($stored.ciphertext),(Entropy $x.binding),[Security.Cryptography.DataProtectionScope]::CurrentUser)
      CheckBinding $x.binding
    $lease=ReadOwn 'lease.json';if($lease.requestDigest -cne $x.requestDigest -or [long]$lease.expiresAt -ne [long]$x.binding.expiresAt -or [long]$lease.issuedAt -ne [long]$x.binding.issuedAt){Reject}
      $result=@{secret=[Text.Encoding]::UTF8.GetString($clear)}
    } elseif($Action -eq 'claim') {
      $sealed=ReadOwn $script:sealedName;if([Convert]::ToBase64String((Entropy $sealed.binding)) -cne [Convert]::ToBase64String((Entropy $x.binding))){Reject}
      if($x.intentDigest -notmatch '^[a-f0-9]{64}$' -or $x.operation -notin @('reset','register','login','password-change','revoke','business')){Reject}
      WriteNew $script:intentName @{state='consumed-before-action';intent=$x.intentDigest;operation=$x.operation;binding=$x.binding;at=(Now)}
      $result=@{claimed=$true;unknownMustReadback=$true}
    } elseif($Action -eq 'readback') {
      $claim=ReadOwn $script:intentName
      if($claim.intent -cne $x.intentDigest -or [Convert]::ToBase64String((Entropy $claim.binding)) -cne [Convert]::ToBase64String((Entropy $x.binding))){Reject}
      $hasReceipt=Test-Path -LiteralPath (FilePath $script:receiptName)
      if($hasReceipt){$receipt=ReadOwn $script:receiptName;if($receipt.state -cne 'confirmed-after-readback' -or $receipt.intent -cne $claim.intent -or $receipt.outcome -notin @('confirmed','rejected')){Reject}}
      $outcome=$null;if($hasReceipt){$outcome=$receipt.outcome}
      $result=@{claimed=$true;requiresAuthoritativeReadback=(-not $hasReceipt);mayBlindRetry=$false;outcome=$outcome}
    } elseif($Action -eq 'receipt') {
      $claim=ReadOwn $script:intentName
      if($x.outcome -notin @('confirmed','rejected') -or $x.readbackDigest -notmatch '^[a-f0-9]{64}$' -or [Convert]::ToBase64String((Entropy $claim.binding)) -cne [Convert]::ToBase64String((Entropy $x.binding))){Reject}
      WriteNew $script:receiptName @{state='confirmed-after-readback';intent=$claim.intent;outcome=$x.outcome;readbackDigest=$x.readbackDigest;at=(Now)}
      $result=@{recorded=$true;mayBlindRetry=$false}
    } else {Reject}
  }
  [Console]::Out.WriteLine((@{ok=$true;result=$result}|ConvertTo-Json -Compress -Depth 5))
} catch {
  $type=$_.Exception.GetType().FullName
  if($type -notin @('System.Management.Automation.CommandNotFoundException','System.Management.Automation.RuntimeException','System.Management.Automation.MethodInvocationException','System.Management.Automation.ParameterBindingException','System.UnauthorizedAccessException','System.Security.Cryptography.CryptographicException','System.IO.IOException')){$type='OTHER'}
  [Console]::Out.WriteLine((@{ok=$false;error='AUTHORIZED_VAULT_REJECTED';stage=$script:stage;exceptionType=$type;acl=$script:aclObservation}|ConvertTo-Json -Compress -Depth 4));exit 1
} finally {
  if($null -ne $plain){[Array]::Clear($plain,0,$plain.Length)}
  if($null -ne $clear){[Array]::Clear($clear,0,$clear.Length)}
  $x=$null
}
