// Future-batch scheduling only. Never changes authority clocks, targets or proof data.
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function planTargetWindow(response,{receivedAt,requestedAt,deadline}={}){
 const serverTime=response?.serverTime,spawns=response?.spawns;
 if(!Number.isSafeInteger(serverTime)||!Number.isSafeInteger(receivedAt)||!Number.isSafeInteger(requestedAt)||receivedAt<requestedAt||!Array.isArray(spawns)||spawns.length>16||spawns.some(s=>!s||!Number.isSafeInteger(s.expiresAt)||typeof s.templateId!=='string'))fail('DISCOVERY_TARGET_SCHEMA_INVALID');
 const duration=receivedAt-requestedAt,skew=receivedAt-serverTime;
 if(duration>30000||Math.abs(skew)>30000)fail('DISCOVERY_TARGET_CLOCK_UNCERTAIN');
 // Both clocks must retain the original strict three-minute guard. Never relax it.
 const eligible=spawns.filter(s=>s.expiresAt-receivedAt>180000&&s.expiresAt-serverTime-duration>180000);
 const selected=eligible.find(s=>s.templateId==='animal-wood-deer')||eligible[0];
 const ttl=spawns.map(s=>s.expiresAt-serverTime);
 const observation={receivedAtUtc:new Date(receivedAt).toISOString(),serverTimeMs:serverTime,responseDurationMs:duration,clientServerSkewMs:skew,spawnCount:spawns.length,preferredTemplateCount:spawns.filter(s=>s.templateId==='animal-wood-deer').length,numericExpiryCount:spawns.length,remainingTtlMinMs:ttl.length?Math.min(...ttl):null,remainingTtlMaxMs:ttl.length?Math.max(...ttl):null,eligibleCount:eligible.length,decision:selected?'READY':spawns.length?'TTL_TOO_SHORT':'EMPTY'};
 if(selected)return {selected,observation};
 if(!spawns.length)return {observation};
 const boundary=(Math.floor(serverTime/3600000)+1)*3600000;
 if(spawns.some(s=>s.expiresAt!==boundary))fail('DISCOVERY_TARGET_SCHEMA_INVALID');
 const waitMs=boundary-serverTime+1000; // Real next server-hour boundary, no injected clock.
 if(!Number.isSafeInteger(deadline)||deadline-receivedAt<=waitMs+180000)fail('PRECONDITION_TARGET_WINDOW_DEADLINE');
 return {observation,waitMs};
}
export async function waitTargetWindow(waitMs,{deadline,assertActive,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 if(!Number.isSafeInteger(waitMs)||waitMs<=0||waitMs>3601000)fail('DISCOVERY_TARGET_SCHEMA_INVALID');
 const until=now()+waitMs;
 if(!Number.isSafeInteger(deadline)||deadline-until<=180000)fail('PRECONDITION_TARGET_WINDOW_DEADLINE');
 while(now()<until){await assertActive();if(now()>=deadline-180000)fail('PRECONDITION_TARGET_WINDOW_DEADLINE');await sleep(Math.min(5000,until-now()));}
 await assertActive();
}
