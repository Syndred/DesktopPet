import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {assertC11IndependentSequenceObservations as verify} from './cloud-c11-independent-sequence-observations.mjs';

// Entirely synthetic fixtures. No live authority, product runtime or credentials.
const uuid=n=>`${String(n).padStart(8,'0')}-0000-4000-8000-000000000000`;
const namespace='qa:cloud-acceptance-20261027-8be246d1',templateId='animal-shiba',start=1793862000000;
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const hash=v=>createHash('sha256').update(canonical(v)).digest('hex');
const editResult=(value,index,change)=>{const action=value.adoptions[index].actionReadback.companionAction,result=JSON.parse(action.result_json);change(result);action.result_json=JSON.stringify(result);};
function fixture(){
 const runId=uuid(1),sourceCommit='a'.repeat(40),owners={a:'account:'+uuid(2),b:'account:'+uuid(3)};
 const reference={runId:40607080843,artifactId:12783353029,sha256:'7424bc1bab2e207687ee37ee56c3f3952983b44e3ed914307858ffdb57bbf5ce',reuseSha256:'870e1a8cb5cff1857744985483243451dc174325271cb5faf252bbe04de09208',packageSource:'1c9af85185bc0fd09a30b02c624c29e9f6cc0bbd',namespace,templateId:'animal-wood-deer',rows:['a','b'].map((role,i)=>({role,ownerAccountId:owners[role],actionId:uuid(10+i),petId:'pet-'+uuid(20+i),globalSerial:String(4+i)}))};
 const adoptions=['a','b'].map((role,i)=>{
  const at=start+1000+i*10000,owner=owners[role],petId='pet-'+uuid(30+i),input={actionId:uuid(40+i),templateId,name:'编号观察',showOnDesktop:false},created=new Date(at+100).toISOString();
  // Same original result structure as cloud-domain.mjs / instance.mjs, including
  // the legacy serial but intentionally NO globalSerial on the adopt receipt.
  const result={ok:true,data:{pet:{ownerAccountId:owner,petId,templateId,name:'编号观察',serial:'00000030',element:'fire',resource:{resourceId:'builtin:lingjing-shiba-v2',kind:'2d'},source:'adoption',origin:{},growth:{level:1,experience:0,mood:60,satiety:60,affinity:0,winsTotal:0,stats:{hp:118,atk:33,def:20,spd:22}},desktop:{visible:false,behavior:'quiet',scale:1,position:{x:80,y:520,displayId:null}},revision:1,createdAt:created,updatedAt:created},selections:{chatPetId:null,battlePetId:null,guardPetId:null}},revision:3,duplicate:false};
  return {role,runId,sourceCommit,namespace,request:{submittedAtMs:at,command:'adopt',input},actionReadback:{source:'normal-own-sdk:lingjing_save_actions',requestedAtMs:at+200,receivedAtMs:at+300,owner_id:owner,action_id:'companions:'+input.actionId,kind:'authority',revision:5,checksum:'b'.repeat(64),companionAction:{owner_account_id:owner,action_id:input.actionId,operation:'adopt',request_hash:hash(input),result_json:JSON.stringify(result),created_at:created}},snapshot:{source:'companions-sync:snapshot',requestedAtMs:at+400,receivedAtMs:at+500,authority:'live',serialRegistry:{format:'lingjing.global-serial.readback',version:1,ownerAccountId:owner,namespace,revision:6,pets:[{namespace,ownerAccountId:owner,petId,templateId,globalSerial:String(i+1)},{namespace,ownerAccountId:owner,petId:reference.rows[i].petId,templateId:'animal-wood-deer',globalSerial:reference.rows[i].globalSerial}]}},ui:{source:'public-dom',observedAtMs:at+600,route:'/companions',ownerAccountId:owner,petId,templateId,visible:true,numberText:'编号 '+String(i+1).padStart(4,'0')}};
 });
 return {format:'lingjing.c11.independent-sequence.observations',version:1,runId,sourceCommit,namespace,templateId,window:{startedAtMs:start,endedAtMs:start+60000},owners,deerReference:reference,adoptions};
}
const failure=value=>assert.throws(()=>verify(value),e=>{
 assert.equal(e.message,'C11_INDEPENDENT_SEQUENCE_OBSERVATION_INVALID');assert.equal(e.code,e.message);
 assert.deepEqual(Object.keys(e),['code']);assert.equal(e.cause,undefined);return true;
});
const reject=(name,change)=>test(name,()=>{const value=fixture();change(value);failure(value);});

