// Explicit localhost fixture preparation for real Electron UI. Never accepts live Auth or normal profiles.
const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const Database=require('better-sqlite3'),{createClient}=require('@supabase/supabase-js');
const {ResourcesService}=require('../service.cjs'),{migrations}=require('../repository.cjs'),{ResourceCloudSync}=require('../cloud-sync.cjs');
const {migrate}=require('../../../core/database.cjs'),{hash}=require('../cloud-contract.cjs');
(async()=>{
  const root=process.cwd(),job=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
  if(job.simulated!==true||new URL(job.url).hostname!=='127.0.0.1'||!job.owner.startsWith('qa:'))throw Error('Only an explicit isolated local protocol fixture is accepted');
  const opened=[],clients=[];
  try{
    for(const label of ['A','B']){
      const profile=path.resolve(job[label]);if(!profile.startsWith(path.join(root,'artifacts/resources')+path.sep))throw Error('Profile escaped resource QA directory');
      const db=new Database(path.join(profile,'lingjing.sqlite'));opened.push(db);
      if(!db.prepare('select 1 from account_identities where owner_account_id=?').get(job.owner))throw Error('Fixture owner is not the actual QA account');
      migrate(db,'resources',migrations);
      const service=new ResourcesService({db,storageRoot:path.join(profile,'character-resources'),seedBuiltin:false});await service.seed();
      const actor={schemaVersion:1,authority:'simulated',authKind:'fixture',ownerAccountId:job.owner,authUserId:job.uid,deviceId:randomUUID(),sessionId:randomUUID()};
      actor.client=createClient(job.url,'fixture-publishable',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:'Bearer fixture-'+job.uid,'X-Lingjing-Device-Id':actor.deviceId}}});
      clients.push({db,service,actor,cloud:new ResourceCloudSync({service,getActor:async()=>actor,protocolFixture:true})});
    }
    const [a,b]=clients,imported=await a.service.importFile(job.owner,path.join(root,'apps/pc-app/runtime/features/resources/assets/roster-v2/qingya/character.json'));
    a.cloud.enqueue(job.owner,randomUUID(),[imported.resource.id]);const uploaded=await a.cloud.flush(job.owner);if(uploaded.verified.length!==1)throw Error('Fixture upload failed');
    const pulled=await b.cloud.pull(job.owner);if(pulled.restored.length!==1)throw Error('Fixture restore failed');
    const evidence={simulated:true,cloudVerified:false,resourceId:imported.resource.id,contentHash:imported.resource.contentHash,files:[]};
    for(const file of a.service.repository.files(job.owner,imported.resource.id)){
      const bytesA=await fs.readFile(await a.service.assetFile(job.owner,imported.resource.id,file.asset_key)),bytesB=await fs.readFile(await b.service.assetFile(job.owner,imported.resource.id,file.asset_key));
      if(hash(bytesA)!==hash(bytesB))throw Error('Restored bytes differ');evidence.files.push({key:file.asset_key,sha256A:hash(bytesA),sha256B:hash(bytesB)});
    }
    evidence.receipts=clients.map(c=>c.db.prepare('select direction,data_mode,count(*) n from lingjing_resource_cloud_receipts group by direction,data_mode').all());
    await fs.writeFile(job.output,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({prepared:true,resourceId:evidence.resourceId,simulated:true}));
  }finally{for(const db of opened)db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
