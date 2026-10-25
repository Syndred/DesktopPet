const {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync,unlinkSync}=require('node:fs');
const {join}=require('node:path');
const {randomUUID}=require('node:crypto');
const FORMAT='lingjing.global-serial.cache';
const canonicalNumber=value=>typeof value==='string'&&/^[1-9][0-9]*$/.test(value);
const identifier=value=>typeof value==='string'&&value.length>0&&value.length<=200&&![...value].some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127);
const namespace=value=>value==='live'||typeof value==='string'&&/^qa:[a-zA-Z0-9][a-zA-Z0-9:_-]{0,179}$/.test(value);
const fail=()=>{throw Object.assign(new Error('伙伴编号的可信读回不一致，原存档已保留。'),{code:'GLOBAL_SERIAL_READBACK_INVALID'});};
function withoutUntrustedGlobalSerial(pet){const{globalSerial,...rest}=pet;void globalSerial;return rest;}
function checkedEntry(owner,entry){
 if(!entry||entry.ownerAccountId!==owner||!identifier(entry.petId)||!identifier(entry.templateId)||!namespace(entry.namespace)||!canonicalNumber(entry.globalSerial))fail();
 return{ownerAccountId:owner,petId:entry.petId,templateId:entry.templateId,namespace:entry.namespace,globalSerial:entry.globalSerial};
}
/** Main-process private cache. Its only writer receives a separate, verified
 * service readback, never a backup, envelope pet field or renderer parameter.
 * OS safeStorage seals persisted bytes. Without it, trusted numbers live only
 * in memory and restart returns pending until another authoritative readback. */
function createGlobalSerialCache({directory,safeStorage}={}){
 const file=directory?join(directory,'global-pet-serials.cache'):null;
 let owners=new Map();
 function canSeal(){try{return Boolean(file&&safeStorage?.isEncryptionAvailable?.()&&!(process.platform==='linux'&&safeStorage.getSelectedStorageBackend?.()==='basic_text'));}catch{return false;}}
 function readDocument(document){
  if(document?.format!==FORMAT||document.version!==1||!Array.isArray(document.owners))fail();
  const result=new Map();
  for(const state of document.owners){
   const owner=state?.ownerAccountId;
   if(!identifier(owner)||result.has(owner)||!Number.isSafeInteger(state.revision)||state.revision<0||!Array.isArray(state.pets))fail();
   const entries=new Map();
   for(const raw of state.pets){const entry=checkedEntry(owner,raw);if(entries.has(entry.petId))fail();entries.set(entry.petId,entry);}
   result.set(owner,{revision:state.revision,entries});
  }
  return result;
 }
 if(canSeal()&&existsSync(file))try{
  const bytes=readFileSync(file);if(bytes.length>8*1024*1024)fail();
  owners=readDocument(JSON.parse(safeStorage.decryptString(bytes)));
 }catch{owners=new Map();}
 function persist(next){
  if(!canSeal())return;
  const temporary=file+'.next-'+randomUUID();
  try{
   mkdirSync(directory,{recursive:true});
   const document={format:FORMAT,version:1,owners:[...next].map(([owner,state])=>({ownerAccountId:owner,revision:state.revision,pets:[...state.entries.values()]}))};
   writeFileSync(temporary,safeStorage.encryptString(JSON.stringify(document)),{flag:'wx',mode:0o600});
   renameSync(temporary,file);
  }catch{
   // The verified in-memory view remains useful. A failed disk write can never
   // promote raw save metadata into a number on the next launch.
   try{if(existsSync(temporary))unlinkSync(temporary);}catch{/* A stale sealed temp file is never loaded. */}
  }
 }
 function validate(owner,registry,rows,revision){
  if(!identifier(owner)||registry?.format!=='lingjing.global-serial.readback'||registry.version!==1||registry.ownerAccountId!==owner
   ||!namespace(registry.namespace)||!Number.isSafeInteger(registry.revision)||registry.revision!==revision||!Array.isArray(registry.pets)||!Array.isArray(rows))fail();
  const prior=owners.get(owner);if(prior&&registry.revision<prior.revision)fail();
  const expected=new Map();
  for(const row of rows){
   if(row.owner_account_id!==owner||!identifier(row.pet_id)||!identifier(row.template_id)||expected.has(row.pet_id))fail();
   expected.set(row.pet_id,row.template_id);
  }
  if(registry.pets.length!==expected.size)fail();
  const entries=new Map(),numbers=new Set();
  for(const raw of registry.pets){
   const entry=checkedEntry(owner,raw),old=prior?.entries.get(entry.petId),number=JSON.stringify([entry.namespace,entry.templateId,entry.globalSerial]);
   if(expected.get(entry.petId)!==entry.templateId||entries.has(entry.petId)||numbers.has(number)
    ||old&&(old.templateId!==entry.templateId||old.namespace!==entry.namespace||old.globalSerial!==entry.globalSerial))fail();
   entries.set(entry.petId,entry);numbers.add(number);
  }
  return entries;
 }
 return{
  validate,
  accept(owner,registry,rows,revision){
   const entries=validate(owner,registry,rows,revision),old=owners.get(owner);
   const changed=[...entries].some(([id,e])=>{const before=old?.entries.get(id);return !before||before.templateId!==e.templateId||before.namespace!==e.namespace||before.globalSerial!==e.globalSerial;});
   // Keep historical confirmed IDs even if a later snapshot omits a pet. Their
   // authority is immutable and cannot be transferred to another owner/template.
   const merged=new Map(old?.entries||[]);for(const[id,e]of entries)merged.set(id,e);
   const next=new Map(owners);next.set(owner,{revision,entries:merged});persist(next);owners=next;return changed;
  },
  project(pet){
   const result=withoutUntrustedGlobalSerial(pet),entry=owners.get(pet.ownerAccountId)?.entries.get(pet.petId);
   if(entry&&entry.templateId===pet.templateId)result.globalSerial=entry.globalSerial;
   return result;
  }
 };
}
module.exports={createGlobalSerialCache,withoutUntrustedGlobalSerial};
