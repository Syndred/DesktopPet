import test from 'node:test';
import assert from 'node:assert/strict';
import {planTargetWindow,waitTargetWindow} from './cloud-live-qa-target-window.mjs';
const time=Date.parse('2026-10-28T00:58:00Z'),boundary=Date.parse('2026-10-28T01:00:00Z');
const response={serverTime:time,spawns:[{templateId:'animal-wood-deer',expiresAt:boundary}]};
const opts={requestedAt:time-100,receivedAt:time+100,deadline:time+600000};
test('near-hour valid targets schedule real elapsed delay without changing target or clock',async()=>{
 const original=JSON.stringify(response),plan=planTargetWindow(response,opts);assert.equal(plan.observation.decision,'TTL_TOO_SHORT');assert.equal(plan.waitMs,121000);assert.equal(plan.selected,undefined);
 let clock=opts.receivedAt,checks=0;const sleeps=[];
 // Virtual scheduler is test-only; production defaults use Date.now and real setTimeout.
 await waitTargetWindow(plan.waitMs,{deadline:opts.deadline,assertActive:async()=>{checks++;},now:()=>clock,sleep:async ms=>{sleeps.push(ms);clock+=ms;}});
 assert.equal(sleeps.reduce((a,b)=>a+b,0),121000);assert.ok(sleeps.every(ms=>ms<=5000));assert.equal(checks,sleeps.length+1);assert.equal(JSON.stringify(response),original);
 const next={serverTime:boundary+2000,spawns:[{templateId:'animal-wood-deer',expiresAt:boundary+3600000}]};const ready=planTargetWindow(next,{requestedAt:boundary+1900,receivedAt:boundary+2100,deadline:opts.deadline});assert.equal(ready.observation.decision,'READY');assert.equal(ready.selected,next.spawns[0]);
});
test('insufficient or absent deadline blocks before sleeping',async()=>{
 for(const deadline of [undefined,time+121000+180000])assert.throws(()=>planTargetWindow(response,{...opts,deadline}),{code:'PRECONDITION_TARGET_WINDOW_DEADLINE'});
 let slept=false;await assert.rejects(waitTargetWindow(121000,{deadline:time+200000,assertActive:async()=>{},now:()=>time,sleep:async()=>{slept=true;}}),{code:'PRECONDITION_TARGET_WINDOW_DEADLINE'});assert.equal(slept,false);
});
test('invalid schema and uncertain clock fail rather than normalize dates',()=>{
 for(const r of [{...response,serverTime:'2026-10-28'}, {...response,spawns:[{templateId:'x',expiresAt:new Date(boundary).toISOString()}]}, {...response,spawns:[{templateId:'x',expiresAt:boundary-1}]}])assert.throws(()=>planTargetWindow(r,opts),{code:'DISCOVERY_TARGET_SCHEMA_INVALID'});
 assert.throws(()=>planTargetWindow(response,{...opts,receivedAt:time+31000}),{code:'DISCOVERY_TARGET_CLOCK_UNCERTAIN'});
});
test('empty remains distinct and no wait; expiry threshold remains strict',()=>{
 assert.equal(planTargetWindow({...response,spawns:[]},opts).observation.decision,'EMPTY');
 const n=boundary-180000;assert.equal(planTargetWindow({...response,serverTime:n},{requestedAt:n,receivedAt:n,deadline:n+600000}).observation.decision,'TTL_TOO_SHORT');
});
test('grant revoked during wait stops without refreshing target',async()=>{
 let clock=time,checks=0,sleeps=0;await assert.rejects(waitTargetWindow(121000,{deadline:opts.deadline,now:()=>clock,assertActive:async()=>{if(++checks===2)throw Object.assign(Error(),{code:'GLOBAL_SERIAL_SCOPE_REVOKED'});},sleep:async ms=>{sleeps++;clock+=ms;}}),{code:'GLOBAL_SERIAL_SCOPE_REVOKED'});assert.equal(sleeps,1);
});
