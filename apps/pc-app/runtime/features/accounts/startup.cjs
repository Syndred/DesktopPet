const { win32 } = require('node:path');
const { statSync, realpathSync } = require('node:fs');
const { tmpdir } = require('node:os');

const regularFile = file => { try { return statSync(file).isFile(); } catch { return false; } };
const canonicalPath = file => { try { return realpathSync.native(file); } catch { return file; } };
function inside(directory, file) {
  const relative = win32.relative(directory, file);
  return relative === '' || (!relative.startsWith('..\\') && relative !== '..' && !win32.isAbsolute(relative));
}
/** electron-builder's outer portable launcher supplies FILE=$EXEPATH. The
 * running Electron child is extracted under TEMP and cannot be a login item. */
function loginItemTarget({ platform = process.platform, env = process.env, execPath = process.execPath,
  temporaryDirectories = [tmpdir(), env.TEMP, env.TMP], isFile = regularFile, realPath = canonicalPath } = {}) {
  if (platform !== 'win32') return {};
  const portable = env.PORTABLE_EXECUTABLE_FILE;
  const portableRuntime = Boolean(portable || env.PORTABLE_EXECUTABLE_DIR || env.PORTABLE_EXECUTABLE_APP_FILENAME);
  const candidate = portableRuntime ? portable : execPath;
  if (typeof candidate !== 'string' || /["\0]/.test(candidate) || win32.extname(candidate).toLowerCase() !== '.exe') return null;
  const root = win32.parse(candidate).root;
  if (!/^[a-z]:[\\/]$/i.test(root) && !/^\\\\[^\\]+\\[^\\]+\\$/.test(root)) return null;
  const executable = win32.normalize(candidate);
  if (!isFile(executable)) return null;
  // Windows may expose the same TEMP tree as Administrator or ADMINI~1.
  const canonicalExecutable = realPath(executable);
  if (temporaryDirectories.some(directory => typeof directory === 'string' && win32.isAbsolute(directory)
    && (inside(directory, executable) || inside(realPath(directory), canonicalExecutable)))) return null;
  return { path: executable, args: [] };
}

function createLoginItemController(app, target = () => loginItemTarget()) {
  return {
    apply(openAtLogin, { explicitStartupChange = false } = {}) {
      if (!explicitStartupChange) return;
      const options = target();
      if (openAtLogin && !options) throw Object.assign(new Error('无法定位稳定的启动程序，请从原便携版 EXE 启动后再开启。'), { code: 'STARTUP_LAUNCHER_UNAVAILABLE' });
      // Disabling remains available even if the original portable file was
      // moved or removed; never create an entry pointing at the temporary child.
      app.setLoginItemSettings({ ...options, openAtLogin, enabled: openAtLogin });
    },
    status() {
      const options = target();
      // Electron requires the same path/args for reading and writing an item.
      return options ? app.getLoginItemSettings?.(options)?.openAtLogin ?? false : false;
    }
  };
}
module.exports = { loginItemTarget, createLoginItemController };
