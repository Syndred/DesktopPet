// Isolated verification host. Loads the production UI, real registry and real
// feature services. Only the explicitly labelled location fixture is injected.
const {app,BrowserWindow,ipcMain,safeStorage,protocol}=require('electron');
const {join,resolve}=require('node:path');
const {fileURLToPath}=require('node:url');
const {randomUUID}=require('node:crypto');
const {openDatabase}=require('../../../core/database.cjs');
const {createServices,discoverFeatures}=require('../../../core/services.cjs');
const {RuntimeDataStore}=require('../../../services/runtime-data-store.cjs');
const {nearbySpawns}=require('../spawns.cjs');
const root=resolve(__dirname,'../../../../../..'),runtime=join(root,'apps/pc-app/runtime');
const profile=process.env.PET_USER_DATA_DIR;
if(!profile) throw new Error('An isolated PET_USER_DATA_DIR is required');
app.setPath('userData',resolve(profile));
require('../../resources/index.cjs').registerResourceScheme(protocol);
const uiFile=join(root,'apps/pc-app/dist/ui/index.html'),preload=join(root,'apps/pc-app/dist/preload/index.cjs');
const windowsByPet=new Map();let db,features=[],main;
const windows={
  create(petId,options={}) {
    if(windowsByPet.has(petId))return windowsByPet.get(petId);
    const window=new BrowserWindow({...options,transparent:true,frame:false,resizable:false,hasShadow:false,skipTaskbar:true,alwaysOnTop:true,show:false,focusable:false,
      webPreferences:{preload,contextIsolation:true,nodeIntegration:false,sandbox:true}});
    windowsByPet.set(petId,window);window.once('ready-to-show',()=>window.showInactive());window.on('closed',()=>windowsByPet.delete(petId));
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));void window.loadFile(uiFile,{hash:`/desktop/${petId}`});return window;
  },
  close(petId){windowsByPet.get(petId)?.close();windowsByPet.delete(petId);},
  get:petId=>windowsByPet.get(petId),all:()=>[...windowsByPet.entries()],showMain:()=>main?.show()
};
app.whenReady().then(async()=>{
  db=openDatabase(join(profile,'shared.sqlite'));
  const legacyDataFile=join(profile,'legacy.json');
  const legacy=new RuntimeDataStore({filePath:legacyDataFile});
  let login=legacy.loginUser('discovery_window_test','isolated-verification-only');
  if(!login.ok)login=legacy.registerUser('discovery_window_test','isolated-verification-only','探索窗口验证');
  if(!login.ok)throw new Error('Cannot create isolated legacy migration fixture');
  const services=createServices({db,legacy:{runtimeDataStore:legacy},paths:{userData:profile,assets:join(runtime,'assets'),legacyDataFile,legacyDataExisted:true},windows,safeStorage});
  features=discoverFeatures(join(runtime,'features'),services);
  await services.get('accounts').ready;
  const auth=await services.invoke('accounts','login',{provider:'local',account:'discovery_window_test',password:'isolated-verification-only',rememberSession:false});
  if(!auth.ok)throw new Error(`Verified account login failed: ${auth.message}`);
  const owner=services.session.getOwnerAccountId();
  if(owner===null)throw new Error('Mapped account is required');
  await require('../../../core/builtin-art.cjs').registerBuiltinArt(services);
  const settings=await services.invoke('accounts','settingsGet');
  settings.data.document.privacy.locationAllowed=true;
  const saved=await services.invoke('accounts','settingsSave',{actionId:randomUUID(),revision:settings.data.revision,document:settings.data.document});
  if(!saved.ok)throw new Error(saved.message);
  const adopted=await services.invoke('companions','adopt',{actionId:'verification-player-2d',templateId:'big-fish-gentle',name:'验证出战伙伴',showOnDesktop:false});
  if(!adopted.ok)throw new Error(adopted.message);
  const discovery=services.get('discovery');
  if(process.env.LINGJING_CONTROLLED_LOCATION==='1') {
    const target=nearbySpawns({lat:31.2304,lng:121.4737}).find(spawn=>spawn.element==='water');
    discovery.location.adapter={getPosition:async()=>({ok:true,...target.position,accuracyMeters:12,timestampMs:Date.now(),coordinateSystem:'wgs84',source:'os',provider:'controlled-test-fixture',positionSource:'test-fixture'})};
  }
  services.ipc.handle('app:info',()=>({features:features.map(f=>({id:f.id,commands:f.commands})),user:services.session.getCurrentUser()}),{public:true});
  main=new BrowserWindow({width:1320,height:900,show:true,frame:false,backgroundColor:'#fbfdff',title:'灵境 · 探索集成验证',webPreferences:{preload,contextIsolation:true,nodeIntegration:false,sandbox:true}});
  main.setMenuBarVisibility(false);main.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  ipcMain.handle('lingjing:invoke',(event,request)=>{
    const frame=event.senderFrame;
    if(!frame||frame!==event.sender.mainFrame||!frame.url.startsWith('file:')||fileURLToPath(frame.url.split('#')[0])!==uiFile) return {ok:false,code:'UNTRUSTED_SENDER',message:'请求来源无效'};
    return services.invoke(request.feature,request.command,request.payload);
  });
  const emit=services.events.emit;services.events.emit=(name,payload)=>{emit(name,payload);for(const win of BrowserWindow.getAllWindows())if(!win.isDestroyed())win.webContents.send('lingjing:event',{name,payload});};
  global.__discoveryVerification={services,db,owner,controlled:process.env.LINGJING_CONTROLLED_LOCATION==='1',realRegistry:true};
  await main.loadFile(uiFile,{hash:'/discovery'});
}).catch(error=>{console.error(error);app.exit(1);});
app.on('before-quit',()=>{for(const feature of [...features].reverse())feature.dispose?.();db?.close();});
app.on('window-all-closed',()=>app.quit());
