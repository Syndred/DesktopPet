import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {generateKeyPairSync,createPublicKey,sign} from 'node:crypto';
import {request as httpsRequest} from 'node:https';
import {canonical,locationEnvelope,PROTOCOL} from '../../../infra/supabase/functions/discovery/protocol.mjs';
const require=createRequire(import.meta.url),{SupabaseRemote,decodeProof}=require('../../../apps/pc-app/runtime/features/accounts/supabase-remote.cjs');
const config=JSON.parse(readFileSync(process.argv[2],'utf8')),selected=config.actors[Number(process.argv[3])];
if(config.purpose!=='lingjing-cloud-territory-acceptance'||config.testOnly!==true||config.projectUrl!=='https://jbvrdmrkwpznbrvteive.supabase.co'||!config.publishableKey?.startsWith('sb_publishable_')||!selected?.deviceId||process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw Error('Private live acceptance configuration required');
const sessionFile=join(selected.profile,'territory-private-session.json');mkdirSync(selected.profile,{recursive:true});
const remote=new SupabaseRemote({userData:selected.profile,deviceId:selected.deviceId,config:{url:config.projectUrl,key:config.publishableKey}});
let session={id:selected.ownerAccountId,ownerAccountId:selected.ownerAccountId,cloudProof:existsSync(sessionFile)?readFileSync(sessionFile,'utf8'):selected.proof};
remote.setCurrentUser(session);remote.onProofChanged(({proof})=>{session={...session,cloudProof:proof};writeFileSync(sessionFile,proof);});
let actor=decodeProof(session.cloudProof).actor;const privateKey=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey;let registered=false;
const slugs={garden:'garden-sync',territory:'territory-sync',discovery:'discovery',companions:'companions-sync',save:'lingjing-save'};
async function request(which,body,{disconnectAfterHeaders=false,anonymous=false,forged=false}={}){
  const name=slugs[which];if(!name)throw Error('Invalid endpoint');
  const proof=await remote.fresh(session);actor=proof.actor;
  const url=new URL(`/functions/v1/${name}`,config.projectUrl),headers={'content-type':'application/json',apikey:config.publishableKey,'x-lingjing-device-id':actor.deviceId};
  if(!anonymous)headers.authorization=`Bearer ${forged?'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmb3JnZWQifQ.invalid':proof.accessToken}`;
  return new Promise((resolve,reject)=>{
    const req=httpsRequest(url,{method:'POST',headers,timeout:25000},res=>{
      if(disconnectAfterHeaders){const status=res.statusCode;res.destroy();req.destroy();resolve({httpStatus:status,responseStreamDisconnected:true,body:null});return;}
      const chunks=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>30*1024*1024){req.destroy(Error('Response too large'));return;}chunks.push(chunk);});
      res.on('end',()=>{try{resolve({httpStatus:res.statusCode,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))});}catch{reject(Error('Response is not JSON'));}});res.on('error',reject);
    });req.on('timeout',()=>req.destroy(Error('HTTPS timeout; outcome uncertain')));req.on('error',reject);req.end(JSON.stringify(body));
  });
}
function checked(reply){if(reply.body?.ok!==true)throw Object.assign(new Error(`HTTP ${reply.httpStatus}: ${reply.body?.code||'unreadable'}`),{code:reply.body?.code||'HTTPS_REQUEST_FAILED'});return reply.body.data;}
async function prove(purpose,reference=''){
  if(config.location?.source!=='simulated'||config.location.provider!=='qa-discovery'||config.location.scenarioId!==config.scenarioId)throw Error('Node verifier only accepts explicitly marked coordinator-granted simulation; OS proof uses Electron');
  if(!registered){
    const protocol=checked(await request('discovery',{op:'protocol'}));if(protocol.protocol!==PROTOCOL)throw Error('Discovery protocol mismatch');
    const jwk=createPublicKey(privateKey).export({format:'jwk'});checked(await request('discovery',{op:'device.register',publicJwk:{kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y}}));registered=true;
  }
  const challenge=checked(await request('discovery',{op:'location.challenge',purpose,reference}));
  for(const field of ['ownerAccountId','authUserId','deviceId','sessionId'])if(challenge[field]!==actor[field])throw Error('Location challenge actor mismatch');
  const fix={lat:config.location.lat,lng:config.location.lng,accuracyMeters:12,timestampMs:Date.now(),coordinateSystem:'wgs84',source:'simulated',provider:'qa-discovery',scenarioId:config.scenarioId};
  const signature=sign('sha256',Buffer.from(canonical(locationEnvelope(actor,challenge,fix))),{key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
  return request('discovery',{op:'location.prove',challengeId:challenge.id,fix,signature});
}
process.send?.({ready:true,pid:process.pid,deviceId:actor.deviceId,actor});
process.on('message',async message=>{
  const {id,body,which='territory',operation,purpose,reference,...options}=message;
  try{const result=operation==='prove'?await prove(purpose,reference):await request(which,body,options);process.send?.({id,pid:process.pid,result});}
  catch(error){process.send?.({id,pid:process.pid,error:{code:error.code||'HTTPS_REQUEST_FAILED',message:String(error.message).replace(/Bearer\s+\S+/g,'Bearer [redacted]')}});}
});
