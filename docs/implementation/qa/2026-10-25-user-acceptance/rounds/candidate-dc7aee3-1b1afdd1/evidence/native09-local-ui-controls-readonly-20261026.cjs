const fs=require('node:fs'),path=require('node:path');
async function main(){
 const pages=(await(await fetch('http://127.0.0.1:57215/json/list')).json()).filter(t=>t.type==='page'&&t.url.includes('/apps/pc-app/dist/ui/index.html'));
 if(pages.length!==1)throw Error('Unique LocalA renderer required');
 const expression=`(()=>{const a=document.activeElement;const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}};return {route:location.hash,active:{tag:a.tagName,type:a.type,id:a.id,role:a.getAttribute('role'),label:a.getAttribute('aria-label'),...(a.type==='range'?{value:a.value}:{}),rect:rect(a)},ranges:[...document.querySelectorAll('input[type=range]')].map(e=>({label:e.getAttribute('aria-label'),id:e.id,value:e.value,min:e.min,max:e.max,step:e.step,rect:rect(e)}))}})()`;
 const ws=new WebSocket(pages[0].webSocketDebuggerUrl);
 const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.close();reject(Error('Readonly timeout'));},10000);ws.onopen=()=>ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{returnByValue:true,expression}}));ws.onerror=()=>{clearTimeout(timer);reject(Error('Readonly connection failed'));};ws.onmessage=e=>{const r=JSON.parse(e.data);if(r.id!==1)return;clearTimeout(timer);ws.close();if(r.error||r.result?.exceptionDetails)reject(Error('Readonly evaluation failed'));else resolve(r.result.result.value);};});
 const report={at:new Date().toISOString(),source:'readonly public DOM control metadata, range values only; no input/IPC/business call or credentials',result};
 const output=path.join(__dirname,'local-ui-controls-'+process.argv[2]+'-20261026.json');fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...report}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
