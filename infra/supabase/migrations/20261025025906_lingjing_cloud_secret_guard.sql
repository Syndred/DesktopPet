begin;
create or replace function lingjing_private.has_secret(p_json jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare v_kind text:=jsonb_typeof(p_json);v_entry record;v_key text;v_text text;v_decoded jsonb;
begin
 if v_kind='object' then for v_entry in select * from jsonb_each(p_json) loop
  v_key:=lower(regexp_replace(v_entry.key,'[^a-zA-Z0-9]','','g'));
  if v_key in ('password','passwordhash','apikey','apikeys','encryptedkey','encryptedsecret','proof','proofhash','secret','secrets','secretkey','servicerole','servicerolekey',
   'authorization','credential','credentials','sessiontoken','accesstoken','refreshtoken','clientsecret','byok','byokkey','privatekey','providerkey')
   or v_key ~ '(password|secret|credential|authorization|apikey|encryptedkey|privatekey|byok|servicerole)' then return true;end if;
  if lingjing_private.has_secret(v_entry.value) then return true;end if;
 end loop;
 elsif v_kind='array' then for v_entry in select value from jsonb_array_elements(p_json) loop if lingjing_private.has_secret(v_entry.value) then return true;end if;end loop;
 elsif v_kind='string' then
  v_text:=p_json#>>'{}';
  if ltrim(v_text) ~ '^[\[{"]' then
   begin v_decoded:=v_text::jsonb;exception when invalid_text_representation then return false;end;
   if v_decoded is distinct from p_json then return lingjing_private.has_secret(v_decoded);end if;
  end if;
 end if;return false;
end $$;
revoke all on function lingjing_private.has_secret(jsonb) from public,anon,authenticated;
grant execute on function lingjing_private.has_secret(jsonb) to service_role;
commit;
