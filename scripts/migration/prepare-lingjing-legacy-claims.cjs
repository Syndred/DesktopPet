const {createHash}=require('node:crypto');const {readFileSync,mkdirSync,writeFileSync}=require('node:fs');const {resolve,join}=require('node:path');const {spawnSync}=require('node:child_process');
const {checksum}=require('../../apps/pc-app/runtime/features/accounts/util.cjs');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
/** Integrity preparation only. A source manifest cannot prove its own origin;
 * the deployment coordinator must independently attest server export custody.
 * This tool performs no network calls, password resets, Auth creation or writes. */
function prepareClaims(sourceBytes,manifestBytes){
 let manifest,rows;try{manifest=JSON.parse(manifestBytes);rows=JSON.parse(sourceBytes);}catch{fail('LEGACY_EXPORT_INVALID_JSON');}
 if(manifest.format!=='lingjing-server-export'||manifest.version!==1||manifest.environment!=='production'
  ||manifest.source?.origin!=='http://47.112.208.97:8000'||manifest.source?.collection!=='public.runtime_accounts'
  ||manifest.provenance?.kind!=='operator-server-export'||manifest.provenance?.mode!=='live'
  ||typeof manifest.source.instanceId!=='string'||!manifest.source.instanceId||manifest.source.instanceId.length>160)fail('TRUSTED_SERVER_EXPORT_REQUIRED');
 if(manifest.file?.sha256!==hash(sourceBytes)||manifest.file?.byteLength!==sourceBytes.length||!Array.isArray(rows)||manifest.file?.rowCount!==rows.length)fail('LEGACY_EXPORT_INTEGRITY_MISMATCH');
 if(!rows.length)fail('EMPTY_SOURCE_IS_NOT_A_MIGRATION');
 const owners=new Set(),names=new Set(),manifestChecksum=hash(manifestBytes),claims=[];
 for(const row of rows){
  if(!row||typeof row.id!=='string'||row.id.length<1||row.id.length>160||row.id.startsWith('qa:')||row.id.startsWith('local-')
   ||row.provenance?.mode==='simulated'||row.environment==='qa'||row.is_simulated===true)fail('PRODUCTION_RUNTIME_OWNER_REQUIRED');
  if(typeof row.account!=='string'||row.account!==row.account.trim()||row.account.length<3||row.account.length>32||/\s/.test(row.account)
   ||typeof row.account_key!=='string'||!row.account_key||typeof row.username!=='string'||row.username.length<2||row.username.length>24
   ||typeof row.password_hash!=='string'||!/^[0-9a-f]{64}$/i.test(row.password_hash)||!Number.isFinite(Date.parse(row.created_at)))fail('LEGACY_ACCOUNT_RECORD_INVALID');
  if(owners.has(row.id)||names.has(row.account_key))fail('AMBIGUOUS_LEGACY_IDENTITY');owners.add(row.id);names.add(row.account_key);
  claims.push({source_instance:manifest.source.instanceId,legacy_subject:row.id,owner_id:row.id,account_key:row.account_key,
   account:row.account,username:row.username,password_hash:row.password_hash.toLowerCase(),hash_algorithm:'sha256',
   source_record_checksum:checksum(row),source_manifest_checksum:manifestChecksum,created_at:row.created_at});
 }
 return{format:'lingjing-legacy-claims',version:1,claims,sourceChecksum:hash(sourceBytes),manifestChecksum,
  requiresIndependentCoordinatorSourceAttestation:true,cloudMigrationCompleted:false};
}
function protectClaims(bundle){
 if(process.platform!=='win32')fail('WINDOWS_DPAPI_REQUIRED');
 const script=`Add-Type -AssemblyName System.Security; [Console]::InputEncoding=[Text.Encoding]::UTF8; $raw=[Console]::In.ReadToEnd(); $bytes=[Text.Encoding]::UTF8.GetBytes($raw); $entropy=[Text.Encoding]::UTF8.GetBytes('LINGJING_LEGACY_CLAIMS_V1'); $protected=[Security.Cryptography.ProtectedData]::Protect($bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($protected));`;
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{input:JSON.stringify(bundle),encoding:'utf8',windowsHide:true,maxBuffer:64*1024*1024});
 if(result.status!==0||!/^[A-Za-z0-9+/=]+$/.test(result.stdout||''))fail('LEGACY_CLAIMS_ENCRYPTION_FAILED');return Buffer.from(result.stdout,'base64');
}
function run(args){
 if(args.length!==3)fail('USAGE_SOURCE_JSON_MANIFEST_JSON_NEW_OUTPUT_DIRECTORY');
 const [sourcePath,manifestPath,out]=args.map(value=>resolve(value)),sourceBytes=readFileSync(sourcePath),manifestBytes=readFileSync(manifestPath);
 const bundle=prepareClaims(sourceBytes,manifestBytes),encrypted=protectClaims(bundle);mkdirSync(out); // Refuse existing output; never overwrite an earlier export.
 const file=join(out,'claims.dpapi');writeFileSync(file,encrypted,{flag:'wx'});
 const audit={format:bundle.format,version:1,preparedAt:new Date().toISOString(),sourceChecksum:bundle.sourceChecksum,manifestChecksum:bundle.manifestChecksum,
  accountCount:bundle.claims.length,uniqueOriginalOwnerCount:new Set(bundle.claims.map(row=>row.owner_id)).size,encryptedFileChecksum:hash(encrypted),
  requiresIndependentCoordinatorSourceAttestation:true,networkWritesPerformed:false,cloudMigrationCompleted:false,
  scope:'Only credentials/identity staging preparation. Inventory/pet/growth/history source import requires separate domain verification. Original source files remain unchanged.'};
 writeFileSync(join(out,'audit.json'),JSON.stringify(audit,null,2),{flag:'wx'});return{output:out,accountCount:audit.accountCount,networkWritesPerformed:false,cloudMigrationCompleted:false};
}
if(require.main===module){try{console.log(JSON.stringify(run(process.argv.slice(2))));}catch(error){console.error(error.code||'LEGACY_CLAIMS_PREPARATION_FAILED');process.exitCode=1;}}
module.exports={prepareClaims,protectClaims};
