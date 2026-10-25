-- Not yet deployed: schema-aware config rejection; authored chat text is opaque.
begin;
create function lingjing_private.has_secret_at(p_json jsonb,p_path text[]) returns boolean language plpgsql immutable set search_path='' as $$
declare v_kind text:=jsonb_typeof(p_json);v_entry record;v_key text;v_text text;v_decoded jsonb;v_table text;v_field text;
begin
 if v_kind='string' then
  if cardinality(p_path)=7 and p_path[1:4]=array['modules','conversations','data','tables'] and p_path[6] ~ '^[0-9]+$' then v_table:=p_path[5];v_field:=p_path[7];
  elsif cardinality(p_path)=5 and p_path[1]='tables' and p_path[3]='rows' and p_path[4] ~ '^[0-9]+$' then v_table:=p_path[2];v_field:=p_path[5];end if;
  if (v_table in ('conversation_messages','conversation_memories') and v_field='content')
    or(v_table='conversation_profiles' and v_field in ('persona','reply_style')) then return false;end if;
 end if;
 if v_kind='object' then for v_entry in select * from jsonb_each(p_json) loop
  v_key:=lower(regexp_replace(v_entry.key,'[^a-zA-Z0-9]','','g'));
  if v_key in ('password','passwordhash','apikey','apikeys','encryptedkey','encryptedsecret','cloudproof','sessionproof','authproof','secret','secrets','secretkey','servicerole','servicerolekey',
   'authorization','credential','credentials','sessiontoken','accesstoken','refreshtoken','clientsecret','byok','byokkey','privatekey','providerkey')
   or v_key ~ '(password|secret|credential|authorization|apikey|encryptedkey|privatekey|byok|servicerole)' then return true;end if;
  if lingjing_private.has_secret_at(v_entry.value,array_append(p_path,v_entry.key)) then return true;end if;
 end loop;
 elsif v_kind='array' then for v_entry in select value,ordinality from jsonb_array_elements(p_json) with ordinality loop
  if lingjing_private.has_secret_at(v_entry.value,array_append(p_path,v_entry.ordinality::text)) then return true;end if;
 end loop;
 elsif v_kind='string' then
  v_text:=p_json#>>'{}';
  if ltrim(v_text) ~ '^[\[{"]' then
   begin v_decoded:=v_text::jsonb;exception when invalid_text_representation then return false;end;
   if v_decoded is distinct from p_json then return lingjing_private.has_secret_at(v_decoded,array_append(p_path,'<json>'));end if;
  end if;
 end if;return false;
end $$;
create or replace function lingjing_private.has_secret(p_json jsonb) returns boolean language sql immutable set search_path='' as $$
 select lingjing_private.has_secret_at(p_json,array[]::text[])
$$;
revoke all on function lingjing_private.has_secret(jsonb),lingjing_private.has_secret_at(jsonb,text[]) from public,anon,authenticated;
grant execute on function lingjing_private.has_secret(jsonb),lingjing_private.has_secret_at(jsonb,text[]) to service_role;
commit;
