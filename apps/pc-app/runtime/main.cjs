const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");

const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen } = require("electron");
const { BattleRuntimeService } = require("./services/battle-runtime.cjs");
const { RuntimeDataStore } = require("./services/runtime-data-store.cjs");
const { MapRuntimeService } = require("./services/map-runtime.cjs");
const { CAPTURE_RADIUS_METERS, WildPetRuntimeService } = require("./services/wild-pet-runtime.cjs");

let mainWindow = null;
let authWindow = null;
let tray = null;
let isQuitting = false;
let interactionPaused = false;
let moveTimer = null;
const battleService = new BattleRuntimeService();
const mapService = new MapRuntimeService({
  providerId: "tencent"
});
const wildPetService = new WildPetRuntimeService();
let runtimeDataStore = null;
let activeBattleSession = null;
let activeLayoutMode = "idle";

const IDLE_BOUNDS = {
  width: 220,
  height: 250
};

const BATTLE_BOUNDS = {
  width: 360,
  height: 420
};

const PANEL_BOUNDS = {
  width: 430,
  height: 560
};

const IDLE_SIZE_LIMITS = {
  minWidth: 180,
  maxWidth: 520,
  minHeight: 200,
  maxHeight: 640
};

const WINDOW_MOVE_LIMIT = 200;
const AUTH_WINDOW_BOUNDS = {
  width: 430,
  height: 520
};

let currentIdleBounds = { ...IDLE_BOUNDS };

const DEFAULT_BOUNDS = {
  x: 40,
  y: 40,
  width: IDLE_BOUNDS.width,
  height: IDLE_BOUNDS.height
};

function createMainWindow() {
  const restored = loadWindowBounds();
  const bounds = clampBoundsToWorkArea(restored || DEFAULT_BOUNDS);

  mainWindow = new BrowserWindow({
    ...bounds,
    show: false,
    transparent: true,
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.loadFile(join(__dirname, "renderer", "index.html"));
  mainWindow.setIgnoreMouseEvents(false, { forward: true });

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return;
    }
    saveWindowBounds(mainWindow.getBounds());
  });

  mainWindow.on("move", scheduleSaveWindowBounds);
  mainWindow.on("resize", scheduleSaveWindowBounds);
}

function hasAuthenticatedSession() {
  if (!runtimeDataStore) return false;
  const session = runtimeDataStore.getAuthSession();
  return Boolean(session?.currentUser?.id);
}

function buildAuthSessionPayload() {
  if (!runtimeDataStore) {
    return { ok: true, currentUser: null };
  }
  const session = runtimeDataStore.getAuthSession();
  if (!session || typeof session !== "object") {
    return { ok: true, currentUser: null };
  }
  return {
    ok: true,
    currentUser: session.currentUser || null
  };
}

function emitAuthState() {
  const payload = buildAuthSessionPayload();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("pet:auth-state", payload);
  }
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.webContents.send("pet:auth-state", payload);
  }
}

function createAuthWindow() {
  if (authWindow && !authWindow.isDestroyed()) return authWindow;
  const area = screen.getPrimaryDisplay().workArea;
  const bounds = {
    x: Math.round(area.x + (area.width - AUTH_WINDOW_BOUNDS.width) / 2),
    y: Math.round(area.y + (area.height - AUTH_WINDOW_BOUNDS.height) / 2),
    width: AUTH_WINDOW_BOUNDS.width,
    height: AUTH_WINDOW_BOUNDS.height
  };
  authWindow = new BrowserWindow({
    ...bounds,
    resizable: false,
    minimizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    title: "轻宠·领主 3D - 登录",
    backgroundColor: "#0b1522",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  authWindow.loadFile(join(__dirname, "auth", "index.html"));
  authWindow.on("closed", () => {
    authWindow = null;
    if (!isQuitting && !hasAuthenticatedSession()) {
      isQuitting = true;
      app.quit();
    }
  });
  return authWindow;
}

function openRuntimeAfterAuth() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!hasAuthenticatedSession()) {
    openAuthGate();
    return;
  }
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.close();
    authWindow = null;
  }
  mainWindow.show();
  mainWindow.focus();
  emitAuthState();
  refreshTrayMenu();
}

