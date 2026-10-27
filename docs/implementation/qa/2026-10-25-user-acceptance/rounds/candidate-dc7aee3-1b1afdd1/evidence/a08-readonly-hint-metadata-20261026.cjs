const fs=require('node:fs'),path=require('node:path');
async function main(){
 const targets=await (await fetch('http://127.0.0.1:57218/json/list')).json();
 const pages=targets.filter(t=>t.type==='page'&&t.url.includes('/apps/pc-app/dist/ui/index.html'));
 if(pages.length!==1)throw Error('Unique original CloudA renderer required');
 const ws=new WebSocket(pages[0].webSocketDebuggerUrl);
 const result=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{ws.close();reject(Error('Readonly metadata timeout'));},10000);
  ws.onopen=()=>ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{returnByValue:true,expression:'(()=>{const hint=JSON.parse(localStorage.getItem("lingjing_account_hint_v2")||"null");return {route:location.hash,hintKeys:hint?Object.keys(hint).sort():[],hintHasOnlyPublicAccountProvider:Boolean(hint&&Object.keys(hint).every(k=>k==="account"||k==="provider")),hintMatchesCurrentB:hint?.account==="uat_1025_b09_28e3d0",hintProviderRuntime:hint?.provider==="runtime",legacyHintKeyAbsent:!Object.keys(localStorage).includes("lingjing_auth_remember_v1")};})()'}}));
  ws.onerror=()=>{clearTimeout(timer);reject(Error('Readonly metadata connection failed'));};
  ws.onmessage=event=>{const r=JSON.parse(event.data);if(r.id!==1)return;clearTimeout(timer);ws.close();if(r.error||r.result?.exceptionDetails)reject(Error('Readonly metadata evaluation failed'));else resolve(r.result.result.value);};
 });
 const report={at:new Date().toISOString(),source:'read-only CDP metadata, no UI input or IPC/business request',targetPort:57218,originalCloudAPhysicalProfile:true,passwordValuesInspected:false,passwordLengthMeasured:false,legacyHintValuesRead:false,storageModified:false,result};
 const output=path.join(__dirname,'a08-actual-remembered-hint-public-keys-only-20261026.json');
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({output,...report}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
