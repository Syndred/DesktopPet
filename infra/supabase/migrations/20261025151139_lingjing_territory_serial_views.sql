-- Created with Supabase CLI migration new. Depends on battle_serial_views (24).
-- Display-only lookup: no allocation, row locks, backfill or historical writes.
begin;
create function public.lingjing_territory_serial_views(p_actor jsonb,p_session_ids jsonb) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare v_namespace text;v_owner text:=p_actor->>'ownerAccountId';v_id text;
 v_challenge public.runtime_territory_challenges;v_context jsonb;v_player jsonb;v_enemy jsonb;
 v_enemy_owner text;v_enemy_id text;v_log_count bigint;v_kind text;v_sessions jsonb:='[]'::jsonb;
begin
 v_namespace:=lingjing_private.global_serial_read_actor_namespace(p_actor);
 if jsonb_typeof(p_session_ids) is distinct from 'array' then raise exception 'LJ_INVALID_REQUEST';end if;
 if jsonb_array_length(p_session_ids) not between 1 and 20
  or exists(select 1 from jsonb_array_elements(p_session_ids) value
    where jsonb_typeof(value)<>'string' or length(value#>>'{}') not between 1 and 160
      or (value#>>'{}') !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$')
  or (select count(distinct value) from jsonb_array_elements_text(p_session_ids) value)<>jsonb_array_length(p_session_ids)
 then raise exception 'LJ_INVALID_REQUEST';end if;
 -- Unknown and foreign sessions share one whole-batch refusal, before identity reads.
 if exists(select 1 from jsonb_array_elements_text(p_session_ids) requested(id) where not exists(
   select 1 from public.runtime_territory_challenges c where c.session_id=requested.id and c.owner_account_id=v_owner
 )) then raise exception 'LJ_NOT_PARTICIPANT';end if;
 for v_id in select value from jsonb_array_elements_text(p_session_ids) loop
  select * into v_challenge from public.runtime_territory_challenges where session_id=v_id and owner_account_id=v_owner;
  v_player:=null;v_enemy:=null;v_kind:=null;v_context:=v_challenge.battle_json->'context';
  if v_challenge.battle_json->>'id'=v_id and v_challenge.battle_json->>'mode'='territory'
   and v_context->>'authority'='cloud' and v_context->>'ownerAccountId'=v_owner
   and v_context->>'territoryId'=v_challenge.territory_id
   and v_context->>'territoryRevision'=v_challenge.territory_revision::text
   and ((v_namespace='live' and v_context->>'locationProvenance'='os' and v_context->>'scenarioId' is null)
    or(v_namespace like 'qa:%' and v_context->>'locationProvenance'='simulated' and v_context->>'scenarioId'=substr(v_namespace,4))) then
   if v_challenge.battle_json#>>'{player,petId}'=v_challenge.pet_id then
    select jsonb_build_object('ownerAccountId',g.owner_id,'petId',g.pet_id,'templateId',g.template_id,'globalSerial',g.global_serial::text)
    into v_player from lingjing_private.global_pet_serials g
    join public.lingjing_accounts a on a.owner_id=g.owner_id and a.status='active'
    where g.owner_id=v_owner and g.pet_id=v_challenge.pet_id and g.namespace=v_namespace
     and not exists(select 1 from lingjing_private.global_serial_qa_scopes q where q.auth_uid=a.auth_user_id and q.namespace<>v_namespace)
     and(v_namespace='live' or exists(select 1 from lingjing_private.global_serial_qa_scopes q where q.auth_uid=a.auth_user_id and q.namespace=v_namespace));
   end if;
   v_enemy_id:=v_challenge.battle_json#>>'{enemy,petId}';
   -- Only the creation log identifies the historical defender owner. The current
   -- region owner/garrison may have changed after this battle and is never read.
   select count(*),min(old_owner_id) into v_log_count,v_enemy_owner from public.runtime_territory_logs
    where session_id=v_id and territory_id=v_challenge.territory_id and actor_owner_id=v_owner and action='challenge';
   if v_log_count=1 and v_enemy_owner is not null and v_enemy_id is not null then
    select jsonb_build_object('ownerAccountId',g.owner_id,'petId',g.pet_id,'templateId',g.template_id,'globalSerial',g.global_serial::text)
    into v_enemy from lingjing_private.global_pet_serials g
    join public.lingjing_accounts a on a.owner_id=g.owner_id and a.status='active'
    where g.owner_id=v_enemy_owner and g.pet_id=v_enemy_id and g.namespace=v_namespace
     and not exists(select 1 from lingjing_private.global_serial_qa_scopes q where q.auth_uid=a.auth_user_id and q.namespace<>v_namespace)
     and(v_namespace='live' or exists(select 1 from lingjing_private.global_serial_qa_scopes q where q.auth_uid=a.auth_user_id and q.namespace=v_namespace));
    if v_enemy is not null then v_kind:='instance';end if;
   elsif v_log_count=1 and v_enemy_owner is null and v_enemy_id='guardian:'||v_challenge.territory_id then
    v_kind:='guardian';
   end if;
  end if;
  v_sessions:=v_sessions||jsonb_build_array(jsonb_build_object('sessionId',v_id,'player',v_player,'enemy',v_enemy)
   ||case when v_kind is null then '{}'::jsonb else jsonb_build_object('enemyKind',v_kind) end);
 end loop;
 return jsonb_build_object('format','lingjing.territory.serial-views','version',1,'ownerAccountId',v_owner,'namespace',v_namespace,'sessions',v_sessions);
end $$;
revoke all on function public.lingjing_territory_serial_views(jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.lingjing_territory_serial_views(jsonb,jsonb) to service_role;
commit;
