import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomUUID,randomBytes} from 'node:crypto';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{SupabaseRemote,decodeProof}=require('../../../apps/pc-app/runtime/features/accounts/supabase-remote.cjs');
const file=resolve(process.argv[2]||'artifacts/garden/cloud/private-clients.json'),config=JSON.parse(readFileSync(file,'utf8'));
if(config.purpose!=='lingjing-cloud-territory-acceptance'||config.testOnly!==true||config.projectUrl!=='https://jbvrdmrkwpznbrvteive.supabase.co'||!config.publishableKey?.startsWith('sb_publishable_'))throw Error('Coordinator-designated private test configuration required');
config.runId||=randomUUID();config.output||=resolve(`artifacts/garden/cloud/live-${config.runId}`);config.scenarioId||=`garden-${config.runId.slice(0,8)}`;
config.location||={source:'simulated',provider:'qa-discovery',scenarioId:config.scenarioId,lat:45.3001+parseInt(config.runId.slice(0,4),16)*0.00001,lng:70.1001};
config.credentials||=[0,1].map(index=>({account:`gardenqa_${config.runId.slice(0,8)}_${index}`,password:`Garden-${randomBytes(20).toString('base64url')}`,username:index?'园地验收乙':'园地验收甲'}));config.actors||=[];
const save=()=>writeFileSync(file,JSON.stringify(config,null,2)+'\n');save();
for(let index=0;index<3;index++){
  const credential=config.credentials[index===2?0:index],profile=resolve(config.output,`client-${index}`);mkdirSync(profile,{recursive:true});
  const remote=new SupabaseRemote({userData:profile,config:{url:config.projectUrl,key:config.publishableKey}});
  const sessionFile=join(profile,'territory-private-session.json');
  let user;
  if(existsSync(sessionFile)){
    const proof=readFileSync(sessionFile,'utf8'),actor=decodeProof(proof).actor;config.actors[index]={...actor,profile,proof};save();continue;
  }
  if(index<2&&!config.credentials[index].registered){
    try{user=await remote.register(credential.account,credential.password,credential.username);config.credentials[index].registered=true;save();}
    catch(error){if(error.code!=='ACCOUNT_EXISTS')throw error;config.credentials[index].registered=true;save();}
  }
  user||=await remote.login(credential.account,credential.password);writeFileSync(sessionFile,user.proof);
  const actor=decodeProof(user.proof).actor;config.actors[index]={...actor,profile,proof:user.proof};save();
}
const request={purpose:'coordinator-only discovery location_test_grants',scenarioId:config.scenarioId,projectRef:'jbvrdmrkwpznbrvteive',source:'simulated',worldNamespace:`qa:${config.scenarioId}:territory:`,actors:config.actors.slice(0,2).map(({authUserId,ownerAccountId,deviceId,sessionId})=>({authUserId,ownerAccountId,deviceId,sessionId})),requestedDurationMinutes:90};
writeFileSync(join(config.output,'location-grant-request.json'),JSON.stringify(request,null,2)+'\n');
console.log(JSON.stringify({prepared:true,config:file,output:config.output,locationGrantRequest:join(config.output,'location-grant-request.json'),actors:request.actors,thirdClientSameAccount:config.actors[2].ownerAccountId===config.actors[0].ownerAccountId,remoteSqlWrites:false}));
