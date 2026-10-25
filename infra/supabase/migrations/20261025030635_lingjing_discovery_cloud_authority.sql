-- Created by Supabase CLI 2.122.0 migration new. Additive and service-only.
-- 08 alone owns Auth UID -> legacy owner mapping. The verified Edge wrapper
-- supplies that mapping; body-supplied actor/owner values are never forwarded.
create schema if not exists lingjing_discovery;
revoke all on schema lingjing_discovery from public, anon, authenticated;
grant usage on schema lingjing_discovery to service_role;

-- Optional, coordinator-issued test grants. Ordinary actors cannot enable this
-- through user_metadata, a request body, or location device registration.
create table lingjing_discovery.location_test_grants (
  auth_uid uuid not null references auth.users(id),
  device_id text not null,
  scenario_id text not null,
  expires_at timestamptz not null,
  primary key(auth_uid,device_id)
);
alter table lingjing_discovery.location_test_grants enable row level security;
revoke all on lingjing_discovery.location_test_grants from public, anon, authenticated;
grant select on lingjing_discovery.location_test_grants to service_role;

create table lingjing_discovery.devices (
  auth_uid uuid not null references auth.users(id),
  device_id text not null check (length(device_id) between 1 and 180),
  owner_account_id text not null check (length(owner_account_id) between 1 and 180),
  public_jwk jsonb not null,
  key_fingerprint text not null check (key_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  primary key(auth_uid, device_id)
);
create index discovery_devices_owner on lingjing_discovery.devices(owner_account_id, device_id);
alter table lingjing_discovery.devices enable row level security;

create table lingjing_discovery.location_nonces (
  id uuid primary key default gen_random_uuid(),
  auth_uid uuid not null,
  device_id text not null,
  owner_account_id text not null,
  session_id text not null,
  nonce text not null unique,
  purpose text not null check (purpose in ('discover','begin','capture','territory:read','territory:challenge','territory:settle')),
  reference text not null default '' check (length(reference) <= 180),
  key_fingerprint text not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  proof_id uuid,
  signature_hash text,
  foreign key(auth_uid, device_id) references lingjing_discovery.devices(auth_uid, device_id)
);
create index discovery_nonce_actor on lingjing_discovery.location_nonces(auth_uid, owner_account_id, device_id, created_at desc);
alter table lingjing_discovery.location_nonces enable row level security;

create table lingjing_discovery.location_proofs (
  id uuid primary key default gen_random_uuid(),
  nonce_id uuid not null unique references lingjing_discovery.location_nonces(id),
  auth_uid uuid not null,
  owner_account_id text not null,
  device_id text not null,
  session_id text not null,
  purpose text not null,
  reference text not null,
  fix jsonb not null,
  source text not null check (source in ('os','simulated')),
  issued_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by text
);
create index discovery_proof_actor on lingjing_discovery.location_proofs(auth_uid, owner_account_id, device_id, issued_at desc);
alter table lingjing_discovery.location_proofs enable row level security;
grant select, insert, update on lingjing_discovery.devices, lingjing_discovery.location_nonces, lingjing_discovery.location_proofs to service_role;
revoke all on lingjing_discovery.devices, lingjing_discovery.location_nonces, lingjing_discovery.location_proofs from public, anon, authenticated;

create function lingjing_discovery.proof_json(p lingjing_discovery.location_proofs)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id',p.id,'challengeId',p.nonce_id,'authUserId',p.auth_uid,'ownerAccountId',p.owner_account_id,
    'deviceId',p.device_id,'sessionId',p.session_id,'purpose',p.purpose,'reference',p.reference,'fix',p.fix,'source',p.source,
    'issuedAt',extract(epoch from p.issued_at)*1000,'expiresAt',extract(epoch from p.expires_at)*1000,
    'consumedAt',extract(epoch from p.consumed_at)*1000,'consumedBy',p.consumed_by);
$$;
revoke all on function lingjing_discovery.proof_json(lingjing_discovery.location_proofs) from public, anon, authenticated;
grant execute on function lingjing_discovery.proof_json(lingjing_discovery.location_proofs) to service_role;

