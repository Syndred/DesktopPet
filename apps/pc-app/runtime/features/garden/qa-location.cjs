"use strict";
const { resolve } = require('node:path');
const { GardenError } = require('./service.cjs');

/** Consumes foundation's verified main-only scenario; there is no renderer toggle. */
function createQaTerritoryLocation(services) {
  const scene=services.get('qaScenario');
  if(!scene)return null;
  const normalize=value=>process.platform==='win32'?resolve(value).toLowerCase():resolve(value);
  if(scene.id!=='unified-battle'||scene.provenance!=='simulated'||scene.isolated!==true||!scene.runId||!scene.profilePath||typeof scene.requireIdentity!=='function'||!services.paths?.userData||normalize(scene.profilePath)!==normalize(services.paths.userData))throw new GardenError('QA_PROFILE_REQUIRED','领地演练需要独立验收目录');
  return {
    descriptor:{mode:'simulated',id:scene.runId,label:'领地演练 · 模拟定位'},
    fix:()=>services.get('discovery')?.location?.snapshot().fix||null,
    validate(fix){
      if(fix?.source!=='simulated'||fix.scenarioId!==scene.runId)throw new GardenError('QA_LOCATION_MISMATCH','模拟位置不属于当前演练');
      const location=services.get('discovery')?.location;
      if(location?.adapter?.scenarioId!==scene.runId)throw new GardenError('QA_LOCATION_MISMATCH','模拟定位服务尚未就绪');
      // Discovery owns identity, source provenance and common quality checks.
      const quality=location.quality(fix);
      if(!quality.ok)throw new GardenError(quality.code,quality.message);
      return fix;
    }
  };
}
module.exports={createQaTerritoryLocation};
