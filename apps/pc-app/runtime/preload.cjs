const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("petApi", {
  setHitRegion(isInside) {
    ipcRenderer.send("pet:set-hit-region", Boolean(isInside));
  },
  getRuntimeInfo() {
    return ipcRenderer.invoke("pet:get-runtime-info");
  },
  togglePause() {
    return ipcRenderer.invoke("pet:toggle-pause");
  },
  battleReset(config) {
    return ipcRenderer.invoke("pet:battle-reset", config ?? {});
  },
  getBattleState() {
    return ipcRenderer.invoke("pet:battle-state");
  },
  battleAct(action) {
    return ipcRenderer.invoke("pet:battle-act", { action });
  },
  setLayoutMode(mode) {
    return ipcRenderer.invoke("pet:set-layout-mode", { mode });
  },
  onPauseState(listener) {
    const wrapped = (_event, state) => listener(Boolean(state));
    ipcRenderer.on("pet:pause-state", wrapped);
    return () => ipcRenderer.removeListener("pet:pause-state", wrapped);
  },
  onTogglePanel(listener) {
    const wrapped = (_event, visible) => listener(Boolean(visible));
    ipcRenderer.on("pet:toggle-panel", wrapped);
    return () => ipcRenderer.removeListener("pet:toggle-panel", wrapped);
  }
});
