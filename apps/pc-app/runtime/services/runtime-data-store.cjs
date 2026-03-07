const { createHash, randomUUID } = require("node:crypto");
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

const DEFAULT_STATE_VERSION = 3;
const MAX_BATTLE_REPORTS = 60;
const DEFAULT_ACTIVE_PET_ID = DEFAULT_PET_ROSTER[0].id;
const DEFAULT_REPORT_LIMIT = 10;
const LEVEL_UP_REQUIRED_WINS = 5;
const DEFAULT_USER_SEARCH_LIMIT = 12;
const MAX_DUEL_REQUESTS = 500;
const DUEL_REQUEST_RESEND_INTERVAL_MS = 30 * 1000;

const ALLOWED_ELEMENTS = new Set(["metal", "wood", "earth", "water", "fire"]);
const ALLOWED_BATTLE_STATUS = new Set(["finished", "abandoned"]);
const ALLOWED_BATTLE_WINNERS = new Set(["player", "enemy", "draw"]);
const ALLOWED_BATTLE_MODES = new Set(["duel", "capture"]);
const ALLOWED_DUEL_REQUEST_STATUS = new Set(["pending", "accepted", "rejected", "cancelled"]);

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
    this.sessionFilePath =
      typeof options.sessionFilePath === "string" && options.sessionFilePath.trim().length > 0
        ? options.sessionFilePath.trim()
        : null;
    if (!this.filePath) {
      throw new Error("RuntimeDataStore requires filePath");
    }
    this.state = this.loadState();
    const persistedSessionUserId = this.loadSessionUserId();
    const fromSessionFile = normalizeCurrentUserId(persistedSessionUserId, this.state.users);
    const fromSharedState = normalizeCurrentUserId(this.state.currentUserId, this.state.users);
    this.sessionUserId = this.sessionFilePath ? fromSessionFile : fromSessionFile || fromSharedState;
  }

  refreshStateFromDisk() {
    const previousSessionUserId = this.sessionUserId;
    this.state = this.loadState();
    const persistedSessionUserId = this.loadSessionUserId();
    const storedUserId = normalizeCurrentUserId(this.state.currentUserId, this.state.users);
    const keepPreviousSession = normalizeCurrentUserId(previousSessionUserId, this.state.users);
    const keepPersistedSession = normalizeCurrentUserId(persistedSessionUserId, this.state.users);
    this.sessionUserId = this.sessionFilePath
      ? keepPreviousSession || keepPersistedSession || null
      : keepPreviousSession || keepPersistedSession || storedUserId || null;
    this.state.currentUserId = this.sessionUserId;
    return this.state;
  }

  ensureSessionInventory(options = {}) {
    const userId = normalizeCurrentUserId(this.sessionUserId, this.state.users);
    if (!userId) {
      return null;
    }

    if (!this.state.userInventories || typeof this.state.userInventories !== "object") {
      this.state.userInventories = {};
    }

    const shouldSeedFromLegacy = Boolean(options.seedFromLegacy);
    let inventory = this.state.userInventories[userId];
    if (!inventory) {
      const seed = shouldSeedFromLegacy
        ? {
            pets: normalizePetList(this.state.pets),
            activePetId: this.state.activePetId,
            battleReports: normalizeBattleReports(this.state.battleReports),
            captureRecords: normalizeCaptureRecords(this.state.captureRecords)
          }
        : createDefaultInventoryState();
      inventory = normalizeInventoryState(seed);
      this.state.userInventories[userId] = inventory;
    } else {
      inventory = normalizeInventoryState(inventory);
      this.state.userInventories[userId] = inventory;
    }

    this.syncLegacyInventoryMirror(inventory);
    return inventory;
  }

  getSessionInventory(options = {}) {
    const userId = normalizeCurrentUserId(this.sessionUserId, this.state.users);
    if (!userId) {
      const fallback = normalizeInventoryState({
        pets: this.state.pets,
        activePetId: this.state.activePetId,
        battleReports: this.state.battleReports,
        captureRecords: this.state.captureRecords
      });
      this.syncLegacyInventoryMirror(fallback);
      return fallback;
    }
    return this.ensureSessionInventory(options) || createDefaultInventoryState();
  }

  syncLegacyInventoryMirror(inventory) {
    if (!inventory || typeof inventory !== "object") return;
    this.state.pets = inventory.pets.map(clonePet);
    this.state.activePetId = inventory.activePetId;
    this.state.battleReports = inventory.battleReports.map(cloneBattleReport);
    this.state.captureRecords = inventory.captureRecords.map(cloneCaptureRecord);
  }

  getInventorySnapshot() {
    this.refreshStateFromDisk();
    const inventory = this.getSessionInventory({ createIfMissing: true });
    const pets = inventory.pets.map(clonePet);
    const activePetId = pets.some((pet) => pet.id === inventory.activePetId)
      ? inventory.activePetId
      : pets[0]?.id ?? null;
    return {
      pets,
      activePetId,
      updatedAt: this.state.updatedAt
    };
  }

  setActivePet(petId) {
    this.refreshStateFromDisk();
    if (typeof petId !== "string" || petId.trim().length === 0) {
      throw new Error("invalid pet id");
    }
    const normalizedPetId = petId.trim();
    const inventory = this.getSessionInventory({ createIfMissing: true });
    const exists = inventory.pets.some((pet) => pet.id === normalizedPetId);
    if (!exists) {
      throw new Error("pet id not found");
    }
    inventory.activePetId = normalizedPetId;
    this.syncLegacyInventoryMirror(inventory);
    this.state.updatedAt = new Date().toISOString();
    this.persistState();
    return this.getInventorySnapshot();
  }

  releasePet(petId) {
    this.refreshStateFromDisk();
    if (typeof petId !== "string" || petId.trim().length === 0) {
      throw new Error("invalid pet id");
    }
    const inventory = this.getSessionInventory({ createIfMissing: true });
    const targetPetId = petId.trim();
    if (inventory.pets.length <= 1) {
      throw new Error("at least one pet must remain");
    }

    const beforeLength = inventory.pets.length;
    inventory.pets = inventory.pets.filter((pet) => pet.id !== targetPetId);
    if (inventory.pets.length === beforeLength) {
      throw new Error("pet id not found");
    }

    inventory.captureRecords = inventory.captureRecords.filter((record) => record.petId !== targetPetId);
    if (!inventory.pets.some((pet) => pet.id === inventory.activePetId)) {
      inventory.activePetId = inventory.pets[0].id;
    }
    this.syncLegacyInventoryMirror(inventory);
    this.state.updatedAt = new Date().toISOString();
    this.persistState();
    return this.getInventorySnapshot();
  }

  listBattleReports(limit = DEFAULT_REPORT_LIMIT) {
    this.refreshStateFromDisk();
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || DEFAULT_REPORT_LIMIT));
    const inventory = this.getSessionInventory({ createIfMissing: true });
    return inventory.battleReports.slice(0, safeLimit).map(cloneBattleReport);
  }

  saveBattleReport(input) {
    this.refreshStateFromDisk();
    const inventory = this.getSessionInventory({ createIfMissing: true });
    const report = normalizeBattleReport(input);
    const next = [report, ...inventory.battleReports.filter((item) => item.id !== report.id)];
    inventory.battleReports = next.slice(0, MAX_BATTLE_REPORTS);
    this.syncLegacyInventoryMirror(inventory);
    this.state.updatedAt = new Date().toISOString();
    this.persistState();
    return cloneBattleReport(report);
  }

  captureWildPet(input) {
    this.refreshStateFromDisk();
    const inventory = this.getSessionInventory({ createIfMissing: true });
    const captureInput = normalizeCaptureInput(input);
    const existingRecord = inventory.captureRecords.find(
      (item) => item.wildSerial === captureInput.wildSerial
    );
    if (existingRecord) {
      const existingPet = inventory.pets.find((pet) => pet.id === existingRecord.petId) || null;
      if (!existingPet) {
        inventory.captureRecords = inventory.captureRecords.filter(
          (record) => record.id !== existingRecord.id
        );
      } else {
        return {
          duplicate: true,
          pet: existingPet ? clonePet(existingPet) : null,
          captureRecord: { ...existingRecord }
        };
      }
    }

    const nextPet = createCapturedPet(captureInput, inventory.pets.length + 1);
    const record = {
      id: `capture-${randomUUID()}`,
      wildPetId: captureInput.wildPetId,
      wildSerial: captureInput.wildSerial,
      petId: nextPet.id,
      rarity: captureInput.rarity,
      element: captureInput.element,
      capturedAt: captureInput.capturedAt
    };

    inventory.pets.push(nextPet);
    inventory.captureRecords = [record, ...inventory.captureRecords].slice(0, 500);
    this.syncLegacyInventoryMirror(inventory);
    this.state.updatedAt = new Date().toISOString();
    this.persistState();
    return {
      duplicate: false,
      pet: clonePet(nextPet),
      captureRecord: { ...record }
    };
  }

  recordBattleWin(petId) {
    this.refreshStateFromDisk();
    const inventory = this.getSessionInventory({ createIfMissing: true });
    if (typeof petId !== "string" || petId.trim().length === 0) {
      return { ok: false, error: "invalid pet id" };
    }
    const targetId = petId.trim();
    const pet = inventory.pets.find((item) => item.id === targetId);
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
    this.syncLegacyInventoryMirror(inventory);
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

  getAuthSession() {
    this.refreshStateFromDisk();
    const user = this.state.users.find((item) => item.id === this.sessionUserId) || null;
    return {
      ok: true,
      currentUser: user ? toPublicUser(user) : null
    };
  }

  applyRemoteAuthSession(currentUser) {
    this.refreshStateFromDisk();
    const remoteUser = normalizeRemotePublicUser(currentUser);
    if (!remoteUser) {
      return {
        ok: false,
        error: "invalid current user"
      };
    }

    const now = new Date().toISOString();
    let user = this.state.users.find((item) => item.id === remoteUser.id) || null;
    if (!user) {
      const accountKey = remoteUser.account.toLowerCase();
      user = this.state.users.find((item) => item.accountKey === accountKey) || null;
    }

    if (user) {
      const previousId = user.id;
      if (previousId !== remoteUser.id) {
        if (
          this.state.userInventories &&
          this.state.userInventories[previousId] &&
          !this.state.userInventories[remoteUser.id]
        ) {
          this.state.userInventories[remoteUser.id] = normalizeInventoryState(
            this.state.userInventories[previousId]
          );
        }
        if (this.state.userInventories && this.state.userInventories[previousId]) {
          delete this.state.userInventories[previousId];
        }
        if (Array.isArray(this.state.duelRequests) && this.state.duelRequests.length > 0) {
          this.state.duelRequests = this.state.duelRequests.map((item) => ({
            ...item,
            fromUserId: item.fromUserId === previousId ? remoteUser.id : item.fromUserId,
            toUserId: item.toUserId === previousId ? remoteUser.id : item.toUserId
          }));
        }
        user.id = remoteUser.id;
      }
      user.account = remoteUser.account;
      user.accountKey = remoteUser.account.toLowerCase();
      user.username = remoteUser.username || remoteUser.account;
      user.sessionToken = remoteUser.sessionToken || null;
      user.createdAt = remoteUser.createdAt || user.createdAt || now;
      user.lastLoginAt = remoteUser.lastLoginAt || now;
      user.updatedAt = now;
    } else {
      user = {
        id: remoteUser.id,
        account: remoteUser.account,
        accountKey: remoteUser.account.toLowerCase(),
        username: remoteUser.username || remoteUser.account,
        sessionToken: remoteUser.sessionToken || null,
        passwordHash: hashPassword(`remote-session-${remoteUser.id}`),
        createdAt: remoteUser.createdAt || now,
        updatedAt: now,
        lastLoginAt: remoteUser.lastLoginAt || now
      };
      this.state.users = [user, ...this.state.users].slice(0, 5000);
    }

    this.sessionUserId = user.id;
    this.state.currentUserId = this.sessionUserId;
    this.ensureSessionInventory({ seedFromLegacy: true });
    this.state.updatedAt = now;
    this.persistState();
    return {
      ok: true,
      currentUser: toPublicUser(user)
    };
  }

  registerUser(account, password, username) {
    this.refreshStateFromDisk();
    const normalizedAccount = normalizeAccount(account);
    const normalizedPassword = normalizePassword(password);
    const normalizedUsername = normalizeUsername(
      typeof username === "string" && username.trim().length > 0 ? username : normalizedAccount
    );
    const accountKey = normalizedAccount.toLowerCase();
    const exists = this.state.users.some((item) => item.accountKey === accountKey);
    if (exists) {
      return {
        ok: false,
        error: "account already exists"
      };
    }

    const now = new Date().toISOString();
    const user = {
      id: `user-${randomUUID()}`,
      account: normalizedAccount,
      accountKey,
      username: normalizedUsername,
      passwordHash: hashPassword(normalizedPassword),
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now
    };
    this.state.users = [user, ...this.state.users].slice(0, 5000);
    this.sessionUserId = user.id;
    this.state.currentUserId = this.sessionUserId;
    this.ensureSessionInventory({ seedFromLegacy: false });
    this.state.updatedAt = now;
    this.persistState();
    return {
      ok: true,
      currentUser: toPublicUser(user)
    };
  }

  loginUser(account, password) {
    this.refreshStateFromDisk();
    const normalizedAccount = normalizeAccount(account);
    const normalizedPassword = normalizePassword(password);
    const accountKey = normalizedAccount.toLowerCase();
    const user = this.state.users.find((item) => item.accountKey === accountKey);
    if (!user) {
      return {
        ok: false,
        error: "account not found"
      };
    }

    const passwordHash = hashPassword(normalizedPassword);
    if (user.passwordHash !== passwordHash) {
      return {
        ok: false,
        error: "invalid password"
      };
    }

    user.lastLoginAt = new Date().toISOString();
    user.updatedAt = user.lastLoginAt;
    this.sessionUserId = user.id;
    this.state.currentUserId = this.sessionUserId;
    this.ensureSessionInventory({ seedFromLegacy: true });
    this.state.updatedAt = user.updatedAt;
    this.persistState();
    return {
      ok: true,
      currentUser: toPublicUser(user)
    };
  }

  logoutUser() {
    this.refreshStateFromDisk();
    this.sessionUserId = null;
    this.state.currentUserId = null;
    this.state.updatedAt = new Date().toISOString();
    this.persistState();
    return {
      ok: true,
      currentUser: null
    };
  }

  updateCurrentUserProfile(payload = {}) {
    this.refreshStateFromDisk();
    const currentUser = this.state.users.find((item) => item.id === this.sessionUserId) || null;
    if (!currentUser) {
      return {
        ok: false,
        error: "login required"
      };
    }

    const oldPasswordRaw =
      payload && typeof payload.oldPassword === "string" ? payload.oldPassword : "";
    if (oldPasswordRaw.trim().length === 0) {
      return {
        ok: false,
        error: "old password is required"
      };
    }

    let normalizedOldPassword = "";
    try {
      normalizedOldPassword = normalizePassword(oldPasswordRaw);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "invalid old password"
      };
    }

    if (hashPassword(normalizedOldPassword) !== currentUser.passwordHash) {
      return {
        ok: false,
        error: "invalid old password"
      };
    }

    let changed = false;
    const nextUsernameRaw = payload && typeof payload.username === "string" ? payload.username : "";
    if (nextUsernameRaw.trim().length > 0) {
      let normalizedUsername = "";
      try {
        normalizedUsername = normalizeUsername(nextUsernameRaw);
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "invalid username"
        };
      }
      if (normalizedUsername !== currentUser.username) {
        currentUser.username = normalizedUsername;
        changed = true;
      }
    }

    const nextPasswordRaw =
      payload && typeof payload.newPassword === "string" ? payload.newPassword : "";
    if (nextPasswordRaw.trim().length > 0) {
      let normalizedNewPassword = "";
      try {
        normalizedNewPassword = normalizePassword(nextPasswordRaw);
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "invalid new password"
        };
      }
      const nextHash = hashPassword(normalizedNewPassword);
      if (nextHash !== currentUser.passwordHash) {
        currentUser.passwordHash = nextHash;
        changed = true;
      }
    }

    if (!changed) {
      return {
        ok: true,
        changed: false,
        currentUser: toPublicUser(currentUser)
      };
    }

    const now = new Date().toISOString();
    currentUser.updatedAt = now;
    this.state.updatedAt = now;
    this.persistState();
    return {
      ok: true,
      changed: true,
      currentUser: toPublicUser(currentUser)
    };
  }

  searchUsers(keyword, limit = DEFAULT_USER_SEARCH_LIMIT) {
    this.refreshStateFromDisk();
    const query = typeof keyword === "string" ? keyword.trim().toLowerCase() : "";
    const safeLimit = Math.max(1, Math.min(50, Number(limit) || DEFAULT_USER_SEARCH_LIMIT));
    const currentUserId = this.sessionUserId;
    const list = this.state.users
      .filter((item) => item.id !== currentUserId)
      .filter((item) => query.length === 0 || item.accountKey.includes(query))
      .slice(0, safeLimit)
      .map(toPublicUser);
    return {
      ok: true,
      users: list
    };
  }

  sendDuelRequest(targetAccount, options = {}) {
    this.refreshStateFromDisk();
    const fromUser = this.state.users.find((item) => item.id === this.sessionUserId) || null;
    if (!fromUser) {
      return {
        ok: false,
        error: "login required"
      };
    }
    const normalizedTargetAccount = normalizeAccount(targetAccount);
    const targetAccountKey = normalizedTargetAccount.toLowerCase();
    const toUser = this.state.users.find((item) => item.accountKey === targetAccountKey) || null;
    if (!toUser) {
      return {
        ok: false,
        error: "target account not found"
      };
    }
    if (toUser.id === fromUser.id) {
      return {
        ok: false,
        error: "cannot challenge yourself"
      };
    }

    const duplicate = this.state.duelRequests.find((item) => {
      if (item.status !== "pending") return false;
      const sameDirection = item.fromUserId === fromUser.id && item.toUserId === toUser.id;
      const reverseDirection = item.fromUserId === toUser.id && item.toUserId === fromUser.id;
      return sameDirection || reverseDirection;
    });
    if (duplicate) {
      const allowResend = Boolean(options?.allowResend);
      if (allowResend && duplicate.fromUserId === fromUser.id) {
        const now = new Date();
        const lastTouchedAt = isoDateToTimestamp(duplicate.updatedAt || duplicate.createdAt);
        const elapsedMs = Math.max(0, now.getTime() - lastTouchedAt);
        if (elapsedMs < DUEL_REQUEST_RESEND_INTERVAL_MS) {
          return {
            ok: false,
            error: "resend too frequent",
            retryAfterSeconds: Math.ceil((DUEL_REQUEST_RESEND_INTERVAL_MS - elapsedMs) / 1000),
            request: cloneDuelRequest(duplicate)
          };
        }
        const updatedAt = now.toISOString();
        duplicate.updatedAt = updatedAt;
        this.state.duelRequests = [duplicate, ...this.state.duelRequests.filter((item) => item.id !== duplicate.id)];
        this.state.updatedAt = updatedAt;
        this.persistState();
        return {
          ok: true,
          resent: true,
          request: cloneDuelRequest(duplicate)
        };
      }
      return {
        ok: false,
        error: "pending duel request already exists",
        request: cloneDuelRequest(duplicate)
      };
    }

    const now = new Date().toISOString();
    const request = {
      id: `duel-${randomUUID()}`,
      fromUserId: fromUser.id,
      fromAccount: fromUser.account,
      toUserId: toUser.id,
      toAccount: toUser.account,
      status: "pending",
      roomId: null,
      roomCode: null,
      roomStatus: null,
      createdAt: now,
      updatedAt: now
    };
    this.state.duelRequests = [request, ...this.state.duelRequests].slice(0, MAX_DUEL_REQUESTS);
    this.state.updatedAt = now;
    this.persistState();
    return {
      ok: true,
      request: cloneDuelRequest(request)
    };
  }

  respondDuelRequest(requestId, decision, options = {}) {
    this.refreshStateFromDisk();
    const currentUser = this.state.users.find((item) => item.id === this.sessionUserId) || null;
    if (!currentUser) {
      return {
        ok: false,
        error: "login required"
      };
    }

    const normalizedRequestId = typeof requestId === "string" ? requestId.trim() : "";
    if (!normalizedRequestId) {
      return {
        ok: false,
        error: "request id is required"
      };
    }
    const request = this.state.duelRequests.find((item) => item.id === normalizedRequestId) || null;
    if (!request) {
      return {
        ok: false,
        error: "duel request not found"
      };
    }
    if (request.toUserId !== currentUser.id) {
      return {
        ok: false,
        error: "request is not inbound"
      };
    }
    if (request.status !== "pending") {
      return {
        ok: false,
        error: "duel request already resolved",
        request: cloneDuelRequest(request)
      };
    }

    const normalizedDecision = typeof decision === "string" ? decision.trim().toLowerCase() : "";
    if (normalizedDecision !== "accept" && normalizedDecision !== "reject") {
      return {
        ok: false,
        error: "invalid duel request decision"
      };
    }
    const status = normalizedDecision === "accept" ? "accepted" : "rejected";
    const now = new Date().toISOString();
    request.status = status;
    if (status === "accepted") {
      const roomId =
        typeof options.roomId === "string" && options.roomId.trim().length > 0
          ? options.roomId.trim()
          : null;
      const roomCode =
        typeof options.roomCode === "string" && options.roomCode.trim().length > 0
          ? options.roomCode.trim().toUpperCase()
          : null;
      const roomStatus =
        typeof options.roomStatus === "string" && options.roomStatus.trim().length > 0
          ? options.roomStatus.trim().toLowerCase()
          : null;
      request.roomId = roomId;
      request.roomCode = roomCode;
      request.roomStatus = roomStatus;
    } else {
      request.roomId = null;
      request.roomCode = null;
      request.roomStatus = null;
    }
    request.updatedAt = now;
    this.state.updatedAt = now;
    this.persistState();
    return {
      ok: true,
      request: cloneDuelRequest(request)
    };
  }

  cancelDuelRequest(requestId) {
    this.refreshStateFromDisk();
    const currentUser = this.state.users.find((item) => item.id === this.sessionUserId) || null;
    if (!currentUser) {
      return {
        ok: false,
        error: "login required"
      };
    }

    const normalizedRequestId = typeof requestId === "string" ? requestId.trim() : "";
    if (!normalizedRequestId) {
      return {
        ok: false,
        error: "request id is required"
      };
    }
    const request = this.state.duelRequests.find((item) => item.id === normalizedRequestId) || null;
    if (!request) {
      return {
        ok: false,
        error: "duel request not found"
      };
    }
    if (request.fromUserId !== currentUser.id) {
      return {
        ok: false,
        error: "request is not outbound"
      };
    }
    if (request.status !== "pending") {
      return {
        ok: false,
        error: "duel request already resolved",
        request: cloneDuelRequest(request)
      };
    }

    const now = new Date().toISOString();
    request.status = "cancelled";
    request.roomId = null;
    request.roomCode = null;
    request.roomStatus = null;
    request.updatedAt = now;
    this.state.updatedAt = now;
    this.persistState();
    return {
      ok: true,
      request: cloneDuelRequest(request)
    };
  }

  listDuelRequests() {
    this.refreshStateFromDisk();
    const currentUserId = this.sessionUserId;
    if (!currentUserId) {
      return {
        ok: false,
        error: "login required",
        inbound: [],
        outbound: []
      };
    }
    const inbound = this.state.duelRequests
      .filter((item) => item.toUserId === currentUserId)
      .map(cloneDuelRequest);
    const outbound = this.state.duelRequests
      .filter((item) => item.fromUserId === currentUserId)
      .map(cloneDuelRequest);
    return {
      ok: true,
      inbound,
      outbound
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
    this.state.currentUserId = this.sessionFilePath ? null : this.sessionUserId || null;
    this.persistRaw(this.state);
    this.persistSessionUserId();
  }

  persistRaw(state) {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(state, null, 2), "utf8");
  }

  loadSessionUserId() {
    if (!this.sessionFilePath || !existsSync(this.sessionFilePath)) {
      return null;
    }
    try {
      const raw = readFileSync(this.sessionFilePath, "utf8");
      const parsed = JSON.parse(raw);
      if (typeof parsed?.currentUserId === "string" && parsed.currentUserId.trim().length > 0) {
        return parsed.currentUserId.trim();
      }
      return null;
    } catch {
      return null;
    }
  }

  persistSessionUserId() {
    if (!this.sessionFilePath) return;
    const payload = {
      version: 1,
      currentUserId: this.sessionUserId || null,
      updatedAt: new Date().toISOString()
    };
    mkdirSync(dirname(this.sessionFilePath), { recursive: true });
    writeFileSync(this.sessionFilePath, JSON.stringify(payload, null, 2), "utf8");
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
    userInventories: {},
    users: [],
    currentUserId: null,
    duelRequests: [],
    createdAt,
    updatedAt: createdAt
  };
}

