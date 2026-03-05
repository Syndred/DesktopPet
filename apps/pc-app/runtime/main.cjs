const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");

const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen } = require("electron");
const { BattleRuntimeService } = require("./services/battle-runtime.cjs");
const { RuntimeDataStore } = require("./services/runtime-data-store.cjs");
const { MapRuntimeService } = require("./services/map-runtime.cjs");
const { CAPTURE_RADIUS_METERS, WildPetRuntimeService } = require("./services/wild-pet-runtime.cjs");

let mainWindow = null;
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

const IDLE_BOUNDS = {
  width: 220,
  height: 250
};

const BATTLE_BOUNDS = {
  width: 360,
  height: 420
};

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
    transparent: true,
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
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

  mainWindow.on("move", scheduleSaveAndSnap);
  mainWindow.on("resize", scheduleSaveAndSnap);
}

function scheduleSaveAndSnap() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (moveTimer) clearTimeout(moveTimer);
  moveTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const snapped = clampBoundsToWorkArea(mainWindow.getBounds());
    mainWindow.setBounds(snapped);
    saveWindowBounds(snapped);
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
  const menu = Menu.buildFromTemplate([
    {
      label: mainWindow && mainWindow.isVisible() ? "Hide" : "Show",
      click: toggleWindowVisibility
    },
    {
      label: interactionPaused ? "Resume Interaction" : "Pause Interaction",
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
      label: "Open Panel",
      click: () => {
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
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
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

function clampBoundsToWorkArea(bounds) {
  const area = getVirtualWorkArea();
  const width = Math.min(Math.max(180, bounds.width), area.width);
  const height = Math.min(Math.max(200, bounds.height), area.height);
  const x = Math.min(Math.max(area.x, bounds.x), area.x + area.width - width);
  const y = Math.min(Math.max(area.y, bounds.y), area.y + area.height - height);
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
          captureOutcome = wildPetService.completeCaptureBattle({
            providerId: activeBattleSession.captureProviderId,
            wildPetId: activeBattleSession.captureWildPetId,
            success: result.roundResult.winner === "player",
            runtimeDataStore
          });
          activeBattleSession.captureResolved = true;
        }
        closeBattleSession("finished", result.roundResult.winner, { captureOutcome });
      }
    }

    return {
      ...result,
      captureOutcome,
      progression
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

  ipcMain.handle("pet:set-active-pet", (_event, payload) => {
    const petId = payload && typeof payload.petId === "string" ? payload.petId : "";
    return runtimeDataStore.setActivePet(petId);
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
    const mode =
      payload && typeof payload.mode === "string" && payload.mode === "battle" ? "battle" : "idle";
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    applyLayoutMode(mode);
    return true;
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

  const target = mode === "battle" ? BATTLE_BOUNDS : IDLE_BOUNDS;
  const current = mainWindow.getBounds();
  const centerX = current.x + Math.floor(current.width / 2);
  const centerY = current.y + Math.floor(current.height / 2);
  const next = clampBoundsToWorkArea({
    x: centerX - Math.floor(target.width / 2),
    y: centerY - Math.floor(target.height / 2),
    width: target.width,
    height: target.height
  });

  mainWindow.setResizable(true);
  mainWindow.setBounds(next);
  saveWindowBounds(next);
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
  registerIpcHandlers();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else if (mainWindow) {
      mainWindow.show();
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
