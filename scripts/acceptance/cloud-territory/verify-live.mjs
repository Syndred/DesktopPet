import assert from 'node:assert/strict';
import {fork,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {canonical} from '../../../apps/pc-app/runtime/features/garden/cloud-domain.mjs';
const configPath=resolve(process.argv[2]||'artifacts/garden/cloud/private-clients.json'),config=JSON.parse(readFileSync(configPath,'utf8'));
assert.equal(config.purpose,'lingjing-cloud-territory-acceptance');assert.equal(config.testOnly,true);assert.equal(config.projectUrl,'https://jbvrdmrkwpznbrvteive.supabase.co');
assert.ok(config.actors.length>=3);assert.notEqual(config.actors[0].ownerAccountId,config.actors[1].ownerAccountId);assert.equal(config.actors[0].ownerAccountId,config.actors[2].ownerAccountId);assert.equal(new Set(config.actors.map(a=>a.deviceId)).size,3);
const output=resolve(config.output);mkdirSync(output,{recursive:true});const file=join(output,'public-evidence.json');
const proof=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{runId:config.runId,startedAt:new Date().toISOString(),source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),provenance:'real Supabase HTTPS, PostGIS, Auth and canonical engine; coordinator-granted simulated location',projectRef:'jbvrdmrkwpznbrvteive',scenarioId:config.scenarioId,clientRuntime:'three independent Node processes; Electron acceptance separate',samePhysicalHost:true,physicalTwoDeviceAcceptance:false,actions:{},checks:[],passed:false,overallPassed:false};
const save=()=>writeFileSync(file,JSON.stringify(proof,null,2)+'\n'),hash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const workers=[],clients=[],active=[];
async function connect(index){
  const child=fork(resolve('scripts/acceptance/cloud-territory/https-worker.mjs'),[configPath,String(index)],{stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});workers.push(child);const pending=new Map();
  await new Promise((done,reject)=>{child.once('error',reject);child.once('exit',()=>reject(Error('HTTPS client exited before ready')));child.once('message',message=>{if(!message.ready)reject(Error('Client did not start'));else{active[index]={pid:message.pid,actor:message.actor};done();}});});
  child.on('message',message=>{const item=pending.get(message.id);if(!item)return;pending.delete(message.id);clearTimeout(item.timer);message.error?item.reject(Object.assign(new Error(message.error.message),{code:message.error.code})):item.resolve(message.result);});
  child.on('exit',()=>{for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('Client stopped; outcome uncertain'));}pending.clear();});
  return (which,body,options={})=>new Promise((done,reject)=>{const id=randomUUID(),timer=setTimeout(()=>{pending.delete(id);reject(Error('Observation timed out; retain exact action and inspect before retry'));},90000);pending.set(id,{resolve:done,reject,timer});child.send({id,which,body,...options});});
}
function success(response){assert.equal(response.body?.ok,true,`HTTP ${response.httpStatus}: ${response.body?.code||'unreadable'}`);return response.body.data;}
const call=async(index,which,body,options)=>success(await clients[index](which,body,options));
const state=index=>call(index,'territory',{op:'snapshot'});
function summary(value){const snapshot=value.snapshot||value.readback?.snapshot;assert.ok(snapshot);return {ownerAccountId:snapshot.ownerAccountId,gardenRevision:snapshot.revision,accountRevision:value.accountRevision||value.readback?.accountRevision,checksum:value.envelope?.checksum||value.readback?.envelope?.checksum,inventory:snapshot.items.map(({id,quantity})=>({id,quantity})),plots:snapshot.plots.map(({stage,...plot})=>plot),pets:snapshot.pets.map(({petId,revision,growth})=>({petId,revision,growth})),territories:snapshot.territories};}
async function action(key,make){if(!proof.actions[key]){proof.actions[key]=await make();save();}return proof.actions[key];}
async function location(index,purpose,reference){const result=await clients[index]('discovery',null,{operation:'prove',purpose,reference}),permit=success(result);assert.equal(permit.source,'simulated');assert.equal(permit.fix.scenarioId,config.scenarioId);return permit.id;}
async function readSession(index,id){return call(index,'territory',{op:'session',input:{sessionId:id}});}
function record(name,data={}){proof.checks.push({name,...data});save();}
function resolvedFailure(){if(proof.failure){proof.resolvedIncidents||=[];proof.resolvedIncidents.push(proof.failure);delete proof.failure;}}
async function independentReceipt(index,receiptId){const saved=await call(index,'save',{op:'read',actionId:receiptId});assert.equal(saved.actionId,receiptId);assert.ok(saved.revision>0&&saved.envelope?.checksum===saved.checksum);return {revision:saved.revision,checksum:saved.checksum};}

