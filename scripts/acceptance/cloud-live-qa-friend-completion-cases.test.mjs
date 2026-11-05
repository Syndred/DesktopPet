import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {assertFriendPair,validateCreatedFriendRoom,friendNumberedIdentity,assertFriendIdentityDocument,captureFriendIdentityDom,assertFriendIdentityDom} from './cloud-live-qa-friend-completion-cases.mjs';
const id='10000000-0000-4000-8000-000000000000',pets={a:'a-pet',b:'b-pet'};
const pair=()=>Object.fromEntries(['a','b'].map(role=>[role,{id:'online-'+id,mode:'friend',status:'active',context:{authority:'supabase'},room:{id},player:{petId:pets[role]},snapshot:{round:1},pendingAction:null}]));
test('same original cloud room exact pets/round only',()=>{const p=pair();assert.equal(assertFriendPair(p.a,p.b,id,pets),1);});
test('unknown pending, different round/room/actor/source all stop before another click',()=>{for(const change of[{pendingAction:{id:'original'}},{room:{id:'other'}},{snapshot:{round:2}},{player:{petId:'different'}},{context:{authority:'simulated'}}]){const p=pair();assert.throws(()=>assertFriendPair(p.a,{...p.b,...change},id,pets));}});
test('accepting B is host and original A invited; unrelated membership refused',()=>{const r={id,host_user_id:'owner-b',invited_user_id:'owner-a',guest_user_id:null};assert.equal(validateCreatedFriendRoom(r,{hostOwner:'owner-b',invitedOwner:'owner-a'}),id);assert.throws(()=>validateCreatedFriendRoom({...r,guest_user_id:'unrelated'},{hostOwner:'owner-b',invitedOwner:'owner-a'}));});
test('transparent read-only binding occurs before original createRoom subscription in actual product',()=>{const s=readFileSync(new URL('../../apps/pc-app/runtime/services/online-duel-service.cjs',import.meta.url),'utf8');const body=s.slice(s.indexOf('async createRoom('),s.indexOf('async joinRoom('));assert.ok(body.indexOf('await this.invoke("create_room"')<body.indexOf('this.applyRoom(response.room)'));assert.ok(body.indexOf('this.applyRoom(response.room)')<body.indexOf('await this.subscribeRoom()'));});

