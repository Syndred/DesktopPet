import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ReportsPanel } from '../src/features/battle/ReportsPanel';
import { useBattleRouteId } from '../src/features/battle/route-id';
import { TerritoryPage } from '../src/features/garden';
// Actual React components; controlled read-only props/state. No account/cloud/native acceptance.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const check=(value,message)=>{if(!value)throw Error(message);};
const pet={petId:'fixture-pet',petName:'fixture-name',element:'fire',level:1,displayIdentity:{roleName:'fixture-role',instanceNumber:'123'}};
const report=id=>({id,sessionId:id,player:pet,enemy:pet,rounds:[],mode:'training',status:'finished',winner:'player',endedAt:'2026-01-01'});
window.runHookRegressions=async()=>{
 const results=[]; let listClicks=0;
 const base={rules:{},reports:[report('first'),report('second')],busy:false,onSelect(){},onAgain(){},onBack(){},onRetry(){},onList(){listClicks++;}};
 async function run(name,Component,props,verify){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);try{await act(async()=>root.render(createElement(Component,props)));await verify(host);results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.message});}finally{await act(async()=>root.unmount());host.remove();}}
 await run('missing explicit report never shows first report; recovery uses list callback',ReportsPanel,{...base,selectedId:'missing'},async host=>{check(host.textContent.includes('未找到这场战报'),'missing state absent');check(!host.querySelector('[aria-label="战报详情"]'),'wrong report rendered');await act(async()=>host.querySelector('button').click());check(listClicks===1,'list callback absent');});
 await run('explicit missing ID with empty collection is missing rather than generic empty',ReportsPanel,{...base,reports:[],selectedId:'missing'},host=>check(host.textContent.includes('未找到这场战报'),'wrong empty state'));
 await run('list without ID preserves original empty guidance',ReportsPanel,{...base,reports:[]},host=>check(host.textContent.includes('每一场并肩'),'empty guidance regressed'));
 await run('list without ID still selects first report',ReportsPanel,base,host=>check(host.querySelector('.battle-report-item[aria-pressed="true"]')===host.querySelectorAll('.battle-report-item')[0],'first item not selected'));
 await run('existing explicit ID selects only requested report',ReportsPanel,{...base,selectedId:'second'},host=>check(host.querySelector('.battle-report-item[aria-pressed="true"]')===host.querySelectorAll('.battle-report-item')[1],'wrong report selected'));
 window.lingjing={invoke:async()=>({ok:false,code:'FIXTURE_ONLY'})};
 for(const pending of [true,false]){
  let mutations=0;window.gardenFixture={snapshot:{ownerAccountId:'fixture-owner',territories:[{id:'territory',name:'fixture territory',ownerAccountId:'fixture-owner',garrisonPetId:'guard',captureMultiplier:1,logs:[]}],pets:[],plots:[],remainingInvasions:2},loading:false,busy:false,pending:pending?{command:'garrison'}:null,now:0,refresh(){},retry(){},mutate(){mutations++;}};
  await run(`end garrison ${pending?'disabled while pending':'enabled without pending'}`,TerritoryPage,{},async host=>{const button=[...host.querySelectorAll('button')].find(b=>b.textContent==='结束驻守');check(Boolean(button),'button missing');check(button.disabled===pending,'pending disable mismatch');await act(async()=>button.click());check(mutations===(pending?0:1),'unexpected mutate dispatch');});
 }
 function RouteProbe({path}) { return <output>{useBattleRouteId(path,'/battle/session/')}</output>; }
 window.location.hash='/battle/session/a%252F';
 await run('raw hash alias updates actual ID even with unchanged decoded path',RouteProbe,{path:'/battle/session/a%2F'},async host=>{check(host.textContent==='a%2F','initial literal-percent ID wrong');await act(async()=>{window.location.hash='/battle/session/a%2F';window.dispatchEvent(new Event('hashchange'));});check(host.textContent==='a/','alias did not update ID');});
 window.location.hash='/battle/session/old';
 await run('exiting old RoutePath retains its original ID across new route hash',RouteProbe,{path:'/battle/session/old'},async host=>{check(host.textContent==='old','initial ID wrong');await act(async()=>{window.location.hash='/battle/session/new';window.dispatchEvent(new Event('hashchange'));});check(host.textContent==='old','exiting page changed identity');});
 delete window.gardenFixture;return results;
};
