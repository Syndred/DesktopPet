const { createHash, randomUUID } = require('node:crypto');
const { listTemplates, findTemplate, BASE_STATS } = require('./templates.cjs');

class CompanionError extends Error {
  constructor(code, message, revision) { super(message); this.code = code; this.revision = revision; }
}
const invalid = message => { throw new CompanionError('INVALID_INPUT', message); };
const clone = value => JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
function identifier(value, label = '标识') {
  if (typeof value !== 'string' || !value.trim() || value.length > 200 || /[\u0000-\u001f\u007f]/u.test(value)) invalid(`${label}无效`);
  return value.trim();
}
function petName(value) {
  if (typeof value !== 'string' || !value.trim() || [...value.trim()].length > 24 || /[\u0000-\u001f\u007f]/u.test(value)) invalid('名字需为 1–24 个字符');
  return value.trim();
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]));
  return value;
}
function hash(value) { return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }
function integer(value, fallback, min = 0, max = 1e9) { return Number.isSafeInteger(value) ? clamp(value, min, max) : fallback; }
function parseStats(value, fallback) {
  if (value && typeof value === 'object') return Object.fromEntries(['hp','atk','def','spd'].map(key => [key, integer(value[key], fallback[key])]));
  const result = { ...fallback };
  if (typeof value === 'string') for (const match of value.matchAll(/(HP|ATK|DEF|SPD)\s*(\d+)/gi)) result[match[1].toLowerCase()] = integer(Number(match[2]), 0);
  return result;
}

/** SAVEPOINTs compose with garden's transaction and work with both supported SQLite drivers. */
function atomic(db, fn) {
  const point = `companions_${randomUUID().replaceAll('-', '')}`;
  db.exec(`SAVEPOINT ${point}`);
  try {
    const result = fn();
    if (result && typeof result.then === 'function') throw new Error('Companion transactions must be synchronous');
    db.exec(`RELEASE SAVEPOINT ${point}`);
    return result;
  } catch (error) {
    db.exec(`ROLLBACK TO SAVEPOINT ${point}`);
    db.exec(`RELEASE SAVEPOINT ${point}`);
    throw error;
  }
}

class CompanionsService {
  constructor({ db, now = () => new Date(), uuid = randomUUID, templates = listTemplates, resolveTemplate = findTemplate }) {
    if (!db?.prepare || !db?.exec) throw new Error('Companions require the host SQLite connection');
    this.db = db; this.now = now; this.uuid = uuid; this.templates = templates; this.resolveTemplate = resolveTemplate;
  }

  account(ownerAccountId) {
    const owner = identifier(ownerAccountId, '账号');
    this.db.prepare('INSERT OR IGNORE INTO companion_accounts(owner_account_id) VALUES (?)').run(owner);
    return this.db.prepare('SELECT * FROM companion_accounts WHERE owner_account_id = ?').get(owner);
  }

  requirePet(ownerAccountId, petId, expectedRevision) {
    const owner = identifier(ownerAccountId, '账号');
    const id = identifier(petId, '伙伴');
    const row = this.db.prepare('SELECT * FROM companion_pets WHERE owner_account_id = ? AND pet_id = ?').get(owner, id);
    if (!row) throw new CompanionError('PET_NOT_FOUND', '找不到这只伙伴');
    if (expectedRevision !== undefined && (!Number.isSafeInteger(expectedRevision) || expectedRevision !== row.revision)) throw new CompanionError('REVISION_CONFLICT', '伙伴状态已更新，请刷新后重试', row.revision);
    return JSON.parse(row.data_json);
  }

  selections(ownerAccountId) { return JSON.parse(this.account(ownerAccountId).selections_json); }

  snapshot(ownerAccountId) {
    const account = this.account(ownerAccountId);
    const pets = this.db.prepare('SELECT data_json FROM companion_pets WHERE owner_account_id = ? ORDER BY created_at, pet_id').all(ownerAccountId).map(row => JSON.parse(row.data_json));
    return { ok: true, data: { ownerAccountId, pets, selections: JSON.parse(account.selections_json), templates: this.templates(), revision: account.revision }, revision: account.revision };
  }

