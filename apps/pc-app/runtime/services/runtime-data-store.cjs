const { randomUUID } = require("node:crypto");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname } = require("node:path");

const DEFAULT_PET_ROSTER = [
  {
    id: "pet-001",
    serial: "0019001",
    name: { zh: "\u7130\u5c3e", en: "BlazeTail" },
    model: "../assets/models/Fox.glb",
    element: "fire",
    stats: "HP128 / ATK32 / DEF20 / SPD18",
    capturedAt: "2026-03-01 21:10",
    avatar: "\u7130",
    level: 1,
    experience: 0,
    winsTotal: 0
  },
  {
    id: "pet-002",
    serial: "0029001",
    name: { zh: "\u661f\u822a", en: "Astror" },
    model: "../assets/models/Astronaut.glb",
    element: "water",
    stats: "HP122 / ATK28 / DEF24 / SPD21",
    capturedAt: "2026-03-02 09:35",
    avatar: "\u661f",
    level: 1,
    experience: 0,
    winsTotal: 0
  },
  {
    id: "pet-003",
    serial: "0039001",
    name: { zh: "\u8349\u8e44", en: "Hoofleaf" },
    model: "../assets/models/Horse.glb",
    element: "wood",
    stats: "HP130 / ATK26 / DEF26 / SPD17",
    capturedAt: "2026-03-02 20:42",
    avatar: "\u8349",
    level: 1,
    experience: 0,
    winsTotal: 0
  },
  {
    id: "pet-004",
    serial: "0049001",
    name: { zh: "\u9510\u94e0", en: "IronGuard" },
    model: "../assets/models/CesiumMan.glb",
    element: "metal",
    stats: "HP135 / ATK30 / DEF30 / SPD12",
    capturedAt: "2026-03-03 08:20",
    avatar: "\u94e0",
    level: 1,
    experience: 0,
    winsTotal: 0
  },
  {
    id: "pet-005",
    serial: "0059001",
    name: { zh: "\u6708\u58e4", en: "MoonSoil" },
    model: "../assets/models/NeilArmstrong.glb",
    element: "earth",
    stats: "HP142 / ATK24 / DEF34 / SPD10",
    capturedAt: "2026-03-03 18:05",
    avatar: "\u58e4",
    level: 1,
    experience: 0,
    winsTotal: 0
  },
  {
    id: "pet-006",
    serial: "0069001",
    name: { zh: "\u5f8b\u52a8", en: "Groove" },
    model: "../assets/models/RobotExpressive.glb",
    element: "fire",
    stats: "HP118 / ATK33 / DEF22 / SPD20",
    capturedAt: "2026-03-04 12:11",
    avatar: "\u5f8b",
    level: 1,
    experience: 0,
    winsTotal: 0
  }
];

const DEFAULT_STATE_VERSION = 2;
const MAX_BATTLE_REPORTS = 60;
const DEFAULT_ACTIVE_PET_ID = DEFAULT_PET_ROSTER[0].id;
const DEFAULT_REPORT_LIMIT = 10;
const LEVEL_UP_REQUIRED_WINS = 5;

const ALLOWED_ELEMENTS = new Set(["metal", "wood", "earth", "water", "fire"]);
const ALLOWED_BATTLE_STATUS = new Set(["finished", "abandoned"]);
const ALLOWED_BATTLE_WINNERS = new Set(["player", "enemy", "draw"]);
const ALLOWED_BATTLE_MODES = new Set(["duel", "capture"]);

const MODEL_BY_ELEMENT = {
  fire: "../assets/models/Fox.glb",
  water: "../assets/models/Astronaut.glb",
  wood: "../assets/models/Horse.glb",
  metal: "../assets/models/CesiumMan.glb",
  earth: "../assets/models/NeilArmstrong.glb"
};

