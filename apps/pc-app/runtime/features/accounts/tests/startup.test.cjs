const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } = require('node:fs');
const { join, resolve, dirname, basename } = require('node:path');
const { tmpdir } = require('node:os');
const { createRequire } = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const { AccountsService } = require('../service.cjs');
const { migrations } = require('../schema.cjs');
const { loginItemTarget, createLoginItemController } = require('../startup.cjs');
const { defaultSettings } = require('../settings.cjs');
const child='C:\\Users\\QA\\AppData\\Local\\Temp\\3LBAQALUKgWr1yvvvscHsCaqSpQ\\Lingjing.exe';
const launcher='D:\\灵境 发布目录\\Lingjing-0.1.8-portable-x64.exe';
const runtime={platform:'win32',execPath:child,env:{PORTABLE_EXECUTABLE_FILE:launcher,PORTABLE_EXECUTABLE_DIR:'D:\\灵境 发布目录',PORTABLE_EXECUTABLE_APP_FILENAME:'Lingjing'},temporaryDirectories:['C:\\Users\\QA\\AppData\\Local\\Temp'],isFile:()=>true,realPath:file=>file};

test('mock Windows runtime: portable target is the absolute outer EXE with empty arguments, preserving spaces and Chinese characters',()=>{
  assert.deepEqual(loginItemTarget(runtime),{path:launcher,args:[]});
  assert.deepEqual(loginItemTarget({...runtime,env:{PORTABLE_EXECUTABLE_FILE:'\\\\server\\share\\灵境 便携版.exe'}}),{path:'\\\\server\\share\\灵境 便携版.exe',args:[]});
});
test('mock Windows runtime: installed application keeps its stable process executable',()=>{
  const installed='C:\\Program Files\\Lingjing\\Lingjing.exe';assert.deepEqual(loginItemTarget({...runtime,env:{},execPath:installed}),{path:installed,args:[]});
  assert.deepEqual(loginItemTarget({...runtime,env:{},execPath:'C:\\Users\\QA\\AppData\\Local\\Programs\\Lingjing\\Lingjing.exe'}),{path:'C:\\Users\\QA\\AppData\\Local\\Programs\\Lingjing\\Lingjing.exe',args:[]});
  assert.deepEqual(loginItemTarget({...runtime,platform:'darwin'}),{});
});
test('mock Windows runtime: missing, relative, quoted, deleted, directory and extracted-child portable paths never fall back to the temporary executable',async t=>{
  const cases=[['missing FILE',{PORTABLE_EXECUTABLE_DIR:'D:\\发布目录'}],['relative',{PORTABLE_EXECUTABLE_FILE:'Lingjing.exe'}],['rooted without drive',{PORTABLE_EXECUTABLE_FILE:'\\Lingjing.exe'}],['drive-relative',{PORTABLE_EXECUTABLE_FILE:'D:Lingjing.exe'}],['quoted',{PORTABLE_EXECUTABLE_FILE:'"'+launcher+'"'}],['non-executable',{PORTABLE_EXECUTABLE_FILE:'D:\\app.txt'}],['child',{PORTABLE_EXECUTABLE_FILE:child}],['case-insensitive TEMP',{PORTABLE_EXECUTABLE_FILE:child.toUpperCase()}],['dot traversal into TEMP',{PORTABLE_EXECUTABLE_FILE:'C:\\Users\\QA\\AppData\\Local\\Temp\\..\\Temp\\other.exe'}]];
  for(const [name,env]of cases)await t.test(name,()=>assert.equal(loginItemTarget({...runtime,env}),null));
  assert.equal(loginItemTarget({...runtime,isFile:()=>false}),null);assert.equal(loginItemTarget({...runtime,env:{}}),null);
  const shortChild=child.replace('QA','ADMINI~1'),longTemp='C:\\Users\\Administrator\\AppData\\Local\\Temp';
  assert.equal(loginItemTarget({...runtime,env:{},execPath:shortChild,temporaryDirectories:[longTemp],realPath:file=>file.replace('ADMINI~1','Administrator')}),null);
});
test('isolated Windows files only: executable existence/type is checked and removed portable files are not registered',{skip:process.platform!=='win32'?'Real Windows path/filesystem fixture; mock Windows cases run on all platforms':false},()=>{
  const directory=mkdtempSync(join(tmpdir(),'lingjing-startup-')),file=join(directory,'原始 便携版.exe'),extraction=join(directory,'extraction');
  try{
    writeFileSync(file,'isolated fixture, never executed');mkdirSync(extraction);mkdirSync(extraction+'.exe');
    const fixture={platform:'win32',env:{PORTABLE_EXECUTABLE_FILE:file},execPath:join(extraction,'Lingjing.exe'),temporaryDirectories:[extraction]};
    assert.deepEqual(loginItemTarget(fixture),{path:file,args:[]});
    assert.equal(loginItemTarget({...fixture,env:{PORTABLE_EXECUTABLE_FILE:extraction+'.exe'}}),null);
    rmSync(file);assert.equal(loginItemTarget(fixture),null);
  }finally{const target=resolve(directory);assert.equal(dirname(target),resolve(tmpdir()));assert.ok(basename(target).startsWith('lingjing-startup-'));rmSync(target,{recursive:true,force:true});}
});
function mockApp(){
  const app=new EventEmitter(),writes=[],reads=[];let registered=false;
  app.setLoginItemSettings=options=>{writes.push(structuredClone(options));registered=options.openAtLogin;};
  app.getLoginItemSettings=options=>{reads.push(structuredClone(options));return{openAtLogin:registered};};
  return{app,writes,reads};
}
test('mock Electron only: no startup writes without explicit user change; on/off and readback use exactly the same stable path/args',()=>{
  const f=mockApp(),controller=createLoginItemController(f.app,()=>loginItemTarget(runtime));
  controller.apply(true);controller.status();controller.apply(false,{explicitStartupChange:false});assert.equal(f.writes.length,0);
  controller.apply(true,{explicitStartupChange:true});assert.equal(controller.status(),true);
  controller.apply(false,{explicitStartupChange:true});assert.equal(controller.status(),false);
  assert.deepEqual(f.writes,[{path:launcher,args:[],openAtLogin:true,enabled:true},{path:launcher,args:[],openAtLogin:false,enabled:false}]);
  for(const read of f.reads)assert.deepEqual(read,{path:launcher,args:[]});
});
test('mock Electron only: unresolvable launcher rejects enabling with zero writes; explicit disabling is still available without registering the child',()=>{
  const f=mockApp(),controller=createLoginItemController(f.app,()=>null);
  controller.apply(true);assert.equal(controller.status(),false);assert.equal(f.reads.length,0);assert.equal(f.writes.length,0);
  assert.throws(()=>controller.apply(true,{explicitStartupChange:true}),{code:'STARTUP_LAUNCHER_UNAVAILABLE'});assert.equal(f.writes.length,0);
  controller.apply(false,{explicitStartupChange:true});assert.deepEqual(f.writes,[{openAtLogin:false,enabled:false}]);
});
function mockDesktopHost(target=()=>loginItemTarget(runtime)){
  const source=resolve(__dirname,'../desktop-host.cjs'),localRequire=createRequire(source),module={exports:{}},f=mockApp();
  const requireMock=id=>{
    if(id==='./startup.cjs')return{createLoginItemController:app=>createLoginItemController(app,target)};
    if(id==='node:child_process')return{spawn(){throw Error('No native process may be spawned by this mock test');}};
    return localRequire(id);
  };
  // Only platform selection is stubbed to skip the unrelated Windows foreground
  // monitor. The production host and real startup controller execute unchanged.
  new Function('require','module','exports','process','__dirname',readFileSync(source,'utf8'))(requireMock,module,module.exports,{platform:'mock',env:{}},dirname(source));
  const services={windows:{getPetWindows:()=>[]},events:{emit(){},on:()=>()=>{}}},electron={app:f.app,BrowserWindow:{getAllWindows:()=>[]}},host=module.exports.createDesktopHost(services,electron);
  return {...f,host};
}
test('mock desktop host: opening settings, account restore and unrelated edits do not touch OS login items; only explicit toggles reach the mock',async()=>{
  const f=mockDesktopHost(),{host}=f;
  try{
    const settings=defaultSettings();await host.apply(settings);settings.desktop.launchAtLogin=true;await host.apply(settings);settings.desktop.volume=15;await host.apply(settings);assert.equal(f.writes.length,0);
    await host.apply(settings,{explicitStartupChange:true});assert.equal(host.status().startup,true);settings.desktop.launchAtLogin=false;await host.apply(settings,{explicitStartupChange:true});assert.equal(host.status().startup,false);
    assert.equal(f.writes.length,2);assert.ok(f.writes.every(row=>row.path===launcher&&row.args.length===0));
  }finally{host.dispose();}
});

