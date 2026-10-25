import { createClient, type Session, type SupabaseClient } from "npm:@supabase/supabase-js@2.98.0";
import { createAdminClient, supabasePublicConfig, requireActor, jsonResponse, readJson, corsHeaders, uuid, LingjingAuthError, authError } from "../_shared/lingjing-auth.ts";
import { sha256, equalHex } from "../_shared/lingjing-json.ts";

type LoginRecord = { accountKey:string; account:string; username:string; email:string|null; authUserId:string|null; ownerAccountId:string|null;
  legacy: null | { source_instance:string; legacy_subject:string; owner_id:string; password_hash:string; hash_algorithm:string } };
function failure(code:string,status=400):never { throw new LingjingAuthError(code,status); }
async function rpc<T>(client:SupabaseClient,name:string,args:Record<string,unknown>):Promise<T> {
  const { data,error }=await client.rpc(name,args);
  if(error) { const code=/LJ_([A-Z_]+)/.exec(error.message)?.[1]||"AUTH_UNAVAILABLE"; failure(code,code==="AUTH_RATE_LIMITED"?429:code.includes("CONFLICT")?409:503); }
  return data as T;
}
function text(value:unknown,min:number,max:number) { if(typeof value!=="string"||value.trim().length<min||value.trim().length>max)failure("INVALID_REQUEST"); return (value as string).trim(); }
function userClient(deviceId:string) { const {url,key}=supabasePublicConfig(); return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{"X-Lingjing-Device-Id":deviceId}}}); }
function authRequest(request:Request,token:string,device:string) { return new Request(request.url,{method:"POST",headers:{authorization:`Bearer ${token}`,"x-lingjing-device-id":device}}); }
async function signedIn(request:Request,session:Session,deviceId:string,label:string) {
  const actor=await requireActor(authRequest(request,session.access_token,deviceId),{registerDevice:true,deviceLabel:label});
  const profile=await actor.client.from("lingjing_accounts").select("created_at").eq("owner_id",actor.ownerAccountId).single();
  if(profile.error)failure("AUTH_UNAVAILABLE",503);
  return { currentUser:{id:actor.ownerAccountId,account:actor.account,username:actor.username,authUserId:actor.authUserId,authKind:"supabase",createdAt:profile.data.created_at},
    actor, tokens:{accessToken:session.access_token,refreshToken:session.refresh_token,expiresAt:session.expires_at,sessionId:actor.sessionId,deviceId} };
}