  storePet(pet, insert = false) {
    if (insert) {
      this.db.prepare('INSERT INTO companion_pets(owner_account_id, pet_id, template_id, revision, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(pet.ownerAccountId, pet.petId, pet.templateId, pet.revision, JSON.stringify(pet), pet.createdAt, pet.updatedAt);
    } else {
      const previousRevision = pet.revision;
      pet.revision += 1;
      pet.updatedAt = this.now().toISOString();
      const result = this.db.prepare('UPDATE companion_pets SET revision = ?, data_json = ?, updated_at = ? WHERE owner_account_id = ? AND pet_id = ? AND revision = ?')
        .run(pet.revision, JSON.stringify(pet), pet.updatedAt, pet.ownerAccountId, pet.petId, previousRevision);
      if (Number(result.changes) !== 1) throw new CompanionError('REVISION_CONFLICT', '伙伴状态已更新，请刷新后重试');
    }
  }

  action(ownerAccountId, operation, input, mutate) {
    identifier(ownerAccountId, '账号');
    const actionId = identifier(input?.actionId, '操作编号');
    const requestHash = hash(input);
    return atomic(this.db, () => {
      const previous = this.db.prepare('SELECT * FROM companion_actions WHERE owner_account_id = ? AND action_id = ?').get(ownerAccountId, actionId);
      if (previous) {
        if (previous.operation !== operation || previous.request_hash !== requestHash) throw new CompanionError('ACTION_ID_CONFLICT', '此操作编号已用于其他请求');
        return { ...JSON.parse(previous.result_json), duplicate: true };
      }
      this.account(ownerAccountId);
      const data = mutate();
      this.db.prepare('UPDATE companion_accounts SET revision = revision + 1 WHERE owner_account_id = ?').run(ownerAccountId);
      const revision = this.account(ownerAccountId).revision;
      const result = { ok: true, data, revision, duplicate: false };
      this.db.prepare('INSERT INTO companion_actions(owner_account_id, action_id, operation, request_hash, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(ownerAccountId, actionId, operation, requestHash, JSON.stringify(result), this.now().toISOString());
      return result;
    });
  }

  newPet(ownerAccountId, template, input, source) {
    const createdAt = this.now().toISOString();
    const petId = `pet-${this.uuid()}`;
    const count = Number(this.db.prepare('SELECT COUNT(*) AS count FROM companion_pets WHERE owner_account_id = ?').get(ownerAccountId).count);
    return {
      ownerAccountId, petId, templateId: template.templateId, name: petName(input.name || template.name),
      serial: source === 'capture' && input.origin?.wildSerial ? String(input.origin.wildSerial) : petId.slice(4, 12).toUpperCase(),
      element: template.element, resource: clone(template.resource), source, origin: clone(input.origin || {}),
      growth: { level: 1, experience: 0, mood: 60, satiety: 60, affinity: 0, winsTotal: 0, stats: clone(template.baseStats) },
      desktop: { visible: Boolean(input.showOnDesktop), behavior: 'quiet', scale: 1, position: { x: 80 + (count % 5) * 240, y: 520 - Math.floor(count / 5) * 50, displayId: null } },
      revision: 1, createdAt, updatedAt: createdAt
    };
  }

  adopt(ownerAccountId, input) {
    return this.action(ownerAccountId, 'adopt', input, () => {
      const template = this.resolveTemplate(identifier(input.templateId, '角色模板'));
      if (!template) throw new CompanionError('TEMPLATE_NOT_FOUND', '角色模板不可用');
      petName(input.name);
      if (typeof input.showOnDesktop !== 'boolean') invalid('请选择是否放到桌面');
      const pet = this.newPet(ownerAccountId, template, input, 'adoption');
      this.storePet(pet, true);
      return { pet, selections: this.selections(ownerAccountId) };
    });
  }

  /** Trusted discovery adapter, called only after battle/capture settlement. Not an IPC command. */
  createCapturedInstance(ownerAccountId, input) {
    return this.action(ownerAccountId, 'capture', input, () => {
      if (!input.origin?.wildPetId || !input.origin?.wildSerial || !input.origin?.battleId) invalid('收服记录缺少遭遇与战斗凭据');
      const battleId = identifier(input.origin.battleId, '战斗凭据');
      const wildPetId = identifier(input.origin.wildPetId, '野外伙伴');
      const receipt = this.db.prepare('SELECT pet_id FROM companion_capture_receipts WHERE owner_account_id = ? AND battle_id = ? AND wild_pet_id = ?').get(ownerAccountId, battleId, wildPetId);
      if (receipt) return { pet: this.requirePet(ownerAccountId, receipt.pet_id), selections: this.selections(ownerAccountId), captureDuplicate: true };
      const template = this.resolveTemplate(identifier(input.templateId, '角色模板'));
      if (!template) throw new CompanionError('TEMPLATE_NOT_FOUND', '角色模板不可用');
      const pet = this.newPet(ownerAccountId, template, input, 'capture');
      if (input.element !== undefined) {
        if (!Object.hasOwn(BASE_STATS, input.element)) invalid('收服元素无效');
        pet.element = input.element;
        pet.growth.stats = clone(BASE_STATS[input.element]);
      }
      if (input.stats) pet.growth.stats = parseStats(input.stats, pet.growth.stats);
      this.storePet(pet, true);
      this.db.prepare('INSERT INTO companion_capture_receipts(owner_account_id, battle_id, wild_pet_id, pet_id) VALUES (?, ?, ?, ?)').run(ownerAccountId, battleId, wildPetId, pet.petId);
      return { pet, selections: this.selections(ownerAccountId) };
    });
  }

  rename(ownerAccountId, input) {
    return this.action(ownerAccountId, 'rename', input, () => {
      const pet = this.requirePet(ownerAccountId, input.petId, input.expectedRevision);
      pet.name = petName(input.name);
      this.storePet(pet);
      return { pet, selections: this.selections(ownerAccountId) };
    });
  }

  updateDesktop(ownerAccountId, input) {
    return this.action(ownerAccountId, 'desktop', input, () => {
      const pet = this.requirePet(ownerAccountId, input.petId, input.expectedRevision);
      if (input.visible !== undefined) { if (typeof input.visible !== 'boolean') invalid('桌面显示状态无效'); pet.desktop.visible = input.visible; }
      if (input.behavior !== undefined) { if (!['wander', 'quiet', 'follow', 'sleep'].includes(input.behavior)) invalid('行为模式无效'); pet.desktop.behavior = input.behavior; }
      if (input.scale !== undefined) { if (!Number.isFinite(input.scale) || input.scale < 0.5 || input.scale > 2) invalid('外观大小需为 50%–200%'); pet.desktop.scale = input.scale; }
      if (input.position !== undefined) {
        const position = input.position;
        if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y) || Math.abs(position.x) > 100000 || Math.abs(position.y) > 100000) invalid('桌面位置无效');
        if (position.displayId !== null && position.displayId !== undefined && (typeof position.displayId !== 'string' || position.displayId.length > 100)) invalid('显示器标识无效');
        pet.desktop.position = { x: Math.round(position.x), y: Math.round(position.y), displayId: position.displayId || null };
      }
      if (['visible', 'behavior', 'scale', 'position'].every(key => input[key] === undefined)) invalid('未提供桌面修改');
      this.storePet(pet);
      return { pet, selections: this.selections(ownerAccountId) };
    });
  }

