// Windows-only check: suspend the real native helper, never substitute a fix.
const assert=require('node:assert/strict');
const {execFile}=require('node:child_process');
const {writeFileSync,mkdirSync}=require('node:fs');
const {resolve}=require('node:path');
const {WindowsLocationAdapter,LocationService}=require('../location-adapter.cjs');
async function checkCancellation(operation){
  let child;
  const adapter=new WindowsLocationAdapter({execute:(...args)=>{child=execFile(...args);return child;}});
  const location=new LocationService({adapter}),pending=location.locate();
  assert.ok(child?.pid,'The actual PowerShell helper must have started');
  const closed=new Promise(resolve=>child.once('close',resolve));
  await new Promise(resolve=>setTimeout(resolve,150));
  assert.equal(location.snapshot().status,'locating');
  location[operation]();
  const result=await pending;assert.equal(result.ok,false);assert.equal(result.error.code,'LOCATION_CANCELLED');
  let timeout;try{await Promise.race([closed,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Native helper did not close')),5000);})]);}finally{clearTimeout(timeout);}
  let running=false;try{process.kill(child.pid,0);running=true;}catch(error){assert.equal(error.code,'ESRCH');}
  assert.equal(running,false);assert.equal(location.snapshot().fix,null);assert.equal(location.snapshot().watching,false);
  location.dispose();
  return {operation,actualNativeHelperStarted:true,nativeHelperClosed:true,nativeHelperStillRunning:false,resultCode:result.error.code};
}
async function main(){
  assert.equal(process.platform,'win32');const checks=[];
  for(const operation of ['suspend','stopWatch'])checks.push(await checkCancellation(operation));
  const evidence={at:new Date().toISOString(),passed:true,platform:process.platform,runtime:{node:process.versions.node,electron:process.versions.electron||null},checks,rawCoordinatesSaved:false,physicalLocationAcceptance:false};
  mkdirSync(resolve('artifacts/discovery'),{recursive:true});writeFileSync(resolve('artifacts/discovery/native-cancellation-evidence.json'),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
