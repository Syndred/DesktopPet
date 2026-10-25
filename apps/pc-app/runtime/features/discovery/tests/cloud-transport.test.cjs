const test=require('node:test'),assert=require('node:assert/strict');
const {CloudDiscoveryAuthority,PROTOCOL}=require('../cloud-adapter.cjs');
const actor={schemaVersion:1,authority:'live',authKind:'supabase',authUserId:'authoritative-auth-uid',ownerAccountId:'runtime:old-text-owner',deviceId:'registered-device',sessionId:'verified-session'};
const context=(invoke,who=actor)=>({...who,actor:who,url:'https://jbvrdmrkwpznbrvteive.supabase.co',publishableKey:'sb_publishable_unit_only',invoke});
// Capability contract only.08 owns actual JWT transport/refresh verification.
test('discovery consumes the shared main-process capability and negotiates its protocol',async()=>{
  const calls=[];
  const adapter=new CloudDiscoveryAuthority({requireActor:async()=>context(async(name,body)=>{
    calls.push(body);assert.equal(name,'discovery');if(body.op==='protocol')return{protocol:PROTOCOL};return{round:body.expectedRound};
  })});
  assert.deepEqual(await adapter.act({permitId:'permit-a',action:'normal_attack',expectedRound:1,actionId:'action-a'}),{round:1});
  assert.deepEqual(await adapter.act({permitId:'permit-a',action:'dodge',expectedRound:2,actionId:'action-b'}),{round:2});
  assert.deepEqual(calls,[{op:'protocol'},{permitId:'permit-a',action:'normal_attack',expectedRound:1,actionId:'action-a',op:'act'},{permitId:'permit-a',action:'dodge',expectedRound:2,actionId:'action-b',op:'act'}]);
  for(const field of ['ownerAccountId','sessionToken','winner','reward','allowSimulatedLocation','globalSerial','namespace','entityKey','templateId'])await assert.rejects(adapter.invoke('act',{[field]:'forged'}),{code:'CLIENT_AUTHORITY_FORBIDDEN'});
  assert.equal(calls.length,3);
});
test('legacy tokens, service keys, HTTP, other projects, mismatched protocols and changed owners fail closed',async()=>{
  const never=async()=>{throw new Error('must not reach network');};
  await assert.rejects(new CloudDiscoveryAuthority({getSession:()=>({actor,accessToken:'legacy'}),fetcher:never}).invoke('protocol'),{code:'CLOUD_AUTH_REQUIRED'});
  for(const [options,code]of [[{url:'http://47.112.208.97:8000'},'CLOUD_TLS_REQUIRED'],[{url:'https://other-project.supabase.co'},'CLOUD_PROJECT_MISMATCH'],[{publishableKey:'sb_secret_must_never_send'},'CLOUD_NOT_CONFIGURED']])await assert.rejects(new CloudDiscoveryAuthority({requireActor:async()=>({...context(never),...options})}).invoke('protocol'),{code});
  await assert.rejects(new CloudDiscoveryAuthority({requireActor:async()=>context(async()=>({}))}).invoke('protocol'),{code:'CLOUD_PROTOCOL_MISMATCH'});
  for(const field of ['authUserId','ownerAccountId','deviceId','sessionId']){
    let calls=0;
    await assert.rejects(new CloudDiscoveryAuthority({requireActor:async()=>context(async()=>({protocol:PROTOCOL}),++calls===1?actor:{...actor,[field]:'foreign'})}).invoke('protocol'),{code:'AUTH_CHANGED'});
  }
});
