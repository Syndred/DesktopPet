const assert=require('node:assert/strict');const {randomUUID,randomBytes}=require('node:crypto');const {mkdirSync,writeFileSync}=require('node:fs');const {resolve,join}=require('node:path');const {execFileSync}=require('node:child_process');
const {SupabaseRemote,decodeProof}=require('../supabase-remote.cjs');
const output=resolve(`artifacts/accounts/cloud-session-revoke-${Date.now()}`);mkdirSync(output,{recursive:true});
const a=new SupabaseRemote({userData:join(output,'a')}),b=new SupabaseRemote({userData:join(output,'b')});
const evidence={at:new Date().toISOString(),sourceSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),
 kind:'Actual HTTPS managed Auth remains valid; direct authenticated RPC revoke/rebind and old refresh rejected by database ledger; same-host devices',credentialsPersisted:false,checks:[]};
const pass=(name,data)=>{evidence.checks.push({name,data});console.log('PASS',name);};
async function directRegister(proof,device=a.deviceId){const r=await fetch(`${a.config.url}/rest/v1/rpc/lingjing_register_device`,{method:'POST',headers:{apikey:a.config.key,Authorization:`Bearer ${proof.accessToken}`,'X-Lingjing-Device-Id':device,'content-type':'application/json'},body:JSON.stringify({p_device_id:device,p_label:'Security rebind probe'}),signal:AbortSignal.timeout(30_000)});return{status:r.status,data:await r.json()};}
async function rejectedRefresh(proof){const r=await fetch(`${a.config.url}/functions/v1/lingjing-auth`,{method:'POST',headers:{apikey:a.config.key,'X-Lingjing-Device-Id':a.deviceId,'content-type':'application/json'},body:JSON.stringify({op:'refresh',refreshToken:proof.refreshToken}),signal:AbortSignal.timeout(30_000)});const data=await r.json();assert.equal(r.status,401);assert.ok(/SESSION_REVOKED|AUTH_INVALID/.test(data.code));return{status:r.status,code:data.code};}
(async()=>{
 const account=`revokeqa_${Date.now().toString(36)}`,password=`Aa9!${randomBytes(18).toString('base64url')}`;
 const ua=await a.register(account,password,'设备撤销验收'),ub=await b.login(account,password),sa={id:ua.id,cloudProof:ua.proof},sb={id:ub.id,cloudProof:ub.proof};a.setCurrentUser(sa);b.setCurrentUser(sb);
 const old=decodeProof(ua.proof),context=await a.cloudContext(sa);const revoked=await context.client.rpc('lingjing_revoke_device',{p_device_id:a.deviceId});assert.equal(revoked.error,null);assert.equal(revoked.data.revoked,true);
 const managed=await fetch(`${a.config.url}/auth/v1/user`,{headers:{apikey:a.config.key,Authorization:`Bearer ${old.accessToken}`},signal:AbortSignal.timeout(30_000)});assert.equal(managed.status,200);
 const next=await a.login(account,password),nextProof=decodeProof(next.proof);a.setCurrentUser({id:next.id,cloudProof:next.proof});assert.notEqual(nextProof.actor.sessionId,old.actor.sessionId);
 const denied=await directRegister(old);assert.equal(denied.status,401);assert.match(denied.data.message,/LJ_SESSION_REVOKED/);
 const moved=await directRegister(old,randomUUID());assert.equal(moved.status,401);const refreshedOld=await rejectedRefresh(old);
 pass('managed-valid old SID cannot rebind any device or refresh after revoke then fresh login',{managedAuthStatus:managed.status,oldSid:old.actor.sessionId,newSid:nextProof.actor.sessionId,rebind:denied.status,otherDevice:moved.status,refresh:refreshedOld});
 const latest=await a.login(account,password),latestProof=decodeProof(latest.proof);a.setCurrentUser({id:latest.id,cloudProof:latest.proof});
 const replaced=await directRegister(nextProof);assert.equal(replaced.status,401);assert.match(replaced.data.message,/LJ_SESSION_REVOKED/);const replacedRefresh=await rejectedRefresh(nextProof);
 const liveA=await a.cloudContext({id:latest.id,cloudProof:latest.proof}),liveB=await b.cloudContext(sb);assert.equal(liveA.ownerAccountId,liveB.ownerAccountId);
 const rowsB=await liveB.client.from('lingjing_accounts').select('owner_id');assert.equal(rowsB.error,null);assert.equal(rowsB.data[0].owner_id,ua.id);
 pass('replacement records its previous SID while new A and independent B stay live',{replacedSid:nextProof.actor.sessionId,latestSid:latestProof.actor.sessionId,rebind:replaced.status,refresh:replacedRefresh,otherDevice:'live'});
 evidence.passed=true;writeFileSync(join(output,'evidence.json'),JSON.stringify(evidence,null,2));console.log('CLOUD_SESSION_REVOKE_PASSED',output);
})().catch(error=>{evidence.error={code:error.code,message:error.message};writeFileSync(join(output,'failure.json'),JSON.stringify(evidence,null,2));console.error(error.code||'',error.message);process.exitCode=1;}).finally(()=>{a.dispose();b.dispose();});