Deno.serve(async request=>{
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders});
  if(request.method!=="POST")return jsonResponse({ok:false,code:"METHOD_NOT_ALLOWED"},405);
  try {
    const body=await readJson(request),op=body.op,device=request.headers.get("x-lingjing-device-id")?.toLowerCase();
    if(!uuid(device))failure("DEVICE_REQUIRED",401);
    if(op==="actor"||op==="session")return jsonResponse({ok:true,data:{actor:await requireActor(request)}});
    const admin=createAdminClient();
    if(op==="logout") {
      const actor=await requireActor(request); await rpc(actor.client,"lingjing_revoke_device",{p_device_id:device});
      const token=(request.headers.get("authorization")||"").slice(7);
      const result=await admin.auth.admin.signOut(token,"local"); if(result.error)failure("AUTH_UNAVAILABLE",503);
      return jsonResponse({ok:true,data:{signedOut:true,deviceId:device}});
    }
    if(op==="refresh") {
      const token=text(body.refreshToken,16,4096),client=userClient(device);
      const result=await client.auth.refreshSession({refresh_token:token});
      if(result.error||!result.data.session||result.data.user?.is_anonymous)failure("AUTH_INVALID",401);
      return jsonResponse({ok:true,data:await signedIn(request,result.data.session,device,text(body.deviceLabel||"Windows PC",1,80))});
    }
    if(op==="profile"||op==="password") {
      const actor=await requireActor(request);
      if(op==="profile") { await rpc(actor.client,"lingjing_update_profile",{p_username:text(body.username,2,24)}); return jsonResponse({ok:true,data:{actor:await requireActor(request)}}); }
      await rpc(admin,"lingjing_auth_rate_limit",{p_key_hash:await sha256(`account:${actor.account.toLowerCase()}`),p_limit:12});
      const record=await rpc<LoginRecord>(admin,"lingjing_auth_record",{p_account_key:actor.account.toLowerCase()});
      if(!record?.email)failure("AUTH_DIRECTORY_MISSING",503);
      const oldPassword=text(body.oldPassword,6,64),next=text(body.newPassword,6,64),client=userClient(device);
      if(next!==text(body.confirmPassword,6,64))failure("PASSWORD_MISMATCH");
      const checked=await client.auth.signInWithPassword({email:record.email!,password:oldPassword});
      if(checked.error||checked.data.user?.id!==actor.authUserId||!checked.data.session)failure("INVALID_OLD_PASSWORD",401);
      await admin.auth.admin.signOut(checked.data.session.access_token,"local");
      const changed=await admin.auth.admin.updateUserById(actor.authUserId,{password:next}); if(changed.error)failure("PASSWORD_CHANGE_FAILED");
      const renewed=await client.auth.signInWithPassword({email:record.email!,password:next});
      if(renewed.error||!renewed.data.session)failure("AUTH_INVALID",401);
      return jsonResponse({ok:true,data:await signedIn(request,renewed.data.session,device,text(body.deviceLabel||"Windows PC",1,80))});
    }
    if(op!=="login"&&op!=="register")failure("UNSUPPORTED_OP");
    const account=text(body.account,3,32),accountKey=account.toLowerCase(),password=text(body.password,6,64);
    if(/\s/.test(account))failure("INVALID_ACCOUNT");
    await rpc(admin,"lingjing_auth_rate_limit",{p_key_hash:await sha256(`account:${accountKey}`),p_limit:12});
    const network=request.headers.get("cf-connecting-ip")||request.headers.get("x-forwarded-for")||"unknown";
    await rpc(admin,"lingjing_auth_rate_limit",{p_key_hash:await sha256(`network:${network}`),p_limit:80});
    let record=await rpc<LoginRecord|null>(admin,"lingjing_auth_record",{p_account_key:accountKey});
    if(op==="register"&&record)failure("ACCOUNT_EXISTS",409);
    if(op==="login"&&!record)failure("INVALID_CREDENTIALS",401);
    let username=record?.username||text(body.username,2,24);
    if(op==="register"&&password!==text(body.confirmPassword,6,64))failure("PASSWORD_MISMATCH");
    if(record?.legacy) {
      if(record.legacy.hash_algorithm!=="sha256"||!equalHex(await sha256(password),record.legacy.password_hash))failure("INVALID_CREDENTIALS",401);
    }
    if(!record?.email) record=await rpc<LoginRecord>(admin,"lingjing_auth_reserve",{p_account:account,p_username:username,
      p_legacy_source:record?.legacy?.source_instance||null,p_legacy_subject:record?.legacy?.legacy_subject||null});
    if(!record?.email)failure("AUTH_DIRECTORY_MISSING",503);
    const client=userClient(device);
    let signed=await client.auth.signInWithPassword({email:record.email!,password});
    if(signed.error&&!record.authUserId) {
      // Only a fresh reservation or a password-verified staged legacy account can
      // reach createUser. A duplicate/crashed reservation never resets a password.
      const created=await admin.auth.admin.createUser({email:record.email!,password,email_confirm:true,app_metadata:{lingjing:true}});
      if(created.error&&!String(created.error.code||"").includes("exists"))failure("AUTH_CREATE_FAILED",503);
      signed=await client.auth.signInWithPassword({email:record.email!,password});
    }
    if(signed.error||!signed.data.session||!signed.data.user||signed.data.user.is_anonymous)failure("INVALID_CREDENTIALS",401);
    await rpc(admin,"lingjing_auth_finalize",{p_auth_user_id:signed.data.user.id,p_account_key:accountKey});
    return jsonResponse({ok:true,data:await signedIn(request,signed.data.session,device,text(body.deviceLabel||"Windows PC",1,80))});
  } catch(error) { return authError(error); }
});
