import { PGlite } from '@electric-sql/pglite';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { resolveRoomRound } from '../../../../../../infra/supabase/functions/lingjing-battle/room-core.js';
import { friendSession } from '../../../../../../infra/supabase/functions/lingjing-battle/projection.js';
import { prepareBattleSettlement } from '../../../../../../infra/supabase/functions/lingjing-battle/settlement.js';
import { BattleRuntimeService, getBattleRules, BATTLE_CORE_VERSION } from '../../../../../../infra/supabase/functions/_shared/battle-core.js';
import {loadSharedActorGuard} from './shared-actor-sql.mjs';
const require=createRequire(import.meta.url),db=new PGlite(),checks=[],locals=[];
const {migrateCompanions}=require('../../companions/migrations.cjs'),{CompanionsService}=require('../../companions/service.cjs');
const {createCompanionBackupAdapter}=require('../../companions/backup.cjs'),{createGardenBackupAdapter}=require('../../garden/backup.cjs');
const {GardenService}=require('../../garden/service.cjs'),{BackupManager}=require('../../accounts/backups.cjs');
const {BattleCloudAuthority}=require('../cloud-authority.cjs');
const {saveDataChecksum}=require('../../accounts/util.cjs');
const users=['host','guest'].map(name=>({uid:randomUUID(),owner:randomUUID(),account:name,device:randomUUID(),sid:randomUUID()}));
const record=name=>{checks.push(name);console.log(name);};
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;GRANT USAGE ON SCHEMA auth TO authenticated,service_role;
CREATE TABLE auth.users(id uuid PRIMARY KEY,is_anonymous boolean NOT NULL DEFAULT false);
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL,not_after timestamptz);
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (auth.jwt()->>'sub')::uuid$$;
CREATE SCHEMA realtime;CREATE TABLE realtime.messages(topic text,extension text);ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql STABLE AS $$SELECT current_setting('request.topic',true)$$;`);
await loadSharedActorGuard(db);
for(const name of ['20261025020540_lingjing_battle_jwt_rooms','20261025024552_lingjing_battle_authority_save'])await db.exec(readFileSync(`infra/supabase/migrations/${name}.sql`,'utf8'));
async function rpc(name,args,role='service_role') {
  await db.exec(`BEGIN;SET LOCAL ROLE ${role}`);
  try {const result=await db.query(`SELECT public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) value`,args);await db.exec('COMMIT');return result.rows[0].value;}
  catch(error){await db.exec('ROLLBACK');throw error;}
}
const head=async user=>(await db.query('SELECT * FROM public.lingjing_saves WHERE owner_id=$1',[user.owner])).rows[0];
function fixture(user,templateId) {
  const sqlite=new DatabaseSync(':memory:');locals.push(sqlite);sqlite.exec('PRAGMA foreign_keys=ON');
  require('../../accounts/schema.cjs').migrations.forEach(m=>sqlite.exec(m.sql));migrateCompanions(sqlite);require('../../garden/migrations.cjs').migrations.forEach(m=>sqlite.exec(m.sql));require('../migrations.cjs').forEach(m=>sqlite.exec(m.sql));
  sqlite.prepare('INSERT INTO account_identities(owner_account_id,provider,subject_id,account,account_key,username,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(user.owner,'runtime',user.owner,user.account,user.account,user.account,'2026-10-24','2026-10-24');
  const companions=new CompanionsService({db:sqlite}),pet=companions.adopt(user.owner,{actionId:'canonical-original-adoption',templateId,name:'原战斗伙伴',showOnDesktop:false}).data.pet;
  const other=companions.adopt(user.owner,{actionId:'canonical-other-adoption',templateId,name:'另一只伙伴',showOnDesktop:false}).data.pet;
  const garden=new GardenService({db:sqlite});garden.snapshot({ownerAccountId:user.owner});
  const companion=createCompanionBackupAdapter(sqlite),gardenBackup=createGardenBackupAdapter(sqlite),battle=require('../backup.cjs').createBattleBackupAdapter(sqlite);
  const backups=new BackupManager({db:sqlite,directory:`artifacts/battle/cloud/readback-${user.owner}`,getIdentity:owner=>sqlite.prepare('SELECT * FROM account_identities WHERE owner_account_id=?').get(owner)});backups.register(companion);backups.register(gardenBackup);backups.register(battle);
  const envelope=backups.snapshot(user.owner);return {sqlite,pet,other,envelope,companion,gardenBackup,battle,backups,companions};
}
const binding=user=>[user.uid,user.owner,user.device,user.sid];
const command=(user,op,input,id=randomUUID())=>rpc('lingjing_battle_command',[...binding(user),op,id,input]);
const settle=(user,mode,id,petId,revision,prepared)=>rpc('lingjing_battle_settle_authority',[...binding(user),mode,id,petId,revision,prepared.fragments,prepared.reward]);
try {
  for(const [i,user] of users.entries()) {
    await db.query('INSERT INTO auth.users(id) VALUES($1)',[user.uid]);await db.query('INSERT INTO public.lingjing_accounts(owner_id,auth_user_id,account,account_key,username) VALUES($1,$2,$3,$3,$3)',[user.owner,user.uid,user.account]);
    await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[user.sid,user.uid]);await db.query("INSERT INTO public.lingjing_devices(owner_id,device_id,auth_session_id,label) VALUES($1,$2,$3,'canonical fixture')",[user.owner,user.device,user.sid]);
    user.local=fixture(user,i?'animal-shiba':'big-fish-gentle');const {envelope,pet}=user.local;user.pet={ownerId:user.owner,petId:pet.petId,name:pet.name,element:pet.element,resourceId:pet.resource.resourceId,level:pet.growth.level};
    const fragments=Object.fromEntries(Object.entries(envelope.data.modules).filter(([key])=>['companions','garden','battle'].includes(key)&&(i!==0||key!=='garden')).map(([key,module])=>[key,{module,tables:{},...(key==='companions'?{petIds:module.data.tables.companion_pets.map(row=>row.pet_id)}:{})}]));
    await rpc('lingjing_commit_authority',[user.owner,'verified-initial-authority',fragments,0]);
  }
  const [host,guest]=users;
  let {room}=await command(host,'create_room',{account:host.account,pet:host.pet});({room}=await command(guest,'join_room',{account:guest.account,pet:guest.pet,roomCode:room.room_code}));
  while(room.status==='active') {
    const h=room.host_anger>=50?'ultimate':'element_attack',g=room.guest_anger>=50?'ultimate':'normal_attack';
    await command(host,'submit_action',{roomId:room.id,roundNo:room.current_round,action:h});await command(guest,'submit_action',{roomId:room.id,roundNo:room.current_round,action:g});
    ({room}=await rpc('lingjing_battle_commit_round',[...binding(host),room.id,room.current_round,room.revision,h,g,resolveRoomRound(room,h,g)]));
    assert.ok(room.last_resolved_round<100);
  }
  const rounds=(await db.query('SELECT * FROM public.lingjing_battle_rounds WHERE room_id=$1 ORDER BY round_no',[room.id])).rows;
  const before=await head(host),initial=friendSession(room,rounds,host.owner,{}),prepared=await prepareBattleSettlement({envelope:before.envelope,owner:host.owner,session:initial});
  const broken=structuredClone(prepared);broken.fragments.battle.module.data.reports=[];
  await assert.rejects(settle(host,'friend',room.id,host.pet.petId,before.revision,broken),/INVALID_SETTLEMENT_PROOF/);
  assert.deepEqual(await head(host),before);assert.equal((await db.query('SELECT count(*)::int n FROM public.lingjing_battle_settlements')).rows[0].n,0);
  record('actual Postgres rollback after protected commit: missing report leaves growth, inventory, head revision and receipt unchanged');
  await assert.rejects(settle(host,'friend',room.id,host.pet.petId,0,prepared),/LJ_SYNC_CONFLICT/);assert.deepEqual(await head(host),before);
  const reports=[];
  for(const user of users) {
    const previous=await head(user),session=friendSession(room,rounds,user.owner,{}),p=await prepareBattleSettlement({envelope:previous.envelope,owner:user.owner,session});
    const proof=await settle(user,'friend',room.id,user.pet.petId,previous.revision,p),again=await settle(user,'friend',room.id,user.pet.petId,0,p),current=await head(user);
    assert.equal(again.duplicate,true);assert.deepEqual({...again,duplicate:false},proof);assert.equal(current.revision,previous.revision+1);
    const modules=current.envelope.data.modules,originalPets=previous.envelope.data.modules.companions.data.tables.companion_pets;
    const pets=modules.companions.data.tables.companion_pets,pet=JSON.parse(pets.find(row=>row.pet_id===user.pet.petId).data_json),old=JSON.parse(originalPets.find(row=>row.pet_id===user.pet.petId).data_json);
    assert.equal(pet.growth.experience-old.growth.experience,proof.experience);assert.equal(proof.experience,session.winner==='player'?20:5);
    assert.deepEqual(pets.find(row=>row.pet_id===user.local.other.petId),originalPets.find(row=>row.pet_id===user.local.other.petId));
    const receipts=modules.garden.data.tables.garden_reward_receipts;assert.equal(receipts.length,1);assert.equal(JSON.parse(receipts[0].result_json).quantity,2);
    user.local.companion.validate(modules.companions.data,user.owner);user.local.gardenBackup.validate(modules.garden.data,user.owner);user.local.battle.validate(modules.battle.data);
    assert.equal(proof.authority.checksum,current.envelope.checksum);assert.deepEqual(proof.report,JSON.parse(modules.battle.data.reports[0].data_json));reports.push(proof.report);
    // Scripted transport to the actual action-specific Postgres save. This tests
    // the real SQLite adapter path, and is explicitly not HTTPS/Auth evidence.
    const readback=async()=>({actionId:proof.action_id,revision:current.revision,checksum:current.checksum,envelope:current.envelope});
    const services={db:user.local.sqlite,get:name=>name==='backups'?user.local.backups:name==='accounts'?{getOwnerAccountId:()=>user.owner}:name==='cloudActor'?{requireActor:async()=>({invoke:readback})}:undefined};
    const store=new (require('../store.cjs').BattleStore)(user.local.sqlite),pendingSession={...session,reward:{...proof.reward,applied:false,pendingReason:'intentional lost readback'},reportId:session.id};
    store.save(user.owner,pendingSession);store.saveReport(user.owner,{...proof.report,reward:pendingSession.reward});
    const authority=new BattleCloudAuthority(services),localBefore=user.local.backups.dataChecksum(user.owner),restore=user.local.battle.restore;
    user.local.battle.restore=()=>{throw new Error('intentional final adapter failure');};
    await assert.rejects(authority.apply(user.owner,proof),/intentional final adapter failure/);assert.equal(user.local.backups.dataChecksum(user.owner),localBefore);
    user.local.battle.restore=restore;await authority.apply(user.owner,proof);await authority.apply(user.owner,proof);
    assert.deepEqual(user.local.companion.export(user.owner),modules.companions.data);
    const gardenHash=data=>saveDataChecksum({modules:{garden:{version:1,data}},tables:{}});assert.equal(gardenHash(user.local.gardenBackup.export(user.owner)),gardenHash(modules.garden.data));
    assert.deepEqual(JSON.parse(JSON.stringify(user.local.battle.export(user.owner))),modules.battle.data);
    user.authority=authority;user.proof=proof;
  }
  assert.equal(reports[0].endedAt,reports[1].endedAt);assert.equal(reports[0].rounds.length,reports[1].rounds.length);
  for(let i=0;i<reports[0].rounds.length;i++){assert.equal(reports[0].rounds[i].hpAfter.player,reports[1].rounds[i].hpAfter.enemy);assert.equal(reports[0].rounds[i].actions.player,reports[1].rounds[i].actions.enemy);}
  record('both owners receive exactly one canonical growth + two seeds + mirrored complete report, with original other-pet state preserved');
  record('actual SQLite readback completes a finished-but-pending report idempotently; late adapter failure rolls back companion/garden restore together');
  host.local.companions.rename(host.owner,{actionId:'unverified-local-rename',petId:host.local.other.petId,name:'本机独立原名'});
  const kept=host.local.backups.dataChecksum(host.owner);await assert.rejects(host.authority.apply(host.owner,host.proof),error=>error.code==='CLOUD_LOCAL_CONFLICT');assert.equal(host.local.backups.dataChecksum(host.owner),kept);
  record('an independent unverified local operation is preserved and reported as a conflict, never silently replaced');
  await assert.rejects(rpc('lingjing_battle_settle_authority',[...binding(host),'friend',room.id,host.pet.petId,0,prepared.fragments,prepared.reward],'authenticated'),/permission denied/);
  await assert.rejects(rpc('lingjing_battle_claim_settlement',[...binding(host),room.id,host.pet.petId]),/permission denied/);
  record('authenticated settlement forgery and obsolete receipt-only service path are denied');
  const engine=new BattleRuntimeService(),id=randomUUID(),timestamp=new Date().toISOString(),player=structuredClone(initial.player),enemy=structuredClone(initial.enemy);
  let session={id:`battle-${id}`,mode:'training',status:'active',player,enemy,snapshot:engine.reset({playerElement:player.element,enemyElement:enemy.element}),rounds:[],winner:null,pendingAction:null,historyComplete:true,startedAt:timestamp,updatedAt:timestamp,rules:getBattleRules(),context:{authority:'supabase',cloudUserId:host.owner,coreVersion:BATTLE_CORE_VERSION}};
  let game=await rpc('lingjing_battle_training_command',[...binding(host),id,randomUUID(),{operation:'start',petId:player.petId,enemyElement:enemy.element},0,session]);
  while(game.status==='active') {
    session=structuredClone(game.session_json);engine.restore(session.snapshot);const action=session.snapshot.player.anger>=50?'ultimate':'element_attack',result=engine.act(action),roundNo=session.snapshot.round+1,actionId=randomUUID();
    session.snapshot=result.state;session.rounds.push({...result.roundResult,state:result.state});session.winner=result.roundResult.winner;session.updatedAt=new Date().toISOString();if(session.winner){session.status='finished';session.endedAt=session.updatedAt;session.reportId=session.id;}
    const input={operation:'action',sessionId:session.id,action,roundNo};game=await rpc('lingjing_battle_training_command',[...binding(host),id,actionId,input,game.revision,session]);
    assert.deepEqual(await rpc('lingjing_battle_training_command',[...binding(host),id,actionId,input,0,{}]),game);assert.ok(game.session_json.rounds.length<100);
  }
  const trainingBefore=await head(host),p=await prepareBattleSettlement({envelope:trainingBefore.envelope,owner:host.owner,session:game.session_json});
  const proof=await settle(host,'training',id,player.petId,trainingBefore.revision,p);assert.equal(proof.reward.mode,'training');assert.equal((await head(host)).envelope.data.modules.battle.data.reports.length,2);
  assert.equal((await settle(host,'training',id,player.petId,0,p)).duplicate,true);
  record('server training state machine uses the same core and atomically awards canonical growth/inventory/report with immutable per-round replay');
  const second={...host,sid:randomUUID(),device:randomUUID()};
  await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[second.sid,second.uid]);await db.query("INSERT INTO public.lingjing_devices(owner_id,device_id,auth_session_id,label) VALUES($1,$2,$3,'second real binding fixture')",[second.owner,second.device,second.sid]);
  await db.exec('BEGIN;SET LOCAL ROLE authenticated');
  await db.query("SELECT set_config('request.jwt.claims',$1,true),set_config('request.headers',$2,true)",[JSON.stringify({sub:second.uid,session_id:second.sid,role:'authenticated'}),JSON.stringify({'x-lingjing-device-id':second.device})]);
  await db.query('SELECT public.lingjing_revoke_device($1)',[host.device]);await db.exec('COMMIT');
  assert.equal((await db.query('SELECT count(*)::int n FROM auth.sessions WHERE id=$1',[host.sid])).rows[0].n,1);
  const unchanged=await head(host),rejected=/LJ_(SESSION_REVOKED|DEVICE_SESSION_REQUIRED|AUTH_REQUIRED|IDENTITY_REQUIRED)/;
  await assert.rejects(settle(host,'training',id,player.petId,0,p),rejected);
  await assert.rejects(settle(host,'friend',room.id,host.pet.petId,0,prepared),rejected);
  await assert.rejects(rpc('lingjing_battle_training_command',[...binding(host),id,randomUUID(),{operation:'start',petId:player.petId,enemyElement:enemy.element},0,session]),rejected);
  assert.deepEqual(await head(host),unchanged);assert.equal((await settle(second,'training',id,player.petId,0,p)).duplicate,true);assert.deepEqual(await head(host),unchanged);
  record('shared08 guard rechecks stale original device/SID before training/settlement replay, rolls back without mutation, and permits another same-owner device');
  mkdirSync('artifacts/battle/cloud',{recursive:true});writeFileSync('artifacts/battle/cloud/authority-save-evidence.json',JSON.stringify({at:new Date().toISOString(),provenance:'local-actual-PGlite-and-canonical-SQLite-fixtures',realCloudVerified:false,checks,friendRounds:rounds.length,trainingRounds:game.session_json.rounds.length,passed:true},null,2));
} finally {for(const sqlite of locals)sqlite.close();await db.close();}
