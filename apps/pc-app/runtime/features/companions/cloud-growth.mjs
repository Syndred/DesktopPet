import { applyGrowthEffect, battleGrowthEffect } from './growth.mjs';

const TABLES = ['companion_accounts','companion_pets','companion_actions','companion_legacy_archive','companion_interactions','companion_capture_receipts'];
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = value => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f]/u.test(value);
function canonical(value) {
  if (value === null || ['boolean','string'].includes(typeof value) || typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (!object(value) || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) fail('INVALID_CLOUD_SAVE','存档包含非 JSON 数据');
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key)+':'+canonical(value[key])).join(',') + '}';
}
async function checksum(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value))))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
function parse(value) { try { return JSON.parse(value); } catch { fail('INVALID_CLOUD_SAVE','伙伴存档记录损坏'); } }
function readTables(envelope, owner) {
  const module = envelope.data?.modules?.companions;
  let tables;
  if (module !== undefined) {
    if (module?.version !== 1 || module.data?.ownerAccountId !== owner || !object(module.data.tables) || !Array.isArray(module.data.identityImports)) fail('INVALID_CLOUD_SAVE','伙伴模块归属或版本不匹配');
    // Never fall back to a stale generic copy when the canonical module exists.
    if (TABLES.some(name=>Object.hasOwn(envelope.data.tables||{},name))) fail('INVALID_CLOUD_SAVE','伙伴存档包含两份状态');
    tables=module.data.tables;
    if (Object.keys(tables).sort().join() !== [...TABLES].sort().join()) fail('INVALID_CLOUD_SAVE','伙伴存档不完整');
  } else tables=Object.fromEntries(TABLES.map(name=>[name,envelope.data?.tables?.[name]?.rows]));
  for (const name of TABLES) if (!Array.isArray(tables[name]) || tables[name].some(row=>!object(row)||row.owner_account_id!==owner)) fail('INVALID_CLOUD_SAVE','伙伴存档不完整或归属不匹配');
  if (tables.companion_accounts.length !== 1 || !Number.isSafeInteger(tables.companion_accounts[0].revision)) fail('INVALID_CLOUD_SAVE','伙伴账号版本无效');
  return tables;
}
function validatePet(row, owner, petId) {
  const pet=parse(row.data_json);
  if (!object(pet)||pet.ownerAccountId!==owner||pet.petId!==petId||pet.templateId!==row.template_id||pet.revision!==row.revision||!Number.isSafeInteger(pet.revision)||pet.revision<1||pet.createdAt!==row.created_at||pet.updatedAt!==row.updated_at) fail('INVALID_CLOUD_SAVE','伙伴编号或修订不一致');
  if (pet.resource?.kind!=='2d') fail('RESOURCE_UNAVAILABLE','历史伙伴记录已保留，当前战斗使用 2D 伙伴');
  const growth=pet.growth;
  if (!object(growth)||!Number.isSafeInteger(growth.level)||growth.level<1||!['experience','mood','satiety','affinity','winsTotal'].every(key=>Number.isSafeInteger(growth[key])&&growth[key]>=0)||!object(growth.stats)||!['hp','atk','def','spd'].every(key=>Number.isSafeInteger(growth.stats[key])&&growth.stats[key]>=0)) fail('INVALID_CLOUD_SAVE','伙伴成长记录无效');
  return pet;
}

/** Server-domain adapter only; NOT an HTTP authorization boundary.
 * 05 must first validate its08 actor and finished authoritative battle, then
 * commit the returned companion + inventory + world fragments in one CAS/SQL
 * transaction. This function performs no network, database write or commit. */
