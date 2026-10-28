// Public evidence index only. Private identifiers are derived inside the runner
// from hard-pinned original artifact members, never embedded/encoded in this file.
import assert from 'node:assert/strict';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join,relative,isAbsolute} from 'node:path';
export const ORIGINAL_FIXTURE_ARTIFACT=Object.freeze({runId:'40607080843',artifactId:'12783353029',zipSha256:'8b2bc3005a61e2f17a988fc446bf600b95211460a919fbce937cf2494805ff1e'});
export const ORIGINAL_FIXTURE_MEMBERS=Object.freeze({
 records:Object.freeze({path:'live-qa-recovery/live-record-evidence.json',sha256:'51a8e17f7db4180a21007b784751905d9ffdba37adab363886d80ac32be57d2b'}),
 intents:Object.freeze({path:'live-qa-recovery/live-record-intents.json',sha256:'fd24aa11e3147ef35f7d6e2083f1f7165788f3179ced8eaae14276223b784c76'}),
 business:Object.freeze({path:'live-qa-recovery/live-business-evidence.json',sha256:'ef7d92cf793b63939c057b5bd11519c08d173650a5442ac8dda2805bc35cd0d4'}),
 game:Object.freeze({path:'live-qa-recovery/live-game-evidence.json',sha256:'abd3f34936534f67be2d3a05baef5393acebe8d87536a320a58c2734faf9d095'}),
 reuse:Object.freeze({path:'native-continuation/package-reuse.json',sha256:'870e1a8cb5cff1857744985483243451dc174325271cb5faf252bbe04de09208'})
});
const scenario='cloud-acceptance-20261027-8be246d1',prepared=new WeakMap(),uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function validatePublicCompletionIndex(x){assert.deepEqual(Object.keys(x).sort(),['version','runId','plan','priorEvidence'].sort());assert.equal(x.version,1);assert.match(x.runId,uuid);assert.equal(x.plan,'fixed-seventeen-completion-v1');assert.deepEqual(x.priorEvidence,ORIGINAL_FIXTURE_ARTIFACT);return x;}
const one=(x,id)=>{assert.ok(Array.isArray(x.cases));const rows=x.cases.filter(r=>r.id===id);assert.equal(rows.length,1,'EXACT_UNIQUE_ORIGINAL_CASE_REQUIRED');return rows[0];};
// Pure schema/mapping contract for synthetic tests. Production admission below
// independently checks all five hard hashes before calling this function.
export function deriveOriginalFixture(records){const {records:r,intents:i,business:b,game:g,reuse}=records;assert.equal(reuse.packageSourceCommit,'1c9af85185bc0fd09a30b02c624c29e9f6cc0bbd');assert.equal(reuse.productPathsUnchanged,true);assert.equal(reuse.auditReceiptVerified,true);assert.equal(reuse.runtimeClosureVerified,true);assert.match(r.runId,uuid);for(const x of[r,i,b,g]){assert.equal(x.runId,r.runId);assert.equal(x.scenario,scenario);}
 const s03=one(r,'S03'),s05=one(r,'S05'),initial=one(b,'S02'),isolated=one(b,'A11'),pets=one(g,'fixture-live-pets');
 for(const row of[s03,initial,isolated,pets])assert.equal(row.status,'passed-scoped');assert.equal(s05.status,'failed');assert.equal(s05.error.code,'READBACK_TIMEOUT');
 assert.match(i.owner,/^account:[a-f0-9-]{36}$/i);assert.match(i.petId,/^pet-[a-f0-9-]{36}$/i);assert.match(i.s05OriginalMemoryId,uuid);assert.equal(i.s05MemoryEditSubmitted,true);assert.ok(Number.isSafeInteger(i.s05BaseRevision)&&i.s05BaseRevision>=0);
 assert.equal(initial.owner,i.owner);assert.equal(initial.petId,i.petId);assert.equal(initial.memoryId,i.s05OriginalMemoryId);assert.equal(s03.petId,i.petId);assert.equal(isolated.ownerA,i.owner);assert.notEqual(isolated.ownerB,i.owner);assert.equal(isolated.petA,i.petId);assert.equal(pets.petA,i.petId);assert.equal(pets.petB,isolated.petB);assert.match(pets.petB,/^pet-[a-f0-9-]{36}$/i);assert.notEqual(pets.petA,pets.petB);
 return {existingRecordFixture:{owner:i.owner,petId:i.petId,memoryId:i.s05OriginalMemoryId,sourceRunId:ORIGINAL_FIXTURE_ARTIFACT.runId},friendPetIds:{a:pets.petA,b:pets.petB},domainFixturePlan:{kind:'fixed-s02-produced-fixture-v1',base:{producer:'s02-base-producer',petId:i.petId,requiresConfirmedG07InventoryWrite:true},report:{producer:'friend-completion',requiredCase:'B11'},territory:{producer:'s02-territory-producer',requiresFreshParentEmptyCell:true,requiresSignedUiLocationCapability:true}}};
}
export function verifyOriginalFixtureMember(key,bytes){const item=ORIGINAL_FIXTURE_MEMBERS[key];assert.ok(item&&Buffer.isBuffer(bytes));assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256,'ORIGINAL_PRIVATE_MEMBER_HASH_MISMATCH');return JSON.parse(bytes.toString('utf8'));}
export function resolvePrivateCompletionFixture(index){validatePublicCompletionIndex(index);const root=resolve('artifacts/qa/same-run-prior'),canonical=realpathSync.native(root);assert.equal(canonical.toLowerCase(),root.toLowerCase());assert.equal(lstatSync(root).isSymbolicLink(),false);const data={};
 for(const[key,item]of Object.entries(ORIGINAL_FIXTURE_MEMBERS)){const file=join(root,item.path),rel=relative(root,file);assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel));const stat=lstatSync(file);assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=4*1024*1024);assert.equal(realpathSync.native(file).toLowerCase(),file.toLowerCase());data[key]=verifyOriginalFixtureMember(key,readFileSync(file));}
 const fields=deriveOriginalFixture(data),opaque=Object.freeze({});prepared.set(opaque,{index:JSON.stringify(index),fields});return opaque;
}
export function readPrivateCompletionFixture(value,index){const state=prepared.get(value);assert.ok(state,'REAL_PRIVATE_ARTIFACT_RESOLUTION_REQUIRED');assert.equal(state.index,JSON.stringify(validatePublicCompletionIndex(index)));return structuredClone(state.fields);}
