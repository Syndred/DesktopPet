// Offline source contracts and Windows-only isolated files. Never run the vault,
// holder, product, account APIs, or the watchdog's main/kill/cleanup routine.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const source=readFileSync(new URL('holder-supervisor.ps1',import.meta.url),'utf8');
const oldBusiness="  if(Test-Path -LiteralPath $businessPath){CheckFile $businessPath;$business=[IO.File]::ReadAllText($businessPath)|ConvertFrom-Json;if([long]$business.expiresAtMs -gt [long]$lease.expiresAt -or ([long]$business.expiresAtMs-[long]$business.insertedAtMs) -gt 7200000 -or $business.scopeDigest -notmatch '^[a-f0-9]{64}$'){Fail};if((Now) -ge [long]$business.expiresAtMs){StopRegisteredApps $rows}}";
function block(name){const re=new RegExp('^ *# BEGIN '+name+'\\r?\\n([\\s\\S]*?)^ *# END '+name+'\\r?\\n','m');const match=source.match(re);assert.ok(match,name);assert.equal(source.match(new RegExp('# BEGIN '+name,'g')).length,1);return match[1];}
const retry=block('BUSINESS_DEADLINE_SHARING_RETRY'),diagnostic=block('SUPERVISOR_RUNTIME_DIAGNOSTIC');
const checkFile=source.slice(source.indexOf(' function CheckFile($p) {'),source.indexOf(' CheckFile $root;'));
assert.ok(checkFile.endsWith(' }\n'));
const stages=['root-check','registry-read','holder-check','business-deadline-read','business-deadline-validate','business-deadline-stop','deadline-loop'];
const categories=['sharing-violation','access-denied','validation-failure','io-failure','other'];
const diagnosticKeys=['version','run','commit','requestDigest','stage','category','win32Code','observedAt'];

