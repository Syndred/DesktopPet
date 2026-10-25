import catalog from './catalog.json' with { type: 'json' };
const { CROPS, ITEMS, RECIPES, BASE_PLOTS, STARTER_SEEDS, MAX_QUANTITY } = catalog;
const problem = (code, message) => { throw Object.assign(new Error(message), { code }); };
const copy = value => structuredClone(value);
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]));
  return value;
}
export async function digest(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
}
function validQuantity(value) { if (!Number.isSafeInteger(value) || value < 1 || value > MAX_QUANTITY) problem('INVALID_QUANTITY', '数量无效'); return value; }
export function gardenDocument(envelope, owner) {
  const module = envelope?.data?.modules?.garden;
  if (envelope?.ownerAccountId !== owner || module?.version !== 1 || module.data?.ownerAccountId !== owner || !module.data.tables) problem('CLOUD_GARDEN_NOT_INITIALIZED', '请先在账号页面同步包含菜园的完整存档');
  const tables = module.data.tables;
  for (const name of ['garden_accounts','garden_plots','garden_items','garden_actions','garden_events','garden_reward_receipts','garden_outbox']) if (!Array.isArray(tables[name]) || tables[name].some(row => row.owner_account_id !== owner)) problem('INVALID_CLOUD_SAVE', '云端菜园归属校验失败');
  return tables;
}
export function cloudSnapshot(envelope, owner, now) {
  const tables = gardenDocument(envelope, owner);
  const items = Object.values(ITEMS).map(item => ({ ...item, quantity: tables.garden_items.find(row => row.item_id === item.id)?.quantity || 0 }));
  return { ownerAccountId: owner, serverTime: now,
    plots: tables.garden_plots.map(row => ({ plotId: row.plot_id, cropType: row.crop_type, plantedAt: row.planted_at, maturesAt: row.matures_at, yieldQuantity: row.yield_quantity, revision: row.revision, stage: !row.crop_type ? 'empty' : now >= row.matures_at ? 'mature' : 'growing' })),
    items, crops: Object.values(CROPS), recipes: Object.values(RECIPES),
    pets: (envelope.data.tables?.companion_pets?.rows || []).filter(row => row.owner_account_id === owner).map(row => JSON.parse(row.data_json)),
    territories: [], ledger: tables.garden_events.slice(-60).reverse().map(row => ({ id: row.event_id, actionId: row.action_id, kind: row.kind, itemId: row.item_id, delta: row.delta, balance: row.balance, petId: row.pet_id, createdAt: row.created_at })),
    sync: { mode: 'cloud', pending: 0, conflicts: 0 }
  };
}
/** Authoritative operation over the existing account-save document. Inventory
 * and the specified companion commit in the same locked Postgres row; no second
 * pet, identity or inventory store is introduced. `now` comes from the server. */
