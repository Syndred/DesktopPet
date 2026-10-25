// Private acceptance driver for a real Windows portable SFX. Debug endpoints
// bind only to loopback and exist only for the exact process launched here.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import WebSocket from 'ws';
import {pollState} from './poll-state.mjs';

async function freePort(){const server=createServer();await new Promise(done=>server.listen(0,'127.0.0.1',done));const port=server.address().port;await new Promise(done=>server.close(done));return port;}
async function inspector(url){
  const socket=new WebSocket(url),pending=new Map();let id=0;
  socket.on('message',bytes=>{const message=JSON.parse(bytes.toString());if(!message.id)return;const request=pending.get(message.id);if(!request)return;pending.delete(message.id);clearTimeout(request.timer);message.error?request.reject(new Error(message.error.message)):request.resolve(message.result);});
  socket.on('error',()=>{});
  socket.on('close',()=>{for(const request of pending.values()){clearTimeout(request.timer);request.reject(new Error('Owned main inspector disconnected'));}pending.clear();});
  await new Promise((done,fail)=>{const timer=setTimeout(()=>fail(new Error('Main inspector connection timed out')),5000);socket.once('open',()=>{clearTimeout(timer);done();});socket.once('error',error=>{clearTimeout(timer);fail(error);});});
  return {close:()=>socket.close(),send(method,params={}){return new Promise((resolve,reject)=>{const requestId=++id,timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('Main inspector request timed out'));},30000);pending.set(requestId,{resolve,reject,timer});socket.send(JSON.stringify({id:requestId,method,params}),error=>{if(error){clearTimeout(timer);pending.delete(requestId);reject(error);}});});}};
}

export async function launchPortableSession({executable,profile,expectedSource,label='portable',environment={}}){
  profile=resolve(profile);mkdirSync(profile,{recursive:true});
  const nodePort=await freePort();let browserPort=await freePort();while(browserPort===nodePort)browserPort=await freePort();const env={...process.env,PET_USER_DATA_DIR:profile};
  for(const key of Object.keys(env))if(/^(?:SUPABASE_|LINGJING_SUPABASE_|LINGJING_QA_|LINGJING_PUBLIC_CONFIG$|LINGJING_LEGACY_AUTH$|LINGJING_CONTROLLED_LOCATION$|LINGJING_DISCOVERY_CLOUD$|LINGJING_BATTLE_QA$|LINGJING_BATTLE_SCENARIO$|PET_RUNTIME_DATA_FILE$|ELECTRON_RUN_AS_NODE$|ELECTRON_RENDERER_URL$|NODE_OPTIONS$|NODE_TLS_REJECT_UNAUTHORIZED$)/.test(key))delete env[key];
  Object.assign(env,environment);
  const child=spawn(resolve(executable),[`--inspect=127.0.0.1:${nodePort}`,`--remote-debugging-port=${browserPort}`,'--force-device-scale-factor=1'],{env,windowsHide:true,stdio:'ignore'});
  let failure,connection,browser,runtime;child.on('error',error=>{failure=error;});
  async function stop(){
    if(connection)try{await main(({app})=>{app.quit();return true;});}catch{}
    connection?.close();await browser?.close().catch(()=>{});
    if(child.exitCode===null)await Promise.race([new Promise(done=>child.once('exit',done)),new Promise(done=>setTimeout(done,2500))]);
    if(child.exitCode===null&&child.pid)try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}
    if(runtime?.pid&&runtime.pid!==child.pid)try{execFileSync('taskkill',['/PID',String(runtime.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}
  }
  async function main(fn,...args){
    const expression=`(async()=>{const require=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json');return await (${fn.toString()})(require('electron'),...${JSON.stringify(args)});})()`;
    const reply=await connection.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(reply.exceptionDetails)throw new Error(reply.exceptionDetails.exception?.description||reply.exceptionDetails.text||'Owned main evaluation failed');return reply.result?.value;
  }
  try{
    const targets=await pollState(async()=>{if(failure)throw failure;try{const response=await fetch(`http://127.0.0.1:${nodePort}/json/list`,{signal:AbortSignal.timeout(400)});return response.ok?await response.json():[];}catch{return[];}},rows=>rows.some(row=>row.webSocketDebuggerUrl),{timeoutMs:60000,label:'Real portable did not expose its owned main inspector'});
    connection=await inspector(targets.find(row=>row.webSocketDebuggerUrl).webSocketDebuggerUrl);
    runtime=await main(({app})=>({pid:process.pid,electron:process.versions.electron,node:process.versions.node,profileOverride:process.env.PET_USER_DATA_DIR,userData:app.getPath('userData'),resourcesPath:process.resourcesPath}));
    assert.ok(runtime.electron);assert.equal(resolve(runtime.profileOverride||''),profile,'Refuse a portable process without the exact isolated profile override');
    // Inspector starts before the application module applies its profile path.
    // Wait for that actual startup contract before observing/instrumenting main.
    await pollState(()=>main(({app})=>({ready:app.isReady(),profile:app.getPath('userData')})),value=>value.ready&&resolve(value.profile)===profile,{timeoutMs:30000,label:'Portable startup did not apply its exact isolated profile'});
    runtime.userData=profile;assert.ok(runtime.resourcesPath.includes('resources'));
    await pollState(async()=>{try{const response=await fetch(`http://127.0.0.1:${browserPort}/json/list`,{signal:AbortSignal.timeout(400)});return response.ok?await response.json():[];}catch{return[];}},rows=>rows.some(row=>row.type==='page'),{timeoutMs:60000,label:'Real portable did not open its renderer'});
    browser=await chromium.connectOverCDP(`http://127.0.0.1:${browserPort}`);
    const page=await pollState(async()=>browser.contexts().flatMap(context=>context.pages()).find(page=>page.url().includes('/app.asar/')&&page.url().includes('/ui/index.html')),Boolean);
    await page.waitForFunction(()=>Boolean(window.lingjing));page.setDefaultTimeout(25000);
    const call=async(feature,command,payload={})=>{const result=await page.evaluate(input=>window.lingjing.invoke(input.feature,input.command,input.payload),{feature,command,payload});assert.equal(result.ok,true,`${feature}:${command} ${result.code||''} ${result.message||''}`);return result.data;};
    const info=await call('app','info');assert.equal(info.build.sourceCommit,expectedSource);assert.ok(!page.url().includes('win-unpacked'));
    return {label,profile,page,browser,main,call,stop,info,runtime,launcherPid:child.pid,pages:()=>browser.contexts().flatMap(context=>context.pages())};
  }catch(error){await stop();throw error;}
}
