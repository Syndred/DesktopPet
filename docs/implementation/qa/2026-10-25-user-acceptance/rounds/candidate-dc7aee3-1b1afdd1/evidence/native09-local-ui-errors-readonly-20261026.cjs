const fs=require('node:fs'),path=require('node:path');
async function main(){
 const pages=(await(await fetch('http://127.0.0.1:57215/json/list')).json()).filter(t=>t.type==='page'&&t.url.includes('/apps/pc-app/dist/ui/index.html'));
 if(pages.length!==1)throw Error('Unique LocalA renderer required');
 const ws=new WebSocket(pages[0].webSocketDebuggerUrl);
 const result=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{ws.close();reject(Error('Readonly UI metadata timeout'));},10000);
  ws.onopen=()=>ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{returnByValue:true,expression:'(()=>({route:location.hash,errors:[...document.querySelectorAll("[role=alert],[class*=error]")].map(e=>({text:e.textContent,classes:e.className,rect:{x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}})).filter(e=>e.text?.trim())}))()'}}));
  ws.onerror=()=>{clearTimeout(timer);reject(Error('Readonly UI connection failed'));};
  ws.onmessage=event=>{const r=JSON.parse(event.data);if(r.id!==1)return;clearTimeout(timer);ws.close();if(r.error||r.result?.exceptionDetails)reject(Error('Readonly UI evaluation failed'));else resolve(r.result.result.value);};
 });
 const report={at:new Date().toISOString(),source:'readonly local renderer DOM text/geometry; no UI input, IPC or business call',result};
 const output=path.join(__dirname,'local-ui-errors-'+process.argv[2]+'-20261026.json');
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...report}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
