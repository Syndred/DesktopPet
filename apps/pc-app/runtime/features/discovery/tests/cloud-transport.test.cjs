const test=require('node:test'),assert=require('node:assert/strict');
const {CloudDiscoveryAuthority,PROTOCOL}=require('../cloud-adapter.cjs');
const actor={schemaVersion:1,authority:'live',authKind:'supabase',authUserId:'authoritative-auth-uid',ownerAccountId:'runtime:old-text-owner',deviceId:'registered-device',sessionId:'verified-session'};
const getSession=async()=>({actor,accessToken:'unit.payload.signature'});
test('transport sends user JWT and device header to the exact HTTPS project, never body credentials or client authority',async()=>{
  let called=0;
  const adapter=new CloudDiscoveryAuthority({getSession,publishableKey:'sb_publishable_unit_only',fetcher:async(url,request)=>{
    called++;assert.equal(url,'https://jbvrdmrkwpznbrvteive.supabase.co/functions/v1/discovery');assert.equal(request.headers.authorization,'Bearer unit.payload.signature');assert.equal(request.headers['x-lingjing-device-id'],actor.deviceId);
    assert.deepEqual(JSON.parse(request.body),{permitId:'permit-a',action:'normal_attack',expectedRound:1,actionId:'action-a',op:'act'});return new Response(JSON.stringify({ok:true,protocol:PROTOCOL,data:{round:1}}));
  }});
  assert.deepEqual(await adapter.act({permitId:'permit-a',action:'normal_attack',expectedRound:1,actionId:'action-a'}),{round:1});
  for(const field of ['ownerAccountId','sessionToken','winner','reward'])await assert.rejects(adapter.invoke('act',{[field]:'forged'}),{code:'CLIENT_AUTHORITY_FORBIDDEN'});
  assert.equal(called,1);
});
test('legacy tokens, service keys, HTTP, other projects, mismatched protocols and changed owners fail closed',async()=>{
  const never=async()=>{throw new Error('must not reach network');};
  await assert.rejects(new CloudDiscoveryAuthority({getUser:()=>({id:'legacy',sessionToken:'plain-old-token'}),fetcher:never}).invoke('protocol'),{code:'CLOUD_AUTH_REQUIRED'});
  for(const [options,code]of [[{url:'http://47.112.208.97:8000'},'CLOUD_TLS_REQUIRED'],[{url:'https://other-project.supabase.co'},'CLOUD_PROJECT_MISMATCH'],[{publishableKey:'sb_secret_must_never_send'},'CLOUD_NOT_CONFIGURED']])await assert.rejects(new CloudDiscoveryAuthority({getSession,publishableKey:'sb_publishable_unit',fetcher:never,...options}).invoke('protocol'),{code});
  await assert.rejects(new CloudDiscoveryAuthority({getSession,publishableKey:'sb_publishable_unit',fetcher:async()=>new Response(JSON.stringify({ok:true,data:{}}))}).invoke('protocol'),{code:'CLOUD_PROTOCOL_MISMATCH'});
  let calls=0;
  await assert.rejects(new CloudDiscoveryAuthority({getSession:async()=>({actor:++calls===1?actor:{...actor,ownerAccountId:'foreign'},accessToken:'unit.payload.signature'}),publishableKey:'sb_publishable_unit',fetcher:async()=>new Response(JSON.stringify({ok:true,protocol:PROTOCOL,data:{}}))}).invoke('protocol'),{code:'AUTH_CHANGED'});
});