test('real-shaped original adopt results without serial metadata bind separately to 1 then 2; no live acceptance claim',()=>{
 const value=fixture();for(const a of value.adoptions)assert.equal(Object.hasOwn(JSON.parse(a.actionReadback.companionAction.result_json).data.pet,'globalSerial'),false);
 const before=JSON.stringify(value),result=verify(value);
 assert.deepEqual(result,{scope:'assertion-only',source:'not-authenticated',fullCasePassed:false});assert.equal(Object.isFrozen(result),true);assert.equal(JSON.stringify(value),before);
 assert.equal(Object.hasOwn(result,'passed'),false);assert.equal(Object.hasOwn(result,'authorization'),false);
});
test('untrusted historical receipt numbers are ignored, including values that disagree with authoritative registry',()=>{
 const value=fixture();editResult(value,0,r=>{r.data.pet.globalSerial='987654321';});editResult(value,1,r=>{r.data.pet.globalSerial='1';});verify(value);
 delete value.adoptions[0].snapshot;failure(value);
});
test('existing reference numbers may be assigned B=4/A=5; they are not an ordering or counter claim',()=>{
 const value=fixture();for(const [i,n]of ['5','4'].entries()){value.deerReference.rows[i].globalSerial=n;value.adoptions[i].snapshot.serialRegistry.pets[1].globalSerial=n;}verify(value);
});
test('additional same-scope owned identities are allowed without computing an owner max',()=>{
 const value=fixture();value.adoptions[0].snapshot.serialRegistry.pets.push({namespace,ownerAccountId:value.owners.a,petId:'pet-'+uuid(70),templateId:'big-fish-gentle',globalSerial:'90071992547409931234567890',spawnId:'original-wild-spawn'});verify(value);
});
test('frozen input is untouched and output contains no supplied identities, names, hashes or times',()=>{
 const value=fixture();const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}};freeze(value);
 assert.equal(JSON.stringify(verify(value)),'{"scope":"assertion-only","source":"not-authenticated","fullCasePassed":false}');
});
test('declared observation window retains the original two-hour maximum, not a new one-hour limit',()=>{
 const value=fixture();value.window.endedAtMs=start+7200000;verify(value);
});

