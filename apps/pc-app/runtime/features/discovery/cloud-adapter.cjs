const PROTOCOL='lingjing-discovery-v2';
const fail=(code,message,extra={})=>{throw Object.assign(new Error(message),{code,...extra});};
const sameActor=actor=>[actor.authUserId,actor.ownerAccountId,actor.deviceId,actor.sessionId].join('\0');
// Only consumes08's verified main-process capability. JWT headers, refresh,
// request transport and logout epochs remain owned by cloudActor.
class CloudDiscoveryAuthority {
  constructor({requireActor,projectRef='jbvrdmrkwpznbrvteive'}={}) {
    this.requireActor=requireActor;this.projectRef=projectRef;this.protocolChecks=new Map();
  }
  async session() {
    const context=await this.requireActor?.(),actor=context?.actor||context;
    if(actor?.schemaVersion!==1||actor.authority!=='live'||actor.authKind!=='supabase'||!actor.authUserId||!actor.ownerAccountId||!actor.deviceId||!actor.sessionId
      ||typeof context.invoke!=='function')fail('CLOUD_AUTH_REQUIRED','请先登录统一云端账号');
    let target;try{target=new URL(context.url);}catch{fail('CLOUD_NOT_CONFIGURED','云端探索地址未配置');}
    if(target.protocol!=='https:')fail('CLOUD_TLS_REQUIRED','云端探索需要HTTPS连接');
    if(target.hostname!==`${this.projectRef}.supabase.co`||target.pathname!=='/'||target.search||target.hash||target.username||target.password)fail('CLOUD_PROJECT_MISMATCH','云端探索目标项目不匹配');
    if(typeof context.publishableKey!=='string'||!context.publishableKey.startsWith('sb_publishable_'))fail('CLOUD_NOT_CONFIGURED','云端探索尚未配置');
    return {context,actor};
  }
  async getActor(){return (await this.session()).actor;}
  async checkProtocol(context,actor) {
    const key=sameActor(actor);
    if(!this.protocolChecks.has(key)) {
      const check=context.invoke('discovery',{op:'protocol'}).then(data=>{
        if(data?.protocol!==PROTOCOL)fail('CLOUD_PROTOCOL_MISMATCH','云端探索协议版本不匹配');return data;
      }).catch(error=>{this.protocolChecks.delete(key);throw error;});
      this.protocolChecks.set(key,check);
    }
    return this.protocolChecks.get(key);
  }
  async invoke(op,input={}) {
    // No owner, old session_token or service credential is serialized in bodies.
    for(const field of ['actor','authUserId','authUid','owner','ownerAccountId','deviceId','sessionId','userId','sessionToken','session_token','allowSimulatedLocation','winner','battle','pet','reward','rewards','experience','captureMultiplier','globalSerial','namespace','entityKey','templateId'])if(Object.hasOwn(input,field))fail('CLIENT_AUTHORITY_FORBIDDEN','请求包含不受信任的权威字段');
    const {context,actor}=await this.session();
    const protocol=await this.checkProtocol(context,actor);
    const data=op==='protocol'?protocol:await context.invoke('discovery',{...input,op});
    if(sameActor((await this.session()).actor)!==sameActor(actor))fail('AUTH_CHANGED','账号已切换，原请求可在原账号读回',{uncertain:true});
    return data;
  }
  observe({spawnId,proofId}){return this.invoke('observe',{spawnId,proofId});}
  reserve({spawnId,petId,proofId,actionId}){return this.invoke('reserve',{spawnId,petId,proofId,actionId});}
  act({permitId,action,expectedRound,actionId}){return this.invoke('act',{permitId,action,expectedRound,actionId});}
  confirm({permitId,proofId,name,actionId}){return this.invoke('confirm',{permitId,proofId,name,actionId});}
  sessionFor(permitId){return this.invoke('session',{permitId});}
  cancel({permitId,actionId}){return this.invoke('cancel',{permitId,actionId});}
  captures(){return this.invoke('captures');}
  action(actionId){return this.invoke('action',{actionId});}
  clear(){this.protocolChecks.clear();}
}
module.exports={CloudDiscoveryAuthority,PROTOCOL};
