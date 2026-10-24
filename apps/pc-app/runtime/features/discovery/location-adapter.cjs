const { execFile } = require('node:child_process');
const { join } = require('node:path');
const { point, checkFix, distanceMeters } = require('./coordinates.cjs');

class WindowsLocationAdapter {
  constructor({ timeoutSeconds = 16 } = {}) { this.timeoutSeconds=timeoutSeconds; }
  getPosition() {
    if (process.platform !== 'win32') return Promise.resolve({ ok:false, code:'LOCATION_PLATFORM_UNSUPPORTED', message:'当前系统尚未接入原生定位' });
    return new Promise(resolve => {
      const script=join(__dirname,'windows-location.ps1');
      const powershell=join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
      execFile(powershell,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-TimeoutSeconds',String(this.timeoutSeconds)],
        {windowsHide:true,timeout:(this.timeoutSeconds+8)*1000,encoding:'utf8',maxBuffer:16384}, (error,stdout) => {
          try { const result=JSON.parse(stdout.trim().replace(/^\uFEFF/,'')); resolve(result); }
          catch { resolve({ok:false,code:error?.killed ? 'LOCATION_TIMEOUT' : 'LOCATION_UNAVAILABLE',message:error?.message || '系统定位没有返回有效结果'}); }
        });
    });
  }
}

class LocationService {
  constructor({ adapter = new WindowsLocationAdapter(), now = Date.now, mayUseLocation = () => true } = {}) {
    this.adapter=adapter; this.now=now; this.fix=null; this.lastError=null; this.status='idle'; this.permission='unknown';
    this.mayUseLocation=mayUseLocation;
    this.pending=null; this.mode='real'; this.timer=null; this.listeners=new Set(); this.generation=0;
  }
  snapshot() {
    const quality=this.fix?.source==='os' ? checkFix(this.fix,this.now()) : null;
    const stale=quality && !quality.ok && this.status==='ready';
    return {mode:this.mode,status:stale ? 'stale' : this.status,permission:this.permission,fix:this.fix ? {...this.fix} : null,lastError:stale ? {code:quality.code,message:quality.message} : this.lastError,watching:Boolean(this.timer)};
  }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit() { const state=this.snapshot(); for (const listener of this.listeners) { try { listener(state); } catch { /* isolate listeners */ } } }
  policyAllowed() {try{return this.mayUseLocation() === true;}catch{return false;}}
  blockByPolicy() {
    this.suspend(); this.fix=null; this.mode='real'; this.status='privacy_disabled';this.permission='unknown';
    this.lastError={code:'APP_LOCATION_DISABLED',message:'应用内定位尚未开启，或当前不在可定位的探索页面。请检查设置中的位置隐私选项。'};
    this.emit();return {ok:false,error:this.lastError,state:this.snapshot()};
  }
  suspend() {if(this.timer)clearInterval(this.timer);this.timer=null;++this.generation;this.pending=null;if(this.status==='locating') this.status='idle';this.emit();}
  reset() {this.suspend();this.fix=null;this.mode='real';this.status='idle';this.permission='unknown';this.lastError=null;this.emit();}
  locate() {
    if(!this.policyAllowed()) return Promise.resolve(this.blockByPolicy());
    if (this.pending) return this.pending;
    this.mode='real'; this.status='locating'; this.lastError=null; this.emit();
    const generation=++this.generation;
    this.pending=this.read(generation).finally(()=>{ if(generation===this.generation) this.pending=null; });
    return this.pending;
  }
  async read(generation) {
    let result;
    try { result=await this.adapter.getPosition(); }
    catch(error) { result={ok:false,code:'LOCATION_UNAVAILABLE',message:error.message}; }
    if (generation!==this.generation) return {ok:false,error:{code:'LOCATION_CANCELLED',message:'定位已取消'},state:this.snapshot()};
    if(!this.policyAllowed()) return this.blockByPolicy();
    if (!result.ok) {
      this.fix=null; this.status=result.code === 'LOCATION_PERMISSION_DENIED' ? 'denied' : result.code === 'LOCATION_TIMEOUT' ? 'timeout' : 'unavailable';
      const messages={LOCATION_PERMISSION_DENIED:'Windows 未授权访问位置，请检查系统定位与桌面应用权限。',LOCATION_TIMEOUT:'Windows 定位超时，请稍后重试。',LOCATION_UNAVAILABLE:'Windows 暂时无法提供位置，请检查设备信号与定位服务。'};
      this.permission=this.status==='denied' ? 'denied' : 'unknown'; this.lastError={code:result.code || 'LOCATION_UNAVAILABLE',message:messages[result.code] || result.message,systemMessage:result.message,systemStatus:result.status,hresult:result.hresult};
      this.emit(); return {ok:false,error:this.lastError,state:this.snapshot()};
    }
    try { point(result); } catch(error) { this.fix=null; this.status='unavailable'; this.lastError={code:error.code,message:error.message}; this.emit(); return {ok:false,error:this.lastError,state:this.snapshot()}; }
    const fix={lat:result.lat,lng:result.lng,accuracyMeters:result.accuracyMeters,timestampMs:result.timestampMs,coordinateSystem:'wgs84',source:'os',provider:result.provider,positionSource:result.positionSource};
    const quality=checkFix(fix,this.now());
    if (this.fix && fix.timestampMs>this.fix.timestampMs && distanceMeters(this.fix,fix)/Math.max(1,(fix.timestampMs-this.fix.timestampMs)/1000)>45) {
      this.fix=null; this.status='imprecise'; this.lastError={code:'LOCATION_DRIFT',message:'位置跳变过大，请重新定位'};
      this.emit(); return {ok:false,error:this.lastError,state:this.snapshot()};
    }
    this.fix=fix; this.permission='granted'; this.status=quality.ok ? 'ready' : quality.code==='LOCATION_STALE' ? 'stale' : 'imprecise';
    this.lastError=quality.ok ? null : {code:quality.code,message:quality.message}; this.emit();
    return {ok:true,state:this.snapshot()};
  }
  setDemo(enabled) {
    this.stopWatch(); ++this.generation; this.pending=null; this.mode=enabled ? 'demo' : 'real'; this.lastError=null;
    this.fix=enabled ? {lat:31.2304,lng:121.4737,accuracyMeters:15,timestampMs:this.now(),source:'demo',coordinateSystem:'wgs84',provider:'explicit-demo'} : null;
    this.status=enabled ? 'demo' : 'idle'; this.permission='unknown'; this.emit(); return {ok:true,state:this.snapshot()};
  }
  startWatch() { if(!this.policyAllowed()) return Promise.resolve(this.blockByPolicy()); if(!this.timer) {this.timer=setInterval(()=>void this.locate(),15000); this.timer.unref?.();} return this.locate(); }
  stopWatch() { if(this.timer) clearInterval(this.timer); this.timer=null; this.emit(); return {ok:true,state:this.snapshot()}; }
  dispose() { this.stopWatch(); ++this.generation; this.listeners.clear(); }
}
module.exports={WindowsLocationAdapter,LocationService};
