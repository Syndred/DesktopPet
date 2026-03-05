import electron from "electron";

const { contextBridge, ipcRenderer } = electron;

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
