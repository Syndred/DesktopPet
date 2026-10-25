import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url),{SupabaseRemote,publicConfig}=require('../../accounts/supabase-remote.cjs');
const {openDatabase,migrate}=require('../../../core/database.cjs'),{createServices}=require('../../../core/services.cjs'),feature=require('../index.cjs');
const previous=resolve(process.argv[2]||'');assert.ok(previous.startsWith(resolve('artifacts/companions')+sep));const prior=JSON.parse(readFileSync(join(previous,'evidence.json'),'utf8'));assert.equal(prior.passed,true);
const file=process.env.LINGJING_COMPANION_VERIFY_CREDENTIALS;assert.ok(file?.endsWith('.dpapi'));
const decrypt="Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))";
const bytes=Buffer.from(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',decrypt],{input:readFileSync(file).toString('base64'),encoding:'utf8',windowsHide:true}).trim(),'base64'),credentials=JSON.parse(bytes.toString());bytes.fill(0);assert.equal(credentials.testOnly,true);
const output=mkdtempSync(join(resolve('artifacts/companions'),'recall-live-')),config=publicConfig();assert.equal(new URL(config.url).hostname,'jbvrdmrkwpznbrvteive.supabase.co');
const report={at:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),mode:'live',simulatedProvider:false,scope:'Actual registered main companion capability and real SQLite in a lightweight Node host;08 SupabaseRemote HTTPS and independent device receipt reader. No Electron tray or full-save advancement claim.',checks:[],passed:false};
let db,registered;const clients=[];
async function client(label){const profile=join(output,label);mkdirSync(profile);const remote=new SupabaseRemote({userData:profile,config}),user=await remote.login(credentials.a.account,credentials.a.password),session={...user,provider:'runtime',ownerAccountId:user.id,cloudProof:user.proof};remote.setCurrentUser(session);const value={remote,user,session,profile};clients.push(value);return value;}
try{
  const a=await client('main'),b=await client('reader'),owner=a.user.id,petId=prior.checks[1].petIds[0];assert.equal(owner,prior.checks[0].owner);assert.equal(b.user.id,owner);
  const snapshot=()=>b.remote.invoke(b.session,'companions-sync',{op:'snapshot'}),before=await snapshot(),pets=state=>state.module.data.tables.companion_pets.map(row=>JSON.parse(row.data_json));assert.equal(pets(before).filter(p=>p.desktop.visible).length,0,'Refuse to recall any unrelated visible test pet');
  db=openDatabase(join(output,'main.sqlite'));migrate(db,'accounts',require('../../accounts/schema.cjs').migrations);migrate(db,'companions',feature.migrations);
  const services=createServices({db,paths:{userData:a.profile},legacy:{}});services.session.setAdapter({getCurrentUser:()=>a.user});services.provide('accounts',{privateSession:()=>a.session,identity:who=>db.prepare('SELECT * FROM account_identities WHERE owner_account_id=?').get(who)});services.provide('cloudActor',{invoke:(name,body)=>a.remote.invoke(a.session,name,body)});registered=feature.register(services);const api=services.get('companions');await api.refreshCloud(owner);
  const original=api.getPet(owner,petId);await registered.commands.desktop({actionId:randomUUID(),petId,visible:true},{ownerAccountId:owner});
  const actionId=randomUUID(),first=await api.recallAll(owner,actionId),again=await api.recallAll(owner,actionId);assert.equal(first.ok,true);assert.ok(first.data.recalled.includes(petId));assert.equal(again.duplicate,true);
  const exact=await b.remote.invoke(b.session,'lingjing-save',{op:'read',actionId:'companions:'+actionId}),after=await snapshot();assert.equal(exact.checksum,first.cloud.checksum);assert.equal(pets(after).filter(p=>p.desktop.visible).length,0);assert.deepEqual(api.getPet(owner,petId).growth,original.growth);assert.equal(after.module.data.tables.companion_actions.filter(row=>row.action_id===actionId).length,1);
  report.checks.push({name:'Actual main recallAll uses one immutable live receipt and preserves original pet/growth',owner,petId,actionId:exact.actionId,revision:exact.revision,checksum:exact.checksum,sharedSavePending:first.cloud.sharedSavePending});report.passed=true;
}catch(error){let message=error.message;for(const secret of[credentials.a.account,credentials.a.password])message=message.split(secret).join('[redacted]');report.failure={code:error.code||error.name,message};process.exitCode=1;}
finally{registered?.dispose();db?.close();for(const c of clients)await c.remote.signOut(c.session).catch(()=>{});writeFileSync(join(output,'evidence.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,output,checks:report.checks.length,failure:report.failure}));}
