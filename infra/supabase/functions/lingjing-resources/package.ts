import { createHash } from 'node:crypto';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.98.0';
import { canonical } from '../_shared/lingjing-json.ts';
import { LingjingAuthError, uuid } from '../_shared/lingjing-auth.ts';
export const bucket='lingjing-resources-v1',indexTable='lingjing_resource_packages',referenceTable='lingjing_resource_references';
export const indexFields='auth_user_id,owner_account_id,resource_id,manifest_sha256,content_hash,manifest_path,manifest_bytes,total_bytes,resource_kind,created_at';
const CHUNK=4*1024*1024,MAX=256*1024*1024,JSON_MAX=4*1024*1024,SHA=/^[0-9a-f]{64}$/;
function invalid():never {throw new LingjingAuthError('RESOURCE_PACKAGE_INVALID',422);}
const object=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const integer=(value:unknown,min:number,max:number):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;
function key(value:unknown):asserts value is string {
  if(typeof value!=='string'||!value||value.length>500||/[\\\x00-\x1f:%?#]/.test(value)||value.startsWith('/')||value.split('/').some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)))invalid();
}
function noSecret(value:unknown,depth=0){
  if(depth>64)invalid();if(!value||typeof value!=='object')return;
  for(const [name,child]of Object.entries(value)){if(/(?:apikey|accesskey|secretkey|servicerole|password|accesstoken|refreshtoken|sessiontoken|authorization|credentials|privatekey)|^(?:secret|token)$/i.test(name.replace(/[_-]/g,'')))invalid();noSecret(child,depth+1);}
}
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
async function bytes(client:SupabaseClient,path:string,size:number,sha:string){
  const response=await client.storage.from(bucket).download(path);if(response.error||!response.data||response.data.size!==size)invalid();
  const value=new Uint8Array(await response.data.arrayBuffer());if(value.length!==size||digest(value)!==sha)invalid();return value;
}
export async function verifyPackage(client:SupabaseClient,row:Record<string,unknown>,owner:string,uid:string){
  if(row.owner_account_id!==owner||row.auth_user_id!==uid||!uuid(row.resource_id)||typeof row.manifest_sha256!=='string'||!SHA.test(row.manifest_sha256)||typeof row.content_hash!=='string'||!SHA.test(row.content_hash)
    ||!integer(row.manifest_bytes,1,1024*1024)||!integer(row.total_bytes,1,MAX))invalid();
  const prefix=`${uid}/${row.resource_id}/${row.manifest_sha256}`;if(row.manifest_path!==prefix+'/manifest.json')invalid();
  const wire=await bytes(client,row.manifest_path,row.manifest_bytes,row.manifest_sha256);let manifest:Record<string,unknown>;
  try{const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(wire));if(!object(parsed))invalid();manifest=parsed;}catch{invalid();}
  if(canonical(manifest)!==new TextDecoder().decode(wire)||manifest.format!=='lingjing.resource-package'||manifest.version!==1||manifest.ownerAccountId!==owner||manifest.authUserId!==uid
    ||manifest.resourceId!==row.resource_id||manifest.contentHash!==row.content_hash||manifest.totalBytes!==row.total_bytes||!object(manifest.document))invalid();
  noSecret(manifest);const document=manifest.document;
  if(document.id!==row.resource_id||document.contentHash!==row.content_hash||document.origin!=='import'||!['spritesheet','model3d'].includes(String(document.kind))||manifest.archiveOnly!==(document.kind==='model3d')
    ||row.resource_kind!==(manifest.archiveOnly?'model3d-archive':'spritesheet')||!Array.isArray(manifest.files)||!manifest.files.length||manifest.files.length>128||!Array.isArray(manifest.imports)||manifest.imports.length>10000)invalid();
  const keys=new Set<string>(),folded=new Set<string>(),files:Record<string,unknown>[]=[],textFiles=new Map<string,Uint8Array>();let total=0;
  for(const raw of manifest.files){
    if(!object(raw))invalid();key(raw.key);
    if(keys.has(raw.key)||folded.has(raw.key.toLowerCase())||!/\.(json|png|webp|glb|gltf|bin|jpe?g|ktx2)$/i.test(raw.key)||typeof raw.sha256!=='string'||!SHA.test(raw.sha256)||!integer(raw.size,1,128*1024*1024)
      ||!Array.isArray(raw.chunks)||raw.chunks.length!==Math.ceil(raw.size/CHUNK)||(document.kind==='spritesheet'&&!/\.(json|png|webp)$/i.test(raw.key))||(/\.(json|gltf)$/i.test(raw.key)&&raw.size>JSON_MAX))invalid();
    keys.add(raw.key);folded.add(raw.key.toLowerCase());total+=raw.size;if(total>MAX)invalid();files.push(raw);
  }
  key(document.entryAsset);if(total!==manifest.totalBytes||!keys.has(document.entryAsset))invalid();
  const receipts=new Set<string>();for(const item of manifest.imports){if(!object(item)||!uuid(item.import_id)||receipts.has(item.import_id)||item.owner_account_id!==owner||item.resource_id!==row.resource_id||typeof item.source_filename!=='string'||item.source_filename.length>500||typeof item.provenance_json!=='string'||typeof item.imported_at!=='string')invalid();receipts.add(item.import_id);}
  const packageHash=createHash('sha256');
  // File order is recorded by the existing importer; do not change a legacy locale-derived content hash.
  for(const file of files){
    const name=file.key as string,size=file.size as number,sha=file.sha256 as string,parts=file.chunks as Record<string,unknown>[];
    packageHash.update(name).update('\0');const whole=createHash('sha256');let text:Uint8Array|undefined,offset=0;
    if(/\.(json|gltf)$/i.test(name))text=new Uint8Array(size);
    for(const [index,chunk]of parts.entries()){
      const expected=Math.min(CHUNK,size-index*CHUNK);if(!object(chunk)||chunk.size!==expected||typeof chunk.sha256!=='string'||!SHA.test(chunk.sha256))invalid();
      const part=await bytes(client,`${prefix}/chunks/${sha}/${index}-${chunk.sha256}.bin`,expected,chunk.sha256);whole.update(part);packageHash.update(part);if(text)text.set(part,offset);offset+=part.length;
    }
    if(offset!==size||whole.digest('hex')!==sha)invalid();
    if(text){let parsed;try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(text));}catch{invalid();}noSecret(parsed);textFiles.set(name,text);}
  }
  if(packageHash.digest('hex')!==row.content_hash)invalid();
  if(document.kind==='spritesheet'){
    key(manifest.descriptorKey);const raw=textFiles.get(manifest.descriptorKey);if(!raw||!/\.(png|webp)$/i.test(document.entryAsset))invalid();
    const descriptor=JSON.parse(new TextDecoder().decode(raw));
    if(!object(descriptor))invalid();
    if(descriptor.format==='lingjing.character'){if(descriptor.version!==1||descriptor.kind!=='spritesheet'||descriptor.image!==document.entryAsset)invalid();}
    else if(!object(descriptor.meta)||!object(descriptor.frames)||descriptor.meta.image!==document.entryAsset)invalid();
  }
  return {resourceId:row.resource_id,manifestSha256:row.manifest_sha256};
}
