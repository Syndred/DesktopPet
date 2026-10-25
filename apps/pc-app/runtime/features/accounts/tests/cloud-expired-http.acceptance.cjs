const {readFileSync,mkdirSync,writeFileSync}=require('node:fs');const {spawnSync,execFileSync}=require('node:child_process');const {randomUUID,createHash}=require('node:crypto');const {resolve,join}=require('node:path');
const {publicConfig}=require('../supabase-remote.cjs');
const file=process.env.LINGJING_EXPIRED_CREDENTIALS_DPAPI||'C:/Users/Administrator/Desktop/project/DesktopPet/artifacts/cloud-upgrade/2026-10-25/refresh-probe.credentials.dpapi';
const output=resolve(`artifacts/accounts/cloud-expired-http-${Date.now()}`);mkdirSync(output,{recursive:true});
const evidence={at:new Date().toISOString(),kind:'Actual provider-issued signed JWT from coordinator DPAPI fixture; no JWT edits/signing/mocks',sourceSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),credentialsLogged:false};
(async()=>{
 const encrypted=readFileSync(file),script=`Add-Type -AssemblyName System.Security; [Console]::OutputEncoding=[Text.Encoding]::UTF8; $inputBytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $clear=[Security.Cryptography.ProtectedData]::Unprotect($inputBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Text.Encoding]::UTF8.GetString($clear));`;
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{input:encrypted.toString('base64'),encoding:'utf8',windowsHide:true,maxBuffer:1024*1024});
 if(result.status!==0)throw Object.assign(new Error(),{code:'DPAPI_FIXTURE_CONTEXT_UNAVAILABLE'});
 let value;try{value=JSON.parse(result.stdout.replace(/^\uFEFF/,''));}catch{throw Object.assign(new Error(),{code:'DPAPI_FIXTURE_FORMAT_UNAVAILABLE'});}
 function find(object,predicate){if(object&&typeof object==='object')for(const [key,item]of Object.entries(object)){if(predicate(key,item))return item;const nested=find(item,predicate);if(nested)return nested;}return null;}
 const token=find(value,(key,item)=>/^(access_?token)$/i.test(key)&&typeof item==='string'&&item.split('.').length===3);
 if(!token)throw Object.assign(new Error(),{code:'ISSUED_TOKEN_NOT_FOUND'});
 const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()),config=publicConfig();
 if(claims.iss!==`${config.url}/auth/v1`||!Number.isFinite(claims.exp))throw Object.assign(new Error(),{code:'FIXTURE_PROJECT_MISMATCH'});
 evidence.fixtureChecksum=createHash('sha256').update(encrypted).digest('hex');evidence.expiresAt=new Date(claims.exp*1000).toISOString();evidence.expiredAtRequest=claims.exp<=Date.now()/1000;
 if(!evidence.expiredAtRequest){evidence.awaitingExpiration=true;writeFileSync(join(output,'awaiting-expiration.json'),JSON.stringify(evidence,null,2));console.log('TOKEN_NOT_YET_EXPIRED',evidence.expiresAt);return;}
 const device=find(value,(key,item)=>/^(device_?id|device)$/i.test(key)&&typeof item==='string'&&/^[0-9a-f-]{36}$/i.test(item))||randomUUID();
 const headers={apikey:config.key,Authorization:`Bearer ${token}`,'X-Lingjing-Device-Id':device};
 const auth=await fetch(`${config.url}/auth/v1/user`,{headers,signal:AbortSignal.timeout(30_000)}),authData=await auth.json();
 const expirationConfirmed=/expir/i.test([authData.msg,authData.message,authData.error_description,authData.error_code,authData.code].filter(Boolean).join(' '));
 evidence.provider={status:auth.status,code:authData.error_code||authData.code,serverDate:auth.headers.get('date'),expirationConfirmed};
 if(auth.status!==401||!expirationConfirmed)throw Object.assign(new Error(),{code:'PROVIDER_DID_NOT_CONFIRM_EXPIRATION'});
 const save=await fetch(`${config.url}/functions/v1/lingjing-save`,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({op:'read'}),signal:AbortSignal.timeout(30_000)}),saveData=await save.json();
 if(save.status!==401)throw Object.assign(new Error(),{code:'EXPIRED_SAVE_ACCESS_WAS_NOT_REJECTED'});
 evidence.save={status:save.status,code:saveData.code};evidence.passed=true;
 writeFileSync(join(output,'evidence.json'),JSON.stringify(evidence,null,2));console.log('CLOUD_SIGNED_EXPIRED_HTTP_PASSED',output);
})().catch(error=>{evidence.error={code:error.code||'EXPIRED_HTTP_VERIFICATION_INCOMPLETE'};writeFileSync(join(output,'failure.json'),JSON.stringify(evidence,null,2));console.error(evidence.error.code);process.exitCode=1;});