export async function awardBattleResult(input) {
  const {envelope:source,ownerAccountId:owner,petId,sessionId,won,mode,actionId,now}=input||{};
  if (!object(input)||Object.keys(input).some(key=>!['envelope','ownerAccountId','petId','sessionId','won','mode','actionId','now'].includes(key))||![owner,petId,sessionId,actionId].every(identifier)||typeof won!=='boolean'||!['training','friend','wild','territory'].includes(mode)||!Number.isSafeInteger(now)||now<0||!Number.isFinite(new Date(now).getTime())) fail('INVALID_INPUT','战斗成长请求无效');
  if (actionId!==`battle:${sessionId}:${owner}`) fail('INVALID_BATTLE_ACTION','战斗奖励必须使用固定结算标识');
  if (source?.format!=='lingjing-account-save'||source.version!==1||source.ownerAccountId!==owner||source.provenance?.mode!=='live') fail('BACKUP_OWNER_MISMATCH','战斗存档归属或环境不匹配');
  const envelope=structuredClone(source);
  const {checksum:digest,...body}=envelope;
  if (typeof digest!=='string'||digest!==await checksum(body)) fail('BACKUP_CHECKSUM_MISMATCH','战斗存档完整性校验失败');
  const tables=readTables(envelope,owner),rows=tables.companion_pets.filter(row=>row.pet_id===petId);
  if (rows.length!==1) fail('PET_NOT_FOUND','找不到当前账号的战斗伙伴');
  const pet=validatePet(rows[0],owner,petId),effect=battleGrowthEffect(won);
  const actionInput={actionId,petId,effect},requestHash=await checksum(actionInput);
  const prior=tables.companion_actions.filter(row=>row.action_id===actionId);
  if (prior.length>1) fail('INVALID_CLOUD_SAVE','战斗成长回执重复');
  if (prior.length) {
    const record=prior[0],result=parse(record.result_json),saved=result.data?.battleReward;
    if(record.operation!=='growth'||record.request_hash!==requestHash||result.ok!==true||result.data?.pet?.ownerAccountId!==owner||result.data?.pet?.petId!==petId||saved&&(saved.sessionId!==sessionId||saved.mode!==mode||saved.won!==won)) fail('ACTION_ID_CONFLICT','此结算标识已用于其他战斗或伙伴');
    const growth=result.data.pet.growth;
    return {envelope,reward:{...(saved||{actionId,petId,sessionId,mode,won,experience:effect.experience,applied:true,currentExperience:growth.experience,currentLevel:growth.level}),duplicate:true}};
  }
  const previous={...pet.growth},account=tables.companion_accounts[0],timestamp=new Date(now).toISOString();
  const selections=parse(account.selections_json);
  if (!object(selections)||Object.keys(selections).sort().join()!==['battlePetId','chatPetId','guardPetId'].sort().join()||Object.values(selections).some(id=>id!==null&&!tables.companion_pets.some(row=>row.pet_id===id))) fail('INVALID_CLOUD_SAVE','伙伴独立选择无效');
  pet.growth=applyGrowthEffect(pet.growth,effect);pet.revision++;pet.updatedAt=timestamp;
  if (!Number.isSafeInteger(pet.revision)||!Number.isSafeInteger(account.revision+1)) fail('INVALID_CLOUD_SAVE','伙伴修订超出范围');
  Object.assign(rows[0],{revision:pet.revision,data_json:JSON.stringify(pet),updated_at:timestamp});account.revision++;
  const reward={actionId,petId,sessionId,mode,won,experience:effect.experience,applied:true,duplicate:false,previousExperience:previous.experience,previousLevel:previous.level,currentExperience:pet.growth.experience,currentLevel:pet.growth.level};
  const result={ok:true,data:{pet,selections,battleReward:reward},revision:account.revision,duplicate:false};
  tables.companion_actions.push({owner_account_id:owner,action_id:actionId,operation:'growth',request_hash:requestHash,result_json:JSON.stringify(result),created_at:timestamp});
  // Match the canonical SQLite adapter's PK order so a complete-save readback
  // does not look like another local edit merely because a receipt was appended.
  tables.companion_actions.sort((a,b)=>{const left=JSON.stringify([a.owner_account_id,a.action_id]),right=JSON.stringify([b.owner_account_id,b.action_id]);return left<right?-1:left>right?1:0;});
  envelope.createdAt=timestamp;const {checksum:oldChecksum,...nextBody}=envelope;void oldChecksum;envelope.checksum=await checksum(nextBody);
  return {envelope,reward};
}
