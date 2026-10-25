const { randomUUID } = require('node:crypto');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { AccountError, invariant } = require('./errors.cjs');
const { writeNew } = require('./util.cjs');
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const messages={INVALID_CREDENTIALS:'账号或密码不正确。',INVALID_OLD_PASSWORD:'当前密码不正确。',ACCOUNT_EXISTS:'账号已存在。',
  SYNC_CONFLICT:'云端已有较新存档，原存档和待同步记录已保留，请先预览。',ACTION_ID_REUSED:'操作标识已经用于不同的内容。',
  PROTECTED_STATE_REQUIRES_AUTHORITY:'原始本地进度需要可信来源核验，已保留原档。',PROTECTED_STATE_MISMATCH:'云端玩法数据已更新，请先读回。',
  AUTH_RATE_LIMITED:'尝试过于频繁，请稍后重试。',SESSION_INVALIDATED:'此设备登录已失效，请重新登录。'};
function failure(code,message){return new AccountError(code,messages[code]||message||'云端请求未完成，原数据已保留。');}

function publicConfig({env=process.env,resourcesPath=process.resourcesPath}={}){
  let value={};
  const file=env.LINGJING_PUBLIC_CONFIG||(resourcesPath&&join(resourcesPath,'lingjing-cloud-public.json'));
  if(file&&existsSync(file)){
    try{value=JSON.parse(readFileSync(file,'utf8'));}catch{throw failure('CLOUD_CONFIG_INVALID');}
  }
  const url=env.LINGJING_SUPABASE_URL||env.SUPABASE_URL||value.url||value.supabaseUrl||value.supabase_url;
  const key=env.LINGJING_SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_PUBLISHABLE_KEY||value.publishableKey||value.publishable_key;
  if(!key&&!url)return null;
  // An old self-hosted URL or anon token cannot silently select the new protocol.
  if(!key)return null;
  let parsed;try{parsed=new URL(url);}catch{throw failure('CLOUD_CONFIG_INVALID');}
  invariant(parsed.protocol==='https:'&&!parsed.username&&!parsed.password&&!parsed.search&&!parsed.hash
    &&parsed.pathname==='/'&&typeof key==='string'&&key.startsWith('sb_publishable_'),'CLOUD_CONFIG_INVALID','云端公开配置无效。');
  return {url:parsed.origin,key};
}
function stableDevice(userData){
  const file=join(userData,'accounts','device.json');
  if(!existsSync(file))try{writeNew(file,JSON.stringify({version:1,deviceId:randomUUID()}));}catch(error){if(error.code!=='EEXIST')throw error;}
  let data;try{data=JSON.parse(readFileSync(file,'utf8'));}catch{throw failure('DEVICE_ID_INVALID');}
  invariant(data.version===1&&uuid(data.deviceId),'DEVICE_ID_INVALID','设备标识损坏，原文件已保留。');return data.deviceId.toLowerCase();
}
function decodeProof(value){
  let proof;try{proof=JSON.parse(value);}catch{throw failure('CLOUD_AUTH_UPGRADE_REQUIRED','旧登录凭据已保留，请使用原密码登录升级后的云端。');}
  invariant(proof?.version===2&&proof.authKind==='supabase'&&proof.actor?.authKind==='supabase'
    &&proof.actor.authority==='live'&&typeof proof.actor.ownerAccountId==='string'&&proof.actor.ownerAccountId
    &&uuid(proof.actor.authUserId)&&uuid(proof.actor.deviceId)&&uuid(proof.actor.sessionId)
    &&typeof proof.accessToken==='string'&&proof.accessToken.length>0&&proof.accessToken.length<=32768
    &&typeof proof.refreshToken==='string'&&proof.refreshToken.length>0&&proof.refreshToken.length<=4096
    &&Number.isFinite(proof.expiresAt),'INVALID_CLOUD_IDENTITY','云端登录身份不完整。');return proof;
}
function normalized(bundle){
  const user=bundle?.currentUser,actor=bundle?.actor,tokens=bundle?.tokens;
  invariant(user?.id===actor?.ownerAccountId&&user?.authUserId===actor?.authUserId&&actor?.schemaVersion===1
    &&tokens?.deviceId===actor?.deviceId&&tokens?.sessionId===actor?.sessionId,'INVALID_CLOUD_IDENTITY','云端账号映射不完整。');
  const proof=JSON.stringify({version:2,authKind:'supabase',actor,accessToken:tokens.accessToken,refreshToken:tokens.refreshToken,expiresAt:tokens.expiresAt});decodeProof(proof);
  return {...user,authKind:'supabase',proof};
}

