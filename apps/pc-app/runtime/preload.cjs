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
  battleEnd() {
    return ipcRenderer.invoke("pet:battle-end");
  },
  getPetInventory() {
    return ipcRenderer.invoke("pet:get-inventory");
  },
  getAuthSession() {
    return ipcRenderer.invoke("pet:auth-session");
  },
  authRegister(account, password, username) {
    return ipcRenderer.invoke("pet:auth-register", { account, password, username });
  },
  authLogin(account, password) {
    return ipcRenderer.invoke("pet:auth-login", { account, password });
  },
  authLogout() {
    return ipcRenderer.invoke("pet:auth-logout");
  },
  authUpdateProfile(payload) {
    return ipcRenderer.invoke("pet:auth-update-profile", payload ?? {});
  },
  searchUsers(keyword, limit) {
    return ipcRenderer.invoke("pet:user-search", { keyword, limit });
  },
  sendDuelRequest(targetAccount, options) {
    return ipcRenderer.invoke("pet:duel-request-send", {
      targetAccount,
      allowResend: Boolean(options?.allowResend)
    });
  },
  listDuelRequests() {
    return ipcRenderer.invoke("pet:duel-request-list");
  },
  respondDuelRequest(payload) {
    return ipcRenderer.invoke("pet:duel-request-respond", payload ?? {});
  },
  cancelDuelRequest(requestId) {
    return ipcRenderer.invoke("pet:duel-request-cancel", { requestId });
  },
  getOnlineDuelStatus() {
    return ipcRenderer.invoke("pet:duel-online-status");
  },
  createOnlineDuelRoom(payload) {
    return ipcRenderer.invoke("pet:duel-online-create-room", payload ?? {});
  },
  joinOnlineDuelRoom(payload) {
    return ipcRenderer.invoke("pet:duel-online-join-room", payload ?? {});
  },
  syncOnlineDuelRoom(payload) {
    return ipcRenderer.invoke("pet:duel-online-sync-room", payload ?? {});
  },
  leaveOnlineDuelRoom(reason) {
    return ipcRenderer.invoke("pet:duel-online-leave-room", { reason });
  },
  onlineDuelReset(payload) {
    return ipcRenderer.invoke("pet:duel-online-reset", payload ?? {});
  },
  onlineDuelAct(action) {
    return ipcRenderer.invoke("pet:duel-online-act", { action });
  },
  setActivePet(petId) {
    return ipcRenderer.invoke("pet:set-active-pet", { petId });
  },
  releasePet(petId) {
    return ipcRenderer.invoke("pet:release-pet", { petId });
  },
  getBattleReports(limit) {
    return ipcRenderer.invoke("pet:get-battle-reports", { limit });
  },
  getNearbyWildPets(radiusMeters) {
    return ipcRenderer.invoke("pet:get-nearby-wild-pets", { radiusMeters });
  },
  beginCaptureBattle(payload) {
    return ipcRenderer.invoke("pet:begin-capture-battle", payload ?? {});
  },
  resolveCapture(accept) {
    return ipcRenderer.invoke("pet:resolve-capture", { accept: Boolean(accept) });
  },
  getMapState() {
    return ipcRenderer.invoke("pet:get-map-state");
  },
  setMapProvider(providerId) {
    return ipcRenderer.invoke("pet:set-map-provider", { providerId });
  },
  requestMapPermission(mode) {
    return ipcRenderer.invoke("pet:request-map-permission", { mode });
  },
  getCurrentLocation() {
    return ipcRenderer.invoke("pet:get-current-location");
  },
  startMapWatch(intervalMs) {
    return ipcRenderer.invoke("pet:start-map-watch", { intervalMs });
  },
  stopMapWatch() {
    return ipcRenderer.invoke("pet:stop-map-watch");
  },
  distanceTo(target) {
    return ipcRenderer.invoke("pet:distance-to", { target });
  },
  setLayoutMode(mode) {
    return ipcRenderer.invoke("pet:set-layout-mode", { mode });
  },
  setIdleWindowSize(size) {
    return ipcRenderer.invoke("pet:set-idle-window-size", size ?? {});
  },
  moveWindowBy(delta) {
    ipcRenderer.send("pet:move-window-by", delta ?? {});
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
  },
  onMapState(listener) {
    const wrapped = (_event, state) => listener(state);
    ipcRenderer.on("pet:map-state", wrapped);
    return () => ipcRenderer.removeListener("pet:map-state", wrapped);
  },
  onAuthState(listener) {
    const wrapped = (_event, session) => listener(session);
    ipcRenderer.on("pet:auth-state", wrapped);
    return () => ipcRenderer.removeListener("pet:auth-state", wrapped);
  },
  onOnlineDuelEvent(listener) {
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on("pet:duel-online-event", wrapped);
    return () => ipcRenderer.removeListener("pet:duel-online-event", wrapped);
  }
});
