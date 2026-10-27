import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { CompanionCloudNotice } from '../../../apps/pc-app/ui/src/features/companions/components';
import { AccountPage } from '../../../apps/pc-app/ui/src/features/accounts/account';

// QA-021 source/UI follow-up only. Frozen native case remains unmodified.
// Real components; synthetic account IPC never performs restore, upload or cloud I/O.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const check=(value,message)=>{if(!value)throw Error(message);};
let root,host,fixture;
async function mount(component){host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(component));}
async function cleanup(){await act(async()=>root?.unmount());host?.remove();root=null;window.location.hash='';}
const button=label=>[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===label);
async function click(label){const item=button(label);check(item&&!item.disabled,`Missing enabled ${label}`);await act(async()=>item.click());}
function accountFixture(authoritative){
 const calls=[];let records=[{collection:'conversation_memories',id:'original-memory-id',reason:'backup-import:retained-original-reason',revision:7,local:{content:'retained original content'},cloud:{content:'current cloud content'}}];
 window.lingjing={subscribe:()=>()=>{},async invoke(feature,command,input){check(feature==='accounts','Unexpected IPC namespace');calls.push({command,input:structuredClone(input)});const ok=data=>({ok:true,data});
  if(command==='session')return ok({currentUser:{id:'original-fixture-owner',provider:'runtime',authKind:authoritative?'supabase':undefined,account:'original-fixture',username:'Fixture',revision:1},persistence:'memory'});
  if(command==='settingsGet')return ok({revision:4,document:{sync:{enabled:false},desktop:{}}});
  if(command==='syncStatus')return ok({status:'ready',lastVerifiedAt:'2026-10-25T21:00:00Z',lastCloudCheckedAt:'2026-10-25T21:00:00Z',localChanged:!authoritative,pending:0,conflicts:0,preservedLocalRecords:authoritative?records.length:0,domainStates:[]});
  if(command==='preservedRecords')return ok(structuredClone(records));
  if(command==='resolvePreservedRecord'){check(input.id===records[0].id&&input.revision===7&&input.reason===records[0].reason,'Resolution changed original identity or version');records=[];return ok({resolved:true});}
  throw Error(`Unexpected mutation/read ${command}`);
 }};
 return {calls};
}
const cases=[
 ['confirmed local difference explains the retained branch and navigates to account details without replay',async()=>{
  let reloads=0;await mount(createElement(CompanionCloudNotice,{controller:{snapshot:{sync:{status:'ready',sharedSavePending:true,pending:0,sharedSaveReason:'local-difference'}},busy:false,refreshing:false,reload(){reloads++;}}}));
  check(host.textContent.includes('伙伴已保存')&&host.textContent.includes('待同步差异'),'Must explain saved companions and remaining difference separately');
  check(!button('核对存档'),'Confirmed local branch must not keep generic restore guidance');
  await click('查看同步详情');check(window.location.hash==='#/account','Must navigate to existing account detail');check(reloads===0,'Guidance must not replay any refresh/restore action');
 }],
 ['fully confirmed state renders no stale restore prompt',async()=>{
  await mount(createElement(CompanionCloudNotice,{controller:{snapshot:{sync:{status:'ready',sharedSavePending:false,pending:0}},busy:false,refreshing:false,reload(){throw Error('Unexpected reload');}}}));
  check(host.textContent==='','No pending state should leave no warning or restore action');
 }],
 ['legacy retained sync-off branch is explained without enabling sync or reopening restore',async()=>{
  fixture=accountFixture(false);await mount(createElement(AccountPage));
  await act(async()=>host.querySelector('[aria-label="待同步"]').focus());
  check(document.body.textContent.includes('存档同步已关闭'),'Must explain the actual retained sync=false branch');
  check(document.body.textContent.includes('保留合并后仍可能有差异'),'Merge outcome must not falsely promise all differences gone');
  check(!document.querySelector('[role="dialog"]'),'Visiting account detail must not reopen restore');
  check(fixture.calls.every(x=>['session','syncStatus','settingsGet'].includes(x.command)),'Read-only account visit must not enable sync, upload or restore');
 }],
 ['cloud-authoritative preserved records offer explicit per-record choice and do not loop to backup restore',async()=>{
  fixture=accountFixture(true);await mount(createElement(AccountPage));await click('查看保留记录');
  check(host.textContent.includes('retained original content')&&host.textContent.includes('current cloud content'),'Both original and current content must be reviewable');
  check(!fixture.calls.some(x=>x.command==='resolvePreservedRecord'),'Viewing records must not resolve them');
  await click('采用原记录');
  const choices=fixture.calls.filter(x=>x.command==='resolvePreservedRecord');check(choices.length===1&&choices[0].input.decision==='local','Only the explicit original-record choice should resolve');
  check(host.textContent.includes('没有待处理的保留记录'),'Resolved record must leave a clear empty-state, not invite repeat restore');
  check(!fixture.calls.some(x=>/backup|syncNow|settingsSave/i.test(x.command)),'Per-record review must never reopen backup restore or enable/upload sync');
 }]
];
window.runHookRegressions=async()=>{const results=[];for(const [name,run]of cases){try{await run();results.push({name,passed:true});}catch(error){results.push({name,passed:false,error:error.stack||String(error),causes:error.errors?.map(e=>e.stack||String(e))});}finally{await cleanup();}}return results;};