for(const [name,change]of [
 ['missing original request',v=>{delete v.adoptions[0].request;}],
 ['missing original success result',v=>{delete v.adoptions[0].actionReadback.companionAction.result_json;}],
 ['receipt-only number cannot replace registry',v=>{editResult(v,0,r=>{r.data.pet.globalSerial='1';});delete v.adoptions[0].snapshot.serialRegistry;}],
 ['missing reference artifact',v=>{delete v.deerReference;}],
 ['wrong original artifact digest',v=>{v.deerReference.sha256='c'.repeat(64);}],
 ['wrong original artifact run',v=>{v.deerReference.runId++;}],
 ['wrong original artifact ID',v=>{v.deerReference.artifactId++;}],
 ['wrong original reuse digest',v=>{v.deerReference.reuseSha256='c'.repeat(64);}],
 ['wrong original package commit',v=>{v.deerReference.packageSource='c'.repeat(40);}],
 ['same owner twice',v=>{v.owners.b=v.owners.a;}],
 ['reference owner swapped',v=>{v.deerReference.rows[0].ownerAccountId=v.owners.b;}],
 ['duplicate reference number',v=>{v.deerReference.rows[1].globalSerial='4';}],
 ['duplicate reference pet',v=>{v.deerReference.rows[1].petId=v.deerReference.rows[0].petId;}],
 ['duplicate reference action',v=>{v.deerReference.rows[1].actionId=v.deerReference.rows[0].actionId;}],
 ['wrong original reference template',v=>{v.deerReference.templateId=templateId;}],
 ['target is not another template',v=>{v.templateId='animal-wood-deer';}],
 ['untrusted target template',v=>{v.templateId='invented-template';}],
 ['mixed run',v=>{v.adoptions[1].runId=uuid(90);}],
 ['mixed commit',v=>{v.adoptions[1].sourceCommit='c'.repeat(40);}],
 ['changed global namespace',v=>{v.namespace='live';}],
 ['mixed observation namespace',v=>{v.adoptions[1].namespace='qa:another';}],
 ['mixed reference namespace',v=>{v.deerReference.namespace='qa:another';}],
 ['mixed registry namespace',v=>{v.adoptions[1].snapshot.serialRegistry.namespace='live';}],
 ['history target entry namespace differs from correct registry wrapper',v=>{v.adoptions[0].snapshot.serialRegistry.pets[0].namespace='live';}],
 ['history deer entry namespace differs from correct registry wrapper',v=>{v.adoptions[0].snapshot.serialRegistry.pets[1].namespace='qa:old';}],
 ['other history entry namespace cannot hide under correct registry wrapper',v=>{v.adoptions[0].snapshot.serialRegistry.pets.push({namespace:'live',ownerAccountId:v.owners.a,petId:'pet-'+uuid(77),templateId:'animal-white-fox',globalSerial:'1'});}],
 ['replaced request action',v=>{v.adoptions[0].request.input.actionId=uuid(81);}],
 ['reused prior deer action',v=>{v.adoptions[0].request.input.actionId=v.deerReference.rows[0].actionId;}],
 ['changed request template',v=>{v.adoptions[0].request.input.templateId='animal-white-fox';}],
 ['changed request name without original hash',v=>{v.adoptions[0].request.input.name='替换请求';}],
 ['changed command',v=>{v.adoptions[0].request.command='observe';}],
 ['unexpected desktop side effect',v=>{v.adoptions[0].request.input.showOnDesktop=true;}],
 ['wrong action envelope owner',v=>{v.adoptions[0].actionReadback.owner_id=v.owners.b;}],
 ['wrong action envelope ID',v=>{v.adoptions[0].actionReadback.action_id='companions:'+uuid(82);}],
 ['wrong action kind',v=>{v.adoptions[0].actionReadback.kind='client';}],
 ['wrong companion row owner',v=>{v.adoptions[0].actionReadback.companionAction.owner_account_id=v.owners.b;}],
 ['wrong companion row action',v=>{v.adoptions[0].actionReadback.companionAction.action_id=uuid(83);}],
 ['wrong companion operation',v=>{v.adoptions[0].actionReadback.companionAction.operation='capture';}],
 ['wrong original hash',v=>{v.adoptions[0].actionReadback.companionAction.request_hash='0'.repeat(64);}],
 ['cached action source',v=>{v.adoptions[0].actionReadback.source='local-cache';}],
 ['cached registry source',v=>{v.adoptions[0].snapshot.source='local-cache';}],
 ['snapshot not live',v=>{v.adoptions[0].snapshot.authority='offline';}],
 ['stale snapshot revision',v=>{v.adoptions[0].snapshot.serialRegistry.revision=4;}],
 ['foreign registry owner',v=>{v.adoptions[0].snapshot.serialRegistry.ownerAccountId=v.owners.b;}],
 ['foreign registry entry owner',v=>{v.adoptions[0].snapshot.serialRegistry.pets[0].ownerAccountId=v.owners.b;}],
 ['wrong target pet',v=>{v.adoptions[0].snapshot.serialRegistry.pets[0].petId='pet-'+uuid(84);}],
 ['wrong target template',v=>{v.adoptions[0].snapshot.serialRegistry.pets[0].templateId='animal-white-fox';}],
 ['duplicate registry pet',v=>{v.adoptions[0].snapshot.serialRegistry.pets.push({...v.adoptions[0].snapshot.serialRegistry.pets[0]});}],
 ['duplicate registry number with another pet',v=>{v.adoptions[0].snapshot.serialRegistry.pets.push({...v.adoptions[0].snapshot.serialRegistry.pets[0],petId:'pet-'+uuid(85)});}],
 ['cross-owner duplicate same-template number',v=>{v.adoptions[1].snapshot.serialRegistry.pets.push({...v.adoptions[1].snapshot.serialRegistry.pets[0],petId:'pet-'+uuid(86),globalSerial:'1'});}],
 ['missing known deer assignment',v=>{v.adoptions[0].snapshot.serialRegistry.pets.pop();}],
 ['wrong current deer number',v=>{v.adoptions[0].snapshot.serialRegistry.pets[1].globalSerial='6';}],
 ['wild assignment substituted for normal adopt',v=>{v.adoptions[0].snapshot.serialRegistry.pets[0].spawnId='wild';}],
 ['wrong UI pet',v=>{v.adoptions[0].ui.petId='pet-'+uuid(87);}],
 ['wrong UI owner',v=>{v.adoptions[0].ui.ownerAccountId=v.owners.b;}],
 ['wrong UI template',v=>{v.adoptions[0].ui.templateId='animal-white-fox';}],
 ['hidden UI',v=>{v.adoptions[0].ui.visible=false;}],
 ['wrong UI route',v=>{v.adoptions[0].ui.route='/companions/adopt';}],
 ['unformatted UI number',v=>{v.adoptions[0].ui.numberText='1';}],
 ['wrong UI second number',v=>{v.adoptions[1].ui.numberText='0001';}],
 ['bare padded number is not the actual visible code text',v=>{v.adoptions[0].ui.numberText='0001';}],
 ['UI text is not public DOM observation',v=>{v.adoptions[0].ui.source='accessibility-label';}],
 ['missing second adoption',v=>{v.adoptions.pop();}],
 ['third adoption not authorized by this contract',v=>{v.adoptions.push(structuredClone(v.adoptions[1]));}],
 ['second owner/order swapped',v=>{v.adoptions.reverse();}],
 ['no bounded observation window',v=>{delete v.window;}],
 ['window exceeds two-hour bound',v=>{v.window.endedAtMs=v.window.startedAtMs+7200001;}],
 ['zero window',v=>{v.window.endedAtMs=v.window.startedAtMs;}],
 ['time outside bound',v=>{v.adoptions[0].request.submittedAtMs=start-1;}],
 ['UI before registry return',v=>{v.adoptions[0].ui.observedAtMs=start+1499;}],
 ['registry before original action readback',v=>{v.adoptions[0].snapshot.requestedAtMs=start+1299;}],
 ['second request predates first complete observation',v=>{v.adoptions[1].request.submittedAtMs=start+1500;}],
 ['noncanonical server date',v=>{v.adoptions[0].actionReadback.companionAction.created_at='2026-11-05';}]
])reject(name,change);

