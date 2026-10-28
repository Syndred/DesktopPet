// Data-only fixed-origin/path receipt polling. No credentials or executable fetch.
export function receiptUrl(nonce){
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(nonce))throw Error('RECOVERY_TRANSPORT_REJECTED');
 return `https://raw.githubusercontent.com/Syndred/DesktopPet/refs/heads/codex/cloud-authority-convergence/scripts/acceptance/requests/recovery-applied-${nonce}.json`;
}
export async function readAppliedReceipt(nonce,{deadline,fetchImpl=fetch}={}){
 if(!Number.isSafeInteger(deadline)||Date.now()>=deadline)throw Error('RECOVERY_TRANSPORT_EXPIRED');
 const response=await fetchImpl(receiptUrl(nonce),{method:'GET',redirect:'error',credentials:'omit',headers:{Accept:'application/json','Cache-Control':'no-cache'},signal:AbortSignal.timeout(Math.max(1,Math.min(10000,deadline-Date.now())))});
 if(response.status===404){await response.body?.cancel();return null;}
 if(response.status!==200){await response.body?.cancel();throw Error('RECOVERY_TRANSPORT_REJECTED');}
 let size=0;const parts=[];
 try{for await(const chunk of response.body){size+=chunk.length;if(size>20480)throw Error('RECOVERY_TRANSPORT_OVERSIZED');parts.push(chunk);}const value=JSON.parse(Buffer.concat(parts).toString('utf8'));if(!value||Object.keys(value).length!==1||typeof value.jws!=='string'||value.jws.length>16384)throw Error();return value.jws;}catch{throw Error('RECOVERY_TRANSPORT_REJECTED');}
}
