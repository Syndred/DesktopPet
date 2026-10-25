const { mkdirSync, realpathSync } = require('node:fs');
const { resolve } = require('node:path');

function canonicalProfilePath(profilePath) {
  const absolute = resolve(profilePath);
  // Electron also creates this directory for its native lock. Resolve junctions,
  // short paths and casing before that lock chooses its userData identity.
  mkdirSync(absolute, { recursive: true });
  return realpathSync.native(absolute);
}

function claimProfileInstance({ app, profilePath }) {
  const canonical = canonicalProfilePath(profilePath);
  app.setPath('userData', canonical);
  // Electron's ProcessSingleton is scoped to userData, not the EXE location.
  const primary = app.requestSingleInstanceLock();
  let showMain = null;
  let pending = false;
  let stopped = false;
  const activate = () => {
    if (!primary || stopped) return;
    if (showMain) showMain();
    else pending = true;
  };
  if (primary) app.on('second-instance', activate);
  return {
    primary,
    profilePath: canonical,
    ready(activateMain) {
      if (!primary || stopped) return;
      showMain = activateMain;
      if (pending) { pending = false; activate(); }
    },
    dispose() {
      stopped = true;
      pending = false;
      showMain = null;
      app.removeListener('second-instance', activate);
      // Keep the native lock until process exit, after SQLite has closed.
    },
  };
}

module.exports = { canonicalProfilePath, claimProfileInstance };
