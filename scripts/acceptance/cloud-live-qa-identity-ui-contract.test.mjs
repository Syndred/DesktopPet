import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {numberedIdentity,unchangedIdentity,pureDesktopText} from './cloud-live-qa-identity-ui-cases.mjs';
const pet={ownerAccountId:'owner',petId:'pet-fixture',templateId:'animal-wood-deer',globalSerial:'9007199254740993'};
const identity={roleName:'鹿',instanceNumber:'9007199254740993'};
test('large server serial never loses precision; exact owner/number required',()=>{const value=numberedIdentity(pet,identity,'owner');assert.equal(value.globalSerial,pet.globalSerial);assert.throws(()=>numberedIdentity(pet,identity,'other'));assert.throws(()=>numberedIdentity({...pet,globalSerial:undefined},identity,'owner'));assert.throws(()=>numberedIdentity(pet,{...identity,instanceNumber:'0001'},'owner'));});
test('decimal formatting and same object across relaunch',()=>{const a=numberedIdentity({...pet,globalSerial:'1'},{...identity,instanceNumber:'0001'},'owner');assert.ok(unchangedIdentity(a,{...a}));assert.throws(()=>unchangedIdentity(a,{...a,petId:'other'}));assert.throws(()=>numberedIdentity({...pet,globalSerial:'01'},{...identity,instanceNumber:'0001'},'owner'));});
test('desktop criterion is no visible text, not removal of accessible labels',()=>{assert.equal(pureDesktopText('  \n'),true);for(const text of ['鹿','编号 0001','摸摸'])assert.equal(pureDesktopText(text),false);});
test('actual UI source contracts remain present',()=>{
 const read=name=>readFileSync(new URL('../../apps/pc-app/ui/src/features/'+name,import.meta.url),'utf8');
 const roster=read('companions/CompanionsPage.tsx');for(const key of ['cp-pet-card-title','data-pet-id={pet.petId}','查看伙伴详情'])assert.ok(roster.includes(key));
 const detail=read('companions/PetDetailPage.tsx');for(const key of ['cp-detail-copy','cp-detail-layout','关闭桌面陪伴','开启桌面陪伴'])assert.ok(detail.includes(key));
 assert.ok(read('conversations/chat-page.tsx').includes('cv-thread-header'));assert.ok(read('conversations/identity.tsx').includes('cv-identity-number'));assert.ok(read('battle/index.tsx').includes('选择出战伙伴'));
 const desktop=read('companions/DesktopCompanion.tsx');assert.ok(desktop.includes('cp-desktop-surface'));assert.ok(desktop.includes('aria-label={`${identity.roleName}的桌面伙伴，编号 ${identity.instanceNumber}`}'));
});