for(const [name,offset]of [['original pet predates this submitted adoption',999],['pet creation is later than its completed UI observation',2000]])reject(name,v=>{
 const created=new Date(start+offset).toISOString();v.adoptions[0].actionReadback.companionAction.created_at=created;
 editResult(v,0,r=>{r.data.pet.createdAt=created;r.data.pet.updatedAt=created;});
});
reject('cross-owner known pet cannot be relabelled with another template and unused number',v=>{
 const other=v.adoptions[0].snapshot.serialRegistry.pets[0];
 v.adoptions[1].snapshot.serialRegistry.pets.push({...other,ownerAccountId:v.owners.b,templateId:'animal-hat-cat',globalSerial:'99'});
});
reject('cross-owner extra pet cannot be relabelled either',v=>{
 const row={namespace,ownerAccountId:v.owners.a,petId:'pet-'+uuid(92),templateId:'animal-hat-cat',globalSerial:'98'};
 v.adoptions[0].snapshot.serialRegistry.pets.push(row);v.adoptions[1].snapshot.serialRegistry.pets.push({...row,ownerAccountId:v.owners.b,globalSerial:'99'});
});
reject('second original adoption cannot reuse the first action even if its other bindings are rewritten',v=>{
 const sample=v.adoptions[1],id=v.adoptions[0].request.input.actionId;sample.request.input.actionId=id;
 sample.actionReadback.action_id='companions:'+id;sample.actionReadback.companionAction.action_id=id;sample.actionReadback.companionAction.request_hash=hash(sample.request.input);
});

for(const bad of [undefined,null,0,1,2,'0','01','0001','2','-1','1.0','1e0','9007199254740993'])reject('first authority must actually be canonical string 1: '+String(bad),v=>{v.adoptions[0].snapshot.serialRegistry.pets[0].globalSerial=bad;});
for(const bad of [null,2,'1','02','0002','3','2000'])reject('second authority must actually be canonical string 2: '+String(bad),v=>{v.adoptions[1].snapshot.serialRegistry.pets[0].globalSerial=bad;});
for(const [name,change]of [
 ['unsuccessful original result',r=>{r.ok=false;}],['duplicate original result',r=>{r.duplicate=true;}],
 ['wrong result owner',r=>{r.data.pet.ownerAccountId='account:'+uuid(91);}],['wrong result template',r=>{r.data.pet.templateId='animal-white-fox';}],
 ['changed result name',r=>{r.data.pet.name='替换请求';}],['capture result instead of adopt',r=>{r.data.pet.source='capture';}],
 ['additional origin authority',r=>{r.data.pet.origin.globalSerial='1';}],['result lacks pet',r=>{delete r.data.pet;}],
 ['result revision noninteger',r=>{r.revision=.5;}],['malformed selection',r=>{r.data.selections.chatPetId='adopt';}],
 ['extra nested password',r=>{r.data.pet.password='DO-NOT-ECHO';}]
])reject(name,v=>editResult(v,0,change));

