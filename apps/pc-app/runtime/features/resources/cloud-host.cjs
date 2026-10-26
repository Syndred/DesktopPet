const { randomUUID } = require('node:crypto');
const { ResourceError } = require('./parser.cjs');
const { ResourceCloudSync } = require('./cloud-sync.cjs');

/** The accounts capability is main-only. No renderer-provided owner, client or JWT is accepted. */
function registerResourceCloud(services, service) {
  const enabled = owner => services.get('accounts')?.settings(owner)?.document?.sync?.enabled === true && !services.get('qaIdentity');
  const cloud = new ResourceCloudSync({service,isEnabled:enabled,getActorGeneration:()=>services.get('accounts')?.epoch,
    async getActor(owner) {
      if(services.session.getOwnerAccountId()!==owner)throw new ResourceError('SESSION_CHANGED','账号已切换');
      const auth=services.get('cloudActor');
      if(typeof auth?.requireActor!=='function')throw new ResourceError('RESOURCE_CLOUD_AUTH_REQUIRED','云端身份服务尚未就绪');
      const actor=await auth.requireActor();
      if(services.session.getOwnerAccountId()!==owner||actor.ownerAccountId!==owner)throw new ResourceError('SESSION_CHANGED','账号已切换');
      return actor;
    },
    onChanged(owner,resourceId){services.events.emit('resources:changed',{ownerAccountId:owner,resourceId});}
  });
  service.cloud=cloud;services.provide('resourceCloud',cloud);
  let disposed=false;const running=new Set();
  async function pump(seed=false) {
    const owner=services.session.getOwnerAccountId();
    if(disposed||!owner||!enabled(owner)||running.has(owner))return;
    running.add(owner);
    try {
      await service.ready;
      if(seed){cloud.enqueue(owner,randomUUID());cloud.preferences.enqueue(owner);}
      await cloud.flush(owner);
      let offset=0;
      do{const batch=await cloud.pull(owner,{offset});if(batch.busy)break;offset=batch.nextOffset;}while(offset!==null&&!disposed&&services.session.getOwnerAccountId()===owner);
      services.events.emit('resources:cloud-status',{ownerAccountId:owner,...cloud.status(owner)});
    }catch(error){services.events.emit('resources:cloud-status',{ownerAccountId:owner,lastError:error.code||'RESOURCE_CLOUD_UNAVAILABLE'});}
    finally{running.delete(owner);}
  }
  const listeners=['accounts:session-changed','accounts:settings-changed','accounts:save-restored'].map(event=>services.events.on(event,()=>{void pump(true);}));
  const timer=setInterval(()=>{void pump();},30000);timer.unref?.();
  void service.ready.then(()=>pump(true)).catch(()=>{});
  return {cloud,changed(owner,resource,preferenceChange=false){if(enabled(owner)){if(preferenceChange)cloud.preferences.enqueue(owner,[resource.id]);else if(resource.origin==='import')cloud.enqueue(owner,randomUUID(),[resource.id]);void pump();}},
    dispose(){disposed=true;clearInterval(timer);for(const off of listeners)off();}};
}
module.exports={registerResourceCloud};
