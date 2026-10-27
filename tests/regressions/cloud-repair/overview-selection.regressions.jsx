import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {CompanionsPage} from '../../../apps/pc-app/ui/src/features/companions/CompanionsPage';
import {PetDetailPage} from '../../../apps/pc-app/ui/src/features/companions/PetDetailPage';
import {usePath} from '../../../apps/pc-app/ui/src/app/navigation';
import {createCompanionInstance,listBuiltinTemplates} from '../../../apps/pc-app/runtime/features/companions/instance.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const wait=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));}),check=(value,message)=>{if(!value)throw Error(message)};
async function until(check){for(let i=0;i<100;i++){if(check())return;await wait();}throw Error('Fixture UI did not settle');}
let owner='fixture-owner-a',pets=[],listeners=new Map();const templates=listBuiltinTemplates();
function resetPets(){pets=[0,1].map(i=>createCompanionInstance({ownerAccountId:owner,template:templates[i],input:{showOnDesktop:false},source:'adopt',petId:`pet-${owner}-${i}`,createdAt:'2026-01-01T00:00:00.000Z',count:i}));}
async function click(node){check(node,'Expected live source control');await act(async()=>{node.click();await new Promise(resolve=>setTimeout(resolve,0));});}
function emit(name){for(const cb of listeners.get(name)||[])cb({id:owner});}
window.lingjing={subscribe(name,cb){const set=listeners.get(name)||new Set();set.add(cb);listeners.set(name,set);return()=>set.delete(cb);},invoke:async(feature,command)=>command==='list'?{ok:true,data:{ownerAccountId:owner,pets:structuredClone(pets),templates,selections:{chatPetId:null,battlePetId:null,guardPetId:null}}}:{ok:false,code:'UNUSED',message:'fixture read unavailable'}};
function Router(){const path=usePath();return path.startsWith('/companions/')?<PetDetailPage/>:<CompanionsPage/>;}
window.runOverviewRegressions=async()=>{
 const results=[],host=document.createElement('main');host.className='main-content';document.body.append(host);const root=createRoot(host);location.hash='/companions';resetPets();await act(async()=>root.render(createElement(Router)));await until(()=>host.querySelectorAll('.cp-pet-card').length===2);
 async function run(name,fn){try{await fn();results.push({name,passed:true});}catch(error){results.push({name,passed:false,error:error.message});}}
 const selected=()=>host.querySelector('.cp-pet-card[aria-pressed="true"]')?.getAttribute('data-pet-id');
 await run('second pet selection survives actual detail route and normal return',async()=>{await click(host.querySelectorAll('.cp-pet-card')[1]);const expected=pets[1].petId;check(selected()===expected,'second pet did not select');await click([...host.querySelectorAll('button')].find(x=>x.textContent.includes('查看伙伴详情')));await until(()=>host.querySelector('.cp-detail-layout'));check(host.querySelector('.cp-detail-layout')?.getAttribute('data-pet-id')===expected,'wrong detail pet');await click(host.querySelector('.page-back'));await until(()=>host.querySelectorAll('.cp-pet-card').length===2);check(selected()===expected,'return resets second pet selection to first pet');});
 await run('switching owner clears old selected entity',async()=>{owner='fixture-owner-b';resetPets();await act(async()=>emit('app:session'));check(selected()===pets[0].petId,'owner switch did not select own first pet');check(!host.textContent.includes('fixture-owner-a'),'old owner content leaked');});
 await run('removing selected pet falls back to a current owned pet',async()=>{await click(host.querySelectorAll('.cp-pet-card')[1]);pets=pets.slice(0,1);await act(async()=>emit('companions:changed'));check(selected()===pets[0].petId,'deleted selection not replaced');});
 await run('same-owner session event clears transient navigation selection',async()=>{resetPets();await act(async()=>emit('companions:changed'));await click(host.querySelectorAll('.cp-pet-card')[1]);await act(async()=>emit('app:session'));check(selected()===pets[0].petId,'same-owner session change retained old selection');});
 await run('session reset while overview is unmounted cannot restore stale selection',async()=>{await click(host.querySelectorAll('.cp-pet-card')[1]);await click([...host.querySelectorAll('button')].find(x=>x.textContent.includes('查看伙伴详情')));await until(()=>host.querySelector('.cp-detail-layout'));await act(async()=>emit('app:session'));await until(()=>host.querySelector('.cp-detail-layout'));await click(host.querySelector('.page-back'));await until(()=>host.querySelectorAll('.cp-pet-card').length===2);check(selected()===pets[0].petId,'off-route session reset retained old navigation selection');});
 await act(async()=>root.unmount());host.remove();return results;
};
