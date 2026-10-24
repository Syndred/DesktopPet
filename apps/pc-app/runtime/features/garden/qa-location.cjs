"use strict";
const { resolve } = require('node:path');

/** Consumes foundation's verified main-only scenario; there is no renderer toggle. */
function createQaTerritoryLocation(services) {
  const scene=services.get('qaScenario');
  if(!scene)return null;
  const normalize=value=>process.platform==='win32'?resolve(value).toLowerCase():resolve(value);
  if(scene.id!=='unified-battle'||scene.provenance!=='simulated'||scene.isolated!==true||!scene.runId||!scene.profilePath||typeof scene.requireIdentity!=='function'||!services.paths?.userData||normalize(scene.profilePath)!==normalize(services.paths.userData))throw Object.assign(new Error('领地演练需要独立验收目录'),{code:'QA_PROFILE_REQUIRED'});
  return {
    descriptor:{mode:'simulated',id:scene.runId,label:'领地演练 · 模拟定位'},
    fix:()=>services.get('discovery')?.location?.snapshot().fix||null,
    validate(fix){
      if(fix?.source!=='simulated'||fix.scenarioId!==scene.runId)throw Object.assign(new Error('模拟位置不属于当前演练'),{code:'QA_LOCATION_MISMATCH'});
      const location=services.get('discovery')?.location;
      if(location?.adapter?.scenarioId!==scene.runId)throw Object.assign(new Error('模拟定位服务尚未就绪'),{code:'QA_LOCATION_MISMATCH'});
      // Discovery owns identity, source provenance and common quality checks.
      const quality=location.quality(fix);
      if(!quality.ok)throw Object.assign(new Error(quality.message),{code:quality.code});
      return fix;
    }
  };
}
module.exports={createQaTerritoryLocation};
