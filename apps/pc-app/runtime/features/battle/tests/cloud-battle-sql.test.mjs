import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolveRoomRound } from '../../../../../../infra/supabase/functions/duel-online/room-core.js';
const db=new PGlite(),checks=[];
const users=Object.fromEntries(['a','b','c'].map(name=>[name,{uid:randomUUID(),sid:randomUUID(),device:randomUUID(),owner:`legacy-text-${name}`,account:`battle_${name}`,pet:{ownerId:`legacy-text-${name}`,petId:`original-pet-${name}`,resourceId:name==='b'?'builtin:lingjing-shiba-v2':'builtin:lingjing-yuwan-v2',name:`伙伴${name}`,element:name==='b'?'fire':'water'}}]));
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated,service_role;
CREATE TABLE auth.users(id uuid PRIMARY KEY,is_anonymous boolean NOT NULL DEFAULT false);
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),not_after timestamptz);
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (auth.jwt()->>'sub')::uuid$$;
CREATE SCHEMA realtime; GRANT USAGE ON SCHEMA realtime TO authenticated,service_role;
CREATE TABLE realtime.messages(topic text,extension text); ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY; GRANT SELECT ON realtime.messages TO authenticated;
CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql STABLE AS $$SELECT current_setting('request.topic',true)$$;`);
await db.exec(readFileSync('infra/supabase/migrations/20261025020314_lingjing_identity_actor_contract.sql','utf8'));
await db.exec(readFileSync('infra/supabase/migrations/20261025020540_lingjing_battle_jwt_rooms.sql','utf8'));
for(const u of Object.values(users)){
  await db.query('INSERT INTO auth.users(id) VALUES($1)',[u.uid]);await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[u.sid,u.uid]);
  await db.query('INSERT INTO public.lingjing_accounts(owner_id,auth_user_id,account_key,account,username) VALUES($1,$2,$3,$3,$4)',[u.owner,u.uid,u.account,u.pet.name]);
}
async function query(role,sql,args=[],user,topic='') {
  await db.exec(`BEGIN; SET LOCAL ROLE ${role}`);
  try {await db.query("SELECT set_config('request.jwt.claims',$1,true),set_config('request.headers',$2,true),set_config('request.topic',$3,true)",[JSON.stringify(user?{sub:user.uid,session_id:user.sid,role:'authenticated'}:{}),JSON.stringify(user?{'x-lingjing-device-id':user.device}:{}),topic]);const result=await db.query(sql,args);await db.exec('COMMIT');return result.rows;}
  catch(error){await db.exec('ROLLBACK');throw error;}
}
const command=async(user,op,input,id=randomUUID())=>(await query('service_role','SELECT public.lingjing_battle_command($1,$2,$3,$4,$5::jsonb) value',[user.uid,user.owner,op,id,JSON.stringify(input)]))[0].value;
const commit=async(room,host,guest,result=resolveRoomRound(room,host,guest))=>(await query('service_role','SELECT public.lingjing_battle_commit_round($1,$2,$3,$4,$5,$6::jsonb) value',[room.id,room.current_round,room.revision,host,guest,JSON.stringify(result)]))[0].value;
const claim=async(user,room,pet=user.pet.petId)=>(await query('service_role','SELECT public.lingjing_battle_claim_settlement($1,$2,$3,$4) value',[user.uid,user.owner,room.id,pet]))[0].value;
const record=name=>{checks.push(name);console.log(name);};
try {
  for(const user of Object.values(users))await query('authenticated',"SELECT public.lingjing_register_device($1,'battle fixture')",[user.device],user);
  const a=users.a,b=users.b,c=users.c;
  const inviteId=randomUUID(),inviteInput={account:a.account,target:{authUid:b.uid,ownerId:b.owner,account:b.account}};
  const invited=await command(a,'invite',inviteInput,inviteId);assert.deepEqual(await command(a,'invite',inviteInput,inviteId),invited);
  await assert.rejects(command(a,'invite',{...inviteInput,target:{authUid:a.uid,ownerId:a.owner,account:a.account}}),/SELF_DUEL_FORBIDDEN/);
  await assert.rejects(command(c,'accept_invite',{account:c.account,requestId:invited.request.id,pet:c.pet}),/INVITE_FORBIDDEN/);
  let {room}=await command(b,'accept_invite',{account:b.account,requestId:invited.request.id,pet:b.pet});
  assert.equal(room.invited_user_id,a.owner);await assert.rejects(command(c,'join_room',{account:c.account,roomCode:room.room_code,pet:c.pet}),/ROOM_FORBIDDEN/);
  ({room}=await command(a,'join_room',{account:a.account,roomCode:room.room_code,pet:a.pet}));assert.equal(room.status,'active');
  assert.equal((await command(a,'create_room',{account:a.account,pet:a.pet})).room.id,room.id);
  await assert.rejects(command(b,'join_room',{account:b.account,roomCode:room.room_code,pet:b.pet}),/SELF_DUEL_FORBIDDEN/);
  record('actual PostgreSQL invitation, acceptance, reserved membership, same-owner refusal and stable command receipt');
  assert.equal((await query('authenticated','SELECT id FROM public.lingjing_battle_rooms',[],a)).length,1);
  assert.equal((await query('authenticated','SELECT id FROM public.lingjing_battle_rooms',[],c)).length,0);
  await assert.rejects(query('anon','SELECT * FROM public.lingjing_battle_rooms'),/permission denied/);
  await assert.rejects(query('authenticated','SELECT * FROM public.lingjing_battle_actions',[],a),/permission denied/);
  await assert.rejects(query('authenticated',"UPDATE public.lingjing_battle_rooms SET host_hp=1",[],a),/permission denied/);
  await assert.rejects(query('authenticated',"SELECT public.lingjing_battle_command($1,$2,'leave_room',$3,'{}')",[b.uid,b.owner,randomUUID()],a),/permission denied/);
  await db.query("INSERT INTO realtime.messages(topic,extension) VALUES($1,'broadcast')",[`lingjing:battle:${room.id}`]);
  assert.equal((await query('authenticated','SELECT * FROM realtime.messages',[],a,`lingjing:battle:${room.id}`)).length,1);
  assert.equal((await query('authenticated','SELECT * FROM realtime.messages',[],c,`lingjing:battle:${room.id}`)).length,0);
  record('RLS denies anonymous/nonparticipants, pending choices, direct client mutations, spoofed RPC actors and private-topic outsiders');
  let number=0;
  while(room.status==='active'&&number<30) {
    const rawHost=room.host_anger>=50?'ultimate':'element_attack',rawGuest=room.guest_anger>=50?'ultimate':'normal_attack';
    const firstId=randomUUID(),firstInput={roomId:room.id,roundNo:room.current_round,action:rawHost};
    const first=await command(b,'submit_action',firstInput,firstId);assert.deepEqual(await command(b,'submit_action',firstInput,firstId),first);
    await assert.rejects(command(b,'submit_action',{...firstInput,action:rawHost==='dodge'?'normal_attack':'dodge'},firstId),/ACTION_ID_REUSED/);
    await assert.rejects(command(b,'submit_action',{...firstInput,action:'dodge'}),/ACTION_LOCKED/);
    await command(a,'submit_action',{roomId:room.id,roundNo:room.current_round,action:rawGuest});
    if(number===0){await assert.rejects(commit(room,rawHost,rawGuest,{...resolveRoomRound(room,rawHost,rawGuest),hp_after:{host:-1,guest:100}}),/check constraint/);assert.equal((await db.query('SELECT count(*)::int n FROM public.lingjing_battle_rounds')).rows[0].n,0);}
    const resolved=await commit(room,rawHost,rawGuest);const duplicate=await commit(room,rawHost,rawGuest);assert.deepEqual(duplicate,resolved);room=resolved.room;number++;
  }
  assert.equal(room.status,'finished');assert.ok(number>2);assert.equal((await db.query('SELECT count(*)::int n FROM public.lingjing_battle_rounds')).rows[0].n,number);
  const rewardA=await claim(a,room),rewardB=await claim(b,room);assert.equal(rewardA.experience+rewardB.experience,25);assert.deepEqual(await claim(a,room),rewardA);await assert.rejects(claim(c,room),/ROOM_FORBIDDEN/);await assert.rejects(claim(a,room,'another-pet'),/PET_ROOM_MISMATCH/);
  assert.equal((await db.query('SELECT count(*)::int n FROM public.lingjing_battle_settlements')).rows[0].n,2);
  record(`shared versioned core resolves ${number} immutable rounds, atomic rollback, duplicate commits and two pet-bound receipts`);
  const second={...a,sid:randomUUID(),device:randomUUID()};await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[second.sid,a.uid]);await query('authenticated',"SELECT public.lingjing_register_device($1,'second device')",[second.device],second);
  await query('authenticated','SELECT public.lingjing_revoke_device($1)',[a.device],second);
  assert.equal((await db.query('SELECT count(*)::int n FROM auth.sessions WHERE id=$1',[a.sid])).rows[0].n,1);
  await assert.rejects(query('authenticated','SELECT * FROM public.lingjing_battle_rooms',[],a),/LJ_DEVICE_SESSION_REQUIRED/);
  await assert.rejects(query('authenticated','SELECT * FROM public.lingjing_battle_rounds',[],a),/LJ_DEVICE_SESSION_REQUIRED/);
  await assert.rejects(query('authenticated','SELECT * FROM realtime.messages',[],a,`lingjing:battle:${room.id}`),/LJ_DEVICE_SESSION_REQUIRED/);
  assert.equal((await query('authenticated','SELECT * FROM public.lingjing_battle_rooms',[],second)).length,1);
  record('actual revoke_device RPC blocks direct room/round/Realtime SELECT while original Auth session still exists; same-owner second device stays authorized');
  await db.query('DELETE FROM auth.sessions WHERE id=$1',[a.sid]);
  await assert.rejects(query('authenticated','SELECT * FROM public.lingjing_battle_rooms',[],a),/LJ_SESSION_REVOKED/);
  await assert.rejects(query('authenticated','SELECT * FROM public.lingjing_battle_rounds',[],a),/LJ_SESSION_REVOKED/);
  await assert.rejects(query('authenticated','SELECT * FROM realtime.messages',[],a,`lingjing:battle:${room.id}`),/LJ_SESSION_REVOKED/);
  await db.query("UPDATE public.lingjing_accounts SET status='locked' WHERE owner_id=$1",[b.owner]);await assert.rejects(query('authenticated','SELECT * FROM public.lingjing_battle_rooms',[],b),/LJ_IDENTITY_REQUIRED/);
  record('direct room/round REST-equivalent RLS and Realtime SELECT reject still-unexpired JWT claims after session revocation or account lock');
  const functions=(await db.query("SELECT proname,prosecdef,has_function_privilege('authenticated',oid,'EXECUTE') auth,has_function_privilege('anon',oid,'EXECUTE') anon FROM pg_proc WHERE proname IN ('lingjing_battle_command','lingjing_battle_commit_round','lingjing_battle_claim_settlement')")).rows;
  assert.ok(functions.every(value=>!value.prosecdef&&!value.auth&&!value.anon));record('all authority RPCs use fixed empty search_path, security invoker and service-only execution');
  mkdirSync('artifacts/battle/cloud',{recursive:true});writeFileSync('artifacts/battle/cloud/sql-evidence.json',JSON.stringify({at:new Date().toISOString(),provenance:'local-embedded-PostgreSQL-only',realCloudVerified:false,checks,functions,rounds:number,rewards:[rewardA,rewardB],passed:true},null,2));
} finally {await db.close();}
