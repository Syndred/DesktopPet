import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import electron from "electron";

const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen } = electron;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow = null;
let tray = null;
let isQuitting = false;
let interactionPaused = false;
let moveTimer = null;

const DEFAULT_BOUNDS = {
  x: 40,
  y: 40,
  width: 360,
  height: 420
};

function createMainWindow() {
  const restored = loadWindowBounds();
  const bounds = clampBoundsToWorkArea(restored ?? DEFAULT_BOUNDS);

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
      preload: join(__dirname, "preload.mjs"),
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
      label: mainWindow?.isVisible() ? "Hide" : "Show",
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
    {
      type: "separator"
    },
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
    // Non-blocking. The app should keep running even if persistence fails.
  }
}

function getWindowConfigPath() {
  return join(app.getPath("userData"), "pet-window-bounds.json");
}

function clampBoundsToWorkArea(bounds) {
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.min(Math.max(280, bounds.width), area.width);
  const height = Math.min(Math.max(320, bounds.height), area.height);
  const x = Math.min(Math.max(area.x, bounds.x), area.x + area.width - width);
  const y = Math.min(Math.max(area.y, bounds.y), area.y + area.height - height);
  return { x, y, width, height };
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
}

app.whenReady().then(() => {
  createMainWindow();
  createTray();
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
});

app.on("window-all-closed", () => {
  // Keep tray app behavior across platforms.
});