const SPECIES_META_BY_ELEMENT = {
  fire: {
    code: "001",
    name: { zh: "\u7130\u5c3e", en: "BlazeTail" },
    avatar: "\u7130"
  },
  water: {
    code: "002",
    name: { zh: "\u661f\u822a", en: "Astror" },
    avatar: "\u661f"
  },
  wood: {
    code: "003",
    name: { zh: "\u8349\u8e44", en: "Hoofleaf" },
    avatar: "\u8349"
  },
  metal: {
    code: "004",
    name: { zh: "\u9510\u94e0", en: "IronGuard" },
    avatar: "\u94e0"
  },
  earth: {
    code: "005",
    name: { zh: "\u6708\u58e4", en: "MoonSoil" },
    avatar: "\u58e4"
  }
};

class RuntimeDataStore {
  constructor(options = {}) {
    this.filePath = options.filePath;
    if (!this.filePath) {
      throw new Error("RuntimeDataStore requires filePath");
    }
    this.state = this.loadState();
  }

  getInventorySnapshot() {
    const pets = this.state.pets.map(clonePet);
    const activePetId = pets.some((pet) => pet.id === this.state.activePetId)
      ? this.state.activePetId
      : pets[0]?.id ?? null;
    return {
      pets,
      activePetId,
      updatedAt: this.state.updatedAt
    };
  }

  setActivePet(petId) {
    if (typeof petId !== "string" || petId.trim().length === 0) {
      throw new Error("invalid pet id");
    }
    const normalizedPetId = petId.trim();
    const exists = this.state.pets.some((pet) => pet.id === normalizedPetId);
    if (!exists) {
      throw new Error("pet id not found");
    }
    this.state.activePetId = normalizedPetId;
    this.state.updatedAt = new Date().toISOString();
    this.persistState();
    return this.getInventorySnapshot();
  }

  listBattleReports(limit = DEFAULT_REPORT_LIMIT) {
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || DEFAULT_REPORT_LIMIT));
    return this.state.battleReports.slice(0, safeLimit).map(cloneBattleReport);
  }

  saveBattleReport(input) {
    const report = normalizeBattleReport(input);
    const next = [report, ...this.state.battleReports.filter((item) => item.id !== report.id)];
    this.state.battleReports = next.slice(0, MAX_BATTLE_REPORTS);
    this.state.updatedAt = new Date().toISOString();
    this.persistState();
    return cloneBattleReport(report);
  }

  captureWildPet(input) {
    const captureInput = normalizeCaptureInput(input);
    const existingRecord = this.state.captureRecords.find(
      (item) => item.wildSerial === captureInput.wildSerial
    );
    if (existingRecord) {
      const existingPet = this.state.pets.find((pet) => pet.id === existingRecord.petId) || null;
      return {
        duplicate: true,
        pet: existingPet ? clonePet(existingPet) : null,
        captureRecord: { ...existingRecord }
      };
    }

    const nextPet = createCapturedPet(captureInput, this.state.pets.length + 1);
    const record = {
      id: `capture-${randomUUID()}`,
      wildPetId: captureInput.wildPetId,
      wildSerial: captureInput.wildSerial,
      petId: nextPet.id,
      rarity: captureInput.rarity,
      element: captureInput.element,
      capturedAt: captureInput.capturedAt
    };

    this.state.pets.push(nextPet);
    this.state.captureRecords = [record, ...this.state.captureRecords].slice(0, 500);
    this.state.updatedAt = new Date().toISOString();
    this.persistState();
    return {
      duplicate: false,
      pet: clonePet(nextPet),
      captureRecord: { ...record }
    };
  }

  recordBattleWin(petId) {
    if (typeof petId !== "string" || petId.trim().length === 0) {
      return { ok: false, error: "invalid pet id" };
    }
    const targetId = petId.trim();
    const pet = this.state.pets.find((item) => item.id === targetId);
    if (!pet) {
      return { ok: false, error: "pet not found" };
    }

    const previousLevel = sanitizeLevel(pet.level);
    const previousExp = sanitizeExperience(pet.experience);
    let nextLevel = previousLevel;
    let nextExp = previousExp + 1;
    const nextWinsTotal = sanitizeWinsTotal(pet.winsTotal) + 1;
    let leveledUp = false;

    while (nextExp >= LEVEL_UP_REQUIRED_WINS) {
      nextExp -= LEVEL_UP_REQUIRED_WINS;
      nextLevel += 1;
      leveledUp = true;
      pet.stats = applyLevelBonus(pet.element, pet.stats);
    }

    pet.level = nextLevel;
    pet.experience = nextExp;
    pet.winsTotal = nextWinsTotal;
    this.state.updatedAt = new Date().toISOString();
    this.persistState();
    return {
      ok: true,
      leveledUp,
      previousLevel,
      currentLevel: nextLevel,
      currentExperience: nextExp,
      pet: clonePet(pet)
    };
  }

  loadState() {
    if (!existsSync(this.filePath)) {
      const defaults = createDefaultState();
      this.persistRaw(defaults);
      return defaults;
    }

    try {
      const raw = readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      const normalized = normalizeRuntimeState(parsed);
      this.persistRaw(normalized);
      return normalized;
    } catch {
      const defaults = createDefaultState();
      this.persistRaw(defaults);
      return defaults;
    }
  }

  persistState() {
    this.persistRaw(this.state);
  }

  persistRaw(state) {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(state, null, 2), "utf8");
  }
}