function openAuthGate() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
  const windowRef = createAuthWindow();
  windowRef.show();
  windowRef.focus();
  emitAuthState();
  refreshTrayMenu();
}

function scheduleSaveWindowBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (moveTimer) clearTimeout(moveTimer);
  moveTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const current = mainWindow.getBounds();
    const target = getLayoutTargetSize(activeLayoutMode);
    if (target.width !== current.width || target.height !== current.height) {
      const locked = clampPositionToWorkArea(
        {
          x: current.x,
          y: current.y,
          width: target.width,
          height: target.height
        },
        { margin: activeLayoutMode === "panel" ? 8 : 0 }
      );
      mainWindow.setBounds(locked, false);
      saveWindowBounds(locked);
      return;
    }
    saveWindowBounds(current);
  }, 220);
}

function createTray() {
  const icon = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAXUlEQVR4AWP4//8/AzWAhYGBgYHhfwYGBjA8MDAw/3+MDAwM/38GqIFkYGBg+P/PMDAwMPx/GKgBk4GBgWH4fzQwMDD8fxioAZOBgYFh+H80MDAw/H8YqAFQYwABANQRCajbDiqQAAAAAElFTkSuQmCC"
  );
  tray = new Tray(icon);
  tray.setToolTip("轻宠·领主 3D 桌宠");
  tray.on("double-click", toggleWindowVisibility);
  refreshTrayMenu();
}

