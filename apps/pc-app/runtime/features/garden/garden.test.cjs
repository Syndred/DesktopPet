"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { GardenService } = require("./service.cjs");
const { companionAdapter } = require("./testing-adapter.cjs");
const companionsRoot = process.env.GARDEN_COMPANIONS_DIR || resolve(__dirname, "../companions");
const { CompanionsService } = require(join(companionsRoot, "service.cjs"));
const { migrateCompanions } = require(join(companionsRoot, "migrations.cjs"));
const owner = { ownerAccountId: "garden-account-a" };
function database(file) {
  const db = new DatabaseSync(file); db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000"); return db;
}
function setup() {
  const file = join(mkdtempSync(join(tmpdir(), "lingjing-garden-")), "actual.sqlite");
  const db = database(file); migrateCompanions(db);
  const companions = new CompanionsService({ db });
  const pets = ["鱼丸", "小蓝", "饭团"].map((name, i) => companions.adopt(owner.ownerAccountId, { actionId: `adopt-${i}`, templateId: "big-fish-gentle", name, showOnDesktop: false }).data.pet);
  let now = Date.now();
  const territories = { owner: owner.ownerAccountId, listForOwner() { return [{ id: 'lake', ownerAccountId: this.owner, revision: 1, captureMultiplier: 2 }]; }, getForOwner() { return this.listForOwner()[0]; }, gardenBonusForOwner() { return this.owner === owner.ownerAccountId ? 1 : 0; } };
  const service = new GardenService({ db, companions: companionAdapter(companions, db), territories, clock: () => now });
  const input = (actionId, extra = {}) => ({ actionId, expectedRevision: service.snapshot(owner).revision, ...extra });
  return { file, db, service, companions, pets, territories, input, advance: ms => { now += ms; } };
}
test("six personal plots, starter grants once, strict account isolation", () => {
  const f = setup(); const first = f.service.snapshot(owner); const again = f.service.snapshot(owner);
  assert.equal(first.data.plots.length, 6); assert.equal(first.data.items.find(i => i.id === "seed:rice").quantity, 2);
  assert.deepEqual(first.data.items, again.data.items); assert.equal(f.db.prepare("SELECT COUNT(*) n FROM garden_events").get().n, 4);
  const other = f.service.snapshot({ ownerAccountId: "garden-account-b" }); assert.equal(other.data.pets.length, 0);
  const denial = f.service.feed({ ownerAccountId: "garden-account-b" }, { actionId: 'foreign-feed', expectedRevision: 0, petId: f.pets[0].petId, itemId: 'cooked_rice', quantity: 1 }); assert.equal(denial.ok, false);
  f.db.close();
});
test("offline growth survives actual database close/reopen, harvest issues once", () => {
  const f = setup(); const planted = f.service.plant(owner, f.input('plant-rice', { plotId: 'plot-1', cropType: 'rice' })); assert.equal(planted.ok, true);
  assert.equal(f.service.harvest(owner, f.input('too-early', { plotIds: ['plot-1'] })).code, 'CROP_NOT_MATURE');
  f.db.close(); const reopened = database(f.file);
  const service = new GardenService({ db: reopened, clock: () => planted.data.maturesAt + 1000 });
  assert.equal(service.snapshot(owner).data.plots[0].stage, 'mature');
  const request = { actionId: 'harvest-rice', expectedRevision: 1, plotIds: ['plot-1'] };
  const first = service.harvest(owner, request); const repeated = service.harvest(owner, request);
  assert.equal(first.ok, true); assert.equal(repeated.replayed, true); assert.equal(service.itemCount(owner.ownerAccountId, 'rice'), 3);
  assert.equal(service.harvest(owner, { ...request, actionId: 'another-device' }).code, 'REVISION_CONFLICT');
  assert.equal(service.harvest(owner, { ...request, actionId: 'new-after-read', expectedRevision: 2 }).code, 'ALREADY_HARVESTED');
  reopened.close();
});
test("recipe consumes rice and food debits one, changes only the selected real companion", () => {
  const f = setup(); assert.equal(f.service.plant(owner, f.input('plant', { plotId: 'plot-1', cropType: 'rice' })).ok, true); f.advance(26 * 60_000);
  assert.equal(f.service.harvest(owner, f.input('harvest', { plotIds: ['plot-1'] })).ok, true);
  const beforeRice = f.service.itemCount(owner.ownerAccountId, 'rice');
  const craft = f.input('craft', { recipeId: 'cooked_rice', quantity: 1 }); assert.equal(f.service.craft(owner, craft).ok, true); assert.equal(f.service.craft(owner, craft).replayed, true);
  assert.equal(f.service.itemCount(owner.ownerAccountId, 'rice'), beforeRice - 1); assert.equal(f.service.itemCount(owner.ownerAccountId, 'cooked_rice'), 1);
  const before = f.companions.snapshot(owner.ownerAccountId).data.pets;
  const request = f.input('feed', { petId: f.pets[0].petId, expectedPetRevision: f.pets[0].revision, itemId: 'cooked_rice', quantity: 1 });
  const result = f.service.feed(owner, request); assert.equal(result.ok, true); assert.equal(f.service.feed(owner, request).replayed, true);
  const after = f.companions.snapshot(owner.ownerAccountId).data.pets;
  assert.equal(after.find(p => p.name === '鱼丸').growth.satiety, 80); assert.equal(after.find(p => p.name === '鱼丸').growth.affinity, 4);
  assert.deepEqual(after.filter(p => p.name !== '鱼丸'), before.filter(p => p.name !== '鱼丸'));
  assert.equal(f.service.itemCount(owner.ownerAccountId, 'cooked_rice'), 0);
  assert.equal(f.service.feed(owner, f.input('feed-empty', { petId: f.pets[0].petId, expectedPetRevision: 2, itemId: 'cooked_rice', quantity: 1 })).code, 'INSUFFICIENT_ITEMS');
  f.db.close();
});
test("failed companion update rolls back inventory, ledger, revision and action", () => {
  const f = setup(); f.service.plant(owner, f.input('p', { plotId: 'plot-1', cropType: 'carrot' })); f.advance(11 * 60_000); f.service.harvest(owner, f.input('h', { plotIds: ['plot-1'] }));
  const revision = f.service.revision(owner.ownerAccountId); const count = f.service.itemCount(owner.ownerAccountId, 'carrot');
  const result = f.service.feed(owner, f.input('bad-pet', { petId: 'someone-elses-pet', expectedPetRevision: 1, itemId: 'carrot', quantity: 1 })); assert.equal(result.code, 'PET_NOT_FOUND');
  assert.equal(f.service.itemCount(owner.ownerAccountId, 'carrot'), count); assert.equal(f.service.revision(owner.ownerAccountId), revision);
  assert.equal(f.db.prepare("SELECT 1 FROM garden_actions WHERE action_id='bad-pet'").get(), undefined);
  assert.equal(f.db.prepare("SELECT 1 FROM garden_events WHERE action_id='bad-pet'").get(), undefined);
  const stale = f.service.feed(owner, f.input('stale-pet', { petId: f.pets[0].petId, expectedPetRevision: 999, itemId: 'carrot', quantity: 1 })); assert.equal(stale.code, 'REVISION_CONFLICT'); assert.equal(f.service.itemCount(owner.ownerAccountId, 'carrot'), count);
  f.db.close();
});
test("invalid quantities, stale revisions and raw rice cannot consume inventory", () => {
  const f = setup();
  for (const value of [0, -1, 1.5, 100, NaN, Infinity]) assert.equal(f.service.craft(owner, f.input(`qty-${String(value)}`, { recipeId: 'cooked_rice', quantity: value })).code, 'INVALID_QUANTITY');
  const raw = f.service.feed(owner, f.input('raw-rice', { petId: f.pets[0].petId, itemId: 'rice', quantity: 1 })); assert.equal(raw.code, 'NOT_EDIBLE');
  const original = f.input('unique', { cropType: 'tomato', plotId: 'plot-2' }); assert.equal(f.service.plant(owner, original).ok, true);
  assert.equal(f.service.plant(owner, { ...original, cropType: 'carrot' }).code, 'ACTION_ID_REUSED');
  assert.equal(f.service.plant(owner, { actionId: 'stale', expectedRevision: 0, plotId: 'plot-3', cropType: 'carrot' }).code, 'REVISION_CONFLICT');
  f.db.close();
});
test("batch harvest is all-or-nothing", () => {
  const f = setup(); f.service.plant(owner, f.input('p1', { cropType: 'carrot', plotId: 'plot-1' })); f.advance(11 * 60_000); f.service.plant(owner, f.input('p2', { cropType: 'rice', plotId: 'plot-2' }));
  assert.equal(f.service.harvest(owner, f.input('batch', { plotIds: ['plot-1','plot-2'] })).code, 'CROP_NOT_MATURE');
  assert.equal(f.service.itemCount(owner.ownerAccountId, 'carrot'), 0); assert.equal(f.service.snapshot(owner).data.plots[0].cropType, 'carrot'); f.db.close();
});
test("seed rewards require trusted receipts, dedupe the settlement and compose with rollback", () => {
  const f = setup(); const request = { actionId: 'reward-1', receiptId: 'battle-1', source: 'battle' };
  assert.equal(f.service.grantSeeds(owner, request).code, 'UNVERIFIED_REWARD');
  const proof = { ownerAccountId: owner.ownerAccountId, id: 'battle-1', source: 'battle', eligible: true };
  const granted = f.service.grantSeeds(owner, request, proof); assert.equal(granted.ok, true); assert.equal(f.service.grantSeeds(owner, request, proof).replayed, true);
  assert.equal(f.service.grantSeeds(owner, { ...request, actionId: 'reward-2' }, proof).code, 'REWARD_ALREADY_CLAIMED');
  f.db.exec('BEGIN IMMEDIATE'); const extra = { actionId: 'reward-3', receiptId: 'battle-2', source: 'battle' }; assert.equal(f.service.grantSeeds(owner, extra, { ...proof, id: 'battle-2' }).ok, true); f.db.exec('ROLLBACK');
  assert.equal(f.db.prepare("SELECT 1 FROM garden_reward_receipts WHERE receipt_id='battle-2'").get(), undefined); f.db.close();
});
test("two database connections cannot duplicate a mature plot or overspend", () => {
  const f = setup(); const planted = f.service.plant(owner, f.input('plant-shared', { cropType: 'rice', plotId: 'plot-1' }));
  const db2 = database(f.file); const second = new GardenService({ db: db2, clock: () => planted.data.maturesAt + 1 }); f.advance(30 * 60_000);
  const expectedRevision = f.service.snapshot(owner).revision;
  assert.equal(f.service.harvest(owner, { actionId: 'device-a', expectedRevision, plotIds: ['plot-1'] }).ok, true);
  assert.equal(second.harvest(owner, { actionId: 'device-b', expectedRevision, plotIds: ['plot-1'] }).code, 'REVISION_CONFLICT');
  const revised = second.snapshot(owner).revision; assert.equal(second.craft(owner, { actionId: 'all-rice', expectedRevision: revised, recipeId: 'cooked_rice', quantity: 3 }).ok, true);
  assert.equal(f.service.craft(owner, f.input('one-too-many', { recipeId: 'cooked_rice', quantity: 1 })).code, 'INSUFFICIENT_ITEMS');
  assert.equal(second.itemCount(owner.ownerAccountId, 'rice'), 0); assert.equal(f.db.prepare('SELECT MIN(quantity) n FROM garden_items').get().n >= 0, true); db2.close(); f.db.close();
});
test("territory changes keep personal garden, crops and harvested items", () => {
  const f = setup(); f.service.plant(owner, f.input('keep-crop', { plotId: 'plot-1', cropType: 'carrot' }));
  assert.equal(f.service.garrison(owner, f.input('guard', { territoryId: 'lake', petId: f.pets[0].petId, expectedTerritoryRevision: 1 })).ok, true);
  f.territories.owner = 'new-owner';
  const after = f.service.snapshot(owner); assert.equal(after.data.plots.length, 6); assert.equal(after.data.plots[0].cropType, 'carrot'); assert.equal(after.data.territories[0].garrisonPetId, null);
  assert.equal(f.service.garrison(owner, f.input('lost-guard', { territoryId: 'lake', petId: f.pets[0].petId, expectedTerritoryRevision: 1 })).code, 'TERRITORY_NOT_OWNED');
  f.advance(11 * 60_000); assert.equal(f.service.harvest(owner, f.input('keep-yield', { plotIds: ['plot-1'] })).ok, true); assert.equal(f.service.itemCount(owner.ownerAccountId, 'carrot'), 4); f.db.close();
});