function createDefaultState() {
  const createdAt = new Date().toISOString();
  return {
    version: DEFAULT_STATE_VERSION,
    pets: DEFAULT_PET_ROSTER.map(clonePet),
    activePetId: DEFAULT_ACTIVE_PET_ID,
    battleReports: [],
    captureRecords: [],
    createdAt,
    updatedAt: createdAt
  };
}

function normalizeRuntimeState(input) {
  const base = createDefaultState();
  const pets = normalizePetList(input?.pets);
  const activePetId = pets.some((pet) => pet.id === input?.activePetId)
    ? input.activePetId
    : pets[0]?.id ?? DEFAULT_ACTIVE_PET_ID;
  const battleReports = normalizeBattleReports(input?.battleReports);
  return {
    version: DEFAULT_STATE_VERSION,
    pets,
    activePetId,
    battleReports,
    captureRecords: normalizeCaptureRecords(input?.captureRecords),
    createdAt: isIsoDate(input?.createdAt) ? input.createdAt : base.createdAt,
    updatedAt: isIsoDate(input?.updatedAt) ? input.updatedAt : new Date().toISOString()
  };
}

function normalizePetList(input) {
  if (!Array.isArray(input)) {
    return DEFAULT_PET_ROSTER.map(clonePet);
  }
  const unique = new Map();
  const legacySerialCounters = new Map();
  for (const candidate of input) {
    const pet = normalizePet(candidate, legacySerialCounters);
    if (!pet) continue;
    if (!unique.has(pet.id)) {
      unique.set(pet.id, pet);
    }
  }
  const normalized = [...unique.values()];
  return normalized.length > 0 ? normalized : DEFAULT_PET_ROSTER.map(clonePet);
}

function normalizePet(input, legacySerialCounters = new Map()) {
  if (!input || typeof input !== "object") return null;
  if (typeof input.id !== "string" || input.id.trim().length === 0) return null;
  const element = ALLOWED_ELEMENTS.has(input.element) ? input.element : "metal";
  const speciesMeta = getSpeciesMeta(element);
  const nameZh =
    typeof input.name?.zh === "string" && input.name.zh.trim().length > 0 ? input.name.zh.trim() : null;
  const nameEn =
    typeof input.name?.en === "string" && input.name.en.trim().length > 0 ? input.name.en.trim() : null;
  const name = normalizePetName(nameZh, nameEn, speciesMeta);
  const serial = normalizePetSerial(input.serial, speciesMeta, legacySerialCounters);

  return {
    id: input.id.trim(),
    serial,
    name,
    model:
      typeof input.model === "string" && input.model.trim().length > 0
        ? input.model.trim()
        : MODEL_BY_ELEMENT[element],
    element,
    stats: typeof input.stats === "string" && input.stats.trim().length > 0 ? input.stats.trim() : "N/A",
    capturedAt:
      typeof input.capturedAt === "string" && input.capturedAt.trim().length > 0
        ? input.capturedAt.trim()
        : new Date().toISOString().slice(0, 19).replace("T", " "),
    avatar:
      typeof input.avatar === "string" && input.avatar.trim().length > 0
        ? input.avatar.trim().slice(0, 2)
        : speciesMeta.avatar,
    level: sanitizeLevel(input.level),
    experience: sanitizeExperience(input.experience),
    winsTotal: sanitizeWinsTotal(input.winsTotal)
  };
}

