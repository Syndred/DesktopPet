const { existsSync, readFileSync, realpathSync, statSync } = require('node:fs');
const { isAbsolute, join, relative, resolve } = require('node:path');

const MARKER = '.lingjing-qa-profile.json';
const SCENARIO = 'unified-battle';
function reject(message) { throw Object.assign(new Error(message), { code: 'QA_PROFILE_REQUIRED' }); }
function samePath(left, right) {
  const normalize = value => process.platform === 'win32' ? value.toLowerCase() : value;
  return normalize(resolve(left)) === normalize(resolve(right));
}
function within(root, file) {
  const delta = relative(root, file);
  return delta !== '..' && !delta.startsWith(`..${require('node:path').sep}`) && !isAbsolute(delta);
}

/** Explicit main-process configuration only. A renderer request cannot enable QA. */
function readQaScenario({ env = process.env, userData, legacyDataFile, productionDirectories = [] }) {
  if (!env.LINGJING_QA_SCENARIO) {
    if ([MARKER, 'lingjing-qa-profile.json'].some(name => existsSync(join(userData, name)))) throw Object.assign(new Error('请使用对应验收场景打开此目录。'), { code: 'QA_SCENARIO_REQUIRED' });
    return null;
  }
  if (env.LINGJING_QA_SCENARIO !== SCENARIO) reject('未知的验收场景。');
  if (!env.PET_USER_DATA_DIR || !isAbsolute(env.PET_USER_DATA_DIR)) reject('验收场景需要独立资料目录。');
  const profile = realpathSync(userData);
  if (!samePath(realpathSync(env.PET_USER_DATA_DIR), profile)) reject('验收目录与启动目录不一致。');
  const markerPath = join(profile, MARKER);
  if (!existsSync(markerPath) || !within(profile, realpathSync(markerPath))) reject('验收目录缺少独立场景标记。');
  if (!statSync(markerPath).isFile() || statSync(markerPath).size > 32768) reject('验收场景标记无效。');
  let marker;
  try { marker = JSON.parse(readFileSync(markerPath, 'utf8')); } catch { reject('验收场景标记无法读取。'); }
  if (marker.schemaVersion !== 1 || marker.application !== 'lingjing' || marker.scenario !== SCENARIO || marker.isolated !== true || !/^[0-9a-f-]{36}$/i.test(marker.runId || '') || !isAbsolute(marker.profilePath || '') || !samePath(marker.profilePath, profile)) reject('验收场景不属于当前独立资料目录。');
  if (env.PET_RUNTIME_DATA_FILE && (!within(profile, resolve(env.PET_RUNTIME_DATA_FILE)) || (existsSync(env.PET_RUNTIME_DATA_FILE) && !within(profile, realpathSync(env.PET_RUNTIME_DATA_FILE))))) reject('验收场景不能读取独立目录以外的存档。');
  const accountContext = require('../features/accounts/qa-scenario.cjs').resolveQaScenario({ env, userData: profile,
    legacyDataFile: legacyDataFile || env.PET_RUNTIME_DATA_FILE || join(profile, 'pet-runtime-data.json'), productionDirectories });
  const descriptor = Object.freeze({ id: SCENARIO, runId: marker.runId, provenance: 'simulated', isolated: true });
  return Object.freeze({ ...descriptor, profilePath: profile, descriptor, accountContext });
}

module.exports = { readQaScenario, MARKER, SCENARIO };
