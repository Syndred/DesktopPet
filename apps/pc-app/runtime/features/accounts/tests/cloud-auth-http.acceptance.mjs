import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
const configFile=process.env.LINGJING_PUBLIC_CONFIG||"C:/Users/Administrator/Desktop/project/DesktopPet/artifacts/cloud-upgrade/2026-10-25/public-runtime-config.json";
const config=JSON.parse(readFileSync(configFile,"utf8"));
const url=config.url||config.supabaseUrl||config.supabase_url, key=config.publishableKey||config.publishable_key;
assert.equal(new URL(url).hostname,"jbvrdmrkwpznbrvteive.supabase.co"); assert.ok(key?.startsWith("sb_publishable_"));
const output=resolve(`artifacts/accounts/cloud-auth-http-${Date.now()}`);mkdirSync(output,{recursive:true});
const suffix=Date.now().toString(36), account=`cloudqa_${suffix}`, pass=`Aa9!${randomBytes(18).toString("base64url")}`;
const da=randomUUID(),da2=randomUUID(),db=randomUUID();
const evidence={at:new Date().toISOString(),kind:"actual HTTPS Supabase; same host HTTP clients, not two physical machines",projectRef:"jbvrdmrkwpznbrvteive",
  sourceSha:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8",windowsHide:true}).trim(),checks:[],credentialsPersisted:false};
function record(name,data){evidence.checks.push({name,data});console.log("PASS",name);}
async function request(path,body,device=da,token){const r=await fetch(`${url}${path}`,{method:"POST",headers:{apikey:key,"content-type":"application/json","X-Lingjing-Device-Id":device,...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  let data;try{data=await r.json();}catch{data={code:"NON_JSON_RESPONSE"};}return{status:r.status,body:data};}
const auth=(body,device,token)=>request("/functions/v1/lingjing-auth",body,device,token);
try{
  const anon=await auth({op:"actor"});assert.equal(anon.status,401);record("anonymous actor denied",{status:anon.status,code:anon.body.code});
  const fake=await auth({op:"actor"},da,"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJub3QtdHJ1c3RlZCJ9.Zm9yZ2Vk");assert.equal(fake.status,401);record("forged JWT denied",{status:fake.status,code:fake.body.code});
  const first=await auth({op:"register",account,password:pass,confirmPassword:pass,username:"云端验收甲"});assert.equal(first.status,200,first.body.code);assert.equal(first.body.ok,true);
  const a=first.body.data;assert.equal(a.actor.ownerAccountId,a.currentUser.id);assert.equal(a.actor.authority,"live");assert.equal(a.actor.client,undefined);
  record("named account created by actual Supabase Auth and stable text mapping",{actor:a.actor});
  const second=await auth({op:"login",account,password:pass},da2);assert.equal(second.status,200,second.body.code);const a2=second.body.data;
  assert.equal(a2.actor.ownerAccountId,a.actor.ownerAccountId);assert.notEqual(a2.actor.sessionId,a.actor.sessionId);record("same account keeps two independent real Auth sessions",{first:a.actor,second:a2.actor});
  assert.equal((await auth({op:"actor"},da,a.tokens.accessToken)).status,200);
  const bReply=await auth({op:"register",account:`${account}_b`,password:pass,confirmPassword:pass,username:"云端验收乙"},db);assert.equal(bReply.status,200,bReply.body.code);const b=bReply.body.data;
  const cross=await fetch(`${url}/rest/v1/lingjing_accounts?owner_id=eq.${encodeURIComponent(b.actor.ownerAccountId)}&select=owner_id`,{headers:{apikey:key,Authorization:`Bearer ${a.tokens.accessToken}`,"X-Lingjing-Device-Id":da}});
  assert.equal(cross.status,200);assert.deepEqual(await cross.json(),[]);record("actual Data API RLS hides another account",{status:cross.status});
  const wrongDevice=await auth({op:"actor"},da2,a.tokens.accessToken);assert.equal(wrongDevice.status,401);record("valid JWT with another device binding denied",{status:wrongDevice.status,code:wrongDevice.body.code});
  const logout=await auth({op:"logout"},da,a.tokens.accessToken);assert.equal(logout.status,200,logout.body.code);
  const revoked=await auth({op:"actor"},da,a.tokens.accessToken);assert.equal(revoked.status,401);
  const otherAlive=await auth({op:"actor"},da2,a2.tokens.accessToken);assert.equal(otherAlive.status,200,otherAlive.body.code);record("local sign-out revokes A while same-account B remains live",{revoked:revoked.status,otherDevice:otherAlive.status});
  const refresh=await auth({op:"refresh",refreshToken:a2.tokens.refreshToken},da2);assert.equal(refresh.status,200,refresh.body.code);assert.equal(refresh.body.data.actor.sessionId,a2.actor.sessionId);
  record("real refresh rotates credentials and retains its device/session mapping",{actor:refresh.body.data.actor});
  evidence.passed=true;writeFileSync(join(output,"evidence.json"),JSON.stringify(evidence,null,2));console.log("CLOUD_AUTH_HTTP_PASSED",output);
}catch(error){evidence.error={message:error.message};writeFileSync(join(output,"failure.json"),JSON.stringify(evidence,null,2));console.error(error.message);process.exitCode=1;}