function getSpeciesMeta(element) {
  return SPECIES_META_BY_ELEMENT[element] || SPECIES_META_BY_ELEMENT.fire;
}

function normalizePetName(nameZh, nameEn, speciesMeta) {
  const hasLegacyZh = typeof nameZh === "string" && nameZh.includes("\u7075\u5ba0");
  const hasLegacyEn =
    typeof nameEn === "string" &&
    /pet/i.test(nameEn) &&
    /(fire|water|wood|metal|earth)/i.test(nameEn);

  if (hasLegacyZh || hasLegacyEn) {
    return {
      zh: speciesMeta.name.zh,
      en: speciesMeta.name.en
    };
  }

  return {
    zh: nameZh || nameEn || speciesMeta.name.zh,
    en: nameEn || nameZh || speciesMeta.name.en
  };
}

function normalizePetSerial(serialInput, speciesMeta, legacySerialCounters) {
  const serial =
    typeof serialInput === "string" && serialInput.trim().length > 0 ? serialInput.trim() : "";
  if (/^\d{7}$/.test(serial)) {
    return serial;
  }

  const previous = Number(legacySerialCounters.get(speciesMeta.code) || 9000);
  const next = previous + 1;
  legacySerialCounters.set(speciesMeta.code, next);
  return `${speciesMeta.code}${String(next).padStart(4, "0")}`;
}

function sanitizeLevel(input) {
  const parsed = Number(input);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return parsed;
}

function sanitizeExperience(input) {
  const parsed = Number(input);
  if (!Number.isInteger(parsed) || parsed < 0) return 0;
  return parsed % LEVEL_UP_REQUIRED_WINS;
}

function sanitizeWinsTotal(input) {
  const parsed = Number(input);
  if (!Number.isInteger(parsed) || parsed < 0) return 0;
  return parsed;
}

function normalizeBattleReports(input) {
  if (!Array.isArray(input)) return [];
  const normalized = [];
  const unique = new Set();
  for (const candidate of input) {
    const report = normalizeBattleReport(candidate);
    if (unique.has(report.id)) continue;
    unique.add(report.id);
    normalized.push(report);
    if (normalized.length >= MAX_BATTLE_REPORTS) break;
  }
  return normalized.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function normalizeBattleReport(input) {
  const reportId =
    typeof input?.id === "string" && input.id.trim().length > 0 ? input.id.trim() : `br-${randomUUID()}`;
  const sessionId =
    typeof input?.sessionId === "string" && input.sessionId.trim().length > 0
      ? input.sessionId.trim()
      : `session-${randomUUID()}`;
  const startedAt = isIsoDate(input?.startedAt) ? input.startedAt : new Date().toISOString();
  const endedAt = isIsoDate(input?.endedAt) ? input.endedAt : new Date().toISOString();
  const status = ALLOWED_BATTLE_STATUS.has(input?.status) ? input.status : "finished";
  const winner = ALLOWED_BATTLE_WINNERS.has(input?.winner) ? input.winner : null;
  const mode = ALLOWED_BATTLE_MODES.has(input?.mode) ? input.mode : "duel";
  const captureSuccess =
    typeof input?.captureSuccess === "boolean" ? input.captureSuccess : null;
  const captureSerial =
    typeof input?.captureSerial === "string" && input.captureSerial.trim().length > 0
      ? input.captureSerial.trim()
      : null;
  const rounds = Array.isArray(input?.rounds)
    ? input.rounds
        .map((round) => normalizeBattleRound(round))
        .filter(Boolean)
        .sort((a, b) => a.round - b.round)
    : [];

  return {
    id: reportId,
    sessionId,
    status,
    winner,
    mode,
    captureSuccess,
    captureSerial,
    startedAt,
    endedAt,
    totalRounds: rounds.length,
    player: normalizeBattleSide(input?.player, "player"),
    enemy: normalizeBattleSide(input?.enemy, "enemy"),
    rounds
  };
}

function normalizeBattleSide(input, fallbackRole) {
  return {
    petId: typeof input?.petId === "string" && input.petId.trim().length > 0 ? input.petId.trim() : null,
    petName:
      typeof input?.petName === "string" && input.petName.trim().length > 0
        ? input.petName.trim()
        : fallbackRole === "player"
          ? "Player"
          : "Enemy",
    element: ALLOWED_ELEMENTS.has(input?.element) ? input.element : "metal"
  };
}

function normalizeBattleRound(input) {
  if (!input || typeof input !== "object") return null;
  const round = Number(input.round);
  if (!Number.isInteger(round) || round <= 0) return null;
  const playerAction =
    typeof input.playerAction === "string" && input.playerAction.trim().length > 0
      ? input.playerAction.trim()
      : "normal_attack";
  const enemyAction =
    typeof input.enemyAction === "string" && input.enemyAction.trim().length > 0
      ? input.enemyAction.trim()
      : "normal_attack";
  return {
    round,
    playerAction,
    enemyAction,
    damageTaken: {
      player: clampNonNegativeNumber(input.damageTaken?.player),
      enemy: clampNonNegativeNumber(input.damageTaken?.enemy)
    },
    winner: ALLOWED_BATTLE_WINNERS.has(input.winner) ? input.winner : null,
    notes: Array.isArray(input.notes)
      ? input.notes.filter((item) => typeof item === "string" && item.length > 0).slice(0, 8)
      : []
  };
}

function normalizeCaptureRecords(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => normalizeCaptureRecord(item))
    .filter(Boolean)
    .slice(0, 500);
}

