import {createRequire} from 'node:module';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{SupabaseRemote,publicConfig,decodeProof}=require('../accounts/supabase-remote.cjs');
const cloud=publicConfig();assert.equal(cloud?.url,'https://jbvrdmrkwpznbrvteive.supabase.co');
const output=resolve(`artifacts/battle/live-preparation-${Date.now()}`);mkdirSync(output,{recursive:true});
const inputPath=join(output,'input.credentials.dpapi'),cipher=operation=>`[Console]::InputEncoding=[Text.Encoding]::UTF8;[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);Add-Type -AssemblyName System.Security;$raw=[Console]::In.ReadToEnd();${operation}`;
const encrypt=value=>execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',cipher("[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($raw),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))")],{input:JSON.stringify(value),encoding:'utf8',windowsHide:true}).trim();
const suffix=Date.now().toString(36),config={testOnly:true,projectRef:'jbvrdmrkwpznbrvteive',url:cloud.url,publishableKey:cloud.key,accounts:['a','b'].map((name,index)=>({account:`battleqa_${suffix}_${name}`,password:`Aa9!${randomBytes(18).toString('base64url')}`,templateId:index?'animal-shiba':'big-fish-gentle',adoptActionId:randomUUID(),selectActionId:randomUUID()}))};
const save=()=>writeFileSync(inputPath,encrypt(config));save();
const evidence={at:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),authority:'actual-HTTPS-through-deployed-Auth-companions-and-garden-functions',projectRef:config.projectRef,credentials:'Windows DPAPI CurrentUser ciphertext only; no account/password/token in evidence',adminSeeding:false,actors:[]};
try {
  for(const [index,credential] of config.accounts.entries()) {
    const remote=new SupabaseRemote({userData:join(output,`preparation-device-${index+1}`),config:cloud});let user;
    try{user=await remote.register(credential.account,credential.password,'真实联机验收');}
    catch(error){if(error.httpStatus===400||error.httpStatus===409)throw error;user=await remote.login(credential.account,credential.password);}
    const session={id:user.id,ownerAccountId:user.id,cloudProof:user.proof};remote.setCurrentUser(session);
    const adopted=await remote.invoke(session,'companions-sync',{op:'command',command:'adopt',input:{actionId:credential.adoptActionId,templateId:credential.templateId,name:index?'联机火伴':'联机水伴',showOnDesktop:false}});
    assert.equal(adopted.authority,'live');credential.petId=adopted.result.data.pet.petId;save();
    await remote.invoke(session,'companions-sync',{op:'command',command:'select',input:{actionId:credential.selectActionId,petId:credential.petId,slot:'battlePetId'}});
    await remote.invoke(session,'garden-sync',{op:'snapshot'});
    const head=await remote.invoke(session,'lingjing-save',{op:'read'}),actor=decodeProof(user.proof).actor;
    assert.equal(head.envelope.ownerAccountId,actor.ownerAccountId);assert.ok(head.envelope.data.modules.garden);assert.ok(head.envelope.data.modules.companions.data.tables.companion_pets.some(row=>row.pet_id===credential.petId));
    evidence.actors.push({authUserId:actor.authUserId,ownerAccountId:actor.ownerAccountId,deviceId:actor.deviceId,petId:credential.petId,accountRevision:head.revision,authorityActionId:head.actionId});remote.dispose();
  }
  assert.notEqual(evidence.actors[0].ownerAccountId,evidence.actors[1].ownerAccountId);evidence.passed=true;
} catch(error){evidence.passed=false;evidence.failure={code:error.code||error.name,status:error.httpStatus};throw error;}
finally{writeFileSync(join(output,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({inputPath,evidence:join(output,'evidence.json'),passed:evidence.passed}));}