  select(ownerAccountId, input) {
    return this.action(ownerAccountId, 'select', input, () => {
      if (!['chatPetId', 'battlePetId', 'guardPetId'].includes(input.slot)) invalid('选择类型无效');
      const pet = this.requirePet(ownerAccountId, input.petId, input.expectedRevision);
      const selections = this.selections(ownerAccountId);
      selections[input.slot] = pet.petId;
      this.db.prepare('UPDATE companion_accounts SET selections_json = ? WHERE owner_account_id = ?').run(JSON.stringify(selections), ownerAccountId);
      return { pet, selections };
    });
  }

  applyEffect(pet, effect) {
    for (const key of Object.keys(effect)) if (!['mood', 'satiety', 'affinity', 'experience', 'wins'].includes(key)) invalid('不支持的养成效果');
    for (const key of ['mood', 'satiety', 'affinity', 'experience', 'wins']) {
      if (effect[key] !== undefined && (!Number.isSafeInteger(effect[key]) || Math.abs(effect[key]) > 10000)) invalid('养成效果无效');
    }
    for (const key of ['mood', 'satiety', 'affinity']) pet.growth[key] = clamp(pet.growth[key] + (effect[key] || 0), 0, 100);
    if ((effect.experience || 0) < 0 || (effect.wins || 0) < 0) invalid('经验与胜场不能减少');
    let experience = pet.growth.experience + (effect.experience || 0);
    // Existing runtime rule: 100 XP per level, every stat +10% (at least +1).
    while (experience >= 100) {
      experience -= 100;
      pet.growth.level += 1;
      for (const key of ['hp', 'atk', 'def', 'spd']) {
        const value = pet.growth.stats[key];
        pet.growth.stats[key] = value <= 0 ? 0 : Math.max(value + 1, Math.round(value * 1.1));
      }
    }
    pet.growth.experience = experience;
    pet.growth.winsTotal += effect.wins || 0;
    this.storePet(pet);
  }

  /** Uses this.db, so a caller's inventory debit and this update share one SQLite transaction. */
  applyGrowthInTransaction(ownerAccountId, input) {
    return this.action(ownerAccountId, 'growth', input, () => {
      const pet = this.requirePet(ownerAccountId, input.petId, input.expectedRevision);
      if (!input.effect || typeof input.effect !== 'object' || Array.isArray(input.effect)) invalid('养成效果无效');
      this.applyEffect(pet, input.effect);
      return { pet, selections: this.selections(ownerAccountId) };
    });
  }

