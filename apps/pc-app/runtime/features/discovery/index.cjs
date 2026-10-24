const {migrations}=require('./migrations.cjs');
const {DiscoveryService}=require('./service.cjs');
const {CloudDiscoveryAuthority}=require('./cloud-adapter.cjs');
const {TileCache}=require('./tile-cache.cjs');
const {join}=require('node:path');
const {TerritoryMapAdapter}=require('./territory-adapter.cjs');
const {LocationService}=require('./location-adapter.cjs');
const {observeExplorationWindows}=require('./window-visibility.cjs');
module.exports={
  id:'discovery',migrations,
  publicCommands:['snapshot','locate','watch','stopWatch','setDemo','setProvider','tile','setExploring'],
  register(services) {
    const cloud=new CloudDiscoveryAuthority({getUser:()=>services.get('accounts')?.privateSession?.() || services.session.getCurrentUser()});
    const location=new LocationService({mayUseLocation:()=>{const privacy=services.get('privacy');return privacy ? privacy.mayUseLocation() : true;}});
    const discovery=new DiscoveryService({db:services.db,getOwner:()=>services.session.getOwnerAccountId(),getCompanions:()=>services.get('companions'),getBattle:()=>services.get('battle'),invokeBattle:(command,payload)=>services.invoke('battle',command,payload),scenario:services.get('qaScenario')?.descriptor,events:services.events,location,
      getAuthority:()=>process.env.LINGJING_DISCOVERY_CLOUD==='1' || services.get('accounts')?.privateSession?.()?.provider==='runtime' ? cloud : null});
    services.provide('discovery',discovery);
    discovery.territories=new TerritoryMapAdapter(()=>services.get('territories'),discovery.map);
    discovery.stopLocationWatch=()=>discovery.location.suspend();
    // Chromium follows the desktop's existing system/session proxy settings.
    // Node-only integration hosts retain their injected/default fetcher.
    const electron=require('electron'),{net}=electron;
    const tiles=new TileCache(join(services.paths.userData,'cache','discovery','tiles'),{fetcher:net?.fetch ? net.fetch.bind(net) : fetch});
    const unsubscribe=discovery.location.subscribe(state=>services.events.emit('discovery:location',state));
    let windowVisibility;
    const setExploring=requested=>{const active=Boolean(requested)&&(!windowVisibility||windowVisibility.isVisible());services.get('privacy')?.setExploring(active);services.events.emit('discovery:exploring',{active});if(!active)discovery.location.suspend();};
    windowVisibility=observeExplorationWindows(electron,setExploring);
    const offSession=services.events.on('accounts:session-changed',()=>{setExploring(false);discovery.location.reset();});
    const offPrivacy=services.events.on('accounts:location-revoked',()=>discovery.location.blockByPolicy());
    return {commands:{
      snapshot:()=>discovery.snapshot(),
      setExploring:payload=>{setExploring(payload.active===true);return discovery.snapshot();},
      locate:async()=>{const result=await discovery.location.locate(); if(!result.ok) return {ok:false,code:result.error.code,message:result.error.message,data:discovery.snapshot().data}; return discovery.snapshot();},
      watch:async()=>{const result=await discovery.location.startWatch();return result.ok ? discovery.snapshot() : {ok:false,code:result.error.code,message:result.error.message,data:discovery.snapshot().data};},
      stopWatch:()=>{discovery.location.stopWatch(); return discovery.snapshot();},
      setDemo:payload=>{discovery.location.setDemo(payload.enabled===true); return discovery.snapshot();},
      setProvider:payload=>{const result=discovery.map.setProvider(payload.providerId); return result.ok ? discovery.snapshot() : {ok:false,code:result.error.code,message:result.error.message};},
      tile:async payload=>({ok:true,data:await tiles.get(discovery.map.snapshot(),payload.z,payload.x,payload.y)}),
      begin:payload=>discovery.begin(payload),act:payload=>discovery.act(payload),cancel:payload=>discovery.cancel(payload),confirm:payload=>discovery.confirm(payload),
      pokedex:()=>({ok:true,data:discovery.captureViews(discovery.owner())}),memories:payload=>discovery.memories(payload)
    },dispose(){windowVisibility.dispose();offSession();offPrivacy();unsubscribe();setExploring(false);discovery.dispose();}};
  }
};
