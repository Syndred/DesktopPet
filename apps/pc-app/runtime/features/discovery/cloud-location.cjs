const {createHash,createPrivateKey,createPublicKey,generateKeyPairSync,sign}=require('node:crypto');
const {mkdirSync,readFileSync,writeFileSync,existsSync}=require('node:fs');
const {join}=require('node:path');
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?`[${value.map(canonical).join(',')}]`:`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const actorKey=actor=>[actor.authUserId,actor.ownerAccountId,actor.deviceId,actor.sessionId].join('\0');
const secureStorageAvailable=storage=>{try{return Boolean(storage?.isEncryptionAvailable?.())&&storage.getSelectedStorageBackend?.()!=='basic_text';}catch{return false;}};

/** Main-process-only signer. There is no IPC method accepting coordinates or
 * exposing this key. getFix is the existing privacy/quality guarded OS service. */
class CloudLocationProofs {
  constructor({authority,getFix,safeStorage,userData}) {this.authority=authority;this.getFix=getFix;this.safeStorage=safeStorage;this.userData=userData;this.keys=new Map();this.registered=new Set();}
  privateKey(actor) {
    if(!secureStorageAvailable(this.safeStorage))fail('CLOUD_DEVICE_KEY_UNAVAILABLE','系统安全存储暂不可用');
    const id=createHash('sha256').update([actor.authUserId,actor.ownerAccountId,actor.deviceId].join('\0')).digest('hex');
    if(this.keys.has(id))return this.keys.get(id);
    const directory=join(this.userData,'secure','discovery'),file=join(directory,`${id}.key`);
    let key;
    if(existsSync(file)) {
      try{key=createPrivateKey(this.safeStorage.decryptString(readFileSync(file)));}catch{fail('CLOUD_DEVICE_KEY_UNAVAILABLE','设备定位密钥无法读取');}
    } else {
      key=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey;
      const pem=key.export({type:'pkcs8',format:'pem'});mkdirSync(directory,{recursive:true});
      try{writeFileSync(file,this.safeStorage.encryptString(pem),{flag:'wx',mode:0o600});}
      catch(error){if(error.code!=='EEXIST')throw error;key=createPrivateKey(this.safeStorage.decryptString(readFileSync(file)));}
    }
    this.keys.set(id,key);return key;
  }
  async prove(purpose,reference='') {
    if(!['discover','begin','capture','territory:read','territory:challenge','territory:settle'].includes(purpose)||typeof reference!=='string'||reference.length>180)fail('LOCATION_PURPOSE_INVALID','定位用途无效');
    const actor=await this.authority.getActor();
    if(!actor?.authUserId||!actor.ownerAccountId||!actor.deviceId||!actor.sessionId)fail('CLOUD_AUTH_REQUIRED','请先登录云端账号');
    const fix=this.getFix(),key=this.privateKey(actor),jwk=createPublicKey(key).export({format:'jwk'});
    const publicJwk={kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y};
    const registration=[actor.authUserId,actor.ownerAccountId,actor.deviceId,canonical(publicJwk)].join('\0');
    if(!this.registered.has(registration)){await this.authority.invoke('device.register',{publicJwk});this.registered.add(registration);}
    const challenge=await this.authority.invoke('location.challenge',{purpose,reference});
    for(const field of ['authUserId','ownerAccountId','deviceId','sessionId'])if(challenge[field]!==actor[field])fail('LOCATION_OWNER_MISMATCH','定位许可不属于当前设备');
    if(actorKey(await this.authority.getActor())!==actorKey(actor))fail('AUTH_CHANGED','账号已切换');
    const signedFix={lat:fix.lat,lng:fix.lng,accuracyMeters:fix.accuracyMeters,timestampMs:fix.timestampMs,coordinateSystem:fix.coordinateSystem,source:fix.source,provider:fix.provider,
      ...(fix.positionSource?{positionSource:fix.positionSource}:{}),...(fix.source==='simulated'?{scenarioId:fix.scenarioId}:{})};
    const envelope={protocol:'lingjing-discovery-v2',authUserId:actor.authUserId,ownerAccountId:actor.ownerAccountId,deviceId:actor.deviceId,sessionId:actor.sessionId,
      challengeId:challenge.id,nonce:challenge.nonce,purpose:challenge.purpose,reference:challenge.reference||'',fix:signedFix};
    const signature=sign('sha256',Buffer.from(canonical(envelope)),{key,dsaEncoding:'ieee-p1363'}).toString('base64url');
    const result=await this.authority.invoke('location.prove',{challengeId:challenge.id,fix:signedFix,signature});
    if(actorKey(await this.authority.getActor())!==actorKey(actor))fail('AUTH_CHANGED','账号已切换');
    return result;
  }
  clear(){this.keys.clear();this.registered.clear();}
}
module.exports={CloudLocationProofs};