function refreshTrayMenu() {
  if (!tray) return;
  const authenticated = hasAuthenticatedSession();
  const primaryWindow = authenticated ? mainWindow : authWindow;
  const isVisible =
    Boolean(primaryWindow) && !primaryWindow.isDestroyed() && primaryWindow.isVisible();
  const menu = Menu.buildFromTemplate([
    {
      label: isVisible ? "Hide" : "Show",
      click: toggleWindowVisibility
    },
    {
      label: interactionPaused ? "Resume Interaction" : "Pause Interaction",
      enabled: authenticated,
      click: () => {
        interactionPaused = !interactionPaused;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("pet:pause-state", interactionPaused);
          mainWindow.setIgnoreMouseEvents(interactionPaused, { forward: true });
        }
        refreshTrayMenu();
      }
    },
    {
      label: authenticated ? "Open Panel" : "Open Login",
      click: () => {
        if (!authenticated) {
          openAuthGate();
          return;
        }
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send("pet:toggle-panel", true);
      }
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(menu);
}

function toggleWindowVisibility() {
  const authenticated = hasAuthenticatedSession();
  if (!authenticated && mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    mainWindow.hide();
  }
  const targetWindow = authenticated ? mainWindow : authWindow;
  if (!authenticated && (!targetWindow || targetWindow.isDestroyed())) {
    openAuthGate();
    return;
  }
  if (!targetWindow || targetWindow.isDestroyed()) return;
  if (targetWindow.isVisible()) {
    targetWindow.hide();
  } else {
    targetWindow.show();
    targetWindow.focus();
  }
  refreshTrayMenu();
}

function loadWindowBounds() {
  const configPath = getWindowConfigPath();
  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.x === "number" &&
      typeof parsed.y === "number" &&
      typeof parsed.width === "number" &&
      typeof parsed.height === "number"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function saveWindowBounds(bounds) {
  const configPath = getWindowConfigPath();
  try {
    writeFileSync(configPath, JSON.stringify(bounds, null, 2), "utf8");
  } catch {
    // Keep non-blocking behavior.
  }
}

function getWindowConfigPath() {
  return join(app.getPath("userData"), "pet-window-bounds.json");
}

function clampBoundsToWorkArea(bounds, options = {}) {
  const area = getVirtualWorkArea();
  const marginRaw = Number(options.margin);
  const margin = Number.isFinite(marginRaw) ? Math.max(0, Math.round(marginRaw)) : 0;
  const safeArea = {
    x: area.x + margin,
    y: area.y + margin,
    width: Math.max(120, area.width - margin * 2),
    height: Math.max(120, area.height - margin * 2)
  };

  const width = Math.min(Math.max(180, bounds.width), safeArea.width);
  const height = Math.min(Math.max(200, bounds.height), safeArea.height);
  const x = Math.min(Math.max(safeArea.x, bounds.x), safeArea.x + safeArea.width - width);
  const y = Math.min(Math.max(safeArea.y, bounds.y), safeArea.y + safeArea.height - height);
  return { x, y, width, height };
}

function clampPositionToWorkArea(bounds, options = {}) {
  const area = getVirtualWorkArea();
  const marginRaw = Number(options.margin);
  const margin = Number.isFinite(marginRaw) ? Math.max(0, Math.round(marginRaw)) : 0;
  const safeArea = {
    x: area.x + margin,
    y: area.y + margin,
    width: Math.max(120, area.width - margin * 2),
    height: Math.max(120, area.height - margin * 2)
  };

  const width = Math.max(1, Math.round(Number(bounds.width) || 1));
  const height = Math.max(1, Math.round(Number(bounds.height) || 1));
  const maxX = safeArea.x + safeArea.width - width;
  const maxY = safeArea.y + safeArea.height - height;
  const x = Math.round(
    Math.min(Math.max(bounds.x, safeArea.x), maxX >= safeArea.x ? maxX : safeArea.x)
  );
  const y = Math.round(
    Math.min(Math.max(bounds.y, safeArea.y), maxY >= safeArea.y ? maxY : safeArea.y)
  );
  return { x, y, width, height };
}

function getVirtualWorkArea() {
  const displays = screen.getAllDisplays();
  if (!Array.isArray(displays) || displays.length === 0) {
    return screen.getPrimaryDisplay().workArea;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxRight = Number.NEGATIVE_INFINITY;
  let maxBottom = Number.NEGATIVE_INFINITY;

  for (const display of displays) {
    const area = display.workArea;
    minX = Math.min(minX, area.x);
    minY = Math.min(minY, area.y);
    maxRight = Math.max(maxRight, area.x + area.width);
    maxBottom = Math.max(maxBottom, area.y + area.height);
  }

  return {
    x: minX,
    y: minY,
    width: maxRight - minX,
    height: maxBottom - minY
  };
}

function registerIpcHandlers() {
  ipcMain.on("pet:set-hit-region", (_event, isInside) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (interactionPaused) return;
    mainWindow.setIgnoreMouseEvents(!Boolean(isInside), { forward: true });
  });

  ipcMain.on("pet:move-window-by", (_event, payload) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const dxRaw = Number(payload?.dx);
    const dyRaw = Number(payload?.dy);
    if (!Number.isFinite(dxRaw) || !Number.isFinite(dyRaw)) return;

    const dx = Math.max(-WINDOW_MOVE_LIMIT, Math.min(WINDOW_MOVE_LIMIT, Math.round(dxRaw)));
    const dy = Math.max(-WINDOW_MOVE_LIMIT, Math.min(WINDOW_MOVE_LIMIT, Math.round(dyRaw)));
    if (dx === 0 && dy === 0) return;

    const current = mainWindow.getBounds();
    const target = getLayoutTargetSize(activeLayoutMode);
    if (current.width !== target.width || current.height !== target.height) {
      mainWindow.setBounds(
        {
          x: current.x,
          y: current.y,
          width: target.width,
          height: target.height
        },
        false
      );
    }
    const next = clampPositionToWorkArea(
      {
        x: current.x + dx,
        y: current.y + dy,
        width: target.width,
        height: target.height
      },
      { margin: activeLayoutMode === "panel" ? 8 : 0 }
    );
    mainWindow.setPosition(next.x, next.y, false);
    saveWindowBounds({
      x: next.x,
      y: next.y,
      width: target.width,
      height: target.height
    });
  });

  ipcMain.handle("pet:get-runtime-info", () => ({
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    platform: process.platform
  }));

  ipcMain.handle("pet:toggle-pause", () => {
    interactionPaused = !interactionPaused;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("pet:pause-state", interactionPaused);
      mainWindow.setIgnoreMouseEvents(interactionPaused, { forward: true });
    }
    refreshTrayMenu();
    return interactionPaused;
  });

  ipcMain.handle("pet:battle-reset", (_event, config) => {
    const payload = config && typeof config === "object" ? config : {};
    if (activeBattleSession) {
      closeBattleSession("abandoned", null);
    }
    const snapshot = battleService.reset(payload);
    activeBattleSession = {
      id: randomUUID(),
      mode: "duel",
      captureResolved: false,
      captureDecisionPending: false,
      captureWildPetId: null,
      captureProviderId: null,
      startedAt: new Date().toISOString(),
      player: {
        petId: typeof payload.playerPetId === "string" ? payload.playerPetId : null,
        petName: typeof payload.playerPetName === "string" ? payload.playerPetName : "Player",
        element: snapshot.player.element
      },
      enemy: {
        petId: typeof payload.enemyPetId === "string" ? payload.enemyPetId : null,
        petName: typeof payload.enemyPetName === "string" ? payload.enemyPetName : "Enemy",
        element: snapshot.enemy.element
      },
      rounds: []
    };
    return snapshot;
  });

  ipcMain.handle("pet:begin-capture-battle", (_event, payload) => {
    const request = payload && typeof payload === "object" ? payload : {};
    const wildPetId = typeof request.wildPetId === "string" ? request.wildPetId.trim() : "";
    const playerElement =
      typeof request.playerElement === "string" && request.playerElement.length > 0
        ? request.playerElement
        : "metal";

    if (!wildPetId) {
      return {
        ok: false,
        error: {
          code: "INVALID_WILD_PET",
          message: "wildPetId is required"
        }
      };
    }

    const mapState = mapService.snapshot();
    const providerId = mapState.providerId;
    const location = mapState.lastLocation;
    const prepareResult = wildPetService.prepareCaptureBattle({
      providerId,
      wildPetId,
      location
    });
    if (!prepareResult.ok) {
      return prepareResult;
    }

    if (activeBattleSession) {
      closeBattleSession("abandoned", null);
    }

    const wildPet = prepareResult.wildPet;
    const snapshot = battleService.reset({
      playerElement,
      enemyElement: wildPet.element
    });

    activeBattleSession = {
      id: randomUUID(),
      mode: "capture",
      captureResolved: false,
      captureDecisionPending: false,
      captureWildPetId: wildPet.id,
      captureProviderId: providerId,
      startedAt: new Date().toISOString(),
      player: {
        petId: typeof request.playerPetId === "string" ? request.playerPetId : null,
        petName: typeof request.playerPetName === "string" ? request.playerPetName : "Player",
        element: snapshot.player.element
      },
      enemy: {
        petId: wildPet.id,
        petName:
          typeof wildPet.name?.en === "string" && wildPet.name.en.length > 0
            ? wildPet.name.en
            : "WildPet",
        element: snapshot.enemy.element
      },
      rounds: []
    };

    return {
      ok: true,
      state: snapshot,
      capture: wildPet,
      captureRadiusMeters: CAPTURE_RADIUS_METERS
    };
  });

  ipcMain.handle("pet:battle-state", () => {
    return battleService.snapshot();
  });

  ipcMain.handle("pet:battle-act", (_event, payload) => {
    const action = payload && typeof payload.action === "string" ? payload.action : "normal_attack";
    const result = battleService.act(action);
    let captureOutcome = null;
    let progression = null;
    let captureDecisionRequired = false;

    if (activeBattleSession) {
      activeBattleSession.rounds.push({
        round: result.roundResult.round,
        playerAction: result.roundResult.actions.player,
        enemyAction: result.roundResult.actions.enemy,
        damageTaken: result.roundResult.damageTaken,
        winner: result.roundResult.winner,
        notes: result.roundResult.notes
      });
      if (result.roundResult.winner) {
        if (
          result.roundResult.winner === "player" &&
          runtimeDataStore &&
          typeof activeBattleSession.player?.petId === "string" &&
          activeBattleSession.player.petId.length > 0
        ) {
          progression = runtimeDataStore.recordBattleWin(activeBattleSession.player.petId);
        }
        if (activeBattleSession.mode === "capture" && !activeBattleSession.captureResolved) {
          if (result.roundResult.winner === "player") {
            activeBattleSession.captureDecisionPending = true;
            captureDecisionRequired = true;
          } else {
            captureOutcome = wildPetService.completeCaptureBattle({
              providerId: activeBattleSession.captureProviderId,
              wildPetId: activeBattleSession.captureWildPetId,
              success: false,
              runtimeDataStore
            });
            activeBattleSession.captureResolved = true;
          }
        }
        if (!captureDecisionRequired) {
          closeBattleSession("finished", result.roundResult.winner, { captureOutcome });
        }
      }
    }

    return {
      ...result,
      captureOutcome,
      progression,
      captureDecisionRequired
    };
  });

  ipcMain.handle("pet:resolve-capture", (_event, payload) => {
    if (!activeBattleSession || activeBattleSession.mode !== "capture") {
      return {
        ok: false,
        error: {
          code: "CAPTURE_SESSION_NOT_FOUND",
          message: "capture session not found"
        }
      };
    }
    if (activeBattleSession.captureResolved) {
      return {
        ok: true,
        captureOutcome: null
      };
    }
    if (!activeBattleSession.captureDecisionPending) {
      return {
        ok: false,
        error: {
          code: "CAPTURE_DECISION_NOT_REQUIRED",
          message: "capture decision is not required"
        }
      };
    }

    const accept = Boolean(payload?.accept);
    const captureOutcome = wildPetService.completeCaptureBattle({
      providerId: activeBattleSession.captureProviderId,
      wildPetId: activeBattleSession.captureWildPetId,
      success: accept,
      runtimeDataStore
    });
    activeBattleSession.captureResolved = true;
    activeBattleSession.captureDecisionPending = false;
    closeBattleSession("finished", "player", { captureOutcome });
    return {
      ok: true,
      captureOutcome
    };
  });

  ipcMain.handle("pet:battle-end", () => {
    let captureOutcome = null;
    if (activeBattleSession) {
      if (activeBattleSession.mode === "capture" && !activeBattleSession.captureResolved) {
        captureOutcome = wildPetService.completeCaptureBattle({
          providerId: activeBattleSession.captureProviderId,
          wildPetId: activeBattleSession.captureWildPetId,
          success: false,
          runtimeDataStore
        });
        activeBattleSession.captureResolved = true;
        activeBattleSession.captureDecisionPending = false;
      }
      closeBattleSession("abandoned", null, { captureOutcome });
    }
    return {
      ok: true,
      captureOutcome
    };
  });

  ipcMain.handle("pet:get-inventory", () => {
    return runtimeDataStore.getInventorySnapshot();
  });

  ipcMain.handle("pet:auth-session", () => {
    return runtimeDataStore.getAuthSession();
  });

  ipcMain.handle("pet:auth-register", (_event, payload) => {
    try {
      const account = payload && typeof payload.account === "string" ? payload.account : "";
      const password = payload && typeof payload.password === "string" ? payload.password : "";
      const username = payload && typeof payload.username === "string" ? payload.username : "";
      const result = runtimeDataStore.registerUser(account, password, username);
      if (result?.ok) {
        openRuntimeAfterAuth();
      } else {
        emitAuthState();
      }
      return result;
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "register failed"
      };
    }
  });

  ipcMain.handle("pet:auth-login", (_event, payload) => {
    try {
      const account = payload && typeof payload.account === "string" ? payload.account : "";
      const password = payload && typeof payload.password === "string" ? payload.password : "";
      const result = runtimeDataStore.loginUser(account, password);
      if (result?.ok) {
        openRuntimeAfterAuth();
      } else {
        emitAuthState();
      }
      return result;
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "login failed"
      };
    }
  });

  ipcMain.handle("pet:auth-logout", () => {
    const result = runtimeDataStore.logoutUser();
    if (result?.ok) {
      openAuthGate();
    } else {
      emitAuthState();
    }
    return result;
  });

  ipcMain.handle("pet:auth-update-profile", (_event, payload) => {
    try {
      const username = payload && typeof payload.username === "string" ? payload.username : "";
      const oldPassword =
        payload && typeof payload.oldPassword === "string" ? payload.oldPassword : "";
      const newPassword =
        payload && typeof payload.newPassword === "string" ? payload.newPassword : "";
      const result = runtimeDataStore.updateCurrentUserProfile({
        username,
        oldPassword,
        newPassword
      });
      emitAuthState();
      return result;
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "profile update failed"
      };
    }
  });

  ipcMain.handle("pet:user-search", (_event, payload) => {
    try {
      const keyword = payload && typeof payload.keyword === "string" ? payload.keyword : "";
      const limit = payload && typeof payload.limit === "number" ? payload.limit : undefined;
      return runtimeDataStore.searchUsers(keyword, limit);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "search failed",
        users: []
      };
    }
  });

  ipcMain.handle("pet:duel-request-send", (_event, payload) => {
    try {
      const targetAccount =
        payload && typeof payload.targetAccount === "string" ? payload.targetAccount : "";
      return runtimeDataStore.sendDuelRequest(targetAccount);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "send request failed"
      };
    }
  });

  ipcMain.handle("pet:duel-request-list", () => {
    return runtimeDataStore.listDuelRequests();
  });

  ipcMain.handle("pet:set-active-pet", (_event, payload) => {
    const petId = payload && typeof payload.petId === "string" ? payload.petId : "";
    return runtimeDataStore.setActivePet(petId);
  });

  ipcMain.handle("pet:release-pet", (_event, payload) => {
    const petId = payload && typeof payload.petId === "string" ? payload.petId : "";
    return runtimeDataStore.releasePet(petId);
  });

  ipcMain.handle("pet:get-battle-reports", (_event, payload) => {
    const limit = payload && typeof payload.limit === "number" ? payload.limit : undefined;
    return runtimeDataStore.listBattleReports(limit);
  });

  ipcMain.handle("pet:get-nearby-wild-pets", (_event, payload) => {
    const radiusMeters =
      payload && typeof payload.radiusMeters === "number" ? payload.radiusMeters : undefined;
    const mapState = mapService.snapshot();
    return wildPetService.getNearbyWildPets({
      providerId: mapState.providerId,
      location: mapState.lastLocation,
      radiusMeters
    });
  });

  ipcMain.handle("pet:get-map-state", () => {
    return mapService.snapshot();
  });

  ipcMain.handle("pet:set-map-provider", (_event, payload) => {
    const providerId = payload && typeof payload.providerId === "string" ? payload.providerId : "";
    return mapService.setProvider(providerId);
  });

  ipcMain.handle("pet:request-map-permission", (_event, payload) => {
    const mode = payload && typeof payload.mode === "string" ? payload.mode : undefined;
    return mapService.requestPermission(mode);
  });

  ipcMain.handle("pet:get-current-location", () => {
    return mapService.getCurrentLocation();
  });

  ipcMain.handle("pet:start-map-watch", (_event, payload) => {
    const intervalMs = payload && typeof payload.intervalMs === "number" ? payload.intervalMs : undefined;
    return mapService.startWatch({ intervalMs });
  });

  ipcMain.handle("pet:stop-map-watch", () => {
    return mapService.stopWatch();
  });

  ipcMain.handle("pet:distance-to", (_event, payload) => {
    const target = payload && typeof payload.target === "object" ? payload.target : {};
    return mapService.distanceTo(target);
  });

  ipcMain.handle("pet:set-layout-mode", (_event, payload) => {
    let mode = "idle";
    if (payload && typeof payload.mode === "string") {
      if (payload.mode === "battle") {
        mode = "battle";
      } else if (payload.mode === "panel") {
        mode = "panel";
      }
    }
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    applyLayoutMode(mode);
    return true;
  });

  ipcMain.handle("pet:set-idle-window-size", (_event, payload) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return {
        ok: false,
        message: "window unavailable"
      };
    }

    const width = Number(payload?.width);
    const height = Number(payload?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      return {
        ok: false,
        message: "invalid size payload"
      };
    }

    currentIdleBounds = {
      width: Math.max(IDLE_SIZE_LIMITS.minWidth, Math.min(IDLE_SIZE_LIMITS.maxWidth, Math.round(width))),
      height: Math.max(
        IDLE_SIZE_LIMITS.minHeight,
        Math.min(IDLE_SIZE_LIMITS.maxHeight, Math.round(height))
      )
    };

    if (activeLayoutMode !== "idle") {
      return {
        ok: true,
        mode: activeLayoutMode,
        idleBounds: { ...currentIdleBounds }
      };
    }

    const current = mainWindow.getBounds();
    const centerX = current.x + Math.floor(current.width / 2);
    const centerY = current.y + Math.floor(current.height / 2);
    const next = clampBoundsToWorkArea(
      {
        x: centerX - Math.floor(currentIdleBounds.width / 2),
        y: centerY - Math.floor(currentIdleBounds.height / 2),
        width: currentIdleBounds.width,
        height: currentIdleBounds.height
      },
      { margin: activeLayoutMode === "panel" ? 8 : 0 }
    );
    mainWindow.setBounds(next, false);
    saveWindowBounds(next);
    return {
      ok: true,
      mode: activeLayoutMode,
      idleBounds: { ...currentIdleBounds },
      bounds: next
    };
  });
}

