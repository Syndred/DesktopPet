const fs=require('node:fs'),path=require('node:path');
async function main(){
 const pages=(await(await fetch('http://127.0.0.1:57215/json/list')).json()).filter(t=>t.type==='page'&&t.url.includes('/apps/pc-app/dist/ui/index.html'));
 if(pages.length!==1)throw Error('Unique LocalA renderer required');
 const expression="(()=>({route:location.hash,rewards:[...document.querySelectorAll('.battle-reward-summary')].map(e=>e.innerText),settingsLinks:[...document.querySelectorAll('a[href*=\"/settings\"]')].map(e=>({text:e.textContent,href:e.getAttribute('href')})),errors:[...document.querySelectorAll('[role=alert]')].map(e=>({text:e.textContent,rect:{x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}}))}))()";
 const ws=new WebSocket(pages[0].webSocketDebuggerUrl);
 const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.close();reject(Error('Readonly UI timeout'));},10000);ws.onopen=()=>ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{returnByValue:true,expression}}));ws.onerror=()=>{clearTimeout(timer);reject(Error('Readonly connection failed'));};ws.onmessage=e=>{const r=JSON.parse(e.data);if(r.id!==1)return;clearTimeout(timer);ws.close();if(r.error||r.result?.exceptionDetails)reject(Error('Readonly evaluation failed'));else resolve(r.result.result.value);};});
 const report={at:new Date().toISOString(),method:'readonly visible reward text, settings links and public alerts; no UI mutation/business call/credential read',result};const output=path.join(__dirname,'visible-public-ui-'+process.argv[2]+'-20261026.json');fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...report}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