/** Main-process only. Auth SDK runs in the username bridge; no JWT/refresh token
 * enters a renderer event, localStorage, ordinary SQLite column or old HTTP. */
class SupabaseRemote {
  constructor({userData,config=publicConfig(),fetcher=globalThis.fetch,deviceId,now=Date.now}={}){
    this.enabled=Boolean(config);this.authKind='supabase';this.config=config;this.fetcher=fetcher;this.now=now;
    this.deviceId=deviceId||stableDevice(userData);this.active=null;this.refreshing=new Map();this.proofListeners=new Set();this.invalidListeners=new Set();
    invariant(uuid(this.deviceId),'DEVICE_ID_INVALID','设备标识无效。');
  }
  async request(name,body,proof){
    invariant(this.enabled,'CLOUD_UNAVAILABLE','云端公开配置尚未安装。');
    invariant(/^[a-z][a-z0-9-]{0,62}$/.test(name)&&!['duel-online','accounts-sync'].includes(name),'CLOUD_PROTOCOL_UPGRADE_REQUIRED','该模块需要升级后的云端接口。');
    let response;try{response=await this.fetcher(`${this.config.url}/functions/v1/${name}`,{method:'POST',headers:{apikey:this.config.key,
      'Content-Type':'application/json','X-Lingjing-Device-Id':this.deviceId,...(proof?{Authorization:`Bearer ${proof.accessToken}`}:{})},
      body:JSON.stringify(body),signal:AbortSignal.timeout(30_000)});}catch{throw failure('CLOUD_UNAVAILABLE','云端连接失败，待同步记录已保留。');}
    let payload;try{payload=await response.json();}catch{throw failure('CLOUD_UNAVAILABLE');}
    if(!response.ok||payload?.ok!==true){const code=typeof payload?.code==='string'?payload.code:'CLOUD_UNAVAILABLE';const error=failure(code);error.httpStatus=response.status;throw error;}
    return payload.data;
  }
  async authenticate(op,account,password,username){return normalized(await this.request('lingjing-auth',{op,account,password,username,confirmPassword:password,deviceLabel:'Windows 灵境'}));}
  login(account,password){return this.authenticate('login',account,password);}
  register(account,password,username){return this.authenticate('register',account,password,username);}
  proofFor(session){
    const proof=decodeProof(session?.cloudProof||session?.proof);
    invariant(proof.actor.deviceId===this.deviceId&&proof.actor.ownerAccountId===(session.ownerAccountId||session.id),'INVALID_CLOUD_IDENTITY','凭据与当前设备或账号不匹配。');
    if(this.active?.actor.ownerAccountId===proof.actor.ownerAccountId&&this.active.actor.sessionId===proof.actor.sessionId)return this.active;
    return proof;
  }
  setCurrentUser(session){
    if(!session){this.active=null;return;}
    const proof=decodeProof(session.cloudProof||session.proof);
    invariant(proof.actor.deviceId===this.deviceId&&proof.actor.ownerAccountId===(session.ownerAccountId||session.id),'INVALID_CLOUD_IDENTITY','凭据与当前设备或账号不匹配。');this.active=proof;
  }
  onInvalidated(listener){this.invalidListeners.add(listener);return()=>this.invalidListeners.delete(listener);}
  onProofChanged(listener){this.proofListeners.add(listener);return()=>this.proofListeners.delete(listener);}
  async refresh(proof){
    const sid=proof.actor.sessionId;
    if(this.refreshing.has(sid))return this.refreshing.get(sid);
    const pending=(async()=>{
      let bundle;try{bundle=await this.request('lingjing-auth',{op:'refresh',refreshToken:proof.refreshToken,deviceLabel:'Windows 灵境'});}
      catch(error){if(error.httpStatus===401)throw failure('SESSION_INVALIDATED');throw error;}
      const user=normalized(bundle),next=decodeProof(user.proof);
      invariant(next.actor.ownerAccountId===proof.actor.ownerAccountId&&next.actor.authUserId===proof.actor.authUserId
        &&next.actor.deviceId===this.deviceId&&next.actor.sessionId===sid,'IDENTITY_CONFLICT','刷新返回了不同的账号，原存档已保留。');
      if(this.active?.actor.sessionId===sid&&this.active.actor.ownerAccountId===proof.actor.ownerAccountId){
        const previousProof=JSON.stringify(this.active);this.active=next;
        for(const listener of this.proofListeners)listener({ownerAccountId:next.actor.ownerAccountId,previousProof,proof:user.proof});
      }
      return next;
    })();this.refreshing.set(sid,pending);try{return await pending;}finally{this.refreshing.delete(sid);}
  }
  async fresh(session){
    const proof=this.proofFor(session);
    try{return proof.expiresAt<=this.now()/1000+60?await this.refresh(proof):proof;}catch(error){
      if(error.code==='SESSION_INVALIDATED'&&this.active?.actor.sessionId===proof.actor.sessionId)
        for(const listener of this.invalidListeners)listener({userId:proof.actor.ownerAccountId,sessionId:proof.actor.sessionId});
      throw error;
    }
  }
  async invoke(session,name,body){
    const requested=decodeProof(session?.cloudProof||session?.proof);
    const unchanged=()=>invariant(this.active?.actor.sessionId===requested.actor.sessionId&&this.active.actor.ownerAccountId===requested.actor.ownerAccountId,
      'SESSION_CHANGED','登录状态已经变化，请重新操作。');
    unchanged();
    let proof=await this.fresh(session);
    try{const data=await this.request(name,body,proof);unchanged();return data;}catch(error){
      if(error.httpStatus!==401)throw error;
      try{unchanged();proof=await this.refresh(proof);const data=await this.request(name,body,proof);unchanged();return data;}catch(next){
        if(next.httpStatus===401||next.code==='SESSION_INVALIDATED'){
          if(this.active?.actor.sessionId===proof.actor.sessionId)for(const listener of this.invalidListeners)listener({userId:proof.actor.ownerAccountId,sessionId:proof.actor.sessionId});
          throw failure('SESSION_INVALIDATED');
        }throw next;
      }
    }
  }
  async verify(user){
    const session={...user,ownerAccountId:user.ownerAccountId||user.id};let proof=await this.fresh(session);
    let reply;
    try{reply=await this.request('lingjing-auth',{op:'actor'},proof);}catch(error){if(error.httpStatus!==401)throw error;proof=await this.refresh(proof);reply=await this.request('lingjing-auth',{op:'actor'},proof);}
    invariant(reply?.actor?.ownerAccountId===proof.actor.ownerAccountId&&reply.actor.authUserId===proof.actor.authUserId,'IDENTITY_CONFLICT','云端映射与原账号不一致。');
    proof={...proof,actor:reply.actor};
    return {...user,account:reply.actor.account,username:reply.actor.username,authKind:'supabase',authUserId:proof.actor.authUserId,proof:JSON.stringify(proof)};
  }
  async update(session,changes){
    if(changes.newPassword)return normalized(await this.invoke(session,'lingjing-auth',{op:'password',oldPassword:changes.oldPassword,newPassword:changes.newPassword,confirmPassword:changes.newPassword}));
    const data=await this.invoke(session,'lingjing-auth',{op:'profile',username:changes.username});
    const proof={...this.proofFor(session),actor:data.actor};
    return{id:proof.actor.ownerAccountId,account:proof.actor.account,username:proof.actor.username,authUserId:proof.actor.authUserId,authKind:'supabase',proof:JSON.stringify(proof)};
  }
  async signOut(session){
    if(!session?.cloudProof)return;
    let proof=decodeProof(session.cloudProof);
    if(this.active?.actor.sessionId===proof.actor.sessionId){proof=this.active;this.active=null;}
    if(proof.expiresAt<=this.now()/1000+5)proof=await this.refresh(proof);
    await this.request('lingjing-auth',{op:'logout'},proof);
  }
  cloudSave(op,session,payload={}){return this.invoke(session,'lingjing-save',{...payload,op});}
  async cloudContext(session){
    const proof=await this.fresh(session);const reply=await this.invoke(session,'lingjing-auth',{op:'actor'});
    invariant(reply.actor.ownerAccountId===proof.actor.ownerAccountId,'IDENTITY_CONFLICT','云端身份不匹配。');
    const context={...reply.actor,actor:Object.freeze({...reply.actor})};
    const {createClient}=require('@supabase/supabase-js');
    const current=this.proofFor(session),client=createClient(this.config.url,this.config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
      global:{headers:{Authorization:`Bearer ${current.accessToken}`,'X-Lingjing-Device-Id':this.deviceId}}});
    for(const [key,value] of Object.entries({client,accessToken:current.accessToken,url:this.config.url,publishableKey:this.config.key,
      invoke:(name,body)=>this.invoke(session,name,body)}))Object.defineProperty(context,key,{value,enumerable:false});
    return Object.freeze(context);
  }
}
module.exports={SupabaseRemote,publicConfig,stableDevice,decodeProof,normalized};