function normalizeCaptureRecord(input) {
  if (!input || typeof input !== "object") return null;
  if (typeof input.wildSerial !== "string" || input.wildSerial.trim().length === 0) return null;
  if (typeof input.petId !== "string" || input.petId.trim().length === 0) return null;
  return {
    id:
      typeof input.id === "string" && input.id.trim().length > 0
        ? input.id.trim()
        : `capture-${randomUUID()}`,
    wildPetId:
      typeof input.wildPetId === "string" && input.wildPetId.trim().length > 0
        ? input.wildPetId.trim()
        : `wild-${randomUUID()}`,
    wildSerial: input.wildSerial.trim(),
    petId: input.petId.trim(),
    rarity:
      input.rarity === "epic" || input.rarity === "rare" || input.rarity === "common"
        ? input.rarity
        : "common",
    element: ALLOWED_ELEMENTS.has(input.element) ? input.element : "metal",
    capturedAt:
      typeof input.capturedAt === "string" && input.capturedAt.trim().length > 0
        ? input.capturedAt.trim()
        : new Date().toISOString().slice(0, 19).replace("T", " ")
  };
}

function normalizeCaptureInput(input) {
  const wildPetId =
    typeof input?.wildPetId === "string" && input.wildPetId.trim().length > 0
      ? input.wildPetId.trim()
      : `wild-${randomUUID()}`;
  const wildSerial =
    typeof input?.wildSerial === "string" && input.wildSerial.trim().length > 0
      ? input.wildSerial.trim()
      : `999${String(Date.now() % 10000).padStart(4, "0")}`;
  const element = ALLOWED_ELEMENTS.has(input?.element) ? input.element : "metal";
  const rarity =
    input?.rarity === "epic" || input?.rarity === "rare" || input?.rarity === "common"
      ? input.rarity
      : "common";
  const nameZh =
    typeof input?.name?.zh === "string" && input.name.zh.trim().length > 0
      ? input.name.zh.trim()
      : "\u65b0\u6536\u7559\u5ba0\u7269";
  const nameEn =
    typeof input?.name?.en === "string" && input.name.en.trim().length > 0
      ? input.name.en.trim()
      : "CapturedPet";
  const model =
    typeof input?.model === "string" && input.model.trim().length > 0
      ? input.model.trim()
      : MODEL_BY_ELEMENT[element];
  const capturedAt =
    typeof input?.capturedAt === "string" && input.capturedAt.trim().length > 0
      ? input.capturedAt.trim()
      : new Date().toISOString().slice(0, 19).replace("T", " ");
  const avatar =
    typeof input?.avatar === "string" && input.avatar.trim().length > 0
      ? input.avatar.trim().slice(0, 2)
      : nameZh.slice(0, 1);

  return {
    wildPetId,
    wildSerial,
    element,
    rarity,
    name: { zh: nameZh, en: nameEn },
    model,
    capturedAt,
    avatar
  };
}