function closeBattleSession(status, winner, options = {}) {
  if (!activeBattleSession || !runtimeDataStore) return;
  let captureOutcome =
    options && typeof options === "object" && options.captureOutcome ? options.captureOutcome : null;
  if (activeBattleSession.mode === "capture" && !activeBattleSession.captureResolved) {
    captureOutcome = wildPetService.completeCaptureBattle({
      providerId: activeBattleSession.captureProviderId,
      wildPetId: activeBattleSession.captureWildPetId,
      success: false,
      runtimeDataStore
    });
    activeBattleSession.captureResolved = true;
  }

  const mode = activeBattleSession.mode === "capture" ? "capture" : "duel";
  const captureSuccess =
    mode === "capture" && captureOutcome && captureOutcome.ok
      ? Boolean(captureOutcome.success)
      : mode === "capture"
        ? false
        : null;
  const captureSerial =
    mode === "capture" && captureOutcome && captureOutcome.ok
      ? captureOutcome.wildPet?.serial || null
      : null;

  const endedAt = new Date().toISOString();
  runtimeDataStore.saveBattleReport({
    id: `battle-${activeBattleSession.id}`,
    sessionId: activeBattleSession.id,
    status,
    winner,
    mode,
    captureSuccess,
    captureSerial,
    startedAt: activeBattleSession.startedAt,
    endedAt,
    player: activeBattleSession.player,
    enemy: activeBattleSession.enemy,
    rounds: activeBattleSession.rounds
  });
  activeBattleSession = null;
}

