const fs=require('node:fs'),path=require('node:path');
async function main(){
 const pages=(await(await fetch('http://127.0.0.1:57215/json/list')).json()).filter(t=>t.type==='page'&&t.url.includes('/apps/pc-app/dist/ui/index.html'));
 if(pages.length!==1)throw Error('Unique original LocalA renderer required');
 const ws=new WebSocket(pages[0].webSocketDebuggerUrl);
 const expression="(async()=>{const r=await window.lingjing.invoke('app','info');const d=r.data||r;return {ok:r.ok,version:d.version,platform:d.platform,build:d.build,runtime:d.runtime,scenario:d.scenario,user:d.user?{ownerAccountId:d.user.ownerAccountId,provider:d.user.provider}:null,route:location.hash}})()";
 const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.close();reject(Error('Readonly AppInfo timeout'));},10000);ws.onopen=()=>ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{returnByValue:true,awaitPromise:true,expression}}));ws.onerror=()=>{clearTimeout(timer);reject(Error('Readonly connection failed'));};ws.onmessage=e=>{const r=JSON.parse(e.data);if(r.id!==1)return;clearTimeout(timer);ws.close();if(r.error||r.result?.exceptionDetails)reject(Error('Readonly AppInfo failed'));else resolve(r.result.result.value);};});
 const report={at:new Date().toISOString(),method:'readonly public app:info projection; original profile localhost CDP; no mutation or credential values',result};
 const output=path.join(__dirname,'app-info-'+process.argv[2]+'-20261026.json');fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...report}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