test('real isolated SQLite + mock OS only: AccountsService writes startup solely on a saved explicit toggle and retains settings on failure',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'lingjing-startup-')),db=new DatabaseSync(':memory:');let available=true;
  const f=mockDesktopHost(()=>available?loginItemTarget(runtime):null);migrations.forEach(m=>db.exec(m.sql));
  const accounts=new AccountsService({services:{db,paths:{userData:directory,legacyDataExisted:false},safeStorage:{isEncryptionAvailable:()=>false},events:{emit(){}}},remote:{enabled:false,setCurrentUser(){},async clear(){}},host:f.host});
  try{
    await accounts.authenticate({provider:'local',account:'startup_fixture',username:'隔离设置',password:'example-only-123',confirmPassword:'example-only-123'},true);assert.equal(f.writes.length,0);
    let settings=accounts.settings();settings.document.desktop.volume=17;await accounts.saveSettings({...settings,actionId:randomUUID()});assert.equal(f.writes.length,0);
    available=false;settings=accounts.settings();settings.document.desktop.launchAtLogin=true;const previousRevision=settings.revision;
    await assert.rejects(accounts.saveSettings({...settings,actionId:randomUUID()}),{code:'STARTUP_LAUNCHER_UNAVAILABLE'});assert.equal(accounts.settings().revision,previousRevision);assert.equal(accounts.settings().document.desktop.launchAtLogin,false);assert.equal(f.writes.length,0);
    available=true;settings=accounts.settings();settings.document.desktop.launchAtLogin=true;const input={...settings,actionId:randomUUID()};await accounts.saveSettings(input);assert.equal(f.writes.length,1);
    assert.equal((await accounts.saveSettings(input)).duplicate,true);assert.equal(f.writes.length,1);
    available=false;await f.host.apply(accounts.settings().document);assert.equal(f.writes.length,1);
    settings=accounts.settings();settings.document.desktop.volume=23;await accounts.saveSettings({...settings,actionId:randomUUID()});assert.equal(f.writes.length,1);
    settings=accounts.settings();settings.document.desktop.launchAtLogin=false;await accounts.saveSettings({...settings,actionId:randomUUID()});assert.equal(f.writes.length,2);assert.deepEqual(f.writes[1],{openAtLogin:false,enabled:false});assert.equal(accounts.settings().document.desktop.launchAtLogin,false);
  }finally{accounts.dispose();f.host.dispose();db.close();const target=resolve(directory);assert.equal(dirname(target),resolve(tmpdir()));assert.ok(basename(target).startsWith('lingjing-startup-'));rmSync(target,{recursive:true,force:true});}
});
