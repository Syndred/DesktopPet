const { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } = require("node:fs");
const { isAbsolute, join, relative, resolve, sep } = require("node:path");
const { randomUUID } = require("node:crypto");
const { invariant } = require("./errors.cjs");

const MARKER = "lingjing-qa-profile.json";
const verified = new WeakSet();
const inside = (root, file) => { const path = relative(root, file); return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path)); };
const same = (a, b) => process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;

/** Explicit provisioning only. Refuses every pre-existing directory, including
 * production profiles and copies of real accounts. Never called on app startup. */
function provisionQaProfile(directory, scenarioId = "friend-pk") {
  invariant(isAbsolute(directory) && /^[a-z][a-z0-9-]{2,63}$/.test(scenarioId), "QA_PROFILE_INVALID", "测试场景配置无效。");
  mkdirSync(directory);
  const marker = { format: "lingjing-qa-profile", version: 1, mode: "simulated", profileId: randomUUID(), scenarioId };
  writeFileSync(join(directory, MARKER), JSON.stringify(marker, null, 2), { flag: "wx" });
  return marker;
}

/** Main-process preflight, also exported for foundation BEFORE database/legacy
 * initialization. A renderer flag, network error, or ordinary local login never
 * selects this path. A QA profile cannot silently reopen as a normal profile. */
function resolveQaScenario({ env = process.env, userData, legacyDataFile, productionDirectories = [] }) {
  const markerFile = join(userData, MARKER), selected = env.LINGJING_QA_SCENARIO;
  if (!selected) {
    invariant(!existsSync(markerFile), "QA_SCENARIO_REQUIRED", "请用对应测试场景打开此独立存档。");
    return null;
  }
  invariant(/^[a-z][a-z0-9-]{2,63}$/.test(selected) && isAbsolute(env.PET_USER_DATA_DIR || "") && existsSync(markerFile),
    "QA_PROFILE_REQUIRED", "测试场景需要独立存档目录。");
  const directory = realpathSync(userData);
  invariant(same(directory, realpathSync(env.PET_USER_DATA_DIR)), "QA_PROFILE_MISMATCH", "测试目录不匹配。");
  for (const path of productionDirectories) {
    const target = existsSync(path) ? realpathSync(path) : resolve(path);
    invariant(!same(directory, target), "QA_PRODUCTION_PROFILE_FORBIDDEN", "不能在正式存档中运行测试场景。");
  }
  let marker;
  try { marker = JSON.parse(readFileSync(markerFile, "utf8")); } catch { invariant(false, "QA_PROFILE_INVALID", "测试目录标记无效。"); }
  invariant(marker?.format === "lingjing-qa-profile" && marker.version === 1 && marker.mode === "simulated"
    && /^[0-9a-f-]{36}$/i.test(marker.profileId || "") && marker.scenarioId === selected,
    "QA_SCENARIO_MISMATCH", "测试场景与存档不匹配。");
  for (const file of [legacyDataFile, legacyDataFile && `${legacyDataFile}.before-lingjing.bak`].filter(Boolean)) {
    invariant(inside(directory, resolve(file)) && (!existsSync(file) || inside(directory, realpathSync(file))), "QA_PROFILE_ESCAPE", "测试场景不能读取目录外的存档。");
    if (!existsSync(file)) continue;
    let data;
    try { data = JSON.parse(readFileSync(file, "utf8")); } catch { invariant(false, "QA_EXISTING_DATA_FORBIDDEN", "测试场景不能导入已有存档。"); }
    invariant(!data.users?.length && !data.currentUserId && !Object.keys(data.userInventories || {}).length,
      "QA_EXISTING_DATA_FORBIDDEN", "测试场景不能导入已有账号。");
  }
  const context = Object.freeze({ mode: "simulated", profileId: marker.profileId, scenarioId: selected, directory });
  verified.add(context);
  return context;
}

function assertQaDatabase(db, scenario) {
  invariant(!scenario || verified.has(scenario), "QA_PROFILE_UNVERIFIED", "测试身份来源未验证。");
  const saved = db.prepare("SELECT * FROM account_qa_profile WHERE singleton=1").get();
  if (!scenario) { invariant(!saved, "QA_SCENARIO_REQUIRED", "此存档仅供独立测试场景使用。"); return; }
  if (saved) {
    invariant(saved.profile_id === scenario.profileId && saved.scenario_id === scenario.scenarioId, "QA_SCENARIO_MISMATCH", "测试身份与存档不匹配。");
  } else {
    invariant(db.prepare("SELECT COUNT(*) n FROM account_identities").get().n === 0, "QA_EXISTING_DATA_FORBIDDEN", "测试场景不能接管已有账号。");
    db.prepare("INSERT INTO account_qa_profile VALUES(1,?,?)").run(scenario.profileId, scenario.scenarioId);
  }
  const rows = db.prepare("SELECT provider,owner_account_id FROM account_identities").all();
  invariant(rows.every(row => row.provider === "local" && row.owner_account_id.startsWith(`qa:${scenario.profileId}:`)),
    "QA_IDENTITY_MISMATCH", "测试身份归属不匹配。");
}

const publicScenario = scenario => scenario ? { mode: "simulated", profileId: scenario.profileId, scenarioId: scenario.scenarioId } : null;
const qaRemoteBoundary = () => ({ enabled: false, setCurrentUser() {} });
function qaHostBoundary(host) {
  return { ...host, apply: document => host.apply({ ...document,
    privacy: { ...document.privacy, locationAllowed: false, emotionStatistics: false } }, { explicitStartupChange: false }),
    notify: () => ({ delivered: false, reason: "qa-scenario" }), mayUseLocation: () => false, mayCollectEmotion: () => false };
}
module.exports = { MARKER, provisionQaProfile, resolveQaScenario, assertQaDatabase, publicScenario, qaRemoteBoundary, qaHostBoundary };