create function public.lingjing_discovery_location(p_actor jsonb, p_op text, p_input jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := (p_actor->>'authUserId')::uuid;
  v_owner text := p_actor->>'ownerAccountId';
  v_device text := p_actor->>'deviceId';
  v_session text := p_actor->>'sessionId';
  v_now timestamptz := clock_timestamp();
  v_ms numeric := extract(epoch from v_now)*1000;
  v_key lingjing_discovery.devices;
  v_nonce lingjing_discovery.location_nonces;
  v_proof lingjing_discovery.location_proofs;
  v_fix jsonb;
  v_jwk jsonb;
begin
  if v_uid is null or coalesce(length(v_owner),0) not between 1 and 180 or coalesce(length(v_device),0) not between 1 and 180
    or coalesce(length(v_session),0) not between 1 and 180 then raise exception 'AUTH_REQUIRED'; end if;
  if p_op='policy' then
    return coalesce((select jsonb_build_object('allowSimulatedLocation',true,'scenarioId',g.scenario_id)
      from lingjing_discovery.location_test_grants g where g.auth_uid=v_uid and g.device_id=v_device and g.expires_at>v_now),jsonb_build_object('allowSimulatedLocation',false));
  end if;
  if p_op = 'register_device' then
    v_jwk := p_input->'publicJwk';
    if v_jwk->>'kty' is distinct from 'EC' or v_jwk->>'crv' is distinct from 'P-256' or v_jwk ? 'd'
      or coalesce(v_jwk->>'x','') !~ '^[A-Za-z0-9_-]{43}$' or coalesce(v_jwk->>'y','') !~ '^[A-Za-z0-9_-]{43}$'
      or coalesce(p_input->>'keyFingerprint','') !~ '^[a-f0-9]{64}$' then raise exception 'DEVICE_KEY_INVALID'; end if;
    insert into lingjing_discovery.devices(auth_uid,device_id,owner_account_id,public_jwk,key_fingerprint)
      values(v_uid,v_device,v_owner,v_jwk,p_input->>'keyFingerprint')
      on conflict(auth_uid,device_id) do update set public_jwk=excluded.public_jwk,key_fingerprint=excluded.key_fingerprint,
        updated_at=v_now,revoked_at=null where lingjing_discovery.devices.owner_account_id=v_owner
      returning * into v_key;
    if v_key.auth_uid is null then raise exception 'DEVICE_OWNER_MISMATCH'; end if;
    return jsonb_build_object('authUserId',v_uid,'ownerAccountId',v_owner,'deviceId',v_device,'keyFingerprint',v_key.key_fingerprint,'publicJwk',v_key.public_jwk);
  end if;
  select * into v_key from lingjing_discovery.devices where auth_uid=v_uid and device_id=v_device and owner_account_id=v_owner and revoked_at is null;
  if not found then raise exception 'DEVICE_KEY_REQUIRED'; end if;
  if p_op = 'device' then
    return jsonb_build_object('authUserId',v_uid,'ownerAccountId',v_owner,'deviceId',v_device,'keyFingerprint',v_key.key_fingerprint,'publicJwk',v_key.public_jwk);
  elsif p_op = 'issue_nonce' then
    if p_input->>'purpose' is null or p_input->>'purpose' not in ('discover','begin','capture','territory:read','territory:challenge','territory:settle')
      or length(coalesce(p_input->>'reference',''))>180 then raise exception 'LOCATION_PURPOSE_INVALID'; end if;
    perform pg_advisory_xact_lock(hashtextextended(v_uid::text,17925));
    if (select count(*) from lingjing_discovery.location_nonces where auth_uid=v_uid and created_at>v_now-interval '1 minute')>=60
      or (select count(*) from lingjing_discovery.location_nonces where auth_uid=v_uid and device_id=v_device and created_at>v_now-interval '1 minute')>=20 then raise exception 'LOCATION_RATE_LIMITED'; end if;
    insert into lingjing_discovery.location_nonces(auth_uid,device_id,owner_account_id,session_id,nonce,purpose,reference,key_fingerprint,expires_at)
      values(v_uid,v_device,v_owner,v_session,gen_random_uuid()::text||gen_random_uuid()::text,p_input->>'purpose',coalesce(p_input->>'reference',''),v_key.key_fingerprint,v_now+interval '30 seconds') returning * into v_nonce;
  elsif p_op in ('nonce','accept_nonce') then
    select * into v_nonce from lingjing_discovery.location_nonces where id=(p_input->>'challengeId')::uuid and auth_uid=v_uid
      and owner_account_id=v_owner and device_id=v_device and session_id=v_session for update;
    if not found then raise exception 'LOCATION_CHALLENGE_INVALID'; end if;
  elsif p_op = 'read_proof' then
    select * into v_proof from lingjing_discovery.location_proofs where id=(p_input->>'proofId')::uuid and auth_uid=v_uid
      and owner_account_id=v_owner and device_id=v_device and session_id=v_session;
    if not found then raise exception 'LOCATION_PROOF_INVALID'; end if;
    return lingjing_discovery.proof_json(v_proof);
  else raise exception 'UNSUPPORTED_OP'; end if;
  if p_op = 'accept_nonce' then
    if coalesce(p_input->>'signatureHash','') !~ '^[a-f0-9]{64}$' then raise exception 'LOCATION_SIGNATURE_INVALID'; end if;
    if v_nonce.proof_id is not null then
      select * into v_proof from lingjing_discovery.location_proofs where id=v_nonce.proof_id;
      if v_nonce.signature_hash is distinct from p_input->>'signatureHash' or v_proof.fix is distinct from p_input->'fix' then raise exception 'LOCATION_NONCE_REPLAY'; end if;
      return lingjing_discovery.proof_json(v_proof);
    end if;
    if v_nonce.expires_at<=v_now then raise exception 'LOCATION_CHALLENGE_EXPIRED'; end if;
    if v_nonce.key_fingerprint<>v_key.key_fingerprint then raise exception 'DEVICE_KEY_CHANGED'; end if;
    v_fix:=p_input->'fix';
    if v_fix->>'coordinateSystem' is distinct from 'wgs84' or v_fix->>'positionSource'='Default'
      or jsonb_typeof(v_fix->'lat') is distinct from 'number' or jsonb_typeof(v_fix->'lng') is distinct from 'number'
      or abs((v_fix->>'lat')::numeric)>90 or abs((v_fix->>'lng')::numeric)>180 then raise exception 'INVALID_COORDINATES'; end if;
    if jsonb_typeof(v_fix->'timestampMs') is distinct from 'number' or v_ms-(v_fix->>'timestampMs')::numeric>30000
      or (v_fix->>'timestampMs')::numeric-v_ms>5000 then raise exception 'LOCATION_STALE'; end if;
    if jsonb_typeof(v_fix->'accuracyMeters') is distinct from 'number' or (v_fix->>'accuracyMeters')::numeric<=0
      or (v_fix->>'accuracyMeters')::numeric>80 then raise exception 'LOCATION_IMPRECISE'; end if;
    if v_fix->>'source'='simulated' then
      if p_actor->>'allowSimulatedLocation' is distinct from 'true' or p_actor->>'scenarioId' is null
        or v_fix->>'scenarioId' is distinct from p_actor->>'scenarioId' or v_fix->>'provider' is distinct from 'qa-discovery'
        or not exists(select 1 from lingjing_discovery.location_test_grants g where g.auth_uid=v_uid and g.device_id=v_device and g.scenario_id=v_fix->>'scenarioId' and g.expires_at>v_now) then raise exception 'REAL_LOCATION_REQUIRED'; end if;
    elsif v_fix->>'source' is distinct from 'os' or v_fix->>'provider' is distinct from 'windows-geolocator' then raise exception 'REAL_LOCATION_REQUIRED'; end if;
    insert into lingjing_discovery.location_proofs(nonce_id,auth_uid,owner_account_id,device_id,session_id,purpose,reference,fix,source,expires_at)
      values(v_nonce.id,v_uid,v_owner,v_device,v_session,v_nonce.purpose,v_nonce.reference,v_fix,v_fix->>'source',v_now+interval '15 seconds') returning * into v_proof;
    update lingjing_discovery.location_nonces set consumed_at=v_now,proof_id=v_proof.id,signature_hash=p_input->>'signatureHash' where id=v_nonce.id;
    return lingjing_discovery.proof_json(v_proof);
  end if;
  return jsonb_build_object('id',v_nonce.id,'authUserId',v_uid,'ownerAccountId',v_owner,'deviceId',v_device,'sessionId',v_session,
    'nonce',v_nonce.nonce,'purpose',v_nonce.purpose,'reference',v_nonce.reference,'keyFingerprint',v_nonce.key_fingerprint,
    'createdAt',extract(epoch from v_nonce.created_at)*1000,'expiresAt',extract(epoch from v_nonce.expires_at)*1000,
    'consumedAt',extract(epoch from v_nonce.consumed_at)*1000,'proofId',v_nonce.proof_id,'signatureHash',v_nonce.signature_hash);
end;
$$;
revoke all on function public.lingjing_discovery_location(jsonb,text,jsonb) from public, anon, authenticated;
grant execute on function public.lingjing_discovery_location(jsonb,text,jsonb) to service_role;

-- 05 calls this inside its own transaction. No separate HTTP consume-and-settle
-- split: a failed territory/capture transaction rolls back the proof consumption.
create function public.lingjing_discovery_take_location(p_actor jsonb,p_proof_id uuid,p_purpose text,p_reference text,p_consumer text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare p lingjing_discovery.location_proofs; v_now timestamptz:=clock_timestamp();
begin
  select * into p from lingjing_discovery.location_proofs where id=p_proof_id and auth_uid=(p_actor->>'authUserId')::uuid
    and owner_account_id=p_actor->>'ownerAccountId' and device_id=p_actor->>'deviceId' and session_id=p_actor->>'sessionId' for update;
  if not found then raise exception 'LOCATION_PROOF_INVALID'; end if;
  if not exists(select 1 from lingjing_discovery.devices d join lingjing_discovery.location_nonces n on n.auth_uid=d.auth_uid and n.device_id=d.device_id
    where n.id=p.nonce_id and d.owner_account_id=p.owner_account_id and d.revoked_at is null and d.key_fingerprint=n.key_fingerprint) then raise exception 'DEVICE_KEY_CHANGED'; end if;
  if p.purpose is distinct from p_purpose or p.reference is distinct from coalesce(p_reference,'') then raise exception 'LOCATION_PROOF_SCOPE_MISMATCH'; end if;
  if p.source='simulated' and not exists(select 1 from lingjing_discovery.location_test_grants g where g.auth_uid=p.auth_uid and g.device_id=p.device_id
    and g.scenario_id=p.fix->>'scenarioId' and g.expires_at>v_now) then raise exception 'REAL_LOCATION_REQUIRED'; end if;
  if coalesce(length(p_consumer),0) not between 1 and 180 then raise exception 'INVALID_CONSUMER'; end if;
  if p.consumed_at is not null then
    if p.consumed_by<>p_consumer then raise exception 'LOCATION_PROOF_USED'; end if;
    return lingjing_discovery.proof_json(p);
  end if;
  if p.expires_at<=v_now or extract(epoch from v_now)*1000-(p.fix->>'timestampMs')::numeric>30000 then raise exception 'LOCATION_PROOF_EXPIRED'; end if;
  update lingjing_discovery.location_proofs set consumed_at=v_now,consumed_by=p_consumer where id=p.id returning * into p;
  return lingjing_discovery.proof_json(p);
end;
$$;
revoke all on function public.lingjing_discovery_take_location(jsonb,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.lingjing_discovery_take_location(jsonb,uuid,text,text,text) to service_role;
