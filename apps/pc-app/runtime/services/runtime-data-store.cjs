const { randomUUID } = require("node:crypto");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname } = require("node:path");

const DEFAULT_PET_ROSTER = [
  {
    id: "pet-001",
    serial: "QP-202603-001",
    name: { zh: "焰尾", en: "BlazeTail" },
    model: "../assets/models/Fox.glb",
    element: "fire",
    stats: "HP128 / ATK32 / DEF20 / SPD18",
    capturedAt: "2026-03-01 21:10",
    avatar: "焰"
  },
  {
    id: "pet-002",
    serial: "QP-202603-002",
    name: { zh: "星航", en: "Astror" },
    model: "../assets/models/Astronaut.glb",
    element: "water",
    stats: "HP122 / ATK28 / DEF24 / SPD21",
    capturedAt: "2026-03-02 09:35",
    avatar: "星"
  },
  {
    id: "pet-003",
    serial: "QP-202603-003",
    name: { zh: "草蹄", en: "Hoofleaf" },
    model: "../assets/models/Horse.glb",
    element: "wood",
    stats: "HP130 / ATK26 / DEF26 / SPD17",
    capturedAt: "2026-03-02 20:42",
    avatar: "草"
  },
  {
    id: "pet-004",
    serial: "QP-202603-004",
    name: { zh: "锐铠", en: "IronGuard" },
    model: "../assets/models/CesiumMan.glb",
    element: "metal",
    stats: "HP135 / ATK30 / DEF30 / SPD12",
    capturedAt: "2026-03-03 08:20",
    avatar: "铠"
  },
  {
    id: "pet-005",
    serial: "QP-202603-005",
    name: { zh: "月壤", en: "MoonSoil" },
    model: "../assets/models/NeilArmstrong.glb",
    element: "earth",
    stats: "HP142 / ATK24 / DEF34 / SPD10",
    capturedAt: "2026-03-03 18:05",
    avatar: "壤"
  },
  {
    id: "pet-006",
    serial: "QP-202603-006",
    name: { zh: "律动", en: "Groove" },
    model: "../assets/models/RobotExpressive.glb",
    element: "fire",
    stats: "HP118 / ATK33 / DEF22 / SPD20",
    capturedAt: "2026-03-04 12:11",
    avatar: "律"
  }
];

const DEFAULT_STATE_VERSION = 1;
const MAX_BATTLE_REPORTS = 60;
const DEFAULT_ACTIVE_PET_ID = DEFAULT_PET_ROSTER[0].id;
const DEFAULT_REPORT_LIMIT = 10;
const ALLOWED_ELEMENTS = new Set(["metal", "wood", "earth", "water", "fire"]);
const ALLOWED_BATTLE_STATUS = new Set(["finished", "abandoned"]);
const ALLOWED_BATTLE_WINNERS = new Set(["player", "enemy", "draw"]);

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
    captureRecords: Array.isArray(input?.captureRecords) ? input.captureRecords.slice(0, 300) : [],
    createdAt: isIsoDate(input?.createdAt) ? input.createdAt : base.createdAt,
    updatedAt: isIsoDate(input?.updatedAt) ? input.updatedAt : new Date().toISOString()
  };
}

function normalizePetList(input) {
  if (!Array.isArray(input)) {
    return DEFAULT_PET_ROSTER.map(clonePet);
  }
  const unique = new Map();
  for (const candidate of input) {
    const pet = normalizePet(candidate);
    if (!pet) continue;
    if (!unique.has(pet.id)) {
      unique.set(pet.id, pet);
    }
  }
  const normalized = [...unique.values()];
  return normalized.length > 0 ? normalized : DEFAULT_PET_ROSTER.map(clonePet);
}

function normalizePet(input) {
  if (!input || typeof input !== "object") return null;
  if (typeof input.id !== "string" || input.id.trim().length === 0) return null;
  const element = ALLOWED_ELEMENTS.has(input.element) ? input.element : "metal";
  const nameZh =
    typeof input.name?.zh === "string" && input.name.zh.trim().length > 0 ? input.name.zh.trim() : null;
  const nameEn =
    typeof input.name?.en === "string" && input.name.en.trim().length > 0 ? input.name.en.trim() : null;

  return {
    id: input.id.trim(),
    serial: typeof input.serial === "string" && input.serial.trim().length > 0 ? input.serial.trim() : "N/A",
    name: {
      zh: nameZh || nameEn || "未命名宠物",
      en: nameEn || nameZh || "Unknown Pet"
    },
    model:
      typeof input.model === "string" && input.model.trim().length > 0
        ? input.model.trim()
        : "../assets/models/Fox.glb",
    element,
    stats: typeof input.stats === "string" && input.stats.trim().length > 0 ? input.stats.trim() : "N/A",
    capturedAt:
      typeof input.capturedAt === "string" && input.capturedAt.trim().length > 0
        ? input.capturedAt.trim()
        : new Date().toISOString().slice(0, 19).replace("T", " "),
    avatar:
      typeof input.avatar === "string" && input.avatar.trim().length > 0
        ? input.avatar.trim().slice(0, 2)
        : "宠"
  };
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
    avatar: pet.avatar
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