function applyLayoutMode(mode) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  activeLayoutMode = mode;

  const target =
    mode === "battle" ? BATTLE_BOUNDS : mode === "panel" ? PANEL_BOUNDS : currentIdleBounds;
  const current = mainWindow.getBounds();
  const byTopLeft = mode === "panel";
  const next = byTopLeft
    ? clampBoundsToWorkArea(
        {
          x: current.x,
          y: current.y,
          width: target.width,
          height: target.height
        },
        { margin: 8 }
      )
    : (() => {
        const centerX = current.x + Math.floor(current.width / 2);
        const centerY = current.y + Math.floor(current.height / 2);
        return clampBoundsToWorkArea(
          {
            x: centerX - Math.floor(target.width / 2),
            y: centerY - Math.floor(target.height / 2),
            width: target.width,
            height: target.height
          },
          { margin: mode === "panel" ? 8 : 0 }
        );
      })();

  mainWindow.setResizable(false);
  mainWindow.setBounds(next, false);
  saveWindowBounds(next);
}

function getLayoutTargetSize(mode) {
  if (mode === "battle") {
    return { ...BATTLE_BOUNDS };
  }
  if (mode === "panel") {
    return { ...PANEL_BOUNDS };
  }
  return { ...currentIdleBounds };
}

app.whenReady().then(() => {
  createMainWindow();
  createTray();
  mapService.subscribe((state) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send("pet:map-state", state);
  });
  runtimeDataStore = new RuntimeDataStore({
    filePath: join(app.getPath("userData"), "pet-runtime-data.json")
  });
  if (typeof wildPetService.seedSerialCounters === "function") {
    const snapshot = runtimeDataStore.getInventorySnapshot();
    wildPetService.seedSerialCounters(snapshot.pets || []);
  }
  registerIpcHandlers();
  emitAuthState();
  if (hasAuthenticatedSession()) {
    openRuntimeAfterAuth();
  } else {
    openAuthGate();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      if (hasAuthenticatedSession()) {
        openRuntimeAfterAuth();
      } else {
        openAuthGate();
      }
    } else if (hasAuthenticatedSession()) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      }
    } else {
      openAuthGate();
    }
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  mapService.dispose();
  if (activeBattleSession) {
    closeBattleSession("abandoned", null);
  }
});

app.on("window-all-closed", () => {
  // Keep tray behavior.
});