test('every object in the observation rejects extra credential or authority keys',()=>{
 const original=fixture(),paths=[];
 const walk=(v,path=[])=>{if(v&&typeof v==='object'){if(!Array.isArray(v))paths.push(path);for(const[k,x]of Object.entries(v))walk(x,[...path,k]);}};walk(original);
 for(const path of paths){const value=fixture(),target=path.reduce((v,k)=>v[k],value);target.password='DO-NOT-ECHO';failure(value);}
 for(const key of ['credentials','authorization','access_token','service_role','ownerMax','counter','passed','fullCasePassed','callback']){const value=fixture();value[key]='DO-NOT-ECHO';failure(value);}
});
test('every parsed original-result object rejects unknown fields, including embedded credentials',()=>{
 const value=fixture(),r=JSON.parse(value.adoptions[0].actionReadback.companionAction.result_json),paths=[];
 const walk=(v,path=[])=>{if(v&&typeof v==='object'){paths.push(path);for(const[k,x]of Object.entries(v))walk(x,[...path,k]);}};walk(r);
 for(const path of paths){const value=fixture();editResult(value,0,r=>{path.reduce((v,k)=>v[k],r).access_token='DO-NOT-ECHO';});failure(value);}
});
test('JSON credential smuggling, malformed JSON and duplicate keys all fail without echo',()=>{
 for(const raw of ['{','{"password":"DO-NOT-ECHO"}','{"ok":false,"ok":true}', ' '.repeat(20000)]){const value=fixture();value.adoptions[0].actionReadback.companionAction.result_json=raw;failure(value);}
 const value=fixture(),row=value.adoptions[0].actionReadback.companionAction;row.result_json=row.result_json.replace('"ok":true','"ok":false,"ok":true');failure(value);
});
test('non-JSON shapes, symbols, accessors, inherited data and excessive recursion fail closed',()=>{
 for(const value of [undefined,null,[],()=>{},new Date(),Object.create(fixture())])failure(value);
 for(const change of [v=>{v.window.endedAtMs=Infinity;},v=>{v.extra=1n;},v=>{v[Symbol('password')]='DO-NOT-ECHO';},v=>{delete v.adoptions[0];},v=>{v.adoptions.extra='DO-NOT-ECHO';},v=>{v.extra=v;},v=>{v.sourceCommit='x'.repeat(32769);},v=>{v.extra=new Map();}]){const value=fixture();change(value);failure(value);}
 let called=false;const value=fixture();Object.defineProperty(value,'password',{enumerable:true,get(){called=true;return 'DO-NOT-ECHO';}});failure(value);assert.equal(called,false);
});
test('reject Proxy values before any trap or input reflection, including nested and revoked proxies',()=>{
 let calls=0;const handler={get(){calls++;throw Error('DO-NOT-ECHO');},ownKeys(){calls++;throw Error('DO-NOT-ECHO');},getPrototypeOf(){calls++;throw Error('DO-NOT-ECHO');},getOwnPropertyDescriptor(){calls++;throw Error('DO-NOT-ECHO');}};
 failure(new Proxy(fixture(),handler));
 const value=fixture();value.adoptions[0].request.input=new Proxy(value.adoptions[0].request.input,handler);failure(value);
 const arrays=fixture();arrays.adoptions=new Proxy(arrays.adoptions,handler);failure(arrays);
 const revoked=Proxy.revocable(fixture(),handler);revoked.revoke();failure(revoked.proxy);assert.equal(calls,0);
});
test('custom array prototypes cannot run entries/map/iterator hooks',()=>{
 let calls=0;const value=fixture(),prototype=Object.create(Array.prototype);
 for(const name of ['entries','map',Symbol.iterator])Object.defineProperty(prototype,name,{value(){calls++;throw Error('DO-NOT-ECHO');}});
 Object.setPrototypeOf(value.adoptions,prototype);failure(value);assert.equal(calls,0);
});
test('validator has no production imports, collector, network, filesystem, credentials, IDs or driver integration',()=>{
 const source=readFileSync(new URL('./cloud-c11-independent-sequence-observations.mjs',import.meta.url),'utf8');
 assert.deepEqual([...source.matchAll(/^import .* from '([^']+)';$/gm)].map(x=>x[1]),['node:crypto','node:util']);
 assert.equal(/\b(fetch|XMLHttpRequest|WebSocket|randomUUID|readFileSync|writeFileSync|execFileSync|setTimeout|setInterval)\s*\(/.test(source),false);
 assert.equal(/\b(process|globalThis)\s*[.[]/.test(source),false);
 // Readiness may pin these bytes/run this synthetic test as metadata. Neither
 // executable business dispatcher nor discovery runner may consume the module.
 for(const file of ['cloud-live-qa-completion-driver.mjs','cloud-live-qa-discovery-cases.mjs'])assert.equal(readFileSync(new URL(file,import.meta.url),'utf8').includes('cloud-c11-independent-sequence-observations'),false);
});
