// Local verifier tests only. No real Supabase server or service credential is used.
import { createHash,randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.98.0';
import { canonical } from '../_shared/lingjing-json.ts';
import { verifyPackage } from './package.ts';
import {validatePreferenceDocument} from './preferences.ts';
const require=createRequire(import.meta.url);
const {parseCharacterFile}=require('../../../../apps/pc-app/runtime/features/resources/parser.cjs');
const owner='account:local-verifier',uid='10000000-0000-4000-8000-000000000001';
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
async function packet(credential=false){
  const source=fileURLToPath(new URL('../../../../apps/pc-app/runtime/features/resources/assets/roster-v2/qingya/character.json',import.meta.url));
  const parsed=await parseCharacterFile(source),id=randomUUID(),all=new Map<string,Uint8Array>(parsed.files);
  if(credential){const desc=JSON.parse(new TextDecoder().decode(all.get('character.json')));desc.character.openai_api_key='fixture-no-real-key';all.set('character.json',new TextEncoder().encode(JSON.stringify(desc)));}
  const full=createHash('sha256'),files=[],objects=new Map<string,Uint8Array>();let total=0;
  for(const [key,bytes]of [...all].sort(([a],[b])=>a.localeCompare(b))){full.update(key).update('\0').update(bytes);total+=bytes.length;files.push({key,size:bytes.length,sha256:hash(bytes),chunks:[{size:bytes.length,sha256:hash(bytes)}]});}
  const contentHash=full.digest('hex'),manifest={format:'lingjing.resource-package',version:1,ownerAccountId:owner,authUserId:uid,resourceId:id,contentHash,document:JSON.parse(JSON.stringify({...parsed.resource,id,contentHash,origin:'import',importedAt:'2026-10-25T00:00:00Z'})),archiveOnly:false,descriptorKey:'character.json',files,totalBytes:total,imports:[]};
  const wire=new TextEncoder().encode(canonical(manifest)),digest=hash(wire),prefix=`${uid}/${id}/${digest}`;
  objects.set(prefix+'/manifest.json',wire);
  for(const file of files)objects.set(`${prefix}/chunks/${file.sha256}/0-${file.sha256}.bin`,all.get(file.key)!);
  const row={auth_user_id:uid,owner_account_id:owner,resource_id:id,manifest_sha256:digest,content_hash:contentHash,manifest_path:prefix+'/manifest.json',manifest_bytes:wire.length,total_bytes:total,resource_kind:'spritesheet'};
  const requests:string[]=[];
  const client={storage:{from:()=>({download:(key:string)=>{requests.push(key);const value=objects.get(key);return Promise.resolve(value?{data:new Blob([Uint8Array.from(value).buffer]),error:null}:{data:null,error:{message:'Explicit local fixture missing'}});}})}} as unknown as SupabaseClient;
  return {row,manifest,objects,client,requests};
}
async function denied(fn:()=>Promise<unknown>){let rejected=false;try{await fn();}catch{rejected=true;}if(!rejected)throw Error('Expected package verification rejection');}
Deno.test('LOCAL verifier: actual existing 2D parser package hashes all source bytes before registration',async()=>{
  const p=await packet();const receipt=await verifyPackage(p.client,p.row,owner,uid);if(receipt.resourceId!==p.row.resource_id||p.requests.length!==3)throw Error('Actual package was not fully verified');
});
Deno.test('LOCAL verifier: changed image chunk is refused before a server receipt can be produced',async()=>{
  const p=await packet(),image=[...p.objects.keys()].find(key=>key.includes('/chunks/')&&p.objects.get(key)!.length>100000)!;const bad=Uint8Array.from(p.objects.get(image)!);bad[0]^=255;p.objects.set(image,bad);await denied(()=>verifyPackage(p.client,p.row,owner,uid));
});
Deno.test('LOCAL verifier: UID/owner and wrong manifest hash are refused',async()=>{
  const p=await packet();await denied(()=>verifyPackage(p.client,{...p.row,owner_account_id:'other'},owner,uid));if(p.requests.length)throw Error('Mismatched owner caused an object read');await denied(()=>verifyPackage(p.client,{...p.row,manifest_sha256:'b'.repeat(64)},owner,uid));
});
Deno.test('LOCAL verifier: credential-bearing original descriptor is refused even with matching hashes',async()=>{
  const p=await packet(true);await denied(()=>verifyPackage(p.client,p.row,owner,uid));
});
Deno.test('LOCAL preference verifier: shared desktop rules accept real clips and reject bounds, unknown clips and extra authority fields',async()=>{
  const p=await packet(),resource=p.manifest.document;
  const document=structuredClone({calibration:resource.calibration,actions:resource.actions});document.calibration.desktop.scale=1.35;
  validatePreferenceDocument(document,resource.clips);
  const invalid=structuredClone(document);invalid.calibration.desktop.scale=4;await denied(()=>Promise.resolve(validatePreferenceDocument(invalid,resource.clips)));
  const clip=structuredClone(document);clip.actions.idle='not-a-real-clip';await denied(()=>Promise.resolve(validatePreferenceDocument(clip,resource.clips)));
  await denied(()=>Promise.resolve(validatePreferenceDocument({...document,growth:{experience:999}},resource.clips)));
});
