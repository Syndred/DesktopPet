// Real HTTPS verifier. Only explicitly designated DPAPI-encrypted QA accounts.
// Node device profiles do not constitute Electron or physical-device acceptance.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createPreferenceValidators} from '../../apps/pc-app/runtime/features/resources/preferences.mjs';
import manifest from '../../apps/pc-app/runtime/features/resources/assets/roster-v2/qingya/character.json' with {type:'json'};
const require=createRequire(import.meta.url);
const {SupabaseRemote,publicConfig,decodeProof}=require('../../apps/pc-app/runtime/features/accounts/supabase-remote.cjs');
const file=process.env.LINGJING_CLOUD_VERIFY_CREDENTIALS_DPAPI;
assert.ok(file,'Provide an ignored DPAPI QA credentials file');
const decrypt='Add-Type -AssemblyName System.Security; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $clear=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($clear))';
const bytes=Buffer.from(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',decrypt],{input:readFileSync(file).toString('base64'),encoding:'utf8',windowsHide:true}).trim(),'base64');
const credentials=JSON.parse(bytes.toString('utf8'));bytes.fill(0);assert.equal(credentials.testOnly,true);
const config=publicConfig();assert.equal(new URL(config.url).hostname,'jbvrdmrkwpznbrvteive.supabase.co');
const root=resolve('artifacts/cloud-upgrade/2026-10-25');mkdirSync(root,{recursive:true});
const output=mkdtempSync(join(root,'resource-preferences-http-'));
const evidence={at:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),scope:'Real HTTPS/Auth/owner-bound SDK and independent common-save readback. Node profiles only.',electronAcceptance:false,physicalSecondDevice:false,checks:[]};
const clients=[];const record=(name,detail={})=>evidence.checks.push({name,...detail});
async function login(name,credential){const directory=join(output,name);mkdirSync(directory,{recursive:true});const remote=new SupabaseRemote({userData:directory,config});const user=await remote.login(credential.account,credential.password);const session={...user,ownerAccountId:user.id,cloudProof:user.proof};remote.setCurrentUser(session);const client={remote,session,actor:decodeProof(user.proof).actor,context:await remote.cloudContext(session)};clients.push(client);return client;}
async function denied(operation,expected){let error;try{await operation();}catch(failure){error=failure;}assert.ok(error,'Expected denial');assert.ok(expected.includes(error.code),`Unexpected denial code ${error.code}`);return {code:error.code,status:error.httpStatus};}
const resourceId='builtin:lingjing-qingya-v1';
const read=async client=>{const reply=await client.context.client.from('lingjing_resource_preferences').select('resource_id,revision,document,authority_action_id').eq('owner_account_id',client.actor.ownerAccountId).eq('resource_id',resourceId).maybeSingle();assert.equal(reply.error,null);return reply.data;};
try{
  const a=await login('a',credentials.a),b=await login('b',credentials.a),other=await login('other',credentials.b);
  assert.equal(a.actor.ownerAccountId,b.actor.ownerAccountId);assert.notEqual(a.actor.deviceId,b.actor.deviceId);assert.notEqual(a.actor.sessionId,b.actor.sessionId);
  evidence.actors=[a,b,other].map(client=>({ownerAccountId:client.actor.ownerAccountId,authUserId:client.actor.authUserId,deviceId:client.actor.deviceId,sessionId:client.actor.sessionId}));
  const prior=await read(b),head=await b.remote.invoke(b.session,'lingjing-save',{op:'read'}),validators=createPreferenceValidators();
  const clips=Object.keys(manifest.animations).map(name=>({name}));
  const document={calibration:validators.calibrations({desktop:{scale:1.35,rotationDeg:5,mirrorX:true,fps:12},battle:{scale:1.1}}),actions:validators.actionMap(undefined,clips,true)};
  const body={op:'preferences',resourceId,actionId:randomUUID(),baseRevision:prior?.revision||0,document};
  const receipt=await a.remote.invoke(a.session,'lingjing-resources',body),row=await read(b);
  assert.equal(row.revision,body.baseRevision+1);assert.deepEqual(row.document,document);assert.equal(row.authority_action_id,receipt.actionId);
  const confirmed=await b.remote.invoke(b.session,'lingjing-save',{op:'read',actionId:receipt.actionId});
  assert.equal(confirmed.checksum,receipt.checksum);assert.equal(confirmed.revision,receipt.revision);
  assert.deepEqual(confirmed.envelope.data.modules['character-resources'].data.preferences.find(row=>row.resourceId===resourceId),{resourceId,revision:row.revision,...document});
  const afterOther={...confirmed.envelope.data.modules};delete afterOther['character-resources'];const beforeOther={...head.envelope.data.modules};delete beforeOther['character-resources'];assert.deepEqual(afterOther,beforeOther);assert.deepEqual(confirmed.envelope.data.tables,head.envelope.data.tables);
  record('A writes valid builtin calibration/actions; independent authenticated B reads identical preference and immutable common receipt without changing other domain data',{actionId:receipt.actionId,revision:receipt.revision,checksum:receipt.checksum,preferenceRevision:row.revision});
  const replay=await b.remote.invoke(b.session,'lingjing-resources',body);assert.equal(replay.duplicate,true);assert.equal(replay.checksum,receipt.checksum);
  assert.equal((await b.remote.invoke(b.session,'lingjing-save',{op:'read'})).revision,receipt.revision);record('Same original request replays without a second preference/save revision');
  const stale=await denied(()=>b.remote.invoke(b.session,'lingjing-resources',{...body,actionId:randomUUID()}),['RESOURCE_PREFERENCE_CONFLICT']);
  const changed=structuredClone(body);changed.document.calibration.desktop.scale=1.45;
  const reused=await denied(()=>a.remote.invoke(a.session,'lingjing-resources',changed),['ACTION_ID_REUSED']);record('Stale preference CAS and changed reuse of an existing action are denied',{stale,reused});
  for(const invalid of [{calibration:{},actions:{}},{...document,actions:{...document.actions,walk:'missing-clip'}},{...document,growth:{experience:999}}])await denied(()=>a.remote.invoke(a.session,'lingjing-resources',{...body,actionId:randomUUID(),baseRevision:row.revision,document:invalid}),['RESOURCE_PREFERENCE_INVALID','UNKNOWN_CLIP']);
  record('Missing fields, unknown clip and extra gameplay authority fields are refused by deployed shared validator');
  const hidden=await other.context.client.from('lingjing_resource_preferences').select('resource_id').eq('owner_account_id',a.actor.ownerAccountId);assert.equal(hidden.error,null);assert.deepEqual(hidden.data,[]);
  const direct=await a.context.client.rpc('lingjing_set_resource_preferences',{p_owner:a.actor.ownerAccountId,p_uid:a.actor.authUserId,p_device:a.actor.deviceId,p_sid:a.actor.sessionId,p_resource_id:resourceId,p_action_id:randomUUID(),p_base_revision:row.revision,p_document:document});assert.equal(direct.error?.code,'42501');
  record('Other owner cannot read preferences and authenticated clients cannot execute service authority RPC',{directRpcSqlState:direct.error.code});
  const final=await b.remote.invoke(b.session,'lingjing-save',{op:'read'});assert.equal(final.revision,receipt.revision);assert.equal(final.checksum,receipt.checksum);
  evidence.final={ownerAccountId:a.actor.ownerAccountId,resourceId,revision:final.revision,checksum:final.checksum};evidence.passed=true;
}catch(error){evidence.passed=false;evidence.failure={code:error.code||'ASSERTION_FAILED',message:error.message};process.exitCode=1;}
finally{for(const client of clients)await client.remote.signOut(client.session).catch(()=>{});writeFileSync(join(output,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({output,passed:evidence.passed,checks:evidence.checks,failure:evidence.failure}));}
