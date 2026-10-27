const fs=require('node:fs'),path=require('node:path');
async function evaluate(page,expression){
 const ws=new WebSocket(page.webSocketDebuggerUrl);
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.close();reject(Error('Readonly timeout'));},10000);
 ws.onopen=()=>ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{returnByValue:true,awaitPromise:true,expression}}));
 ws.onerror=()=>{clearTimeout(timer);reject(Error('Readonly connection failed'));};
 ws.onmessage=e=>{const r=JSON.parse(e.data);if(r.id!==1)return;clearTimeout(timer);ws.close();if(r.error||r.result?.exceptionDetails)reject(Error('Readonly evaluation failed'));else resolve(r.result.result.value);};});
}
async function main(){
 const pages=(await(await fetch('http://127.0.0.1:57215/json/list')).json()).filter(t=>t.type==='page');
 const mains=pages.filter(t=>t.url.includes('/apps/pc-app/dist/ui/index.html'));
 if(mains.length!==1)throw Error('Original LocalA unique renderer required');
 const state=await evaluate(mains[0],`(async()=>{const s=await window.lingjing.invoke('accounts','settingsGet');const c=await window.lingjing.invoke('companions','list');const a=await window.lingjing.invoke('app','info');const d=c.data||{};return {route:location.hash,build:a.data?.build?.sourceCommit,scenario:a.data?.scenario,user:a.data?.user?{ownerAccountId:a.data.user.ownerAccountId,provider:a.data.user.provider}:null,settings:s,companions:{ok:c.ok,ownerAccountId:d.ownerAccountId,desktopDisplay:d.desktopDisplay,selections:d.selections,pets:d.pets?.map(p=>({petId:p.petId,resource:p.resource,desktop:p.desktop}))},visibleCounterLines:document.body.innerText.split('\\n').filter(t=>/已拥有|已开启|桌面显示|桌面中|等待空位|当前显示|未开启桌面|正在桌面|最多显示/.test(t))}})()`);
 if(state.build!=='c7ad6837e1569dafd942528f375062debf714c2b')throw Error('Wrong actual source');
 const geometry=[];
 for(const p of pages.filter(t=>t.url.includes('/apps/pc-app/dist/ui/desktop.html'))){
  geometry.push(await evaluate(p,`(()=>({at:Date.now(),route:location.hash,ready:document.readyState,visibility:document.visibilityState,screen:[screenX,screenY],inner:[innerWidth,innerHeight],outer:[outerWidth,outerHeight],dpr:devicePixelRatio,visualViewportScale:visualViewport?.scale,cssZoom:getComputedStyle(document.documentElement).zoom,canvas:[...document.querySelectorAll('canvas')].map(c=>({width:c.width,height:c.height,rect:{x:c.getBoundingClientRect().x,y:c.getBoundingClientRect().y,width:c.getBoundingClientRect().width,height:c.getBoundingClientRect().height},hostAttributes:Object.fromEntries([...c.parentElement.attributes].filter(a=>/^(class|data-renderer|data-frame|data-frame-texture|data-texture-frame|data-content-bounds)$/.test(a.name)).map(a=>[a.name,a.value]))}))}))()`));
 }
 const report={at:new Date().toISOString(),method:'Readonly public accounts:settingsGet/companions:list/app:info plus public DOM/canvas geometry; exact original localhost LocalA; no input or mutation',state,geometry};
 const output=path.join(__dirname,'desktop-readonly-'+process.argv[2]+'-20261026.json');fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({output,at:report.at,host:state.settings.data?.host,desktopDisplay:state.companions.desktopDisplay,counterLines:state.visibleCounterLines,geometry}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
