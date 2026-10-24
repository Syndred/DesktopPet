// Development verification host only. Production registration never imports this file.
const {app,BrowserWindow,ipcMain,safeStorage}=require('electron');
const {join,resolve}=require('node:path');
const {openDatabase,migrate}=require('../../../core/database.cjs');
const {createServices}=require('../../../core/services.cjs');
const {RuntimeDataStore}=require('../../../services/runtime-data-store.cjs');
const {nearbySpawns}=require('../spawns.cjs');
const root=resolve(__dirname,'../../../../../..');
const profile=process.env.PET_USER_DATA_DIR;
if(!profile) throw new Error('An isolated PET_USER_DATA_DIR is required');
app.setPath('userData',resolve(profile));
let db,registrations=[];
app.whenReady().then(async()=>{
  db=openDatabase(join(profile,'shared.sqlite'));
  const legacy=new RuntimeDataStore({filePath:join(profile,'legacy.json')});
  let auth=legacy.loginUser('discovery_window_test','isolated-verification-only');
  if(!auth.ok) auth=legacy.registerUser('discovery_window_test','isolated-verification-only','探索窗口验证');
  if(!auth.ok) throw new Error('Cannot create isolated test session');
  const services=createServices({db,legacy:{runtimeDataStore:legacy},paths:{userData:profile,assets:join(root,'apps/pc-app/runtime/assets')},windows:{},safeStorage});
  const roots=[process.env.LINGJING_COMPANIONS_RUNTIME,process.env.LINGJING_BATTLE_RUNTIME,__dirname+'/..'];
  for(const featureRoot of roots) {
    if(!featureRoot) throw new Error('Real companions and battle source directories are required');
    const feature=require(join(featureRoot,'index.cjs'));migrate(db,feature.id,feature.migrations);
    const registration=feature.register(services);registrations.push(registration);
    for(const [command,handler] of Object.entries(registration.commands||{})) services.ipc.handle(`${feature.id}:${command}`,handler,{public:feature.publicCommands?.includes(command)});
  }
  const owner=services.session.getOwnerAccountId();
  await services.invoke('companions','adopt',{actionId:'verification-player',templateId:'husky',name:'验证出战伙伴',showOnDesktop:false});
  const discovery=services.get('discovery');
  if(process.env.LINGJING_CONTROLLED_LOCATION==='1') {
    const target=nearbySpawns({lat:31.2304,lng:121.4737}).find(spawn=>spawn.element==='wood');
    discovery.location.adapter={getPosition:async()=>({ok:true,...target.position,accuracyMeters:12,timestampMs:Date.now(),coordinateSystem:'wgs84',source:'os',provider:'controlled-test-fixture',positionSource:'test-fixture'})};
  }
  services.ipc.handle('app:info',()=>({features:roots.map((_,i)=>({id:['companions','battle','discovery'][i]})),user:services.session.getCurrentUser()}),{public:true});
  const win=new BrowserWindow({width:1340,height:1000,show:true,title:'灵境 · 受控集成验证',webPreferences:{preload:join(root,'apps/pc-app/dist/preload/index.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.setMenuBarVisibility(false);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  ipcMain.handle('lingjing:invoke',(event,request)=>{
    if(event.sender!==win.webContents || event.senderFrame!==win.webContents.mainFrame) return {ok:false,code:'UNTRUSTED_SENDER',message:'请求来源无效'};
    return services.invoke(request.feature,request.command,request.payload);
  });
  const emit=services.events.emit;services.events.emit=(name,payload)=>{emit(name,payload);if(!win.isDestroyed())win.webContents.send('lingjing:event',{name,payload});};
  global.__discoveryVerification={services,db,owner,controlled:process.env.LINGJING_CONTROLLED_LOCATION==='1'};
  await win.loadFile(join(root,'apps/pc-app/dist/ui/index.html'),{hash:'/discovery'});
  if(process.env.LINGJING_CONTROLLED_LOCATION==='1') await win.webContents.executeJavaScript(`document.body.insertAdjacentHTML('afterbegin','<div style="position:fixed;bottom:0;left:0;right:0;padding:7px;z-index:99999;background:#fff4d8;color:#8b6b2d;text-align:center;font-size:12px">受控集成测试坐标 · 不代表真实系统定位正向验收</div>')`);
}).catch(error=>{console.error(error);app.exit(1);});
app.on('before-quit',()=>{for(const feature of registrations)feature.dispose?.();db?.close();});
app.on('window-all-closed',()=>app.quit());
