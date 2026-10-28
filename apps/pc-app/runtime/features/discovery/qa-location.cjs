const {resolve}=require('node:path');
const {nearbySpawns}=require('./spawns.cjs');
const {point}=require('./coordinates.cjs');

/** Only consumes foundation's verified, namespaced main-process QA service. */
function createQaLocationAdapter(services,now=Date.now) {
  const scene=services.get('qaScenario');
  if(!scene||scene.id!=='unified-battle')return null;
  const path=value=>{const result=resolve(value);return process.platform==='win32'?result.toLowerCase():result;};
  if(scene.provenance!=='simulated'||scene.isolated!==true||!scene.runId||!scene.profilePath||!services.paths?.userData||path(scene.profilePath)!==path(services.paths.userData)||typeof scene.requireIdentity!=='function')throw Object.assign(new Error('需要独立 QA 场景'),{code:'QA_PROFILE_REQUIRED'});
  let position;
  function identity() {
    if(services.get('qaScenario')!==scene)throw Object.assign(new Error('QA 场景已变更'),{code:'QA_SCENARIO_CHANGED'});
    const value=scene.requireIdentity();
    if(value.authority!=='simulated'||value.scenarioId!==scene.id||value.runId!==scene.runId||value.ownerAccountId!==services.session.getOwnerAccountId())throw Object.assign(new Error('QA 身份不匹配'),{code:'QA_IDENTITY_MISMATCH'});
    return value;
  }
  function selectTemplate(templateId) {
    identity();
    const templates=services.get('companions')?.listTemplates?.();let target;
    for(let offset=0;offset<20&&!target;offset++)target=nearbySpawns({lat:31.2304+offset*.0006,lng:121.4737},now(),450,templates).find(spawn=>!templateId||spawn.templateId===templateId);
    if(!target)throw Object.assign(new Error('此场景尚无对应角色'),{code:'QA_TARGET_UNAVAILABLE'});
    position={...target.position};return {templateId:target.templateId,resourceId:target.resourceId};
  }
  function selectPosition(input) {
    identity();
    if(!input||Object.keys(input).sort().join(',')!=='lat,lng')throw Object.assign(new Error('模拟位置仅接受 WGS84 经纬度'),{code:'INVALID_COORDINATES'});
    position=point(input);
    return {...position,source:'simulated',scenarioId:scene.runId};
  }
  return {
    scenario:'qa',scenarioId:scene.runId,
    allowed(){try{identity();return true;}catch{return false;}},
    selectTemplate,selectPosition,
    metricFix(fix){
      identity();
      if(fix?.source!=='simulated'||fix.scenarioId!==scene.runId||fix.provider!=='qa-discovery')throw Object.assign(new Error('位置不属于当前 QA 场景'),{code:'QA_LOCATION_MISMATCH'});
      // Temporary geometry input only; snapshots and receipts retain simulated.
      return {...fix,source:'os'};
    },
    async getPosition({signal}={}) {
      if(signal?.aborted)return {ok:false,code:'LOCATION_CANCELLED',message:'定位已取消'};
      identity();if(!position)selectTemplate();
      return {ok:true,...position,source:'simulated',scenarioId:scene.runId,coordinateSystem:'wgs84',accuracyMeters:5,timestampMs:now(),provider:'qa-discovery',positionSource:'Scenario'};
    }
  };
}
module.exports={createQaLocationAdapter};
