class CloudDiscoveryAuthority {
  constructor({getUser,url=process.env.SUPABASE_URL,anonKey=process.env.SUPABASE_ANON_KEY,fetcher=fetch}={}) {this.getUser=getUser;this.url=url;this.anonKey=anonKey;this.fetcher=fetcher;}
  async invoke(op,input) {
    const user=this.getUser?.();
    if(!user?.id||!user.sessionToken) throw Object.assign(new Error('请登录云端账号后重试'),{code:'CLOUD_AUTH_REQUIRED'});
    if(!this.url||!this.anonKey) throw Object.assign(new Error('尚未配置云端探索服务，收服进度仍保存在本机'),{code:'CLOUD_NOT_CONFIGURED'});
    // New cloud endpoints require TLS. Never send session credentials to the legacy HTTP fallback.
    if(!/^https:\/\//i.test(this.url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(this.url)) throw Object.assign(new Error('云端探索需要 HTTPS 连接'),{code:'CLOUD_TLS_REQUIRED'});
    let response;
    try {response=await this.fetcher(`${this.url.replace(/\/$/,'')}/functions/v1/discovery`,{method:'POST',headers:{'content-type':'application/json',apikey:this.anonKey,authorization:`Bearer ${this.anonKey}`},body:JSON.stringify({op,...input,userId:user.id,sessionToken:user.sessionToken}),signal:AbortSignal.timeout(15000)});}
    catch {throw Object.assign(new Error('暂时无法连接云端探索服务，可稍后恢复进度'),{code:'CLOUD_UNAVAILABLE'});}
    let result; try {result=await response.json();} catch {result=null;}
    if(!response.ok||!result?.ok) throw Object.assign(new Error(result?.error?.message||'云端探索服务尚未就绪'),{code:result?.error?.code||'CLOUD_UNAVAILABLE'});
    return result.data;
  }
  reserve(input) {return this.invoke('reserve',input);}
  act(input) {return this.invoke('act',input);}
  confirm({encounter,fix,permit,actionId}) {return this.invoke('confirm',{permitId:permit?.id,spawnId:encounter.spawn.id,fix,actionId});}
}
module.exports={CloudDiscoveryAuthority};