export function applyCloudCommand(source, owner, kind, input, now, requestHash, uuid = () => crypto.randomUUID(), verifiedReward) {
  if (!input || typeof input.actionId !== 'string' || !/^[a-zA-Z0-9:_-]{1,160}$/.test(input.actionId)) problem('INVALID_ACTION', '操作编号无效');
  if (input.sessionOwnerAccountId !== undefined && input.sessionOwnerAccountId !== owner) problem('SESSION_CHANGED','账号已切换，请刷新');
  const envelope = copy(source), tables = gardenDocument(envelope, owner);
  const previous = tables.garden_actions.find(row => row.action_id === input.actionId);
  if (previous) {
    if (previous.request_hash !== requestHash || previous.kind !== kind) problem('ACTION_ID_REUSED', '此操作编号已用于另一项操作');
    return { envelope, result: { ...JSON.parse(previous.result_json), replayed: true }, changed: false };
  }
  const actionId = input.actionId;
  function change(itemId, delta, petId = null, eventKind = kind) {
    let item = tables.garden_items.find(row => row.item_id === itemId);
    const balance = (item?.quantity || 0) + delta;
    if (!Number.isSafeInteger(balance) || balance < 0) problem('INSUFFICIENT_ITEMS', `${ITEMS[itemId]?.name || itemId}不足`);
    if (balance > 1_000_000_000) problem('INVENTORY_LIMIT', '库存已达上限');
    if (item) item.quantity = balance; else { item = { owner_account_id: owner, item_id: itemId, quantity: balance }; tables.garden_items.push(item); }
    tables.garden_events.push({ owner_account_id: owner, event_id: uuid(), action_id: actionId, kind: eventKind, item_id: itemId, delta, balance, pet_id: petId, created_at: now });
  }
  const initializing = !tables.garden_accounts.length;
  if (initializing) {
    tables.garden_accounts.push({ owner_account_id: owner, revision: 0, initialized_at: now });
    for (let i = 1; i <= BASE_PLOTS; i++) tables.garden_plots.push({ owner_account_id: owner, plot_id: `plot-${i}`, crop_type: null, planted_at: null, matures_at: null, yield_quantity: 0, revision: 0 });
    for (const crop of Object.values(CROPS)) change(crop.seedItemId, STARTER_SEEDS, null, 'starter');
  }
  const account = tables.garden_accounts[0];
  if (kind === 'initialize' && !initializing) return {envelope,result:{ok:true,data:{initialized:true},revision:account.revision,replayed:true},changed:false};
  if (kind !== 'reward' && (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== account.revision)) problem('REVISION_CONFLICT', '另一台设备已更新菜园，请刷新');
  let receipt;
  if (kind === 'initialize') {
    receipt = {initialized:true,plots:BASE_PLOTS};
  } else if (kind === 'plant') {
    const crop = CROPS[input.cropType]; if (!crop) problem('INVALID_CROP', '种子无效');
    const plot = tables.garden_plots.find(row => row.plot_id === input.plotId); if (!plot) problem('PLOT_NOT_FOUND', '找不到这块菜地'); if (plot.crop_type) problem('PLOT_OCCUPIED', '请先收获');
    change(crop.seedItemId, -1);
    Object.assign(plot, { crop_type: crop.id, planted_at: now, matures_at: now + crop.growMs, yield_quantity: crop.yield, revision: plot.revision + 1 });
    receipt = { plotId: plot.plot_id, cropType: crop.id, plantedAt: now, maturesAt: plot.matures_at, yieldQuantity: plot.yield_quantity };
  } else if (kind === 'harvest') {
    if (!Array.isArray(input.plotIds) || input.plotIds.length < 1 || input.plotIds.length > BASE_PLOTS || new Set(input.plotIds).size !== input.plotIds.length) problem('INVALID_PLOTS', '请选择有效地块');
    const harvested = [];
    for (const id of input.plotIds) {
      const plot = tables.garden_plots.find(row => row.plot_id === id); if (!plot) problem('PLOT_NOT_FOUND', '找不到菜地'); if (!plot.crop_type) problem('ALREADY_HARVESTED', '这块菜地已收获'); if (now < plot.matures_at) problem('CROP_NOT_MATURE', '作物尚未成熟');
      const crop = CROPS[plot.crop_type]; change(crop.harvestItemId, plot.yield_quantity);
      harvested.push({ plotId: id, itemId: crop.harvestItemId, quantity: plot.yield_quantity });
      Object.assign(plot, { crop_type: null, planted_at: null, matures_at: null, yield_quantity: 0, revision: plot.revision + 1 });
    }
    receipt = { harvested };
  } else if (kind === 'craft') {
    const recipe = RECIPES[input.recipeId]; if (!recipe) problem('INVALID_RECIPE', '食谱无效'); const count = validQuantity(input.quantity);
    change(recipe.input.itemId, -recipe.input.quantity * count); change(recipe.output.itemId, recipe.output.quantity * count);
    receipt = { recipeId: recipe.id, itemId: recipe.output.itemId, quantity: recipe.output.quantity * count };
  } else if (kind === 'feed') {
    const item = ITEMS[input.itemId]; if (!item?.effects) problem('NOT_EDIBLE', '稻米需要先制作，种子不能喂食'); const count = validQuantity(input.quantity);
    const pets = envelope.data.tables?.companion_pets?.rows;
    const petRow = pets?.find(row => row.owner_account_id === owner && row.pet_id === input.petId);
    if (!petRow) problem('PET_NOT_FOUND', '当前账号没有这只伙伴');
    if (!Number.isSafeInteger(input.expectedPetRevision) || petRow.revision !== input.expectedPetRevision) problem('REVISION_CONFLICT', '伙伴状态已更新，请刷新');
    const pet = JSON.parse(petRow.data_json); if (pet.ownerAccountId !== owner || pet.petId !== input.petId) problem('PET_NOT_FOUND', '伙伴归属不一致');
    change(item.id, -count, pet.petId);
    for (const [effect, target] of [['satiety','satiety'],['mood','mood'],['intimacy','affinity']]) pet.growth[target] = Math.min(100, Math.max(0, pet.growth[target] + item.effects[effect] * count));
    pet.revision++; pet.updatedAt = new Date(now).toISOString(); petRow.revision = pet.revision; petRow.updated_at = pet.updatedAt; petRow.data_json = JSON.stringify(pet);
    const companionAccount = envelope.data.tables?.companion_accounts?.rows?.find(row => row.owner_account_id === owner); if (companionAccount) companionAccount.revision++;
    receipt = { petId: pet.petId, itemId: item.id, quantity: count, effects: Object.fromEntries(Object.entries(item.effects).map(([key,value]) => [key,value * count])), pet };
  } else if (kind === 'reward') {
    if (!verifiedReward || verifiedReward.ownerAccountId !== owner || verifiedReward.id !== input.receiptId || verifiedReward.source !== input.source || !CROPS[verifiedReward.cropId]) problem('UNVERIFIED_REWARD', '需要已结算的服务端凭据');
    if (tables.garden_reward_receipts.some(row => row.source === input.source && row.receipt_id === input.receiptId)) problem('REWARD_ALREADY_CLAIMED', '本次种子已入库');
    const crop = CROPS[verifiedReward.cropId], count = input.source === 'battle' ? 2 : 1;
    change(crop.seedItemId,count);
    receipt = { source: input.source, receiptId: input.receiptId, itemId: crop.seedItemId, quantity: count };
    tables.garden_reward_receipts.push({ owner_account_id: owner, source: input.source, receipt_id: input.receiptId, action_id: actionId, result_json: JSON.stringify(receipt) });
  } else problem('CLOUD_COMMAND_UNAVAILABLE', '该操作尚未接入云端权威结算');
  account.revision++;
  const result = { ok: true, data: receipt, revision: account.revision, replayed: false };
  tables.garden_actions.push({ owner_account_id: owner, action_id: actionId, kind, request_hash: requestHash, result_json: JSON.stringify(result), created_at: now });
  tables.garden_outbox.push({ owner_account_id: owner, action_id: actionId, payload_json: JSON.stringify({ kind, input, result }), status: 'synced', attempts: 0, last_error: null, created_at: now });
  envelope.createdAt = new Date(now).toISOString();
  return { envelope, result, changed: true };
}