test('removing only marked IO32 and diagnostic additions restores exact reviewed watchdog bytes',()=>{
 let restored=source.replace(/^ *# BEGIN (SUPERVISOR_RUNTIME_DIAGNOSTIC|BUSINESS_DEADLINE_SHARING_RETRY)\r?\n[\s\S]*?^ *# END \1\r?\n/gm,'');
 restored=restored.replace(/^.*# SUPERVISOR_DIAGNOSTIC_STAGE\r?\n/gm,'');
 const calls=restored.match(/^.*# SUPERVISOR_BUSINESS_READ_CALL$/gm);assert.equal(calls?.length,1);restored=restored.replace(calls[0],()=>oldBusiness);
 const catches=restored.match(/^.*# SUPERVISOR_DIAGNOSTIC_CATCH$/gm);assert.equal(catches?.length,1);restored=restored.replace(catches[0],' }catch{$runtimeFailure=$true}');
 assert.equal(createHash('sha256').update(restored).digest('hex'),'96c5cd378518a2419b1400fd90ddc6fd15ab14698bf536034a7ff06a53ac6d7f');
});

test('retry retains original ACL JSON and deadline validation, and only waits for inner IO error 32',()=>{
 assert.match(retry,/\$until=\[Math\]::Min\(\[long\]\$lease\.expiresAt,\(Now\)\+3000\)/);
 assert.match(retry,/CheckFile \$path/);assert.match(retry,/\[IO.File\]::ReadAllText\(\$path\)\|ConvertFrom-Json/);
 assert.match(retry,/while\(\$inner.InnerException\)\{\$inner=\$inner.InnerException\}/);
 assert.match(retry,/if\(\$inner -isnot \[IO.IOException\] -or \(\$inner.HResult -band 0xffff\) -ne 32 -or \(Now\) -ge \$until\)\{throw\}/);
 assert.match(retry,/Start-Sleep -Milliseconds \(\[Math\]::Min\(50,\$remaining\)\)/);
 assert.match(retry,/if\(\(Now\) -ge \$until\)\{throw \$failure\}/);
 const validation=oldBusiness.match(/if\(\[long\]\$business.expiresAtMs[\s\S]*?\{Fail\}/)[0];assert.ok(retry.includes(validation));
 assert.doesNotMatch(retry,/WriteAllText|WriteNew|expiresAt\s*=|expiresAtMs\s*=|StopRegisteredApps|\.Kill\(/);
});

test('diagnostic is a separate fixed primitive schema and its failure cannot bypass original cleanup',()=>{
 const fields=diagnostic.match(/\$receipt=@\{([^\n]+)\}/)[1].split(';').map(x=>x.split('=')[0]);assert.deepEqual(fields,diagnosticKeys);
 assert.ok(diagnostic.includes("($RequestDigest+'-diagnostic.json')"));assert.match(diagnostic,/\[IO.FileMode\]::CreateNew/);
 assert.match(diagnostic,/\[DateTimeOffset\]::UtcNow.ToString\('O'\)/);
 assert.deepEqual([...diagnostic.matchAll(/\$category='([^']+)'/g)].map(m=>m[1]).filter((v,i,a)=>a.indexOf(v)===i).sort(),[...categories].sort());
 assert.deepEqual(diagnostic.match(/\$stages=@\(([^\n]+)\)/)[1].split(',').map(s=>s.slice(1,-1)),stages);
 assert.deepEqual([...diagnostic.matchAll(/\$win32Code=([^;}\n]+)/g)].map(m=>m[1]),['$null','5','32','5']);
 assert.doesNotMatch(diagnostic,/\$HolderPid|\$HolderImage|\$HolderStartTicks|StackTrace|ToString\(\).*exception|ConvertTo-Json.*exception/);
 assert.ok(source.includes('}catch{$runtimeFailure=$true;try{WriteRuntimeDiagnostic $_.Exception}catch{}} # SUPERVISOR_DIAGNOSTIC_CATCH'));
 assert.ok(source.indexOf('WriteRuntimeDiagnostic $_.Exception')<source.indexOf('$cleanupFailed=$runtimeFailure'));
});

const quote=value=>"'"+value.replaceAll("'","''")+"'";
function powershell(script,{onLine,timeout=15000}={}){
 const exe=join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
 const child=spawn(exe,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{stdio:['pipe','pipe','pipe'],windowsHide:true});
 child.stdin.on('error',()=>{});
 let stdout='',stderr='',pending='';const timer=setTimeout(()=>child.kill(),timeout);
 child.stdout.on('data',b=>{stdout+=b;pending+=b;while(pending.includes('\n')){const end=pending.indexOf('\n'),line=pending.slice(0,end).trim();pending=pending.slice(end+1);onLine?.(line);}if(stdout.length>32768)child.kill();});
 child.stderr.on('data',b=>{stderr+=b;if(stderr.length>32768)child.kill();});
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',(code,signal)=>{clearTimeout(timer);if(code===0)resolve(stdout);else reject(Error('ISOLATED_POWERSHELL_FAILED: '+code+' '+signal+' '+stderr));});});
 return {child,done};
}
async function run(script,options){return (await powershell(script,options).done).trim();}
const setup=`$ErrorActionPreference='Stop';$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
function Now {[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}
function Fail {throw 'SAME_RUN_SUPERVISOR_REJECTED'}
${checkFile.replace('function CheckFile(', 'function CheckFileActual(')}
${retry}
${diagnostic}`;
const secureFile=`$sec=New-Object Security.AccessControl.FileSecurity;$sec.SetOwner((New-Object Security.Principal.SecurityIdentifier($sid)));$sec.SetAccessRuleProtection($true,$false)
foreach($id in @($sid,'S-1-5-18')){$rule=New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($id)),[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.AccessControlType]::Allow);$sec.AddAccessRule($rule)}
[IO.File]::SetAccessControl($path,$sec)`;
// The positive short-lock case releases its actual Windows lock synchronously
// only after the unchanged reader has caught IO32 and requested a retry. It must
// not depend on a parent stdout event, a guessed delay, or another process waking.
const shortLockSetup='$script:retryLock=[IO.File]::Open($path,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)';
const shortLockSleep=`function Start-Sleep([int]$Milliseconds){
 $script:sleeps++
 if($null -ne $script:retryLock){$script:retryLock.Dispose();$script:retryLock=$null;$script:releasedOnRetry=$true;$script:releaseAfterAttempt=$script:attempts}
 Microsoft.PowerShell.Utility\\Start-Sleep -Milliseconds $Milliseconds
}`;

test('positive real-lock release is inside the first actual IO32 retry, not a parent timer',()=>{
 assert.match(shortLockSetup,/\[IO.File\]::Open\(\$path,\[IO.FileMode\]::Open,\[IO.FileAccess\]::ReadWrite,\[IO.FileShare\]::None\)/);
 assert.match(shortLockSleep,/function Start-Sleep\(\[int\]\$Milliseconds\)/);
 assert.ok(shortLockSleep.indexOf('$script:retryLock.Dispose()')<shortLockSleep.indexOf('Microsoft.PowerShell.Utility\\Start-Sleep'));
 assert.match(shortLockSleep,/\$script:releaseAfterAttempt=\$script:attempts/);
 assert.doesNotMatch(shortLockSleep,/throw|New-Object.*IOException|FromMilliseconds|Start-Job/);
 const self=readFileSync(new URL('holder-supervisor-io.test.mjs',import.meta.url),'utf8'),windowsTests=self.match(/^test\('Windows actual exclusive locks[\s\S]+/m)[0];
 assert.equal(windowsTests.includes("onLine:line=>{if(line==='READING'"),false);
 assert.equal(windowsTests.includes("setTimeout(()=>release.child.stdin.end"),false);
 assert.ok(retry.indexOf('($inner.HResult -band 0xffff) -ne 32')<retry.indexOf('Start-Sleep -Milliseconds'));
 assert.equal(createHash('sha256').update(source).digest('hex'),'5ded2c0d06c39464ec5be2694986a1b18e4879a368ee19f66002c27ad53bb08f');
});

test('Windows actual exclusive locks and immediate-rejection negatives, only independent mock files',{skip:process.platform!=='win32'},async t=>{
 const directory=mkdtempSync(join(tmpdir(),'lingjing-watchdog-io-contract-')),path=join(directory,'mock-deadline.json');
 const file=`$path=${quote(path)}`;const owned=[];
 async function makeFile(content){await run(`${setup}\n${file}\n[IO.File]::WriteAllText($path,${quote(content??JSON.stringify({insertedAtMs:Date.now(),expiresAtMs:Date.now()+60000,scopeDigest:'a'.repeat(64)}))})\n${secureFile}`);}
 async function lock(){let locked;const ready=new Promise(r=>locked=r);const p=powershell(`${file};$s=[IO.File]::Open($path,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);try{[Console]::Out.WriteLine('LOCKED');[void][Console]::In.ReadLine()}finally{$s.Dispose()}`,{onLine:line=>{if(line==='LOCKED')locked();},timeout:20000});owned.push(p);await Promise.race([ready,p.done.then(()=>{throw Error('LOCK_NOT_READY');})]);return p;}
 async function read({old=false,leaseMs=120000,check='CheckFileActual $p',noSleep=false,releaseOnRetry=false}={}){
  assert.equal(noSleep&&releaseOnRetry,false);
  const script=`${setup}\n${file}
$script:attempts=0;$script:lastAttemptAt=0;$script:sleeps=0;$script:retryLock=$null;$script:releasedOnRetry=$false;$script:releaseAfterAttempt=0
function CheckFile($p){$script:attempts++;$script:lastAttemptAt=Now;${check}}
${noSleep?"function Start-Sleep { $script:sleeps++;throw 'UNEXPECTED_RETRY' }":releaseOnRetry?shortLockSleep:''}
${releaseOnRetry?shortLockSetup:''}
$lease=@{expiresAt=(Now)+${leaseMs}};$start=Now
try{${old?'$business=[IO.File]::ReadAllText($path)|ConvertFrom-Json':'$business=ReadBusinessDeadline $path'};$finished=Now;$ok=$true;$code=$null;$kind='none'}catch{$finished=Now;$ok=$false;$e=$_.Exception;while($e.InnerException){$e=$e.InnerException};$code=if($e -is [IO.IOException]){$e.HResult -band 0xffff}else{$null};$kind=$e.GetType().FullName}finally{if($null -ne $script:retryLock){$script:retryLock.Dispose();$script:retryLock=$null}}
[Console]::Out.WriteLine((@{ok=$ok;win32Code=$code;exceptionType=$kind;attempts=$script:attempts;sleeps=$script:sleeps;elapsedMs=($finished-$start);lastAttemptAt=$script:lastAttemptAt;leaseEnd=$lease.expiresAt;releasedOnRetry=$script:releasedOnRetry;releaseAfterAttempt=$script:releaseAfterAttempt}|ConvertTo-Json -Compress))`;
  return JSON.parse((await run(script)).split(/\r?\n/).at(-1));
 }
 try{
  await t.test('old ReadAllText deterministically raises actual Windows error 32',async()=>{await makeFile();const p=await lock();try{const result=await read({old:true});assert.equal(result.ok,false);assert.equal(result.win32Code,32);}finally{p.child.stdin.end('release\n');await p.done;}});
  await t.test('bounded new read survives only a temporary actual exclusive lock',async()=>{await makeFile();const result=await read({releaseOnRetry:true});assert.equal(result.ok,true);assert.equal(result.releasedOnRetry,true);assert.equal(result.releaseAfterAttempt,1);assert.ok(result.sleeps>=1);assert.ok(result.attempts>1);});
  await t.test('actual exclusive lock beyond three seconds rejects without an extra attempt',async()=>{await makeFile();const p=await lock();try{const result=await read();assert.equal(result.ok,false);assert.equal(result.win32Code,32);assert.ok(result.attempts>1);assert.ok(result.elapsedMs>=2900&&result.elapsedMs<4500);}finally{p.child.stdin.end('release\n');await p.done;}});
  await t.test('original lease clips the retry window instead of receiving three new seconds',async()=>{await makeFile();const p=await lock();try{const result=await read({leaseMs:250});assert.equal(result.ok,false);assert.equal(result.win32Code,32);assert.ok(result.elapsedMs>=200&&result.elapsedMs<1200);assert.ok(result.lastAttemptAt<result.leaseEnd);}finally{p.child.stdin.end('release\n');await p.done;}});
  await t.test('invalid actual ACL is rejected on the first read with no sleep',async()=>{await makeFile();await run(`${setup}\n${file}\n$acl=[IO.File]::GetAccessControl($path);$acl.SetAccessRuleProtection($false,$true);[IO.File]::SetAccessControl($path,$acl)`);const result=await read({noSleep:true});assert.equal(result.ok,false);assert.equal(result.attempts,1);assert.equal(result.sleeps,0);});
  for(const [name,content]of [['malformed JSON','{broken'],['invalid scope',JSON.stringify({insertedAtMs:Date.now(),expiresAtMs:Date.now()+60000,scopeDigest:'invalid'})],['deadline above original lease',JSON.stringify({insertedAtMs:Date.now(),expiresAtMs:Date.now()+600000,scopeDigest:'a'.repeat(64)})]])await t.test(name+' is rejected without retries',async()=>{await makeFile(content);const result=await read({noSleep:true});assert.equal(result.ok,false);assert.equal(result.attempts,1);assert.equal(result.sleeps,0);});
  for(const [name,check]of [['permission denied',"throw [UnauthorizedAccessException]::new('SYNTHETIC_PRIVATE_MARKER')"],['non32 IOException',"throw [IO.IOException]::new('SYNTHETIC_PRIVATE_MARKER',-2147024863)"],['other error',"throw 'SYNTHETIC_PRIVATE_MARKER'"]])await t.test(name+' is rejected on first attempt',async()=>{await makeFile();const result=await read({check,noSleep:true});assert.equal(result.ok,false);assert.equal(result.attempts,1);assert.equal(result.sleeps,0);});
  await t.test('all diagnostic classifications remain whitelisted and unknown stage cannot leak',async()=>{
   const script=`${setup}\nSet-Location ${quote(directory)}
$env:GITHUB_RUN_ID='124';$env:GITHUB_SHA='${'b'.repeat(40)}';$script:observationStage='SYNTHETIC_PRIVATE_MARKER';$results=@()
$errors=@([IO.IOException]::new('SYNTHETIC_PRIVATE_MARKER',-2147024864),[UnauthorizedAccessException]::new('SYNTHETIC_PRIVATE_MARKER'),[IO.IOException]::new('SYNTHETIC_PRIVATE_MARKER',-2147024863),[ArgumentException]::new('SYNTHETIC_PRIVATE_MARKER'),[Management.Automation.RuntimeException]::new('SAME_RUN_SUPERVISOR_REJECTED'),[Exception]::new('SYNTHETIC_PRIVATE_MARKER'))
for($i=0;$i -lt $errors.Count;$i++){$RequestDigest=($i+1).ToString('x64');WriteRuntimeDiagnostic $errors[$i];$proof=[IO.File]::ReadAllText((Join-Path (Get-Location).Path ('artifacts/qa/same-run-watchdog-124/'+$RequestDigest+'-diagnostic.json')));$results+=($proof|ConvertFrom-Json);if($proof.Contains('SYNTHETIC_PRIVATE_MARKER')){throw 'DIAGNOSTIC_LEAK'}}
[Console]::Out.WriteLine((ConvertTo-Json -InputObject $results -Depth 4 -Compress))`;
   const rows=JSON.parse(await run(script));assert.deepEqual(rows.map(r=>[r.category,r.win32Code]),[['sharing-violation',32],['access-denied',5],['io-failure',null],['validation-failure',null],['validation-failure',null],['other',null]]);for(const row of rows){assert.deepEqual(Object.keys(row).sort(),[...diagnosticKeys].sort());assert.equal(row.stage,'deadline-loop');}
  });
  await t.test('fixed diagnostics redact exception text and fail safely if the file already exists',async()=>{
   const script=`${setup}\nSet-Location ${quote(directory)}
$env:GITHUB_RUN_ID='123';$env:GITHUB_SHA='${'b'.repeat(40)}';$RequestDigest='${'c'.repeat(64)}';$script:observationStage='business-deadline-read'
$e=[IO.IOException]::new('SYNTHETIC_PRIVATE_MARKER C:\\secret 12345',-2147024864)
WriteRuntimeDiagnostic $e
$proof=Get-Content -LiteralPath ('artifacts/qa/same-run-watchdog-123/'+$RequestDigest+'-diagnostic.json') -Raw
$cleanupReached=$false;try{throw $e}catch{$runtimeFailure=$true;try{WriteRuntimeDiagnostic $_.Exception}catch{}};$cleanupReached=$true
[Console]::Out.WriteLine((@{receipt=($proof|ConvertFrom-Json);cleanupReached=$cleanupReached;runtimeFailure=$runtimeFailure;markerLeaked=$proof.Contains('SYNTHETIC_PRIVATE_MARKER')}|ConvertTo-Json -Depth 4 -Compress))`;
   const result=JSON.parse(await run(script));assert.equal(result.cleanupReached,true);assert.equal(result.runtimeFailure,true);assert.equal(result.markerLeaked,false);assert.deepEqual(Object.keys(result.receipt).sort(),[...diagnosticKeys].sort());assert.equal(result.receipt.category,'sharing-violation');assert.equal(result.receipt.win32Code,32);assert.equal(result.receipt.stage,'business-deadline-read');assert.ok(Number.isFinite(Date.parse(result.receipt.observedAt)));
  });
 }finally{for(const p of owned){if(p.child.exitCode===null&&p.child.signalCode===null)p.child.stdin.end('release\n');await p.done.catch(()=>{});}rmSync(directory,{recursive:true,force:true});}
});