  interact(ownerAccountId, input) {
    return this.action(ownerAccountId, 'interact', input, () => {
      const pet = this.requirePet(ownerAccountId, input.petId, input.expectedRevision);
      const now = this.now().getTime();
      const previous = this.db.prepare('SELECT last_interacted_at FROM companion_interactions WHERE owner_account_id = ? AND pet_id = ?').get(ownerAccountId, pet.petId);
      if (previous && now - previous.last_interacted_at < 10000) throw new CompanionError('RATE_LIMITED', '伙伴感受到你的心意了，稍等片刻再摸摸吧');
      this.db.prepare('INSERT INTO companion_interactions(owner_account_id, pet_id, last_interacted_at) VALUES (?, ?, ?) ON CONFLICT(owner_account_id, pet_id) DO UPDATE SET last_interacted_at = excluded.last_interacted_at').run(ownerAccountId, pet.petId, now);
      this.applyEffect(pet, { mood: 2, affinity: 1 });
      return { pet, selections: this.selections(ownerAccountId) };
    });
  }

  /** Import only an explicitly owner-scoped legacy inventory. The old file and history remain intact. */
  importLegacyInventory(ownerAccountId, inventory) {
    return atomic(this.db, () => {
      const account = this.account(ownerAccountId);
      if (account.legacy_imported_at) return { imported: 0, alreadyImported: true };
      if (!inventory || !Array.isArray(inventory.pets)) invalid('旧存档格式无效');
      let imported = 0;
      const now = this.now().toISOString();
      for (const legacy of inventory.pets) {
        const petId = identifier(legacy.id, '旧伙伴');
        if (this.db.prepare('SELECT 1 FROM companion_pets WHERE owner_account_id = ? AND pet_id = ?').get(ownerAccountId, petId)) continue;
        const element = BASE_STATS[legacy.element] ? legacy.element : 'water';
        const model = typeof legacy.model === 'string' ? legacy.model : '';
        const known = this.templates().find(template => template.resource.legacyModel === model);
        const pet = {
          ownerAccountId, petId, templateId: known?.templateId || `legacy:${hash({ model, element }).slice(0, 16)}`,
          name: petName(typeof legacy.name === 'string' ? legacy.name : legacy.name?.zh || legacy.name?.en || '伙伴'),
          serial: String(legacy.serial || petId), element,
          resource: known ? clone(known.resource) : { resourceId: /\.(glb|gltf)$/i.test(model) ? `legacy:${model.split(/[\\/]/).pop().toLowerCase()}` : `legacy:${hash(model).slice(0, 16)}`, kind: '3d', legacyModel: model },
          source: 'legacy', origin: { legacyPetId: petId, capturedAt: legacy.capturedAt || null },
          growth: { level: integer(legacy.level, 1, 1), experience: integer(legacy.experience, 0), mood: integer(legacy.mood, 60, 0, 100), satiety: integer(legacy.satiety, 60, 0, 100), affinity: integer(legacy.affinity, 0, 0, 100), winsTotal: integer(legacy.winsTotal, 0), stats: parseStats(legacy.stats, BASE_STATS[element]) },
          desktop: { visible: false, behavior: 'quiet', scale: 1, position: { x: 80 + (imported % 5) * 240, y: 520, displayId: null } },
          revision: 1, createdAt: now, updatedAt: now
        };
        this.storePet(pet, true);
        this.db.prepare('INSERT OR IGNORE INTO companion_legacy_archive(owner_account_id, legacy_pet_id, source_json, imported_at) VALUES (?, ?, ?, ?)').run(ownerAccountId, petId, JSON.stringify(legacy), now);
        imported += 1;
      }
      const selections = JSON.parse(account.selections_json);
      if (!selections.battlePetId && inventory.activePetId) {
        const row = this.db.prepare('SELECT data_json FROM companion_pets WHERE owner_account_id = ? AND pet_id = ?').get(ownerAccountId, inventory.activePetId);
        if (row && JSON.parse(row.data_json).resource.kind === '2d') selections.battlePetId = inventory.activePetId;
      }
      this.db.prepare('UPDATE companion_accounts SET legacy_imported_at = ?, revision = revision + 1, selections_json = ? WHERE owner_account_id = ?').run(now, JSON.stringify(selections), ownerAccountId);
      return { imported, alreadyImported: false };
    });
  }
}

function toLegacyPet(pet) {
  const stats = pet.growth.stats;
  return { id: pet.petId, serial: pet.serial, name: { zh: pet.name, en: pet.name }, model: pet.resource.legacyModel || null, element: pet.element,
    stats: `HP${stats.hp} / ATK${stats.atk} / DEF${stats.def} / SPD${stats.spd}`, capturedAt: pet.origin.capturedAt || pet.createdAt,
    avatar: [...pet.name].slice(0, 1).join(''), level: pet.growth.level, experience: pet.growth.experience, mood: pet.growth.mood, winsTotal: pet.growth.winsTotal };
}

module.exports = { CompanionsService, CompanionError, atomic, toLegacyPet };