const ownPet=role=>({ownerAccountId:'owner-'+role,petId:pets[role],templateId:'big-fish-gentle',globalSerial:role==='a'?'7':'9007199254740993',name:'旧昵称-'+role});
const identity=role=>({roleName:'鱼丸',instanceNumber:role==='a'?'0007':'9007199254740993'});
const identities=Object.fromEntries(['a','b'].map(role=>[role,friendNumberedIdentity(ownPet(role),identity(role),'owner-'+role)]));
const expected=(role='a',kind='session')=>({role,kind,roomId:id,identities});
function document(role='a',kind='session'){
 const peer=role==='a'?'b':'a',participant=r=>({petId:pets[r],petName:'旧昵称-'+r,displayKind:'instance',displayIdentity:identity(r)});
 const value={id:'online-'+id,mode:'friend',status:kind==='session'?'active':'finished',context:{authority:'supabase',cloudUserId:'owner-'+role},player:participant(role),enemy:participant(peer)};
 return kind==='session'?{...value,room:{id,host_user_id:'owner-b',guest_user_id:'owner-a',invited_user_id:'owner-a',host_pet_id:pets.b,guest_pet_id:pets.a},side:role==='a'?'guest':'host',pendingAction:null,snapshot:{round:1}}:{...value,sessionId:'online-'+id,historyComplete:true,rounds:[{round:1}],reward:{applied:true,actionId:`battle:${id}:owner-${role}`}};
}
const text=value=>[{text:value,visible:true}];
function dom(role='a',kind='session'){
 const roles=[role,role==='a'?'b':'a'],path=`/battle/${kind==='session'?'session':'reports'}/online-${id}`;
 const value={kind,hash:'#'+path,routeCount:1,routeKey:path,routeVisible:true,participants:roles.map((r,i)=>({side:i===0?'player':'enemy',visible:true,petIds:[pets[r]],names:text(identities[r].roleName),numbers:text('编号 '+identities[r].number)}))};
 return kind==='session'?{...value,screenCount:1,sessionId:'online-'+id,mode:'friend',authority:'supabase'}:{...value,detailCount:1,selectedCount:1,selectedVisible:true,selectedNames:text('鱼丸 vs 鱼丸'),selectedNumbers:roles.map((r,i)=>({text:(i===0?'我方编号 ':'对方编号 ')+identities[r].number,visible:true}))};
}
test('C03 expected fixed names are catalog-bound and preserve large server serials',()=>{
 assert.equal(identities.b.number,'9007199254740993');assert.equal(identities.a.number,'0007');assert.equal(identities.a.roleName,'鱼丸');
 for(const mutate of[p=>p.ownerAccountId='foreign',p=>p.globalSerial=7,p=>p.globalSerial='07',p=>p.globalSerial='',p=>p.templateId='not-catalog']){const pet=ownPet('a');mutate(pet);assert.throws(()=>friendNumberedIdentity(pet,identity('a'),'owner-a'));}
 for(const wrong of[{roleName:'旧昵称-a',instanceNumber:'0007'},{roleName:'鱼丸',instanceNumber:'0008'}])assert.throws(()=>friendNumberedIdentity(ownPet('a'),wrong,'owner-a'));
});
test('C03 both owner perspectives bind fixed name and exact server number to original room and report',()=>{
 for(const role of['a','b'])for(const kind of['session','report']){assert.equal(assertFriendIdentityDocument(document(role,kind),expected(role,kind)).id,'online-'+id);assert.equal(assertFriendIdentityDom(dom(role,kind),expected(role,kind)),true);}
});
test('C03 original session identity rejects wrong owner, stale room, swapped pet and pending intent',()=>{
 for(const mutate of[v=>v.context.cloudUserId='owner-b',v=>v.context.authority='simulated',v=>v.id='online-old',v=>v.room.id='old',v=>v.room.host_user_id='other',v=>v.room.guest_user_id='other',v=>v.room.invited_user_id='other',v=>v.room.host_pet_id='other',v=>v.room.guest_pet_id='other',v=>v.side='host',v=>v.player.petId='other',v=>v.enemy.petId='other',v=>v.pendingAction={actionId:'unknown'},v=>v.status='waiting']){const value=document();mutate(value);assert.throws(()=>assertFriendIdentityDocument(value,expected()));}
});
test('C03 no stale participant number, nickname, pending metadata or non-instance projection passes',()=>{
 for(const kind of['session','report'])for(const side of['player','enemy'])for(const mutate of[p=>p.displayIdentity.instanceNumber='0008',p=>p.displayIdentity.instanceNumber='待同步',p=>p.displayIdentity.roleName=p.petName,p=>p.displayKind='practice',p=>delete p.displayIdentity]){const value=document('a',kind);mutate(value[side]);assert.throws(()=>assertFriendIdentityDocument(value,expected('a',kind)));}
});
test('C03 report must be the same terminal session, owner and original applied settlement',()=>{
 for(const mutate of[v=>v.id='online-old',v=>v.sessionId='online-old',v=>delete v.sessionId,v=>v.context.cloudUserId='owner-b',v=>v.status='active',v=>v.historyComplete=false,v=>v.rounds=[],v=>v.reward.applied=false,v=>v.reward.actionId=`battle:${id}:owner-b`]){const value=document('a','report');mutate(value);assert.throws(()=>assertFriendIdentityDocument(value,expected('a','report')));}
});
test('C03 UI rejects wrong number and role text even when both pets share the same fixed name',()=>{
 for(const kind of['session','report'])for(const side of[0,1])for(const mutate of[p=>p.numbers=text('编号 0008'),p=>p.numbers=text('编号 待同步'),p=>p.names=text('旧昵称-a'),p=>p.petIds=['other'],p=>p.side=p.side==='player'?'enemy':'player']){const value=dom('a',kind);mutate(value.participants[side]);assert.throws(()=>assertFriendIdentityDom(value,expected('a',kind)));}
});
test('C03 stale session, stale route, simulated battle and incomplete or hidden DOM cannot pass',()=>{
 for(const kind of['session','report'])for(const mutate of[v=>v.hash='#/battle/session/online-old',v=>v.routeKey='/battle/session/online-old',v=>v.routeCount=0,v=>v.routeCount=2,v=>v.routeVisible=false,v=>v.participants.pop(),v=>v.participants.push(v.participants[0]),v=>v.participants[0].names=[],v=>v.participants[1].numbers=[],v=>v.participants[0].names.push(v.participants[0].names[0]),v=>v.participants[0].visible=false,v=>v.participants[1].numbers[0].visible=false,v=>v.participants[0].petIds.push(pets.a)]){const value=dom('a',kind);mutate(value);assert.throws(()=>assertFriendIdentityDom(value,expected('a',kind)));}
 for(const mutate of[v=>v.sessionId='online-old',v=>v.screenCount=2,v=>v.mode='training',v=>v.authority='simulated']){const value=dom();mutate(value);assert.throws(()=>assertFriendIdentityDom(value,expected()));}
});
test('C03 original report UI requires one selected row and complete detail with both numbers',()=>{
 for(const mutate of[v=>v.detailCount=0,v=>v.detailCount=2,v=>v.selectedCount=0,v=>v.selectedCount=2,v=>v.selectedVisible=false,v=>v.selectedNames=text('旧昵称-a vs 旧昵称-b'),v=>v.selectedNumbers[1].text='对方编号 0007',v=>v.selectedNumbers.pop()]){const value=dom('a','report');mutate(value);assert.throws(()=>assertFriendIdentityDom(value,expected('a','report')));}
});
// No browser, credentials, native app or network. The serialized DOM collector
// runs against explicit nodes, including missing children and hidden ancestors.
function syntheticDom(kind='session'){
 const node=(attrs={},value='')=>({attrs,innerText:value,parentElement:null,style:{visibility:'visible',display:'block',opacity:'1'},queries:{},classList:{contains:c=>c===attrs.class},getAttribute(name){return this.attrs[name]??null;},getClientRects(){return [{}];},querySelectorAll(selector){return this.queries[selector]||[];}});
 const root=node({'data-route-key':`/battle/${kind==='session'?'session':'reports'}/online-${id}`}),screen=node({'data-session-id':'online-'+id,'data-battle-mode':'friend','data-authority':'supabase'}),detail=node(),selected=node(),nodes=[];
 root.queries['.battle-screen']=[screen];root.queries['.battle-report-detail']=[detail];root.queries['.battle-report-item[aria-pressed="true"]']=[selected];
 const participants=['a','b'].map((r,i)=>{const p=node({class:i?'enemy':''}),name=node({},'鱼丸'),number=node({},'编号 '+identities[r].number);p.parentElement=root;name.parentElement=p;number.parentElement=p;nodes.push({p,name,number});p.queries['.battle-portrait[data-pet-id]']=[node({'data-pet-id':pets[r]})];p.queries[kind==='session'?'.battle-participant-identity > strong':':scope > strong']=[name];p.queries[kind==='session'?'.battle-participant-identity > .battle-identity-number':':scope > .battle-identity-number']=[number];return p;});
 screen.queries['.battle-arena-top > .combatant-status']=participants;detail.queries['.battle-result-portraits > div']=participants;selected.queries[':scope > div > strong']=[node({},'鱼丸 vs 鱼丸')];selected.queries['.battle-report-identities > .battle-identity-number']=[node({},'我方编号 0007'),node({},'对方编号 9007199254740993')];
 const sandbox={document:{querySelectorAll:selector=>selector==='.app-page-motion[data-current-route="true"]'?[root]:[]},location:{hash:'#'+root.attrs['data-route-key']},getComputedStyle:el=>el.style};
 return {root,nodes,screen,detail,selected,read:()=>structuredClone(runInNewContext('('+captureFriendIdentityDom.toString()+')('+JSON.stringify(kind)+')',sandbox))};
}
test('C03 serialized DOM collector supplies exact paired nodes and detects missing or invisible content',()=>{
 for(const kind of['session','report']){const f=syntheticDom(kind);assert.equal(assertFriendIdentityDom(f.read(),expected('a',kind)),true);f.nodes[1].number.style.visibility='hidden';assert.throws(()=>assertFriendIdentityDom(f.read(),expected('a',kind)));f.nodes[1].number.style.visibility='visible';f.root.style.opacity='0';assert.throws(()=>assertFriendIdentityDom(f.read(),expected('a',kind)));}
 const f=syntheticDom();f.nodes[0].p.queries['.battle-participant-identity > strong']=[];assert.throws(()=>assertFriendIdentityDom(f.read(),expected()));
});
test('C03 read-only additions keep original producer operations and scoped evidence, not a new C03 full pass',()=>{
 const source=readFileSync(new URL('./cloud-live-qa-friend-completion-cases.mjs',import.meta.url),'utf8'),warm=source.slice(source.indexOf('async function warmOriginalRoom('),source.indexOf('async function reportUi('));
 for(const command of['createRoom','joinRoom','leave','act','retryAction','retrySettlement','selectPet','startTraining'])assert.ok(!new RegExp("call\\(role,'"+command+"'").test(warm));
 assert.ok(warm.includes("name:'返回'"));assert.ok(warm.includes("?'继续本场':'查看对局'"));assert.ok(warm.includes('assert.equal(after.snapshot.round,before.snapshot.round)'));assert.ok(warm.includes('assert.deepEqual((await hooks())[r].commands,commands[r].commands)'));
 assert.ok(source.includes("id:'C03',passed:false,fullCasePassed:false"));assert.ok(source.includes("proof.identityUi.status='passed-scoped'"));assert.ok(!source.includes('fullCasePassed=true'));assert.ok(source.includes("r.id==='B11'&&r.passed&&r.bothNormallyRestarted"));assert.ok(source.includes("reportUi('report-after-restart',originalReports)"));assert.ok(source.includes('proof.passed=proof.passed&&proof.identityUi.passed'));
 assert.ok(!captureFriendIdentityDom.toString().includes('lingjing'));assert.ok(!captureFriendIdentityDom.toString().includes('.click('));
});
test('C03 DOM contracts match the actual battle and report rendering',()=>{
 const read=file=>readFileSync(new URL('../../apps/pc-app/ui/src/features/battle/'+file,import.meta.url),'utf8');
 for(const value of['data-session-id={session.id}','data-battle-mode={session.mode}','data-authority='])assert.ok(read('BattleScreen.tsx').includes(value));
 for(const value of['battle-arena-top','combatant-status','data-pet-id={pet.petId}','ParticipantIdentity pet={pet}'])assert.ok(read('BattleArena.tsx').includes(value));
 for(const value of['battle-report-detail','battle-result-portraits','aria-pressed={item.id === report.id}','label="我方编号"','label="对方编号"','reports.find(item => item.id === selectedId)'])assert.ok(read('ReportsPanel.tsx').includes(value));
 assert.ok(read('identity.tsx').includes('battle-participant-identity'));assert.ok(read('identity.tsx').includes('battle-identity-number'));assert.ok(read('index.tsx').includes('aria-label="已保留的对局"'));
});
