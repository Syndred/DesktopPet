const { existsSync, statSync } = require('node:fs');
const { join, resolve } = require('node:path');

// Discovery only: never creates a marker, moves a profile or writes a save.
function resolveProfilePath({ current, appData, override, isFile = file => existsSync(file) && statSync(file).isFile() }) {
  if (override) return resolve(override);
  const candidates = [...new Set([current, ...['Lingjing', 'qingpet-desktop-runtime', 'qingpet-lord-3d'].map(name => join(appData, name))].map(path => resolve(path)))];
  return candidates.find(path => isFile(join(path, 'lingjing.sqlite')))
    || candidates.find(path => isFile(join(path, 'pet-runtime-data.json')))
    || join(appData, 'Lingjing');
}
module.exports = { resolveProfilePath };
