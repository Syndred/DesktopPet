"use strict";
const { createHash, randomUUID } = require("node:crypto");
const { CROPS, ITEMS, RECIPES, BASE_PLOTS, STARTER_SEEDS, MAX_QUANTITY } = require("./catalog.cjs");
const { migrate } = require("./migrations.cjs");

class GardenError extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}
const reject = (code, message, details) => { throw new GardenError(code, message, details); };
const identifier = (value, label) => {
  if (typeof value !== "string" || !/^[a-zA-Z0-9:_./@-]{1,160}$/.test(value)) reject("INVALID_INPUT", `${label}无效`);
  return value;
};
const quantity = value => {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_QUANTITY) reject("INVALID_QUANTITY", `数量应为 1–${MAX_QUANTITY} 的整数`);
  return value;
};
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, canonical(value[k])]));
  return value;
}
const hash = value => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

class GardenService {
  constructor({ db, companions, territories, clock = Date.now, balance = {}, onCommitted, cloud } = {}) {
    if (!db?.prepare || !db?.exec) throw new Error("Garden requires the foundation SQLite connection");
    this.db = db; this.companions = companions; this.territories = territories; this.clock = clock;
    this.balance = balance; this.onCommitted = onCommitted; this.cloud = cloud;
    migrate(db);
  }
  transaction(work) {
    // BEGIN IMMEDIATE serializes independent Electron processes on the same file.
    // SAVEPOINT permits battle settlement to include seed rewards in its transaction.
    const nested = this.db.isTransaction === true || this.db.inTransaction === true;
    this.db.exec(nested ? "SAVEPOINT garden_action" : "BEGIN IMMEDIATE");
    try {
      const result = work();
      if (result?.then) throw new Error("Garden transaction adapters must be synchronous");
      this.db.exec(nested ? "RELEASE garden_action" : "COMMIT");
      return result;
    } catch (error) {
      this.db.exec(nested ? "ROLLBACK TO garden_action; RELEASE garden_action" : "ROLLBACK");
      throw error;
    }
  }
  owner(context) {
    // context is created by the main process, never from a renderer payload.
    const owner=identifier(context?.ownerAccountId, "已验证账号");
    if(this.db.prepare('SELECT 1 FROM garden_identity_imports WHERE source_owner_account_id=? AND target_owner_account_id<>?').get(owner,owner))reject('OWNER_MIGRATED','旧归属已完成迁移，请使用已验证的新账号身份');
    return owner;
  }
  ensureAccount(owner, now) {
    if (this.db.prepare("SELECT 1 FROM garden_accounts WHERE owner_account_id = ?").get(owner)) return;
    this.db.prepare("INSERT INTO garden_accounts VALUES (?,0,?)").run(owner, now);
    const plot = this.db.prepare("INSERT INTO garden_plots(owner_account_id,plot_id) VALUES (?,?)");
    for (let i = 1; i <= BASE_PLOTS; i++) plot.run(owner, `plot-${i}`);
    for (const crop of Object.values(CROPS)) this.changeItem(owner, "starter:v1", "starter", crop.seedItemId, STARTER_SEEDS, now);
  }
  revision(owner) { return this.db.prepare("SELECT revision FROM garden_accounts WHERE owner_account_id=?").get(owner)?.revision ?? 0; }
  itemCount(owner, item) { return this.db.prepare("SELECT quantity FROM garden_items WHERE owner_account_id=? AND item_id=?").get(owner, item)?.quantity ?? 0; }
  changeItem(owner, actionId, kind, itemId, delta, now, petId = null) {
    const balance = this.itemCount(owner, itemId) + delta;
    if (!Number.isSafeInteger(balance) || balance < 0) reject("INSUFFICIENT_ITEMS", `${ITEMS[itemId]?.name || itemId}不足`);
    if (balance > 1_000_000_000) reject("INVENTORY_LIMIT", "库存已达上限");
    this.db.prepare("INSERT INTO garden_items VALUES (?,?,?) ON CONFLICT(owner_account_id,item_id) DO UPDATE SET quantity=excluded.quantity").run(owner, itemId, balance);
    this.db.prepare("INSERT INTO garden_events(owner_account_id,event_id,action_id,kind,item_id,delta,balance,pet_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)").run(owner, randomUUID(), actionId, kind, itemId, delta, balance, petId, now);
    return balance;
  }
  command(context, kind, input, work, { checkRevision = true } = {}) {
    let owner;
    try {
      owner = this.owner(context);
      identifier(input?.actionId, "操作标识");
      const requestHash = hash({ kind, input });
      const result = this.transaction(() => {
        const now = this.clock();
        this.ensureAccount(owner, now);
        const previous = this.db.prepare("SELECT request_hash,result_json FROM garden_actions WHERE owner_account_id=? AND action_id=?").get(owner, input.actionId);
        if (previous) {
          if (previous.request_hash !== requestHash) reject("ACTION_ID_REUSED", "同一操作标识不能用于不同的请求");
          return { ...JSON.parse(previous.result_json), replayed: true };
        }
        const revision = this.revision(owner);
        if (checkRevision && (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== revision)) reject("REVISION_CONFLICT", "数据已更新，请刷新后重试", { revision });
        const receipt = work({ owner, now, actionId: input.actionId });
        this.db.prepare("UPDATE garden_accounts SET revision=revision+1 WHERE owner_account_id=?").run(owner);
        const result = { ok: true, revision: this.revision(owner), replayed: false, data: receipt };
        this.db.prepare("INSERT INTO garden_actions VALUES (?,?,?,?,?,?)").run(owner, input.actionId, kind, requestHash, JSON.stringify(result), now);
        // Local saves remain durable when the network is down. Only a server receipt
        // may acknowledge this record; local success is never described as cloud sync.
        this.db.prepare("INSERT INTO garden_outbox(owner_account_id,action_id,payload_json,created_at) VALUES (?,?,?,?)").run(owner, input.actionId, JSON.stringify({ kind, input, result }), now);
        return result;
      });
      if (!result.replayed) {
        // A failed UI notification cannot turn a committed transaction into failure.
        try { this.onCommitted?.({ ownerAccountId: owner, kind, actionId: input.actionId, revision: result.revision }); } catch { /* data is already durable */ }
      }
      return result;
    } catch (error) { return this.failure(error, owner); }
  }
  failure(error, owner) {
    const busy = /SQLITE_BUSY|database is locked/.test(String(error?.code) + String(error?.message));
    return { ok: false, code: error.code || (busy ? "REVISION_CONFLICT" : "GARDEN_UNAVAILABLE"), message: error instanceof GardenError ? error.message : busy ? "其他设备正在保存，请刷新后重试" : "菜园暂时不可用，请稍后重试", revision: owner ? this.revision(owner) : undefined, details: error.details };
  }
  snapshot(context) {
    let owner;
    try {
      owner = this.owner(context);
      return this.transaction(() => {
        const now = this.clock(); this.ensureAccount(owner, now);
        const plots = this.db.prepare("SELECT * FROM garden_plots WHERE owner_account_id=? ORDER BY plot_id").all(owner).map(p => ({
          plotId: p.plot_id, cropType: p.crop_type, plantedAt: p.planted_at, maturesAt: p.matures_at,
          yieldQuantity: p.yield_quantity, revision: p.revision,
          stage: !p.crop_type ? "empty" : now >= p.matures_at ? "mature" : "growing"
        }));
        const items = Object.values(ITEMS).map(item => ({ ...item, quantity: this.itemCount(owner, item.id) }));
        const pending = this.db.prepare("SELECT status,COUNT(*) count FROM garden_outbox WHERE owner_account_id=? GROUP BY status").all(owner);
        const ledger = this.db.prepare("SELECT event_id id,action_id actionId,kind,item_id itemId,delta,balance,pet_id petId,created_at createdAt FROM garden_events WHERE owner_account_id=? ORDER BY created_at DESC,event_id DESC LIMIT 60").all(owner);
        const pets = (this.companions?.listForOwner?.({ db: this.db, ownerAccountId: owner }) || []).filter(pet => !['3d','model3d'].includes(pet.resource?.kind));
        const territories = this.listTerritories(owner);
        return { ok: true, revision: this.revision(owner), data: { ownerAccountId: owner, serverTime: now, plots, items, crops: Object.values(CROPS), recipes: Object.values(RECIPES), pets, territories, ledger, sync: { mode: this.cloud ? "available" : "local", pending: pending.find(p => p.status === "pending")?.count || 0, conflicts: pending.find(p => p.status === "conflict")?.count || 0 } } };
      });
    } catch (error) { return this.failure(error, owner); }
  }
  plant(context, input) {
    return this.command(context, "plant", input, ({ owner, now, actionId }) => {
      const crop = CROPS[input.cropType]; if (!crop) reject("INVALID_CROP", "请选择有效种子");
      const plot = this.db.prepare("SELECT * FROM garden_plots WHERE owner_account_id=? AND plot_id=?").get(owner, input.plotId);
      if (!plot) reject("PLOT_NOT_FOUND", "找不到这块菜地");
      if (plot.crop_type) reject("PLOT_OCCUPIED", "请先收获这块菜地");
      this.changeItem(owner, actionId, "plant", crop.seedItemId, -1, now);
      const growMs = this.balance.growMs?.[crop.id] ?? crop.growMs;
      if (!Number.isSafeInteger(growMs) || growMs < 1) throw new Error("Invalid growth balance");
      // Bonus is snapshotted at planting; loss of a territory never deletes crops.
      const bonus = Math.max(0, Math.min(5, Number(this.territories?.gardenBonusForOwner?.({ db: this.db, ownerAccountId: owner })) || 0));
      const yieldQuantity = crop.yield + Math.floor(bonus);
      this.db.prepare("UPDATE garden_plots SET crop_type=?,planted_at=?,matures_at=?,yield_quantity=?,revision=revision+1 WHERE owner_account_id=? AND plot_id=?").run(crop.id, now, now + growMs, yieldQuantity, owner, input.plotId);
      return { plotId: input.plotId, cropType: crop.id, plantedAt: now, maturesAt: now + growMs, yieldQuantity };
    });
  }
  harvest(context, input) {
    return this.command(context, "harvest", input, ({ owner, now, actionId }) => {
      if (!Array.isArray(input.plotIds) || !input.plotIds.length || input.plotIds.length > BASE_PLOTS || new Set(input.plotIds).size !== input.plotIds.length) reject("INVALID_PLOTS", "请选择要收获的菜地");
      const harvested = [];
      for (const plotId of [...input.plotIds].sort()) {
        const plot = this.db.prepare("SELECT * FROM garden_plots WHERE owner_account_id=? AND plot_id=?").get(owner, plotId);
        if (!plot) reject("PLOT_NOT_FOUND", "找不到这块菜地");
        if (!plot.crop_type) reject("ALREADY_HARVESTED", "这块菜地已收获");
        if (now < plot.matures_at) reject("CROP_NOT_MATURE", "作物还在生长，请稍等");
        const crop = CROPS[plot.crop_type];
        this.changeItem(owner, actionId, "harvest", crop.harvestItemId, plot.yield_quantity, now);
        this.db.prepare("UPDATE garden_plots SET crop_type=NULL,planted_at=NULL,matures_at=NULL,yield_quantity=0,revision=revision+1 WHERE owner_account_id=? AND plot_id=?").run(owner, plotId);
        harvested.push({ plotId, itemId: crop.harvestItemId, quantity: plot.yield_quantity });
      }
      return { harvested };
    });
  }
  craft(context, input) {
    return this.command(context, "craft", input, ({ owner, now, actionId }) => {
      const recipe = RECIPES[input.recipeId]; if (!recipe) reject("INVALID_RECIPE", "找不到这个食谱");
      const count = quantity(input.quantity);
      this.changeItem(owner, actionId, "craft", recipe.input.itemId, -recipe.input.quantity * count, now);
      this.changeItem(owner, actionId, "craft", recipe.output.itemId, recipe.output.quantity * count, now);
      return { recipeId: recipe.id, itemId: recipe.output.itemId, quantity: recipe.output.quantity * count };
    });
  }
  feed(context, input) {
    return this.command(context, "feed", input, ({ owner, now, actionId }) => {
      const item = ITEMS[input.itemId]; if (!item?.effects) reject("NOT_EDIBLE", input.itemId === "rice" ? "稻米需要先制作成米饭" : "这件物品不能喂食");
      const count = quantity(input.quantity); identifier(input.petId, "伙伴实例");
      if (!Number.isSafeInteger(input.expectedPetRevision) || input.expectedPetRevision < 0) reject('INVALID_PET_REVISION', '请刷新伙伴状态后再喂食');
      if (!this.companions?.applyFoodInTransaction) reject("COMPANIONS_UNAVAILABLE", "伙伴养成服务尚未就绪");
      this.changeItem(owner, actionId, "feed", item.id, -count, now, input.petId);
      const effects = Object.fromEntries(Object.entries(item.effects).map(([key, value]) => [key, value * count]));
      const pet = this.companions.applyFoodInTransaction({ db: this.db, ownerAccountId: owner, petId: input.petId, expectedRevision: input.expectedPetRevision, effects, actionId, now });
      if (pet?.then) throw new Error("Companion food adapter must participate synchronously in the garden transaction");
      if (!pet || pet.ok === false) reject(pet?.code || "PET_NOT_FOUND", pet?.message || "这只伙伴不属于当前账号");
      return { petId: input.petId, itemId: item.id, quantity: count, effects, pet: pet.pet || pet };
    });
  }
  // Main-process only. The caller must first validate its battle/exploration receipt.
  // No IPC command exposes this method or lets renderer choose rewards.
  grantSeeds(context, input, verifiedReceipt) {
    if (!verifiedReceipt || verifiedReceipt.ownerAccountId !== context?.ownerAccountId || verifiedReceipt.id !== input.receiptId || verifiedReceipt.source !== input.source || verifiedReceipt.eligible !== true) return { ok: false, code: "UNVERIFIED_REWARD", message: "需要已结算的探索或对战记录" };
    return this.command(context, "reward", input, ({ owner, now, actionId }) => {
      if (!["exploration", "battle"].includes(input.source)) reject("INVALID_REWARD_SOURCE", "种子来源无效");
      identifier(input.receiptId, "结算记录");
      const old = this.db.prepare("SELECT result_json FROM garden_reward_receipts WHERE owner_account_id=? AND source=? AND receipt_id=?").get(owner, input.source, input.receiptId);
      if (old) reject("REWARD_ALREADY_CLAIMED", "这次探索或对战的种子已入库");
      const cropIds = Object.keys(CROPS);
      const crop = CROPS[cropIds[parseInt(hash({ source: input.source, receipt: input.receiptId }).slice(0, 8), 16) % cropIds.length]];
      const count = input.source === "battle" ? 2 : 1;
      this.changeItem(owner, actionId, "reward", crop.seedItemId, count, now);
      const result = { source: input.source, receiptId: input.receiptId, itemId: crop.seedItemId, quantity: count };
      this.db.prepare("INSERT INTO garden_reward_receipts VALUES (?,?,?,?,?)").run(owner, input.source, input.receiptId, actionId, JSON.stringify(result));
      return result;
    }, { checkRevision: false });
  }
  listTerritories(owner) {
    const rows = this.territories?.listForOwner?.({ db: this.db, ownerAccountId: owner }) || [];
    return rows.map(t => {
      const garrison = this.db.prepare("SELECT pet_id petId,territory_revision territoryRevision FROM garden_garrisons WHERE owner_account_id=? AND territory_id=?").get(owner, t.id);
      return { ...t, garrisonPetId: t.ownerAccountId === owner ? garrison?.petId || null : null };
    });
  }
  garrison(context, input) {
    return this.command(context, "garrison", input, ({ owner, now }) => {
      identifier(input.territoryId, "领地");
      const territory = this.territories?.getForOwner?.({ db: this.db, ownerAccountId: owner, territoryId: input.territoryId });
      if (!territory || territory.ownerAccountId !== owner) reject("TERRITORY_NOT_OWNED", "当前账号未拥有这片领地");
      if (territory.revision !== input.expectedTerritoryRevision) reject("TERRITORY_CONFLICT", "领地归属已更新，请刷新");
      if (input.petId === null) {
        this.db.prepare("DELETE FROM garden_garrisons WHERE owner_account_id=? AND territory_id=?").run(owner, input.territoryId);
      } else {
        identifier(input.petId, "伙伴实例");
        const pets = this.companions?.listForOwner?.({ db: this.db, ownerAccountId: owner }) || [];
        if (!pets.some(p => p.petId === input.petId || p.id === input.petId)) reject("PET_NOT_FOUND", "这只伙伴不属于当前账号");
        this.db.prepare("DELETE FROM garden_garrisons WHERE owner_account_id=? AND pet_id=?").run(owner, input.petId);
        this.db.prepare("INSERT INTO garden_garrisons VALUES (?,?,?,?,?) ON CONFLICT(owner_account_id,territory_id) DO UPDATE SET pet_id=excluded.pet_id,territory_revision=excluded.territory_revision,updated_at=excluded.updated_at").run(owner, input.territoryId, input.petId, territory.revision, now);
      }
      return { territoryId: input.territoryId, petId: input.petId };
    });
  }
}
module.exports = { GardenService, GardenError, canonical };
