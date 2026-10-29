const {test}=require('node:test'),assert=require('node:assert/strict');
const {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,readdirSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os'),{join,basename}=require('node:path');
const {createHash,createPublicKey,sign,verify}=require('node:crypto');
const {CloudLocationProofs}=require('../cloud-location.cjs');
const actor={authUserId:'synthetic-user',ownerAccountId:'synthetic-owner',deviceId:'synthetic-device',sessionId:'synthetic-session'};
function fixture(t,backend='gnome_libsecret'){
 const userData=mkdtempSync(join(tmpdir(),'location-storage-contract-'));t.after(()=>rmSync(userData,{recursive:true,force:true}));
 const calls={encrypt:0,decrypt:0,invoke:0};
 // Synthetic codec only; real EC keys, no native encryption or network claims.
 const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>{calls.encrypt++;return Buffer.from(s);},decryptString:b=>{calls.decrypt++;return b.toString();}};
 if(backend!==undefined)safeStorage.getSelectedStorageBackend=()=>backend;
 const authority={getActor:async()=>actor,invoke:async()=>{calls.invoke++;throw Error('must not contact authority');}};
 const signer=new CloudLocationProofs({authority,getFix:()=>({}),safeStorage,userData});
 const directory=join(userData,'secure','discovery'),id=createHash('sha256').update([actor.authUserId,actor.ownerAccountId,actor.deviceId].join('\0')).digest('hex'),file=join(directory,id+'.key');
 return{signer,safeStorage,calls,file,directory,userData};
}
for(const mode of ['basic_text','unavailable','availability-throws','backend-throws','missing-storage'])test(`unsafe ${mode} refuses file key access before codec or network`,async t=>{
 const f=fixture(t);mkdirSync(f.directory,{recursive:true});const bytes=Buffer.from('synthetic-original-key-bytes');writeFileSync(f.file,bytes);
 if(mode==='basic_text')f.safeStorage.getSelectedStorageBackend=()=>mode;
 if(mode==='unavailable')f.safeStorage.isEncryptionAvailable=()=>false;
 if(mode==='availability-throws')f.safeStorage.isEncryptionAvailable=()=>{throw Error('synthetic');};
 if(mode==='backend-throws')f.safeStorage.getSelectedStorageBackend=()=>{throw Error('synthetic');};
 if(mode==='missing-storage')f.signer.safeStorage=undefined;
 assert.throws(()=>f.signer.privateKey(actor),{code:'CLOUD_DEVICE_KEY_UNAVAILABLE'});
 await assert.rejects(f.signer.prove('discover'),{code:'CLOUD_DEVICE_KEY_UNAVAILABLE'});
 assert.deepEqual(readFileSync(f.file),bytes);assert.deepEqual(readdirSync(f.directory),[basename(f.file)]);assert.equal(f.signer.keys.size,0);assert.deepEqual(f.calls,{encrypt:0,decrypt:0,invoke:0});
});
test('basic_text creates no directory or key',t=>{const f=fixture(t,'basic_text');assert.throws(()=>f.signer.privateKey(actor),{code:'CLOUD_DEVICE_KEY_UNAVAILABLE'});assert.equal(existsSync(f.directory),false);assert.equal(f.signer.keys.size,0);assert.deepEqual(f.calls,{encrypt:0,decrypt:0,invoke:0});});
test('secure cached key becomes inaccessible when backend becomes unsafe',t=>{const f=fixture(t);const key=f.signer.privateKey(actor),bytes=readFileSync(f.file);assert.equal(f.signer.privateKey(actor),key);f.safeStorage.getSelectedStorageBackend=()=>'basic_text';assert.throws(()=>f.signer.privateKey(actor),{code:'CLOUD_DEVICE_KEY_UNAVAILABLE'});assert.deepEqual(readFileSync(f.file),bytes);assert.deepEqual(f.calls,{encrypt:1,decrypt:0,invoke:0});});
for(const backend of ['gnome_libsecret','kwallet6','absent-api'])test(`supported original persisted EC signature contract: ${backend}`,t=>{const f=fixture(t);if(backend==='absent-api')delete f.safeStorage.getSelectedStorageBackend;else f.safeStorage.getSelectedStorageBackend=()=>backend;const key=f.signer.privateKey(actor),message=Buffer.from('public synthetic message'),signature=sign('sha256',message,key);assert.equal(verify('sha256',message,createPublicKey(key),signature),true);f.signer.clear();const restored=f.signer.privateKey(actor);assert.equal(verify('sha256',message,createPublicKey(restored),signature),true);assert.deepEqual(f.calls,{encrypt:1,decrypt:1,invoke:0});});
