// Real HTTPS service validator; credentials are inherited privately and never written or printed.
// Run under Electron's Node ABI. Requires coordinator-deployed Auth/Storage and three legitimate sessions.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const root=process.cwd(),require=createRequire(path.join(root,'package.json'));
const {createClient}=require('@supabase/supabase-js'),Database=require('better-sqlite3');
const {ResourcesService}=require('../service.cjs'),{migrations}=require('../repository.cjs');
const {ResourceCloudSync}=require('../cloud-sync.cjs'),{hash,identity,BUCKET,TABLE}=require('../cloud-contract.cjs');
if(!process.argv.includes('--live'))throw Error('Explicit --live and coordinator-provided authenticated sessions are required');
const configFile=process.env.LJ_STORAGE_PUBLIC_CONFIG;
if(!configFile)throw Error('LJ_STORAGE_PUBLIC_CONFIG is required; do not put keys in command-line arguments');
const config=JSON.parse(await fs.readFile(configFile,'utf8'));
const url=config.supabaseUrl??config.url,publishable=config.publishableKey??config.supabasePublishableKey;
if(url!=='https://jbvrdmrkwpznbrvteive.supabase.co'||typeof publishable!=='string'||!publishable.startsWith('sb_publishable_'))throw Error('Coordinator-verified modern public config for the exact target project is required');
const directory=path.join(root,'artifacts/resources/cloud-live',new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID());await fs.mkdir(directory,{recursive:true});
const report={at:new Date().toISOString(),projectRef:'jbvrdmrkwpznbrvteive',dataSource:{authority:'live',simulated:false,transport:'actual Supabase HTTPS with official SDK',topology:'Two isolated SQLite client roots in one validator process; not dual Electron or two physical devices'},clients:[],passed:false};
const opened=[];
async function actorFor(label){
  const token=process.env[`LJ_STORAGE_${label}_ACCESS_TOKEN`],deviceId=process.env[`LJ_STORAGE_${label}_DEVICE_ID`];
  if(!token||!deviceId)throw Object.assign(new Error('Legitimate Auth token and already registered device are required'),{code:'LIVE_SESSION_REQUIRED'});
  const client=createClient(url,publishable,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:'Bearer '+token,'X-Lingjing-Device-Id':deviceId}}});
  const {data:user,error:userError}=await client.auth.getUser(token);
  if(userError||!user?.user||user.user.is_anonymous)throw Object.assign(new Error('Live Auth user verification failed'),{code:'LIVE_AUTH_INVALID'});
  const {data,error}=await client.rpc('lingjing_actor_context',{p_device_id:deviceId});
  if(error||data?.authUserId!==user.user.id||data?.deviceId!==deviceId)throw Object.assign(new Error('08 actor/device context was not verified'),{code:'LIVE_ACTOR_INVALID'});
  return identity(Object.assign(Object.create(null),data,{client}),data.ownerAccountId);
}
async function local(label,actor){
  const profile=path.join(directory,label);await fs.mkdir(profile);
  const db=new Database(path.join(profile,'lingjing.sqlite'));opened.push(db);for(const migration of migrations)db.exec(migration.sql);
  const service=new ResourcesService({db,storageRoot:path.join(profile,'managed'),seedBuiltin:false});await service.seed();
  return {db,service,cloud:new ResourceCloudSync({service,getActor:()=>actorFor(label)})};
}
try{
  const a=await actorFor('A'),b=await actorFor('B'),other=await actorFor('OTHER');
  assert.equal(a.authUserId,b.authUserId);assert.equal(a.ownerAccountId,b.ownerAccountId);assert.notEqual(a.deviceId,b.deviceId);assert.notEqual(a.sessionId,b.sessionId);assert.notEqual(other.authUserId,a.authUserId);assert.notEqual(other.ownerAccountId,a.ownerAccountId);
  report.clients=[['A',a],['B',b],['OTHER',other]].map(([label,actor])=>({label,ownerAccountId:actor.ownerAccountId,authUserId:actor.authUserId,deviceId:actor.deviceId,sessionId:actor.sessionId}));
  const clientA=await local('A',a),clientB=await local('B',b);
  const source=path.join(root,'apps/pc-app/runtime/features/resources/assets/roster-v2/qingya/character.json');
  const imported=await clientA.service.importFile(a.ownerAccountId,source),id=imported.resource.id;
  clientA.cloud.enqueue(a.ownerAccountId,randomUUID(),[id]);const upload=await clientA.cloud.flush(a.ownerAccountId);
  assert.equal(upload.verified.length,1);assert.equal(upload.errors.length,0);
  const pulled=await clientB.cloud.pull(b.ownerAccountId,{resourceIds:[id]});assert.equal(pulled.restored.length,1);
  const actual=await clientB.service.get(b.ownerAccountId,id);assert.equal(actual.contentHash,imported.resource.contentHash);assert.equal(actual.availability,'ready');
  const fileEvidence=[];for(const file of clientA.service.repository.files(a.ownerAccountId,id)){
    const bytesA=await fs.readFile(await clientA.service.assetFile(a.ownerAccountId,id,file.asset_key)),bytesB=await fs.readFile(await clientB.service.assetFile(b.ownerAccountId,id,file.asset_key));assert.equal(hash(bytesA),hash(bytesB));fileEvidence.push({key:file.asset_key,bytes:bytesA.length,sha256A:hash(bytesA),sha256B:hash(bytesB)});
  }
  const digest=upload.verified[0].manifestSha256,object=`${a.authUserId}/${id}/${digest}/manifest.json`;
  const denied=await other.client.storage.from(BUCKET).download(object);assert(denied.error,'Other-account Storage download unexpectedly succeeded');
  const crossIndex=await other.client.from(TABLE).select('resource_id').eq('auth_user_id',a.authUserId).eq('resource_id',id);assert.ifError(crossIndex.error);assert.deepEqual(crossIndex.data,[]);
  const ownIndex=await b.client.from(TABLE).select('*').eq('auth_user_id',a.authUserId).eq('resource_id',id);assert.ifError(ownIndex.error);assert.equal(ownIndex.data.length,1);
  report.resourceId=id;report.contentHash=actual.contentHash;report.manifestSha256=digest;report.files=fileEvidence;
  report.upload=upload.verified;report.download=pulled.restored;report.otherAccount={storageDenied:true,status:String(denied.error.statusCode??denied.error.status??'denied'),indexRows:crossIndex.data.length};
  report.sqlite={a:clientA.db.prepare('select count(*) n from lingjing_resources').get().n,b:clientB.db.prepare('select count(*) n from lingjing_resources').get().n};
  report.passed=true;
}catch(error){report.failure={code:error.code||'LIVE_RESOURCE_CHECK_FAILED',name:error.name};throw error;}
finally{for(const db of opened)db.close();await fs.writeFile(path.join(directory,'evidence.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,evidence:path.relative(root,path.join(directory,'evidence.json')),resourceId:report.resourceId??null}));}