function createDefaultInventoryState() {
  return {
    pets: DEFAULT_PET_ROSTER.map(clonePet),
    activePetId: DEFAULT_ACTIVE_PET_ID,
    battleReports: [],
    captureRecords: []
  };
}

function normalizeInventoryState(input) {
  const pets = normalizePetList(input?.pets);
  const activePetId = pets.some((pet) => pet.id === input?.activePetId)
    ? input.activePetId
    : pets[0]?.id ?? DEFAULT_ACTIVE_PET_ID;
  return {
    pets,
    activePetId,
    battleReports: normalizeBattleReports(input?.battleReports),
    captureRecords: normalizeCaptureRecords(input?.captureRecords).filter((record) =>
      pets.some((pet) => pet.id === record.petId)
    )
  };
}

function normalizeUserInventories(input, users, legacyInventory) {
  const output = {};
  const userIds = users.map((item) => item.id);
  const userIdSet = new Set(userIds);
  const source = input && typeof input === "object" ? input : {};
  for (const [userId, candidate] of Object.entries(source)) {
    if (!userIdSet.has(userId)) continue;
    output[userId] = normalizeInventoryState(candidate);
  }
  for (const userId of userIds) {
    if (output[userId]) continue;
    if (legacyInventory) {
      output[userId] = normalizeInventoryState(legacyInventory);
    } else {
      output[userId] = createDefaultInventoryState();
    }
  }
  return output;
}

