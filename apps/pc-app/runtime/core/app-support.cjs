const { existsSync } = require('node:fs');
const { loginItemTarget } = require('../features/accounts/startup.cjs');

/** Only fixed, host-derived paths; renderer cannot supply a path or URL. */
function createAppSupport({ app, shell, platform = process.platform, launcher = () => loginItemTarget(), exists = existsSync }) {
  const executable = () => !app.isPackaged ? null : platform === 'win32' ? launcher()?.path || null : app.getPath('exe');
  const logs = () => app.getPath('logs');
  return {
    info() { return { packaged: app.isPackaged, executablePath: executable(), logsPath: logs(), logsAvailable: exists(logs()), automaticUpdates: false }; },
    async openLogs() {
      const target = logs();
      if (!exists(target)) throw Object.assign(new Error('当前运行还没有本地日志目录。可在关于页面查看版本与运行诊断；应用不会自动上传日志。'), { code: 'LOGS_UNAVAILABLE' });
      const error = await shell.openPath(target);
      if (error) throw Object.assign(new Error('无法打开本地日志目录，请使用页面显示的位置手动打开。'), { code: 'OPEN_LOGS_FAILED' });
      return { opened: true };
    },
    showExecutable() {
      const target = executable();
      if (!target || !exists(target)) throw Object.assign(new Error('无法定位稳定的程序文件，请从原便携版 EXE 启动；不要替换临时解压目录中的程序。'), { code: 'LAUNCHER_UNAVAILABLE' });
      shell.showItemInFolder(target); return { revealed: true };
    }
  };
}
module.exports = { createAppSupport };
