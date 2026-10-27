import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {useDiscovery} from '../src/features/discovery/use-discovery';
import {useNearbyControls} from '../src/features/discovery/useNearbyControls';
import {LocationControl} from '../src/features/discovery/LocationControl';
import {ExploreView} from '../src/features/discovery/ExploreView';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const check=(value,message)=>{if(!value)throw Error(message);};
export async function runTests(){
 const checks=[],listeners=new Map(),pending=[],snapshotPending=[];let currentOwner='a',nearDistance=80,latest,clock=100000,hold=false,holdSnapshot=false,locateCalls=0;
 const originalNow=Date.now,originalSet=window.setInterval,originalClear=window.clearInterval;Date.now=()=>clock;let next=0;const timers=new Map();window.setInterval=fn=>{timers.set(++next,fn);return next;};window.clearInterval=id=>timers.delete(id);
 const state=()=>({owner:currentOwner,scenario:'qa',spawns:[{id:'near',name:'近',distanceMeters:nearDistance,expiresAt:999999,resourceId:'near',element:'metal'},{id:'far',name:'远',distanceMeters:250,expiresAt:999999,resourceId:'far',element:'wood'}],encounters:[],captures:[],pets:[],territories:[],map:{id:'osm'},location:{status:'ready',mode:'os',fix:{source:'simulated',provider:'qa-discovery',accuracyMeters:5,timestampMs:clock}}});
 window.lingjing={subscribe:(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);return()=>listeners.get(name).delete(fn);},invoke:async(_feature,command)=>{
  if(command==='setExploring')return{ok:true};if(command==='snapshot'){if(holdSnapshot)return new Promise(resolve=>snapshotPending.push(resolve));return{ok:true,data:state()};}
  if(command==='locate'){locateCalls++;if(hold)return new Promise(resolve=>pending.push(resolve));return{ok:true,data:state()};}throw Error('Unexpected command');
 }};
 function Harness(){const discovery=useDiscovery();const controls=useNearbyControls(discovery.sessionEpoch,async()=>await discovery.run('locate')!==undefined);latest={...discovery,...controls};if(!discovery.data)return null;const visible={...discovery.data,spawns:discovery.data.spawns.filter(p=>p.distanceMeters<=controls.radius)};return <><LocationControl state={discovery.data} pending={discovery.pending||controls.manualPending} cooldownSeconds={controls.cooldownSeconds} locate={()=>void controls.refreshLocation()}/><ExploreView state={visible} selected={visible.spawns[0]} select={()=>{}} displayRadius={controls.radius} setDisplayRadius={controls.setRadius}/><p data-testid="error">{discovery.error}</p></>;}
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const render=async()=>{await act(async()=>root.render(<Harness/>));};
 const emit=async()=>{await act(async()=>{for(const fn of listeners.get('app:session')||[])fn({currentUser:{id:currentOwner}});});};
 const button=()=>host.querySelector('button[aria-label="更新场景位置"]');
 const settle=async(resolve,value)=>{await act(async()=>resolve(value));};
 const report=name=>checks.push({name,passed:true});
 try{
  await render();check(latest.radius===450,'default 450');check(host.querySelector('select[aria-label="附近显示范围"]')?.value==='450','accessible range select');check(host.textContent.includes('2 位伙伴'),'default result count');report('default range and accessible real controls');
  await act(async()=>latest.setRadius(100));check(host.textContent.includes('1 位伙伴'),'100m filters display only');check(latest.data.spawns.length===2,'source data not filtered');report('display-only range leaves source intact');
  hold=true;await act(async()=>{void latest.refreshLocation();void latest.refreshLocation();});check(locateCalls===1&&button().disabled,'same-turn duplicate locked');await settle(pending.shift(),{ok:true,data:state()});check(latest.cooldownSeconds===15&&button().disabled,'success cooldown');check(button().getAttribute('aria-describedby')&&host.querySelector('[role="timer"]')?.textContent==='15 秒后可更新','accessible countdown');await act(async()=>latest.refreshLocation());check(locateCalls===1,'cooldown rejects duplicate');report('shared busy lock and accessible 15-second success throttle');
  clock+=15000;await act(async()=>{for(const fn of [...timers.values()])fn();});check(latest.cooldownSeconds===0&&!button().disabled,'natural deadline re-enables');report('deadline expires without changing service clock');
  await act(async()=>{void latest.refreshLocation();});await settle(pending.shift(),{ok:false,code:'LOCATION_UNAVAILABLE',message:'fixture unavailable'});check(!button().disabled&&latest.cooldownSeconds===0&&latest.error==='fixture unavailable','failure immediately retryable');report('failure displays error with no cooldown');
  await act(async()=>{void latest.refreshLocation();});const oldSuccess=pending.shift();currentOwner='b';await emit();check(latest.radius===450&&latest.cooldownSeconds===0&&!button().disabled,'new owner resets controls');await settle(oldSuccess,{ok:true,data:{...state(),owner:'a'}});check(latest.data.owner==='b'&&latest.cooldownSeconds===0&&!latest.pending,'late old success ignored');report('owner switch ignores late success');
  await act(async()=>{void latest.refreshLocation();});const oldError=pending.shift();await emit();await act(async()=>{void latest.refreshLocation();});const newRequest=pending.shift();await settle(oldError,{ok:false,message:'old owner error'});check(latest.error===''&&latest.pending&&button().disabled,'late failure must not clear new busy');await settle(newRequest,{ok:true,data:state()});check(latest.cooldownSeconds===15,'new request success preserved');report('same-owner session change protects newer pending and errors');
  holdSnapshot=true;await act(async()=>{void latest.refresh();});const staleSnapshot=snapshotPending.shift();holdSnapshot=false;currentOwner='c';await emit();await settle(staleSnapshot,{ok:false,message:'stale snapshot error'});check(latest.error===''&&latest.data.owner==='c','stale refresh failure ignored');report('stale snapshot rejection cannot poison current session');
  await act(async()=>latest.setRadius(100));nearDistance=150;await act(async()=>latest.refresh());check(host.textContent.includes('100 米内暂未发现伙伴'),'real filtered empty label');report('display-filter empty state distinct from unlocated state');
  await act(async()=>root.unmount());check([...listeners.values()].every(s=>s.size===0),'session listeners cleaned');report('unmount cleans subscriptions');
  check(checks.length===10,'test cardinality');return checks;
 }finally{try{await act(async()=>root.unmount());}catch{}host.remove();Date.now=originalNow;window.setInterval=originalSet;window.clearInterval=originalClear;}
}
