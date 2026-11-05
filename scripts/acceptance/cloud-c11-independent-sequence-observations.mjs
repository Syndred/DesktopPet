// Pure, offline consistency assertions over explicitly supplied observations.
// No collection, login, allocation, request IDs, namespace changes or authority
// capabilities. A successful assertion does NOT authenticate any input source.
// In particular, pinned artifact digest labels below do not verify artifact bytes.
import {createHash} from 'node:crypto';
import {types} from 'node:util';

const ERROR='C11_INDEPENDENT_SEQUENCE_OBSERVATION_INVALID';
const NAMESPACE='qa:cloud-acceptance-20261027-8be246d1';
const DEER='animal-wood-deer';
const TEMPLATES=new Set(['big-fish-gentle','big-fish-cheerful','big-fish-foodie','animal-shiba','animal-hat-cat','animal-white-fox',DEER,'animal-earth-pangolin']);
// Same reference pins as cloud-live-qa-discovery-cases.mjs:127. Only provenance
// labels are checked here; an authorized future collector must verify originals.
const PRIOR={runId:40607080843,artifactId:12783353029,sha256:'7424bc1bab2e207687ee37ee56c3f3952983b44e3ed914307858ffdb57bbf5ce',reuseSha256:'870e1a8cb5cff1857744985483243451dc174325271cb5faf252bbe04de09208',packageSource:'1c9af85185bc0fd09a30b02c624c29e9f6cc0bbd'};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9:_-]{0,179}$/;
const ACTION=/^[A-Za-z0-9][A-Za-z0-9:_-]{7,95}$/;
const SHA=/^[a-f0-9]{64}$/;
const NUMBER=/^[1-9][0-9]*$/;
const RESULT=Object.freeze({scope:'assertion-only',source:'not-authenticated',fullCasePassed:false});
function check(condition){if(!condition)throw new Error(ERROR);}
const same=(a,b)=>check(a===b);
const integer=(v,min=0)=>check(Number.isSafeInteger(v)&&v>=min);
const text=(v,pattern,max=180)=>check(typeof v==='string'&&v.length<=max&&pattern.test(v));
const petId=v=>{text(v,/^pet-[a-f0-9-]{36}$/);text(v.slice(4),UUID);};
const ownerId=v=>{text(v,/^account:[a-f0-9-]{36}$/);text(v.slice(8),UUID);};
function keys(value,required,optional=[]){
 check(value!==null&&typeof value==='object'&&!Array.isArray(value));
 const actual=Object.keys(value);check(required.every(k=>Object.hasOwn(value,k))&&actual.every(k=>required.includes(k)||optional.includes(k)));
}
// Reject accessors, symbols, custom prototypes, holes, functions, non-finite
// numbers and excessive input before reading fields or hashing any request.
function jsonData(value,depth=0,budget={nodes:0}){
 check(!types.isProxy(value));
 check(depth<=20&&++budget.nodes<=20000);
 if(value===null||typeof value==='boolean')return;
 if(typeof value==='number'){check(Number.isFinite(value));return;}
 if(typeof value==='string'){check(value.length<=32768);return;}
 check(typeof value==='object');
 const array=Array.isArray(value);same(Object.getPrototypeOf(value),array?Array.prototype:Object.prototype);
 const names=Reflect.ownKeys(value);check(names.every(k=>typeof k==='string'));
 if(array){check(value.length<=1000&&names.length===value.length+1);for(let i=0;i<value.length;i++)check(Object.hasOwn(value,String(i)));}
 for(const k of names){const d=Object.getOwnPropertyDescriptor(value,k);check(d&&Object.hasOwn(d,'value'));
  if(array&&k==='length')continue;check(d.enumerable);jsonData(d.value,depth+1,budget);}
}
function canonical(value){
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
function time(value,window){integer(value);check(value>=window.startedAtMs&&value<=window.endedAtMs);}
function iso(value,window){
 text(value,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,24);
 const ms=Date.parse(value);check(Number.isSafeInteger(ms)&&new Date(ms).toISOString()===value);time(ms,window);
}
function ordered(values){for(let i=1;i<values.length;i++)check(values[i]>=values[i-1]);}
function successfulAdoptResult(raw,{owner,input,window}){
 // This is the ORIGINAL companion_actions.result_json, not a rewritten receipt.
 // Normal new-adopt results have no globalSerial. An optional historical value
 // is untrusted metadata: never use it for the sequence assertion below.
 check(typeof raw==='string'&&raw.length<=16384);const r=JSON.parse(raw);jsonData(r);
 same(JSON.stringify(r),raw); // Also reject duplicate JSON keys/non-product encoding.
 keys(r,['ok','data','revision','duplicate']);same(r.ok,true);same(r.duplicate,false);integer(r.revision,1);
 keys(r.data,['pet','selections']);const p=r.data.pet;
 keys(p,['ownerAccountId','petId','templateId','name','serial','element','resource','source','origin','growth','desktop','revision','createdAt','updatedAt'],['globalSerial']);
 if(Object.hasOwn(p,'globalSerial'))text(p.globalSerial,NUMBER,1000);
 same(p.ownerAccountId,owner);petId(p.petId);same(p.templateId,input.templateId);same(p.name,input.name.trim());
 text(p.serial,/^[A-Za-z0-9_-]+$/,180);check(['metal','wood','water','fire','earth'].includes(p.element));
 keys(p.resource,['resourceId','kind']);text(p.resource.resourceId,ID);same(p.resource.kind,'2d');same(p.source,'adoption');keys(p.origin,[]);
 keys(p.growth,['level','experience','mood','satiety','affinity','winsTotal','stats']);
 for(const k of ['level','experience','mood','satiety','affinity','winsTotal'])integer(p.growth[k],k==='level'?1:0);
 keys(p.growth.stats,['hp','atk','def','spd']);for(const value of Object.values(p.growth.stats))integer(value,1);
 keys(p.desktop,['visible','behavior','scale','position']);same(p.desktop.visible,input.showOnDesktop);check(['quiet','wander','follow','sleep'].includes(p.desktop.behavior));
 check(typeof p.desktop.scale==='number'&&p.desktop.scale>=.5&&p.desktop.scale<=2);
 keys(p.desktop.position,['x','y','displayId']);for(const k of ['x','y'])check(typeof p.desktop.position[k]==='number'&&Number.isFinite(p.desktop.position[k])&&Math.abs(p.desktop.position[k])<=100000);
 if(p.desktop.position.displayId!==null)text(p.desktop.position.displayId,ID,100);
 integer(p.revision,1);iso(p.createdAt,window);same(p.updatedAt,p.createdAt);
 keys(r.data.selections,['chatPetId','battlePetId','guardPetId']);for(const value of Object.values(r.data.selections))if(value!==null)petId(value);
 return p;
}
function serialRegistry(value,{owner,namespace,minRevision,allSerials,allPets}){
 keys(value,['format','version','ownerAccountId','namespace','revision','pets']);same(value.format,'lingjing.global-serial.readback');same(value.version,1);
 same(value.ownerAccountId,owner);same(value.namespace,namespace);integer(value.revision,minRevision);
 check(Array.isArray(value.pets)&&value.pets.length>=2&&value.pets.length<=500);const found=new Map();
 for(const row of value.pets){keys(row,['namespace','ownerAccountId','petId','templateId','globalSerial'],['spawnId']);
  same(row.namespace,namespace);same(row.ownerAccountId,owner);petId(row.petId);check(TEMPLATES.has(row.templateId));text(row.globalSerial,NUMBER,1000);
  if(Object.hasOwn(row,'spawnId'))text(row.spawnId,ID);
  check(!found.has(row.petId));found.set(row.petId,row);
  check(!allPets.has(row.petId)||allPets.get(row.petId)===owner);allPets.set(row.petId,owner);
  const identity=row.templateId+':'+row.globalSerial;check(!allSerials.has(identity));allSerials.add(identity);
 }
 return found;
}

/**
 * All input is a bounded JSON observation DTO, never an execution plan.
 * Each actionReadback is a safe projection of the normal owner's original
 * lingjing_save_actions row and its exact companion_actions row. snapshot is
 * the subsequent normal companions-sync snapshot projection. No cache/max,
 * private counter or caller-supplied success flag can replace either observation.
 * Exactly two chronological adoptions are supplied: A -> 1, then B -> 2.
 * Reference deer 4/5 identifies a separate existing sequence; this does NOT
 * assert that the deer counter or any unseen assignments stayed unchanged.
 */
export function assertC11IndependentSequenceObservations(value){
 try{
  jsonData(value);keys(value,['format','version','runId','sourceCommit','namespace','templateId','window','owners','deerReference','adoptions']);
  same(value.format,'lingjing.c11.independent-sequence.observations');same(value.version,1);text(value.runId,UUID);text(value.sourceCommit,/^[a-f0-9]{40}$/);
  same(value.namespace,NAMESPACE);check(TEMPLATES.has(value.templateId)&&value.templateId!==DEER);
  keys(value.window,['startedAtMs','endedAtMs']);integer(value.window.startedAtMs);integer(value.window.endedAtMs);
  check(value.window.endedAtMs>value.window.startedAtMs&&value.window.endedAtMs-value.window.startedAtMs<=2*60*60*1000);
  keys(value.owners,['a','b']);ownerId(value.owners.a);ownerId(value.owners.b);check(value.owners.a!==value.owners.b);
  const prior=value.deerReference;keys(prior,[...Object.keys(PRIOR),'namespace','templateId','rows']);
  for(const [k,v]of Object.entries(PRIOR))same(prior[k],v);same(prior.namespace,value.namespace);same(prior.templateId,DEER);
  check(Array.isArray(prior.rows)&&prior.rows.length===2);const seenActions=new Set(),seenPets=new Set();
  for(const [i,role]of ['a','b'].entries()){
   const row=prior.rows[i];keys(row,['role','ownerAccountId','actionId','petId','globalSerial']);same(row.role,role);same(row.ownerAccountId,value.owners[role]);text(row.actionId,ACTION);petId(row.petId);
   check(['4','5'].includes(row.globalSerial)&&!seenActions.has(row.actionId)&&!seenPets.has(row.petId));seenActions.add(row.actionId);seenPets.add(row.petId);
  }
  check(prior.rows[0].globalSerial!==prior.rows[1].globalSerial);
  check(Array.isArray(value.adoptions)&&value.adoptions.length===2);let previousUi=null;const allSerials=new Set(),allPets=new Map();
  for(const [index,role]of ['a','b'].entries()){
   const sample=value.adoptions[index],owner=value.owners[role],expectedSerial=String(index+1),reference=prior.rows[index];
   keys(sample,['role','runId','sourceCommit','namespace','request','actionReadback','snapshot','ui']);same(sample.role,role);
   for(const key of ['runId','sourceCommit','namespace'])same(sample[key],value[key]);
   const request=sample.request;keys(request,['submittedAtMs','command','input']);time(request.submittedAtMs,value.window);same(request.command,'adopt');
   if(previousUi!==null)check(request.submittedAtMs>previousUi);
   const input=request.input;keys(input,['actionId','templateId','name','showOnDesktop']);text(input.actionId,ACTION);same(input.templateId,value.templateId);
   check(typeof input.name==='string'&&input.name.trim().length>0&&[...input.name.trim()].length<=24&&!/[\u0000-\u001f\u007f]/u.test(input.name));same(input.showOnDesktop,false);
   check(!seenActions.has(input.actionId));seenActions.add(input.actionId);
   const action=sample.actionReadback;keys(action,['source','requestedAtMs','receivedAtMs','owner_id','action_id','kind','revision','checksum','companionAction']);
   same(action.source,'normal-own-sdk:lingjing_save_actions');same(action.owner_id,owner);same(action.action_id,'companions:'+input.actionId);same(action.kind,'authority');integer(action.revision,1);text(action.checksum,SHA);
   const original=action.companionAction;keys(original,['owner_account_id','action_id','operation','request_hash','result_json','created_at']);
   same(original.owner_account_id,owner);same(original.action_id,input.actionId);same(original.operation,'adopt');text(original.request_hash,SHA);
   same(original.request_hash,createHash('sha256').update(canonical(input)).digest('hex'));iso(original.created_at,value.window);
   const pet=successfulAdoptResult(original.result_json,{owner,input,window:value.window});same(pet.createdAt,original.created_at);
   check(!seenPets.has(pet.petId));seenPets.add(pet.petId);
   const snapshot=sample.snapshot;keys(snapshot,['source','requestedAtMs','receivedAtMs','authority','serialRegistry']);same(snapshot.source,'companions-sync:snapshot');same(snapshot.authority,'live');
   const registry=serialRegistry(snapshot.serialRegistry,{owner,namespace:value.namespace,minRevision:action.revision,allSerials,allPets});
   const target=registry.get(pet.petId);check(target);same(target.templateId,value.templateId);same(target.globalSerial,expectedSerial);check(!Object.hasOwn(target,'spawnId'));
   const deer=registry.get(reference.petId);check(deer);same(deer.templateId,DEER);same(deer.globalSerial,reference.globalSerial);
   // numberText is trimmed visible textContent of this pet card's
   // .cp-instance-identity code, not a fabricated display string or cache value.
   const ui=sample.ui;keys(ui,['source','observedAtMs','route','ownerAccountId','petId','templateId','visible','numberText']);same(ui.source,'public-dom');same(ui.route,'/companions');same(ui.ownerAccountId,owner);same(ui.petId,pet.petId);same(ui.templateId,value.templateId);same(ui.visible,true);same(ui.numberText,'编号 '+expectedSerial.padStart(4,'0'));
   const timeline=[request.submittedAtMs,action.requestedAtMs,action.receivedAtMs,snapshot.requestedAtMs,snapshot.receivedAtMs,ui.observedAtMs];
   for(const at of timeline)time(at,value.window);ordered(timeline);
   ordered([request.submittedAtMs,Date.parse(original.created_at),action.receivedAtMs]);previousUi=ui.observedAtMs;
  }
  return RESULT;
 }catch{throw Object.assign(new Error(ERROR),{code:ERROR});}
}
