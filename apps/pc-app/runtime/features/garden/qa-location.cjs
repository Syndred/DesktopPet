"use strict";
const { resolve } = require('node:path');
const { checkFix } = require('../discovery/coordinates.cjs');

/** Consumes foundation's verified main-only scenario; there is no renderer toggle. */
function createQaTerritoryLocation(services, now=Date.now) {
  const scene=services.get('qaScenario');
  if(!scene)return null;
  const normalize=value=>process.platform==='win32'?resolve(value).toLowerCase():resolve(value);
  if(scene.id!=='unified-battle'||scene.provenance!=='simulated'||scene.isolated!==true||!scene.runId||!scene.profilePath||!services.paths?.userData||normalize(scene.profilePath)!==normalize(services.paths.userData))throw Object.assign(new Error('领地演练需要独立验收目录'),{code:'QA_PROFILE_REQUIRED'});
  return {
    descriptor:{mode:'simulated',id:scene.runId,label:'领地演练 · 模拟定位'},
    fix:()=>({source:'simulated',scenarioId:scene.runId,coordinateSystem:'wgs84',lat:31.233,lng:121.473,accuracyMeters:5,timestampMs:now(),provider:'qa-territory',positionSource:'Scenario'}),
    validate(fix){
      if(fix?.source!=='simulated'||fix.scenarioId!==scene.runId)throw Object.assign(new Error('模拟位置不属于当前演练'),{code:'QA_LOCATION_MISMATCH'});
      // Reuse the same age/accuracy/coordinate validator after the explicit QA
      // provenance check. The stored/displayed source remains simulated.
      const quality=checkFix({...fix,source:'os'},now());
      if(!quality.ok)throw Object.assign(new Error(quality.message),{code:quality.code});
      return fix;
    }
  };
}
module.exports={createQaTerritoryLocation};