function createCapturedPet(captureInput, seqNo) {
  const rarityRatio =
    captureInput.rarity === "epic" ? 1.2 : captureInput.rarity === "rare" ? 1.1 : 1;
  const baseStats = {
    fire: { hp: 118, atk: 33, def: 20, spd: 22 },
    water: { hp: 124, atk: 28, def: 24, spd: 20 },
    wood: { hp: 130, atk: 26, def: 26, spd: 18 },
    metal: { hp: 136, atk: 30, def: 30, spd: 13 },
    earth: { hp: 142, atk: 24, def: 34, spd: 11 }
  }[captureInput.element] || { hp: 120, atk: 30, def: 24, spd: 18 };

  const hp = Math.round(baseStats.hp * rarityRatio);
  const atk = Math.round(baseStats.atk * rarityRatio);
  const def = Math.round(baseStats.def * rarityRatio);
  const spd = Math.round(baseStats.spd * rarityRatio);

  return {
    id: `pet-${randomUUID()}`,
    serial: captureInput.wildSerial,
    name: {
      zh: captureInput.name.zh,
      en: captureInput.name.en
    },
    model: captureInput.model,
    element: captureInput.element,
    stats: `HP${hp} / ATK${atk} / DEF${def} / SPD${spd}`,
    capturedAt: captureInput.capturedAt,
    avatar: captureInput.avatar || String(seqNo),
    level: 1,
    experience: 0,
    winsTotal: 0
  };
}

function applyLevelBonus(element, statsText) {
  const stats = parseStatsText(statsText);
  if (!stats) return statsText;
  if (element === "fire") {
    stats.ATK += 2;
  } else if (element === "water") {
    stats.SPD += 1;
    stats.HP += 1;
  } else if (element === "wood") {
    stats.HP += 4;
  } else if (element === "metal") {
    stats.DEF += 2;
  } else if (element === "earth") {
    stats.HP += 3;
    stats.DEF += 1;
  }
  return formatStats(stats);
}

function parseStatsText(statsText) {
  if (typeof statsText !== "string" || statsText.length === 0) return null;
  const entries = statsText.split("/").map((item) => item.trim());
  const stats = {
    HP: 0,
    ATK: 0,
    DEF: 0,
    SPD: 0
  };
  for (const entry of entries) {
    const matched = entry.match(/^(HP|ATK|DEF|SPD)\s*([0-9]+)$/i);
    if (!matched) continue;
    const key = matched[1].toUpperCase();
    const value = Number(matched[2]);
    if (!Number.isFinite(value)) continue;
    stats[key] = value;
  }
  return stats;
}

function formatStats(stats) {
  return `HP${stats.HP} / ATK${stats.ATK} / DEF${stats.DEF} / SPD${stats.SPD}`;
}

function clampNonNegativeNumber(input) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed);
}

function isIsoDate(input) {
  return typeof input === "string" && input.trim().length >= 16 && !Number.isNaN(Date.parse(input));
}

function clonePet(pet) {
  return {
    id: pet.id,
    serial: pet.serial,
    name: { zh: pet.name.zh, en: pet.name.en },
    model: pet.model,
    element: pet.element,
    stats: pet.stats,
    capturedAt: pet.capturedAt,
    avatar: pet.avatar,
    level: sanitizeLevel(pet.level),
    experience: sanitizeExperience(pet.experience),
    winsTotal: sanitizeWinsTotal(pet.winsTotal)
  };
}

function cloneBattleReport(report) {
  return {
    ...report,
    player: { ...report.player },
    enemy: { ...report.enemy },
    rounds: report.rounds.map((round) => ({
      ...round,
      damageTaken: { ...round.damageTaken },
      notes: [...round.notes]
    }))
  };
}

module.exports = {
  DEFAULT_PET_ROSTER,
  RuntimeDataStore
};