async function initialize(){
  for(const [label,options] of [['anonymous',{anonymous:true}],['forged JWT',{forged:true}]]){
    const rejected=await clients[0]('territory',{op:'snapshot'},options);assert.equal(rejected.httpStatus,401);assert.equal(rejected.body.ok,false);record(label,{httpStatus:rejected.httpStatus,code:rejected.body.code});
  }
  for(let index=0;index<2;index++){
    await call(index,'garden',{op:'snapshot'});proof.pets||=[[],[]];
    for(let pet=0;pet<2;pet++){
      const input=await action(`adopt${index}:${pet}:v2`,async()=>({actionId:`garden-adopt-v2:${proof.runId}:${index}:${pet}`,templateId:pet?'big-fish-gentle':'animal-shiba',name:`园地${index?'乙':'甲'}${pet?'伙伴':'出战'}`,showOnDesktop:false}));
      const receipt=await call(index,'companions',{op:'command',command:'adopt',input});assert.equal(receipt.authority,'live');proof.pets[index][pet]=receipt.result.data.pet.petId;save();
      await independentReceipt(index===0?2:1,receipt.actionId);
    }
  }
  if(!proof.sameAccountRace){
    const before=summary(await state(0)),inputs=await Promise.all([0,2].map((index,slot)=>action(`farmRace${slot}`,async()=>({actionId:`garden-race:${proof.runId}:${slot}`,sessionOwnerAccountId:config.actors[0].ownerAccountId,expectedRevision:before.gardenRevision,plotId:`plot-${slot+1}`,cropType:'carrot'}))));
    const responses=await Promise.all([0,2].map((index,slot)=>clients[index]('garden',{op:'command',command:'plant',input:inputs[slot]})));
    assert.equal(responses.filter(r=>r.body?.ok===true).length,1);const denied=responses.find(r=>r.body?.ok!==true);assert.equal(denied.httpStatus,409);assert.ok(['SYNC_CONFLICT','REVISION_CONFLICT'].includes(denied.body.code));
    const after=await Promise.all([state(0),state(2)]);assert.equal(after[0].envelope.checksum,after[1].envelope.checksum);assert.equal(after[0].snapshot.revision,before.gardenRevision+1);
    const winner=responses.findIndex(r=>r.body?.ok===true),receipt=responses[winner].body.data;const replay=await call(winner===0?2:0,'garden',{op:'command',command:'plant',input:inputs[winner]});assert.equal(replay.replayed,true);assert.equal(replay.accountRevision,receipt.accountRevision);
    proof.sameAccountRace={passed:true,denied:denied.body.code,receipt:await independentReceipt(2,receipt.authorityReceiptId)};save();record('same-account distinct-device concurrent farm writes commit once and replay across devices');
  }
  if(!proof.economy){
    const current=await state(0),input=await action('ricePlant',async()=>({actionId:`rice-plant:${proof.runId}`,sessionOwnerAccountId:config.actors[0].ownerAccountId,expectedRevision:current.snapshot.revision,plotId:'plot-3',cropType:'rice'}));
    const receipt=await call(0,'garden',{op:'command',command:'plant',input});proof.economy={plotId:'plot-3',startedAt:receipt.result.data.plantedAt,maturesAt:receipt.result.data.maturesAt,growMs:receipt.result.data.maturesAt-receipt.result.data.plantedAt,passed:false};assert.equal(proof.economy.growMs,1500000);save();record('real server-clock rice planted for original25-minute maturity period',proof.economy);
  }
}
async function fight(index,key,territory,petId,lose=false){
  const input=await action(`${key}:challenge`,async()=>({actionId:`${key}-challenge:${proof.runId}:${index}`,sessionOwnerAccountId:config.actors[index].ownerAccountId,territoryId:territory.id,expectedTerritoryRevision:territory.revision,petId,locationReceiptId:await location(index,'territory:challenge',territory.id)}));
  let battle;
  if(proof.actions[`${key}:session`])battle=(await readSession(index,proof.actions[`${key}:session`])).session;
  else{const begun=await call(index,'territory',{op:'challenge',input});battle=begun.battle;proof.actions[`${key}:session`]=battle.id;save();}
  assert.equal(battle.context.authority,'cloud');assert.equal(battle.player.petId,petId);assert.equal(battle.context.scenarioId,config.scenarioId);
  for(let count=0;count<150&&battle.status==='active';count++){
    const round=battle.snapshot.round+1,choice=lose?'dodge':battle.snapshot.player.anger>=battle.rules.ultimateAnger?'ultimate':'normal_attack';
    const move=await action(`${key}:round:${round}`,async()=>({actionId:`${key}-act:${proof.runId}:${index}:${round}`,sessionId:battle.id,expectedRound:round,action:choice}));
    battle=(await call(index,'territory',{op:'act',input:move})).data;
  }
  assert.equal(battle.status,'finished');return battle;
}
async function resolveInitialDefeats(){
  if(proof.initialAttempt||!proof.battles?.every(b=>b.winner==='enemy'))return;
  const original={battles:structuredClone(proof.battles),before:structuredClone(proof.before),settlements:[]};
  for(let index=0;index<2;index++){
    const current=await state(index),input=await action(`initialDefeat${index}`,async()=>({actionId:`initial-defeat:${proof.runId}:${index}`,sessionId:original.battles[index].id,sessionOwnerAccountId:config.actors[index].ownerAccountId,expectedRevision:current.snapshot.revision}));
    const settled=await call(index,'territory',{op:'settle',input});assert.equal(settled.ok,true);assert.equal(settled.data.won,false);assert.equal(settled.data.ownerAccountId,null);assert.equal(settled.data.territoryRevision,proof.territory.revision);assert.equal(settled.battle.reward.experience,5);assert.equal(settled.battle.reward.seeds.quantity,2);
    const after=summary(settled.readback);await call(index,'territory',{op:'settle',input});assert.deepEqual(summary(await state(index)),after);
    original.settlements[index]={sessionId:input.sessionId,experience:5,seeds:2,replayedOnce:true,after};
  }
  // A second ordinary attempt uses a legitimately adopted counter-element.
  // Keep both original defeats, inputs and receipts; do not reset any counter,
  // edit HP, replace the server outcome or change canonical battle rules.
  proof.contestPets=[];
  for(let index=0;index<2;index++){
    const input=await action(`adoptMetal${index}`,async()=>({actionId:`garden-metal:${proof.runId}:${index}`,templateId:'animal-hat-cat',name:`园地${index?'乙':'甲'}礼帽喵`,showOnDesktop:false}));
    const adopted=await call(index,'companions',{op:'command',command:'adopt',input});proof.contestPets[index]=adopted.result.data.pet.petId;
  }
  proof.contestBefore=await Promise.all([0,1].map(async index=>summary(await state(index))));proof.initialAttempt=original;proof.defeat={passed:true,sessions:original.battles.map(b=>b.id),worldRevisionUnchanged:true,onlyLegalParticipationReward:true};save();record('both original natural defeats retained and settled once; second legal daily attempt uses normal adopted metal companions');
}
async function contest(){
  if(proof.passed)return;
  await resolveInitialDefeats();
  proof.before||=await Promise.all([0,1].map(async i=>summary(await state(i))));save();
  const located=await Promise.all([0,1].map(async index=>{
    const input=await action(`locate${index}`,async()=>({actionId:`garden-locate:${proof.runId}:${index}`,sessionOwnerAccountId:config.actors[index].ownerAccountId,locationReceiptId:await location(index,'territory:read','')}));return call(index,'territory',{op:'locate',input});
  }));
  const territory=located[0].data;assert.equal(territory.id,located[1].data.id);assert.ok(territory.id.startsWith(`qa:${config.scenarioId}:territory:`));
  if(!proof.territory){assert.equal(territory.ownerAccountId,null);proof.territory=territory;save();}
  const beforeContest=proof.contestBefore||proof.before,contestPets=proof.contestPets||proof.pets.map(pets=>pets[0]),series=proof.initialAttempt?'contestRetry':'contest';
  const battles=await Promise.all([0,1].map(index=>fight(index,`${series}${index}`,proof.territory,contestPets[index])));proof.battles=battles.map(b=>({id:b.id,winner:b.winner,rounds:b.snapshot.round,player:b.player,context:b.context}));save();
  for(let index=0;index<2;index++){const denied=await clients[1-index]('territory',{op:'session',input:{sessionId:battles[index].id}});assert.equal(denied.httpStatus,403);record('foreign authoritative battle denied',{code:denied.body.code});}
  assert.ok(battles.every(b=>b.winner==='player'),'Natural outcomes did not produce two competing winners; preserve original run and report incomplete, never force or replace a result');
  const inputs=await Promise.all([0,1].map(index=>action(`settle${index}`,async()=>({actionId:`garden-settle:${proof.runId}:${index}`,sessionId:battles[index].id,sessionOwnerAccountId:config.actors[index].ownerAccountId,expectedRevision:beforeContest[index].gardenRevision,locationReceiptId:await location(index,'territory:settle',battles[index].id)}))));
  if(!proof.transportFault){const results=await Promise.all([0,1].map(index=>clients[index]('territory',{op:'settle',input:inputs[index]},index===0?{disconnectAfterHeaders:true}:{})));proof.transportFault={kind:'actual HTTPS response stream destroyed after server headers before body',httpStatus:results[0].httpStatus,clientPid:active[0].pid,physicalInternetOutage:false};save();}
  const retry=await Promise.all([0,1].map(index=>call(index,'territory',{op:'settle',input:inputs[index]}))),contexts=await Promise.all([0,1].map(index=>readSession(index,battles[index].id)));
  const confirmed=contexts.map(ctx=>ctx.context.result?.ok===true);assert.equal(confirmed.filter(Boolean).length,1);const winner=confirmed.findIndex(Boolean),loser=1-winner;
  assert.equal(contexts[loser].context.result.code,'TERRITORY_CONFLICT');assert.equal(contexts[winner].territory.ownerAccountId,config.actors[winner].ownerAccountId);assert.equal(contexts[loser].territory.ownerAccountId,config.actors[winner].ownerAccountId);
  for(let index=0;index<2;index++){
    const after=summary(contexts[index]),before=beforeContest[index],seed=contexts[index].session.reward?.seeds;
    assert.deepEqual(after.plots,before.plots);assert.deepEqual(after.pets.filter(p=>p.petId!==contestPets[index]),before.pets.filter(p=>p.petId!==contestPets[index]));
    const seeds=contexts[index].envelope.data.modules.garden.data.tables.garden_reward_receipts.filter(r=>r.source==='battle'&&r.receipt_id===battles[index].id);assert.equal(seeds.length,confirmed[index]?1:0);
    for(const item of after.inventory)assert.equal(item.quantity,(before.inventory.find(i=>i.id===item.id)?.quantity||0)+(confirmed[index]&&item.id===seed.itemId?2:0));
    if(confirmed[index]){assert.equal(contexts[index].session.reward.experience,20);await independentReceipt(index===0?2:1,contexts[index].context.result.receipt.authorityReceiptId);}else assert.deepEqual(after.pets,before.pets);
    assert.equal(hash(summary(await state(index))),hash(after));assert.equal(retry[index].replayed,true);
  }
  proof.winner=winner;proof.loser=loser;proof.contest={passed:true,exactlyOneOccupation:true,loserCode:'TERRITORY_CONFLICT',recovery:'original actionId/hash/proof replay after real response-stream loss'};save();record('two actual server wins contest one PostGIS revision; stale winner has no growth or seeds; exact retry recovers original receipt');
  if(!proof.defeat){
    const before=summary(await state(loser)),region=(await readSession(loser,battles[loser].id)).territory;
    const failed=await fight(loser,'defeat',region,proof.pets[loser][1],true);assert.equal(failed.winner,'enemy');
    const input=await action('defeat:settle',async()=>({actionId:`defeat-settle:${proof.runId}`,sessionId:failed.id,sessionOwnerAccountId:config.actors[loser].ownerAccountId,expectedRevision:before.gardenRevision}));
    const settled=await call(loser,'territory',{op:'settle',input});assert.equal(settled.ok,true);assert.equal(settled.data.won,false);assert.equal(settled.data.ownerAccountId,region.ownerAccountId);assert.equal(settled.data.territoryRevision,region.revision);assert.equal(settled.battle.reward.experience,5);assert.equal(settled.battle.reward.seeds.quantity,2);
    const after=summary(settled.readback);assert.deepEqual(after.plots,before.plots);assert.deepEqual(after.pets.filter(p=>p.petId!==failed.player.petId),before.pets.filter(p=>p.petId!==failed.player.petId));
    await call(loser,'territory',{op:'settle',input});assert.equal(hash(summary(await state(loser))),hash(after));proof.defeat={passed:true,sessionId:failed.id,worldRevisionUnchanged:true,onlyLegalParticipationReward:true};save();record('natural defeat does not occupy or advance world revision; canonical5XP/two seeds are credited once');
  }
  if(!proof.garrison){
    const current=await state(winner),region=current.territories.find(t=>t.id===proof.territory.id),before=summary(current);
    const input=await action('garrison',async()=>({actionId:`garden-guard:${proof.runId}`,territoryId:region.id,petId:proof.pets[winner][0],expectedTerritoryRevision:region.revision,expectedRevision:current.snapshot.revision,sessionOwnerAccountId:config.actors[winner].ownerAccountId}));
    const guarded=await call(winner,'territory',{op:'garrison',input});assert.deepEqual(summary(guarded.readback).inventory,before.inventory);assert.deepEqual(summary(guarded.readback).pets,before.pets);
    const denied=await clients[loser]('territory',{op:'garrison',input:{...input,actionId:`garden-forbidden:${proof.runId}`,sessionOwnerAccountId:config.actors[loser].ownerAccountId}});assert.equal(denied.httpStatus,403);proof.garrison={passed:true,foreignDenied:denied.body.code};save();record('garrison changes no inventory, growth or selections and rejects foreign owner');
  }
  proof.after=await Promise.all([0,1].map(async i=>summary(await state(i))));proof.passed=true;proof.completedAt=new Date().toISOString();save();
}
async function economy(){
  assert.ok(proof.economy);if(proof.economy.passed)return;
  let current=await state(0),before=summary(current);if(current.serverTime<proof.economy.maturesAt){console.log(JSON.stringify({phase:'economy',pending:true,maturesAt:new Date(proof.economy.maturesAt).toISOString(),remainingMs:proof.economy.maturesAt-current.serverTime,evidence:file}));return;}
  const harvest=await action('riceHarvest',async()=>({actionId:`rice-harvest:${proof.runId}`,sessionOwnerAccountId:config.actors[0].ownerAccountId,expectedRevision:current.snapshot.revision,plotIds:['plot-3']}));
  const harvested=await call(0,'garden',{op:'command',command:'harvest',input:harvest});assert.equal(harvested.result.data.harvested[0].quantity,2);current=await state(0);
  const craft=await action('riceCraft',async()=>({actionId:`rice-craft:${proof.runId}`,sessionOwnerAccountId:config.actors[0].ownerAccountId,expectedRevision:current.snapshot.revision,recipeId:'cooked_rice',quantity:1}));
  const crafted=await call(0,'garden',{op:'command',command:'craft',input:craft});assert.equal(crafted.result.data.quantity,1);current=await state(0);
  const target=current.snapshot.pets.find(p=>p.petId===proof.pets[0][0]),feed=await action('riceFeed',async()=>({actionId:`rice-feed:${proof.runId}`,sessionOwnerAccountId:config.actors[0].ownerAccountId,expectedRevision:current.snapshot.revision,petId:target.petId,expectedPetRevision:target.revision,itemId:'cooked_rice',quantity:1}));
  const fed=await call(0,'garden',{op:'command',command:'feed',input:feed});assert.equal(fed.result.data.petId,target.petId);const after=summary(fed.readback);
  assert.deepEqual(after.pets.filter(p=>p.petId!==target.petId),before.pets.filter(p=>p.petId!==target.petId));
  const repeat=await call(2,'garden',{op:'command',command:'feed',input:feed});assert.equal(repeat.replayed,true);assert.equal(hash(summary(await state(0))),hash(after));await independentReceipt(2,fed.authorityReceiptId);
  proof.economy={...proof.economy,passed:true,finishedAt:new Date().toISOString(),actualElapsedMs:current.serverTime-proof.economy.startedAt,harvested:2,crafted:1,fedTo:target.petId,repeatAcrossDevice:true};proof.after=await Promise.all([0,1].map(async i=>summary(await state(i))));save();record('actual original25-minute maturity, harvest2, craft1 and feed same pet once, independently read by same-account other device');
}
async function negatives(){
  assert.equal(proof.passed,true);const index=proof.loser,other=1-index,before=await state(index),region=before.territories.find(t=>t.id===proof.territory.id);
  const request=await action('expiredProofChallenge',async()=>({actionId:`expired-proof:${proof.runId}`,sessionOwnerAccountId:config.actors[index].ownerAccountId,territoryId:region.id,expectedTerritoryRevision:region.revision,petId:proof.contestPets[index],locationReceiptId:await location(index,'territory:challenge',region.id)}));
  if(!proof.security?.expiredProof){await new Promise(resolve=>setTimeout(resolve,16000));const denied=await clients[index]('territory',{op:'challenge',input:request});assert.equal(denied.body?.ok,false);assert.equal(denied.body.code,'LOCATION_PROOF_EXPIRED');assert.equal(denied.httpStatus,409);proof.security||={};proof.security.expiredProof={passed:true,code:denied.body.code};save();}
  const scoped=await location(index,'territory:challenge','wrong-region-reference');
  const scopeDenied=await clients[index]('territory',{op:'challenge',input:{...request,actionId:`wrong-scope:${proof.runId}`,locationReceiptId:scoped}});assert.equal(scopeDenied.body.ok,false);assert.equal(scopeDenied.body.code,'LOCATION_PROOF_SCOPE_MISMATCH');
  const foreignProof=await clients[other]('territory',{op:'challenge',input:{...request,actionId:`foreign-proof:${proof.runId}`,sessionOwnerAccountId:config.actors[other].ownerAccountId,petId:proof.contestPets[other],locationReceiptId:scoped}});assert.equal(foreignProof.body.ok,false);assert.ok(/LOCATION|OWNER/.test(foreignProof.body.code));
  const forged=await clients[index]('territory',{op:'settle',input:{sessionId:proof.battles[index].id,actionId:`forged-winner:${proof.runId}`,winner:'player'}});assert.equal(forged.httpStatus,403);assert.equal(forged.body.code,'UNTRUSTED_AUTHORITY_FIELD');
  const missing=await clients[index]('territory',{op:'locate',input:{actionId:`missing-proof:${proof.runId}`}});assert.equal(missing.body.ok,false);assert.equal(missing.body.code,'LOCATION_PERMIT_REQUIRED');
  assert.equal((await state(index)).envelope.checksum,before.envelope.checksum);
  const rice=await state(0);
  if(rice.serverTime<proof.economy.maturesAt){
    const denied=await clients[0]('garden',{op:'command',command:'harvest',input:{actionId:`immature-harvest:${proof.runId}`,expectedRevision:rice.snapshot.revision,plotIds:['plot-3']}});assert.equal(denied.body.ok,false);assert.equal(denied.body.code,'CROP_NOT_MATURE');assert.equal((await state(0)).envelope.checksum,rice.envelope.checksum);proof.security.immatureHarvest={passed:true,code:denied.body.code};
  }
  proof.security={...proof.security,passed:true,wrongScope:scopeDenied.body.code,foreignProof:foreignProof.body.code,forgedWinner:forged.body.code,missingProof:missing.body.code,noEconomicChange:true};save();record('real HTTPS expired15-second proof, wrong scope, foreign proof, forged winner, missing proof and premature harvest denied without economics',proof.security);
}
async function restart(){
  assert.equal(proof.passed,true);assert.ok(proof.after);
  for(let index=0;index<2;index++){
    const current=summary(await state(index));assert.deepEqual(current,proof.after[index]);const session=await readSession(index,proof.battles[index].id);assert.equal(session.context.settled,true);
    await call(index,'territory',{op:'settle',input:proof.actions[`settle${index}`]});assert.deepEqual(summary(await state(index)),current);
  }
  proof.restartReadback={passed:true,at:new Date().toISOString(),clients:active};proof.overallPassed=proof.passed===true&&proof.economy?.passed===true;save();
}
try{
  for(let index=0;index<3;index++)clients[index]=await connect(index);assert.equal(new Set(active.map(c=>c.pid)).size,3);proof.clients=proof.clients||active;proof.lastClients=active;save();
  if(process.argv.includes('--readback'))await restart();
  else if(process.argv.includes('--negative'))await negatives();
  else if(process.argv.includes('--economy'))await economy();
  else{await initialize();if(!process.argv.includes('--prepare-only'))await contest();}
  resolvedFailure();save();console.log(JSON.stringify({evidence:file,passed:proof.passed,economyPassed:proof.economy?.passed||false,restartPassed:proof.restartReadback?.passed||false,overallPassed:proof.overallPassed,physicalTwoDeviceAcceptance:false}));
}catch(error){proof.failure={at:new Date().toISOString(),code:error.code||'ASSERTION_FAILED',message:String(error.message)};proof.overallPassed=false;save();console.error(JSON.stringify({evidence:file,failure:proof.failure}));process.exitCode=1;}
finally{for(const worker of workers)worker.kill();}
