// Fixed remaining B06/B11 producer. Existing authorized two-owner pets only.
// Actual UI invitation/accept/join and every round; no economy/training fixture,
// no forced result, no polling suppression, no replacement unresolved intent.
import assert from 'node:assert/strict';
import {existsSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {companionIdentity} from '../../apps/pc-app/runtime/features/companions/display-identity.mjs';
import {battleSelectionReady} from './cloud-live-qa-game-cases.mjs';
import {observeCloudRealtimeUi,runCloudAuthorityReadbackCases,endCloudAuthorityObservation} from './cloud-live-qa-authority-readback-cases.mjs';
export function assertFriendPair(a,b,roomId,petIds){
 for(const [role,s]of[['a',a],['b',b]]){assert.equal(s.mode,'friend');assert.equal(s.context?.authority,'supabase');assert.equal(s.room?.id,roomId);assert.equal(s.id,'online-'+roomId);assert.equal(s.player.petId,petIds[role]);assert.equal(s.pendingAction,null);assert.ok(['active','finished'].includes(s.status));}
 assert.equal(a.snapshot.round,b.snapshot.round);assert.equal(a.status,b.status);return a.snapshot.round;
}
export function validateCreatedFriendRoom(room,{hostOwner,invitedOwner}){assert.match(room?.id||'',/^[a-f0-9-]{36}$/i);assert.equal(room.host_user_id,hostOwner);assert.equal(room.invited_user_id,invitedOwner);assert.ok(room.guest_user_id===null||room.guest_user_id===invitedOwner);return room.id;}
// These expectations come from each participant's own already-numbered pet,
// not the opponent's rendered text, a nickname, or a prior run's report.
export function friendNumberedIdentity(pet,identity,owner){
 assert.equal(pet?.ownerAccountId,owner);assert.match(pet.petId,/^[A-Za-z0-9:_-]+$/);
 assert.equal(typeof pet.globalSerial,'string');assert.match(pet.globalSerial,/^[1-9][0-9]*$/);
 const fixed=companionIdentity(pet);assert.notEqual(fixed.roleName,'历史伙伴');
 assert.equal(identity?.roleName,fixed.roleName);assert.equal(identity.instanceNumber,fixed.instanceNumber);
 return {ownerAccountId:owner,petId:pet.petId,templateId:pet.templateId,globalSerial:pet.globalSerial,roleName:fixed.roleName,number:fixed.instanceNumber};
}
export function assertFriendIdentityDocument(value,{role,roomId,identities,kind}){
 assert.ok(['a','b'].includes(role));assert.ok(['session','report'].includes(kind));assert.match(roomId,/^[a-f0-9-]{36}$/i);
 const own=identities[role],other=identities[role==='a'?'b':'a'],id='online-'+roomId;
 assert.notEqual(own.ownerAccountId,other.ownerAccountId);assert.notEqual(own.globalSerial,other.globalSerial);
 assert.equal(value?.id,id);assert.equal(value.mode,'friend');assert.equal(value.context?.authority,'supabase');assert.equal(value.context.cloudUserId,own.ownerAccountId);
 if(kind==='session'){
  assert.equal(value.room?.id,roomId);assert.equal(value.room.host_user_id,identities.b.ownerAccountId);assert.equal(value.room.guest_user_id,identities.a.ownerAccountId);assert.equal(value.room.invited_user_id,identities.a.ownerAccountId);
  assert.equal(value.room.host_pet_id,identities.b.petId);assert.equal(value.room.guest_pet_id,identities.a.petId);assert.equal(value.side,role==='b'?'host':'guest');assert.equal(value.pendingAction,null);assert.ok(['active','finished'].includes(value.status));
 }else{
  assert.equal(value.sessionId,id);assert.equal(value.status,'finished');assert.equal(value.historyComplete,true);assert.ok(value.rounds?.length>0);
  assert.equal(value.reward?.applied,true);assert.equal(value.reward.actionId,`battle:${roomId}:${own.ownerAccountId}`);
 }
 for(const [side,expected]of[['player',own],['enemy',other]]){const p=value[side];assert.equal(p?.petId,expected.petId);assert.equal(p.displayKind,'instance');assert.equal(p.displayIdentity?.roleName,expected.roleName);assert.equal(p.displayIdentity?.instanceNumber,expected.number);}
 return value;
}
// Serialized DOM reads only. Scope to the current route, never an exiting
// Motion page, a hidden duplicate, an accessibility label or a stale session.
export function captureFriendIdentityDom(kind){
 const all=(root,selector)=>root?[...root.querySelectorAll(selector)]:[],visible=el=>{if(!el||!el.getClientRects().length)return false;for(let node=el;node;node=node.parentElement){const style=getComputedStyle(node);if(style.visibility==='hidden'||style.display==='none'||Number(style.opacity)===0)return false;}return true;};
 const texts=(root,selector)=>all(root,selector).map(el=>({text:el.innerText.trim(),visible:visible(el)}));
 const routes=all(document,'.app-page-motion[data-current-route="true"]'),route=routes.length===1?routes[0]:null;
 const result={hash:location.hash,routeCount:routes.length,routeKey:route?.getAttribute('data-route-key'),routeVisible:visible(route),kind};
 const participant=(el,side)=>({side,visible:visible(el),petIds:all(el,'.battle-portrait[data-pet-id]').map(p=>p.getAttribute('data-pet-id')),names:texts(el,kind==='session'?'.battle-participant-identity > strong':':scope > strong'),numbers:texts(el,kind==='session'?'.battle-participant-identity > .battle-identity-number':':scope > .battle-identity-number')});
 if(kind==='session'){
  const screens=all(route,'.battle-screen'),screen=screens.length===1?screens[0]:null;
  return {...result,screenCount:screens.length,sessionId:screen?.getAttribute('data-session-id'),mode:screen?.getAttribute('data-battle-mode'),authority:screen?.getAttribute('data-authority'),participants:all(screen,'.battle-arena-top > .combatant-status').map(el=>participant(el,el.classList.contains('enemy')?'enemy':'player'))};
 }
 const details=all(route,'.battle-report-detail'),detail=details.length===1?details[0]:null,selected=all(route,'.battle-report-item[aria-pressed="true"]'),item=selected.length===1?selected[0]:null;
 return {...result,detailCount:details.length,selectedCount:selected.length,selectedVisible:visible(item),selectedNames:texts(item,':scope > div > strong'),selectedNumbers:texts(item,'.battle-report-identities > .battle-identity-number'),participants:all(detail,'.battle-result-portraits > div').map((el,index)=>participant(el,index===0?'player':'enemy'))};
}
export function assertFriendIdentityDom(dom,{role,roomId,identities,kind}){
 assert.ok(['session','report'].includes(kind));assert.equal(dom.kind,kind);const id='online-'+roomId,path=`/battle/${kind==='session'?'session':'reports'}/${id}`;
 assert.equal(dom.hash,'#'+path);assert.equal(dom.routeCount,1);assert.equal(dom.routeKey,path);assert.equal(dom.routeVisible,true);
 const expected=[identities[role],identities[role==='a'?'b':'a']],text=(actual,wanted)=>assert.deepEqual(actual,[{text:wanted,visible:true}]);
 if(kind==='session'){assert.equal(dom.screenCount,1);assert.equal(dom.sessionId,id);assert.equal(dom.mode,'friend');assert.equal(dom.authority,'supabase');}
 else{assert.equal(dom.detailCount,1);assert.equal(dom.selectedCount,1);assert.equal(dom.selectedVisible,true);text(dom.selectedNames,`${expected[0].roleName} vs ${expected[1].roleName}`);assert.deepEqual(dom.selectedNumbers,[{text:'我方编号 '+expected[0].number,visible:true},{text:'对方编号 '+expected[1].number,visible:true}]);}
 assert.equal(dom.participants.length,2);for(const [i,p]of dom.participants.entries()){assert.equal(p.side,i===0?'player':'enemy');assert.equal(p.visible,true);assert.deepEqual(p.petIds,[expected[i].petId]);text(p.names,expected[i].roleName);text(p.numbers,'编号 '+expected[i].number);}return true;
}
export async function runCloudLiveQaFriendCompletionCases(context,{petIds}){
 assert.equal(process.platform,'win32');assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1');
 const {models,expectedActors,assertActive,runId,scenario,output}=context;for(const role of['a','b'])assert.ok(typeof petIds?.[role]==='string'&&petIds[role]);assert.notEqual(expectedActors.a.ownerAccountId,expectedActors.b.ownerAccountId);
 const file=join(output,'live-friend-completion-evidence.json'),intents=join(output,'live-friend-completion-intents.json');assert.equal(existsSync(intents),false,'Unknown original room/intents must be reconciled, not replaced');
 const identities={},proof={runId,scenario,passed:false,fullCasePassed:false,cases:[],substage:'preflight',lastSafe:{},pollingRemainedEnabled:true,identityUi:{id:'C03',passed:false,fullCasePassed:false,status:'pending',scope:'Read-only identity assertions on this original B06/B11 room and report only; does not complete all C03 surfaces.',checks:[]}},intent={runId,scenario,petIds,inviteSubmitted:false,acceptSubmitted:false,joinSubmitted:false,rounds:[]};
 const write=(p,x)=>{writeFileSync(p+'.tmp',JSON.stringify(x,null,2),{mode:0o600});renameSync(p+'.tmp',p);};const save=()=>write(file,proof),persist=()=>write(intents,intent);persist();save();const deadline=Date.now()+12*60000;let installed=false,roomId=null,observation=null;
 const mark=(stage,lastSafe={})=>{proof.substage=stage;proof.lastSafe=lastSafe;save();};
 async function active(){assert.ok(Date.now()<deadline);await assertActive();for(const role of['a','b']){const s=await models[role].call('accounts','session');assert.equal(s.currentUser?.id,expectedActors[role].ownerAccountId);assert.equal(s.currentUser?.authUserId,expectedActors[role].authUserId);assert.equal(s.currentUser?.authKind,'supabase');}await assertActive();}
 async function call(role,cmd,payload={}){await active();return models[role].call('battle',cmd,payload);}
 async function wait(stage,read,test,scalar){mark(stage);const end=Math.min(deadline,Date.now()+30000);while(Date.now()<end){await active();const x=await read();mark(stage,scalar(x));if(test(x))return x;await new Promise(r=>setTimeout(r,300));}throw Object.assign(Error(),{code:'READBACK_TIMEOUT'});}
 async function hooks(){const result={};for(const role of['a','b'])result[role]=await models[role].main(()=>{const h=globalThis.__authorityReadbackObserver;if(!h||h.overflow)throw Error('Observer missing/overflow');return {roomId:h.roomId,requestId:h.requestId,commands:h.commands,createdAt:h.createdAt};});return result;}
 async function persistHooks(){if(installed){intent.observed=await hooks();persist();}}
 async function arm(role){await models[role].main((_e,e,other,role,runId)=>{
  const req=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json'),p=req('./apps/pc-app/runtime/services/online-duel-service.cjs').OnlineDuelService.prototype;if(globalThis.__authorityReadbackObserver)throw Error('Existing observer');
  const h={prototype:p,original:p.emit,originalInvoke:p.invoke,runId,role,roomId:null,requestId:null,createdAt:null,events:[],commands:[],overflow:false};globalThis.__authorityReadbackObserver=h;
  const matches=self=>self.cloudActor?.ownerAccountId===e.ownerAccountId&&self.cloudActor?.authUserId===e.authUserId&&self.cloudActor?.deviceId===e.deviceId;
  p.emit=function(type,payload={}){const id=payload.room?.id||payload.roomId;if(matches(this)&&h.roomId&&id===h.roomId&&((type==='realtime-status'&&payload.status==='SUBSCRIBED')||(['room-updated','round-updated'].includes(type)&&payload.source==='realtime'))){if(h.events.length>=512)h.overflow=true;else h.events.push({type,at:Date.now(),status:type==='realtime-status'?'SUBSCRIBED':null,source:payload.source==='realtime'?'realtime':null,roomId:id,round:payload.round?.round_no??payload.room?.last_resolved_round??null});}return h.original.call(this,type,payload);};
  p.invoke=async function(op,payload={}){let command=null;if(['send_duel_request','create_room','respond_duel_request','join_room','submit_action'].includes(op)&&this.currentUser?.id===e.ownerAccountId){if(h.commands.length>=256){h.overflow=true;throw Error('Bounded observation full');}command={op,actionId:typeof payload.actionId==='string'?payload.actionId:null,requestId:typeof payload.requestId==='string'?payload.requestId:null,roomId:typeof payload.roomId==='string'?payload.roomId:null,round:Number.isSafeInteger(payload.roundNo)?payload.roundNo:null,returned:false,errorCode:null};h.commands.push(command);}
   try{const result=await h.originalInvoke.call(this,op,payload);if(command)command.returned=true;
    if(role==='b'&&op==='create_room'&&payload.requestId===h.requestId&&h.requestId){if(!matches(this))throw Error('Actor mismatch');const r=result.room;if(!r||!/^[a-f0-9-]{36}$/i.test(r.id)||r.host_user_id!==e.ownerAccountId||r.invited_user_id!==other.ownerAccountId)throw Error('Exact room mismatch');h.roomId=r.id;h.createdAt=Date.now();}
    return result;
   }catch(error){if(command)command.errorCode=['INVITE_CONFLICT','INVITE_EXPIRED','AUTH_REQUIRED','SESSION_REVOKED','ACTION_ID_REUSED','BATTLE_CLOUD_UNAVAILABLE'].includes(error?.code)?error.code:'UNCLASSIFIED';throw error;}
  };
 },expectedActors[role],expectedActors[role==='a'?'b':'a'],role,runId);}
 async function choose(role){const m=models[role];mark('normal-friend-lobby-'+role);await active();await m.page.evaluate(()=>{location.hash='#/battle/friends';});await m.page.locator('.app-page-motion[data-current-route="true"][data-route-key="/battle/friends"]').waitFor({timeout:15000});
  const pet=(await m.call('companions','list')).pets.find(x=>x.petId===petIds[role]);assert.ok(pet);const identity=await m.call('companions','identity',{petId:pet.petId});identities[role]=friendNumberedIdentity(pet,identity,expectedActors[role].ownerAccountId);const label=`${identity.roleName} · 编号 ${identity.instanceNumber} ·`,combo=m.page.getByRole('combobox',{name:'选择出战伙伴',exact:true});await combo.click();const option=m.page.getByRole('option').filter({hasText:label});assert.equal(await option.count(),1);await option.click();await wait('actual-default-or-persisted-owned-selection-'+role,async()=>({overview:await call(role,'overview'),enabled:await combo.isEnabled(),label:await combo.innerText()}),x=>battleSelectionReady(x,pet.petId,label),x=>({enabled:x.enabled,petCount:x.overview.pets.length,ready:battleSelectionReady(x,pet.petId,label)}));}
 async function pair(){const values={};for(const role of['a','b'])values[role]=await call(role,'sync',{sessionId:'online-'+roomId});return values;}
 async function identityUi(role,kind,phase){
  proof.identityUi.status='running';const expected={role,kind,roomId,identities},id='online-'+roomId;
  const observed=await wait('C03-original-'+phase+'-'+role,async()=>{const value=await call(role,kind==='session'?'snapshot':'getReport',kind==='session'?{sessionId:id}:{reportId:id});const dom=await models[role].page.evaluate(captureFriendIdentityDom,kind);await active();return {value,dom};},x=>{try{assertFriendIdentityDocument(x.value,expected);assertFriendIdentityDom(x.dom,expected);return true;}catch(e){if(e.code!=='ERR_ASSERTION')throw e;return false;}},x=>({sameOriginalId:x.value?.id===id,currentRoute:x.dom.routeKey,participantCount:x.dom.participants.length}));
  const screenshot=`C03-friend-${phase}-${role}.png`;await active();await models[role].page.screenshot({path:join(output,screenshot),timeout:10000});
  proof.identityUi.checks.push({role,phase,kind,roomId,sessionId:id,ownerAccountId:expectedActors[role].ownerAccountId,identities:{player:identities[role],enemy:identities[role==='a'?'b':'a']},dom:observed.dom,screenshot,passed:true});save();return observed.value;
 }
 async function warmOriginalRoom(role){
  // Normal Back / Continue navigation only. No join, leave, retry, action,
  // replacement room, forced result or modified production polling.
  const before=await call(role,'snapshot',{sessionId:'online-'+roomId}),commands=await hooks();assertFriendIdentityDocument(before,{role,roomId,identities,kind:'session'});
  await active();await models[role].page.locator(`.app-page-motion[data-current-route="true"] .battle-screen[data-session-id="online-${roomId}"] .battle-screen-toolbar`).getByRole('button',{name:'返回',exact:true}).click();
  const lobby=models[role].page.locator('.app-page-motion[data-current-route="true"][data-route-key="/battle/friends"]');await lobby.waitFor({timeout:15000});const resume=lobby.getByLabel('已保留的对局',{exact:true}).getByRole('button',{name:before.status==='active'?'继续本场':'查看对局',exact:true});await active();assert.equal(await resume.count(),1);await resume.click();
  const after=await identityUi(role,'session','warm');assert.equal(after.snapshot.round,before.snapshot.round);assert.equal(after.status,before.status);for(const r of['a','b'])assert.deepEqual((await hooks())[r].commands,commands[r].commands);
 }
 async function reportUi(phase,previous){const reports={};for(const role of['a','b']){await active();await models[role].page.evaluate(id=>{location.hash='#/battle/reports/'+id;},'online-'+roomId);reports[role]=await identityUi(role,'report',phase);if(previous)assert.deepEqual(reports[role],previous[role]);}return reports;}
 try{
  for(const role of['a','b']){const overview=await call(role,'overview');assert.equal(overview.session,null,'Existing session must be reconciled rather than replaced');const inv=await call(role,'invitations');assert.ok(![...inv.inbound,...inv.outbound].some(x=>x.status==='pending'));assert.equal((await models[role].call('accounts','syncStatus')).pending,0);}
  const accountA=(await models.a.call('accounts','session')).currentUser.account,accountB=(await models.b.call('accounts','session')).currentUser.account;assert.ok(accountA&&accountB&&accountA!==accountB);await choose('a');await choose('b');
  await arm('a');installed=true;await arm('b');const baseline=await call('a','invitations');await models.a.page.getByLabel('搜索账号或用户名',{exact:true}).fill(accountB);mark('normal-ui-search-own-b');await active();await models.a.page.getByRole('button',{name:'搜索',exact:true}).click();const target=models.a.page.locator('.battle-user').filter({hasText:`@${accountB}`});await wait('unique-own-b-search-result',()=>target.count(),x=>x===1,x=>({count:x}));
  intent.inviteSubmitted=true;persist();mark('normal-ui-invite-original');await active();await target.getByRole('button',{name:'发起对战',exact:true}).click();
  const inv=await wait('original-invitation-authoritative-read',()=>call('a','invitations'),x=>x.outbound.filter(r=>r.toAccount===accountB&&r.status==='pending'&&!baseline.outbound.some(b=>b.id===r.id)).length===1,x=>({pending:x.outbound.filter(r=>r.status==='pending').length}));const request=inv.outbound.find(r=>r.toAccount===accountB&&r.status==='pending'&&!baseline.outbound.some(b=>b.id===r.id));intent.requestId=request.id;persist();
  for(const role of['a','b'])await models[role].main((_e,id)=>{globalThis.__authorityReadbackObserver.requestId=id;},request.id);
  await wait('b-normal-inbound-original',()=>call('b','invitations'),x=>x.inbound.some(r=>r.id===request.id&&r.status==='pending'),x=>({pending:x.inbound.filter(r=>r.status==='pending').length}));mark('b-normal-ui-refresh-invites');await active();await models.b.page.locator('.battle-section-heading').filter({has:models.b.page.getByRole('heading',{name:/待处理邀请/})}).getByRole('button',{name:'刷新',exact:true}).click();const accept=models.b.page.locator('.battle-invitation').filter({has:models.b.page.locator('strong',{hasText:accountA})}).getByRole('button',{name:'接受',exact:true});await wait('unique-original-accept-ui',()=>accept.count(),x=>x===1,x=>({count:x}));intent.acceptSubmitted=true;persist();mark('normal-ui-accept-original');await active();await accept.click();
  const accepted=await wait('b-actual-created-room-before-join',()=>call('b','overview'),x=>x.session?.mode==='friend'&&x.session.room?.id,x=>({sessionPresent:!!x.session,status:x.session?.status||null,round:x.session?.snapshot?.round??null}));roomId=accepted.session.room.id;validateCreatedFriendRoom(accepted.session.room,{hostOwner:expectedActors.b.ownerAccountId,invitedOwner:expectedActors.a.ownerAccountId});assert.equal(accepted.session.player.petId,petIds.b);const hs=await hooks();assert.equal(hs.b.roomId,roomId);intent.roomId=roomId;await persistHooks();
  await models.a.main((_e,id)=>{const h=globalThis.__authorityReadbackObserver;if(h.roomId&&h.roomId!==id)throw Error('Different original room');h.roomId=id;},roomId);
  mark('a-normal-ui-refresh-accepted');await active();await models.a.page.locator('.battle-section-heading').filter({has:models.a.page.getByRole('heading',{name:/待处理邀请/})}).getByRole('button',{name:'刷新',exact:true}).click();const joinButton=models.a.page.locator('.battle-invitation').filter({has:models.a.page.locator('strong',{hasText:accountB})}).getByRole('button',{name:'进入房间',exact:true});await joinButton.waitFor({timeout:15000});assert.equal(await joinButton.count(),1);intent.joinSubmitted=true;persist();mark('normal-ui-join-original');await active();await joinButton.click();
  let game=await wait('both-original-room-active',pair,x=>x.a.status==='active'&&x.b.status==='active'&&!x.a.pendingAction&&!x.b.pendingAction,x=>({aStatus:x.a.status,bStatus:x.b.status,aRound:x.a.snapshot.round,bRound:x.b.snapshot.round,pending:Number(!!x.a.pendingAction)+Number(!!x.b.pendingAction)}));assertFriendPair(game.a,game.b,roomId,petIds);
  observation={runId,scenario,roomId,sessions:{a:'online-'+roomId,b:'online-'+roomId},installedAt:hs.b.createdAt,uiProgress:{}};
  for(const role of['a','b'])await identityUi(role,'session','active');for(const role of['a','b'])await warmOriginalRoom(role);proof.identityUi.warmNavigationWithoutMutation=true;save();
  let realtimeFailure=false;
  for(let n=0;n<80&&game.a.status==='active';n++){
   const round=assertFriendPair(game.a,game.b,roomId,petIds)+1;intent.rounds.push({round,clicked:[]});persist();
   for(const role of['a','b']){const button=models[role].page.locator(`.battle-screen[data-session-id="online-${roomId}"] .battle-command.normal_attack`);await wait('original-round-'+round+'-'+role+'-ui-ready',()=>button.isEnabled(),Boolean,x=>({round,enabled:x}));await active();intent.rounds.at(-1).clicked.push(role);persist();await button.click();await persistHooks();}
   game=await wait('original-round-'+round+'-both-authoritative',pair,x=>x.a.snapshot.round>=round&&x.b.snapshot.round>=round&&!x.a.pendingAction&&!x.b.pendingAction,x=>({round,aRound:x.a.snapshot.round,bRound:x.b.snapshot.round,aStatus:x.a.status,bStatus:x.b.status,pending:Number(!!x.a.pendingAction)+Number(!!x.b.pendingAction)}));assertFriendPair(game.a,game.b,roomId,petIds);assert.equal(game.a.snapshot.round,round);await persistHooks();
   if(n===0)try{mark('production-realtime-first-round-ui');await observeCloudRealtimeUi(context,observation);}catch(error){if(error?.code!=='REALTIME_UI_UNOBSERVED')throw error;realtimeFailure=true;proof.cases.push({id:'B06',status:'failed',errorCode:'REALTIME_UI_UNOBSERVED',readOnlyObservationFailure:true});save();game=await pair();assertFriendPair(game.a,game.b,roomId,petIds);}
  }
  assertFriendPair(game.a,game.b,roomId,petIds);for(const role of['a','b']){assert.equal(game[role].status,'finished');assert.equal(game[role].reward?.applied,true);}await persistHooks();
  const settlementIds={a:game.a.reward.actionId,b:game.b.reward.actionId};for(const role of['a','b'])assert.equal(settlementIds[role],`battle:${roomId}:${expectedActors[role].ownerAccountId}`);intent.settlementIds=settlementIds;intent.phase='normal-terminal-before-independent-readback';persist();
  const originalReports=await reportUi('report-before-restart');
  mark('independent-full-authority-and-normal-report-restart');const readback=await runCloudAuthorityReadbackCases(context,{observation,roomId,sessions:observation.sessions,settlementIds,selectedCases:realtimeFailure?['B11']:['B06','B11']});for(const r of readback.cases)proof.cases.push({id:r.id,status:r.passed?'passed-scoped':'failed'});proof.authorityReadbackPassed=readback.passed;proof.normalTerminalConfirmed=true;proof.onlyRealtimeObservationFailed=realtimeFailure&&readback.passed;proof.roomId=roomId;proof.naturalRounds=game.a.rounds.length;proof.passed=!realtimeFailure&&readback.passed;
  if(readback.cases.some(r=>r.id==='B11'&&r.passed&&r.bothNormallyRestarted)){await reportUi('report-after-restart',originalReports);assert.equal(proof.identityUi.checks.length,8);proof.identityUi.passed=true;proof.identityUi.status='passed-scoped';}else{proof.identityUi.status='blocked';proof.identityUi.errorCode='B11_ORIGINAL_REPORT_RESTART_NOT_VERIFIED';}proof.passed=proof.passed&&proof.identityUi.passed;
 }catch(error){proof.passed=false;proof.errorCode=['AUTH_REQUIRED','SESSION_REVOKED','SESSION_CHANGED','QA_GRANT_EXPIRED','QA_SCOPE_DENIED','READBACK_TIMEOUT','REALTIME_UI_UNOBSERVED'].includes(error?.code)?error.code:'FRIEND_COMPLETION_UNCLASSIFIED';proof.uncertainWrite=intent.inviteSubmitted||intent.acceptSubmitted||intent.joinSubmitted||intent.rounds.length>0;}
 finally{if(proof.errorCode){proof.identityUi.status='failed';proof.identityUi.passed=false;}if(installed)try{await persistHooks();}catch{proof.lastHookReadbackUnavailable=true;}proof.cleanup=await endCloudAuthorityObservation(context);if(Object.values(proof.cleanup).some(x=>x!==true))proof.passed=false;proof.friendFailureContinuation=proof.onlyRealtimeObservationFailed===true&&proof.normalTerminalConfirmed===true&&proof.authorityReadbackPassed===true&&proof.identityUi.passed===true&&Object.values(proof.cleanup).every(x=>x===true)&&!proof.errorCode&&!proof.uncertainWrite?{originalRoomTerminal:true,bothReportsAndAuthorityVerified:true,originalIntentsPersisted:true,observerCleanupVerified:true,onlyRealtimeReadObservationFailed:true}:null;proof.completedAt=new Date().toISOString();save();}
 return proof;
}
