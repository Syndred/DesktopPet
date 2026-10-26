const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createRequire,isBuiltin}=require('node:module'),{pathToFileURL}=require('node:url');

// Load the actual archive in Electron's Node mode. A temporary copy prevents
// missing production dependencies from resolving through the checkout's modules.
function verifyPackagedRuntime(unpacked){
  const archive=path.join(unpacked,'resources/app.asar'),isolated=fs.mkdtempSync(path.join(os.tmpdir(),'lingjing-runtime-deps-'));
  const copy=path.join(isolated,'app.asar');fs.copyFileSync(archive,copy);
  if(fs.existsSync(archive+'.unpacked'))fs.cpSync(archive+'.unpacked',copy+'.unpacked',{recursive:true});
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^(?:NODE_PATH|NODE_OPTIONS|PET_USER_DATA_DIR|LINGJING_|ACCOUNTS_|SUPABASE_)/i.test(key)));
  env.ELECTRON_RUN_AS_NODE='1';
  const result=spawnSync(path.join(unpacked,'Lingjing.exe'),[__filename,'--child',copy],{env,encoding:'utf8',windowsHide:true,timeout:60000,cwd:isolated});
  let report;try{report=JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));}catch{report={passed:false,errors:[result.error?.message||result.stderr||result.stdout||'No dependency report']};}
  report.isolationDirectory=isolated;
  if(result.status!==0||!report.passed)throw Object.assign(new Error(`Packaged runtime dependencies are incomplete: ${JSON.stringify(report.errors)}`),{report});
  return report;
}

if(process.argv[2]==='--child')void (async()=>{
  const archive=process.argv[3],load=createRequire(path.join(archive,'package.json'));
  const closure=JSON.parse(fs.readFileSync(path.join(archive,'apps/pc-app/dist/runtime-closure.json'),'utf8'));
  const packages=closure.external.filter(name=>!isBuiltin(name)&&name!=='electron'),loaded=[],errors=[];
  for(const name of packages)try{
    const entry=load.resolve(name);if(!entry.startsWith(archive+path.sep))throw new Error(`Dependency escaped archive: ${name}`);
    try{load(name);}catch(error){if(!['ERR_REQUIRE_ESM','ERR_REQUIRE_ASYNC_MODULE'].includes(error.code))throw error;await import(pathToFileURL(entry).href);}
    loaded.push(name);
  }catch(error){errors.push({name,code:error.code||'LOAD_FAILED',message:String(error.message).slice(0,700)});}
  console.log(JSON.stringify({passed:errors.length===0,provenance:'Isolated ASAR dependency imports in packaged Electron Node mode; no app or business initialization',electron:process.versions.electron,loaded,errors}));
  if(errors.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
else module.exports={verifyPackagedRuntime};