function normalizeRuntimeState(input) {
  const base = createDefaultState();
  const users = normalizeUsers(input?.users);
  const currentUserId = normalizeCurrentUserId(input?.currentUserId, users);
  const legacyInventory = normalizeInventoryState({
    pets: input?.pets,
    activePetId: input?.activePetId,
    battleReports: input?.battleReports,
    captureRecords: input?.captureRecords
  });
  const userInventories = normalizeUserInventories(input?.userInventories, users, legacyInventory);
  const currentInventory = currentUserId
    ? userInventories[currentUserId] || createDefaultInventoryState()
    : legacyInventory;
  return {
    version: DEFAULT_STATE_VERSION,
    pets: currentInventory.pets.map(clonePet),
    activePetId: currentInventory.activePetId,
    battleReports: currentInventory.battleReports.map(cloneBattleReport),
    captureRecords: currentInventory.captureRecords.map(cloneCaptureRecord),
    userInventories,
    users,
    currentUserId,
    duelRequests: normalizeDuelRequests(input?.duelRequests, users),
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
  stats.HP += 2;
  if (element === "fire") {
    stats.ATK += 2;
  } else if (element === "water") {
    stats.SPD += 1;
    stats.HP += 1;
  } else if (element === "wood") {
    stats.HP += 2;
  } else if (element === "metal") {
    stats.HP += 1;
    stats.DEF += 2;
  } else if (element === "earth") {
    stats.HP += 2;
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

function normalizeRemotePublicUser(input) {
  if (!input || typeof input !== "object") return null;
  if (typeof input.id !== "string" || input.id.trim().length === 0) return null;
  if (typeof input.account !== "string" || input.account.trim().length < 3) return null;
  const id = input.id.trim();
  const account = input.account.trim();
  if (account.length > 32 || /\s/.test(account)) return null;
  const rawUsername = typeof input.username === "string" ? input.username.trim() : "";
  const username =
    rawUsername.length >= 2 && rawUsername.length <= 24 ? rawUsername : account;
  return {
    id,
    account,
    username,
    sessionToken:
      typeof input.sessionToken === "string" && input.sessionToken.trim().length > 0
        ? input.sessionToken.trim()
        : null,
    createdAt: isIsoDate(input.createdAt) ? input.createdAt : null,
    lastLoginAt: isIsoDate(input.lastLoginAt) ? input.lastLoginAt : null
  };
}

function normalizeAccount(input) {
  if (typeof input !== "string") {
    throw new Error("account is required");
  }
  const account = input.trim();
  if (account.length < 3 || account.length > 32) {
    throw new Error("account length must be 3-32");
  }
  if (/\s/.test(account)) {
    throw new Error("account cannot contain spaces");
  }
  return account;
}

function normalizeUsername(input) {
  if (typeof input !== "string") {
    throw new Error("username is required");
  }
  const username = input.trim();
  if (username.length < 2 || username.length > 24) {
    throw new Error("username length must be 2-24");
  }
  return username;
}

function normalizePassword(input) {
  if (typeof input !== "string") {
    throw new Error("password is required");
  }
  const password = input.trim();
  if (password.length < 6 || password.length > 64) {
    throw new Error("password length must be 6-64");
  }
  return password;
}

function hashPassword(password) {
  return createHash("sha256").update(password).digest("hex");
}

function normalizeUsers(input) {
  if (!Array.isArray(input)) return [];
  const unique = new Map();
  for (const candidate of input) {
    const user = normalizeUser(candidate);
    if (!user) continue;
    if (!unique.has(user.accountKey)) {
      unique.set(user.accountKey, user);
    }
  }
  return [...unique.values()].slice(0, 5000);
}

function normalizeUser(input) {
  if (!input || typeof input !== "object") return null;
  if (typeof input.id !== "string" || input.id.trim().length === 0) return null;
  if (typeof input.account !== "string" || input.account.trim().length < 3) return null;
  const account = input.account.trim();
  const accountKey =
    typeof input.accountKey === "string" && input.accountKey.trim().length > 0
      ? input.accountKey.trim().toLowerCase()
      : account.toLowerCase();
  let username = account;
  if (typeof input.username === "string" && input.username.trim().length > 0) {
    try {
      username = normalizeUsername(input.username);
    } catch {
      username = account;
    }
  }
  const passwordHash =
    typeof input.passwordHash === "string" && input.passwordHash.trim().length > 0
      ? input.passwordHash.trim()
      : hashPassword("123456");
  const now = new Date().toISOString();
  return {
    id: input.id.trim(),
    account,
    accountKey,
    username,
    sessionToken:
      typeof input.sessionToken === "string" && input.sessionToken.trim().length > 0
        ? input.sessionToken.trim()
        : null,
    passwordHash,
    createdAt: isIsoDate(input.createdAt) ? input.createdAt : now,
    updatedAt: isIsoDate(input.updatedAt) ? input.updatedAt : now,
    lastLoginAt: isIsoDate(input.lastLoginAt) ? input.lastLoginAt : null
  };
}

function normalizeCurrentUserId(currentUserId, users) {
  if (typeof currentUserId !== "string" || currentUserId.trim().length === 0) return null;
  const userId = currentUserId.trim();
  if (!users.some((item) => item.id === userId)) return null;
  return userId;
}

function normalizeDuelRequests(input, users) {
  if (!Array.isArray(input)) return [];
  const userIdSet = new Set(users.map((item) => item.id));
  const normalized = [];
  const unique = new Set();
  for (const candidate of input) {
    const request = normalizeDuelRequest(candidate, userIdSet);
    if (!request) continue;
    if (unique.has(request.id)) continue;
    unique.add(request.id);
    normalized.push(request);
    if (normalized.length >= MAX_DUEL_REQUESTS) break;
  }
  return normalized.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function normalizeDuelRequest(input, userIdSet) {
  if (!input || typeof input !== "object") return null;
  if (typeof input.id !== "string" || input.id.trim().length === 0) return null;
  if (typeof input.fromUserId !== "string" || input.fromUserId.trim().length === 0) return null;
  if (typeof input.toUserId !== "string" || input.toUserId.trim().length === 0) return null;
  const fromUserId = input.fromUserId.trim();
  const toUserId = input.toUserId.trim();
  if (!userIdSet.has(fromUserId) || !userIdSet.has(toUserId) || fromUserId === toUserId) {
    return null;
  }
  const fromAccount =
    typeof input.fromAccount === "string" && input.fromAccount.trim().length > 0
      ? input.fromAccount.trim()
      : fromUserId;
  const toAccount =
    typeof input.toAccount === "string" && input.toAccount.trim().length > 0
      ? input.toAccount.trim()
      : toUserId;
  const status = ALLOWED_DUEL_REQUEST_STATUS.has(input.status) ? input.status : "pending";
  const roomId =
    typeof input.roomId === "string" && input.roomId.trim().length > 0 ? input.roomId.trim() : null;
  const roomCode =
    typeof input.roomCode === "string" && input.roomCode.trim().length > 0
      ? input.roomCode.trim().toUpperCase()
      : null;
  const roomStatus =
    typeof input.roomStatus === "string" && input.roomStatus.trim().length > 0
      ? input.roomStatus.trim().toLowerCase()
      : null;
  const now = new Date().toISOString();
  return {
    id: input.id.trim(),
    fromUserId,
    fromAccount,
    toUserId,
    toAccount,
    status,
    roomId,
    roomCode,
    roomStatus,
    createdAt: isIsoDate(input.createdAt) ? input.createdAt : now,
    updatedAt: isIsoDate(input.updatedAt) ? input.updatedAt : now
  };
}

function toPublicUser(user) {
  return {
    id: user.id,
    account: user.account,
    username: user.username || user.account,
    sessionToken:
      typeof user.sessionToken === "string" && user.sessionToken.trim().length > 0
        ? user.sessionToken.trim()
        : null,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt
  };
}

function isIsoDate(input) {
  return typeof input === "string" && input.trim().length >= 16 && !Number.isNaN(Date.parse(input));
}

function isoDateToTimestamp(input) {
  const parsed = Date.parse(typeof input === "string" ? input : "");
  return Number.isFinite(parsed) ? parsed : 0;
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

function cloneCaptureRecord(record) {
  return {
    id: record.id,
    wildPetId: record.wildPetId,
    wildSerial: record.wildSerial,
    petId: record.petId,
    rarity: record.rarity,
    element: record.element,
    capturedAt: record.capturedAt
  };
}

function cloneDuelRequest(request) {
  return {
    id: request.id,
    fromUserId: request.fromUserId,
    fromAccount: request.fromAccount,
    toUserId: request.toUserId,
    toAccount: request.toAccount,
    status: request.status,
    roomId: request.roomId || null,
    roomCode: request.roomCode || null,
    roomStatus: request.roomStatus || null,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt
  };
}

module.exports = {
  DEFAULT_PET_ROSTER,
  RuntimeDataStore
};
