const {migrations}=require('./migrations.cjs');
const {DiscoveryService}=require('./service.cjs');
const {CloudDiscoveryAuthority}=require('./cloud-adapter.cjs');
const {TileCache}=require('./tile-cache.cjs');
const {join}=require('node:path');
const {TerritoryMapAdapter}=require('./territory-adapter.cjs');
module.exports={
  id:'discovery',migrations,
  publicCommands:['snapshot','locate','watch','stopWatch','setDemo','setProvider','tile'],
  register(services) {
    const discovery=new DiscoveryService({db:services.db,getOwner:()=>services.session.getOwnerAccountId(),getCompanions:()=>services.get('companions'),getBattle:()=>services.get('battle'),invokeBattle:(command,payload)=>services.invoke('battle',command,payload),events:services.events,
      authority:process.env.LINGJING_DISCOVERY_CLOUD==='1' ? new CloudDiscoveryAuthority({getUser:()=>services.session.getCurrentUser()}) : null});
    services.provide('discovery',discovery);
    discovery.territories=new TerritoryMapAdapter(()=>services.get('territories'),discovery.map);
    const tiles=new TileCache(join(services.paths.userData,'cache','discovery','tiles'));
    const unsubscribe=discovery.location.subscribe(state=>services.events.emit('discovery:location',state));
    return {commands:{
      snapshot:()=>discovery.snapshot(),
      locate:async()=>{const result=await discovery.location.locate(); if(!result.ok) return {ok:false,code:result.error.code,message:result.error.message,data:discovery.snapshot().data}; return discovery.snapshot();},
      watch:async()=>{await discovery.location.startWatch(); return discovery.snapshot();},
      stopWatch:()=>{discovery.location.stopWatch(); return discovery.snapshot();},
      setDemo:payload=>{discovery.location.setDemo(payload.enabled===true); return discovery.snapshot();},
      setProvider:payload=>{const result=discovery.map.setProvider(payload.providerId); return result.ok ? discovery.snapshot() : {ok:false,code:result.error.code,message:result.error.message};},
      tile:async payload=>({ok:true,data:await tiles.get(discovery.map.snapshot(),payload.z,payload.x,payload.y)}),
      begin:payload=>discovery.begin(payload),act:payload=>discovery.act(payload),cancel:payload=>discovery.cancel(payload),confirm:payload=>discovery.confirm(payload),
      pokedex:()=>({ok:true,data:discovery.repo.captures(discovery.owner())}),memories:payload=>discovery.memories(payload)
    },dispose(){unsubscribe(); discovery.dispose();}};
  }
};
