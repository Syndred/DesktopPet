const PROTOCOL='lingjing-discovery-v2';
const fail=(code,message,extra={})=>{throw Object.assign(new Error(message),{code,...extra});};
const sameActor=actor=>[actor.authUserId,actor.ownerAccountId,actor.deviceId,actor.sessionId].join('\0');
class CloudDiscoveryAuthority {
  constructor({getSession,url=process.env.SUPABASE_URL,publishableKey=process.env.SUPABASE_PUBLISHABLE_KEY,projectRef='jbvrdmrkwpznbrvteive',fetcher=fetch}={}) {
    this.getSession=getSession;this.url=url||`https://${projectRef}.supabase.co`;this.publishableKey=publishableKey;this.anonKey=publishableKey;this.projectRef=projectRef;this.fetcher=fetcher;
  }
  async session() {
    const value=await this.getSession?.(),actor=value?.actor;
    if(actor?.schemaVersion!==1||actor.authority!=='live'||actor.authKind!=='supabase'||!actor.authUserId||!actor.ownerAccountId||!actor.deviceId||!actor.sessionId
      ||typeof value.accessToken!=='string'||!/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]+\.[-_A-Za-z0-9]+$/.test(value.accessToken))fail('CLOUD_AUTH_REQUIRED','请先登录统一云端账号');
    return value;
  }
  async getActor(){return (await this.session()).actor;}
  endpoint() {
    let target;try{target=new URL(this.url);}catch{fail('CLOUD_NOT_CONFIGURED','云端探索地址未配置');}
    if(target.protocol!=='https:')fail('CLOUD_TLS_REQUIRED','云端探索需要HTTPS连接');
    if(target.hostname!==`${this.projectRef}.supabase.co`||!['','/'].includes(target.pathname)||target.search||target.hash||target.username||target.password)fail('CLOUD_PROJECT_MISMATCH','云端探索目标项目不匹配');
    if(typeof this.publishableKey!=='string'||!this.publishableKey.startsWith('sb_publishable_'))fail('CLOUD_NOT_CONFIGURED','云端探索尚未配置');
    return `${target.origin}/functions/v1/discovery`;
  }
  async invoke(op,input={}) {
    const current=await this.session(),endpoint=this.endpoint();
    // No owner, old session_token or service credential is serialized in bodies.
    for(const field of ['actor','authUserId','authUid','owner','ownerAccountId','deviceId','sessionId','userId','sessionToken','session_token','winner','battle','pet','reward','rewards','experience','captureMultiplier'])if(Object.hasOwn(input,field))fail('CLIENT_AUTHORITY_FORBIDDEN','请求包含不受信任的权威字段');
    let response;
    try{response=await this.fetcher(endpoint,{method:'POST',headers:{'content-type':'application/json',apikey:this.publishableKey,authorization:`Bearer ${current.accessToken}`,'x-lingjing-device-id':current.actor.deviceId},body:JSON.stringify({...input,op}),signal:AbortSignal.timeout(15000)});}
    catch{fail('CLOUD_UNAVAILABLE','暂时无法连接云端探索，可按原操作编号读回',{uncertain:true});}
    let result;try{result=await response.json();}catch{fail('CLOUD_RESPONSE_INVALID','云端探索响应无效',{uncertain:true});}
    if(!response.ok||!result?.ok)fail(result?.code||result?.error?.code||(response.status===401?'CLOUD_AUTH_INVALID':'CLOUD_UNAVAILABLE'),result?.message||result?.error?.message||'云端探索请求未完成',{httpStatus:response.status});
    if(result.protocol!==PROTOCOL)fail('CLOUD_PROTOCOL_MISMATCH','云端探索协议版本不匹配');
    if(sameActor((await this.session()).actor)!==sameActor(current.actor))fail('AUTH_CHANGED','账号已切换，原请求可在原账号读回',{uncertain:true});
    return result.data;
  }
  reserve({spawnId,petId,proofId,actionId}){return this.invoke('reserve',{spawnId,petId,proofId,actionId});}
  act({permitId,action,expectedRound,actionId}){return this.invoke('act',{permitId,action,expectedRound,actionId});}
  confirm({permitId,proofId,name,actionId}){return this.invoke('confirm',{permitId,proofId,name,actionId});}
  sessionFor(permitId){return this.invoke('session',{permitId});}
  cancel({permitId,actionId}){return this.invoke('cancel',{permitId,actionId});}
  captures(){return this.invoke('captures');}
  action(actionId){return this.invoke('action',{actionId});}
}
module.exports={CloudDiscoveryAuthority,PROTOCOL};
