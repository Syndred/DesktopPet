const { contextBridge, ipcRenderer } = require('electron');
const argument = process.argv.find(value => value.startsWith('--companion-channel='));
const channel = argument?.slice('--companion-channel='.length);
const allowed = new Set(['snapshot', 'hit', 'miss', 'drag-start', 'drag-move', 'drag-end', 'interact', 'recall']);
contextBridge.exposeInMainWorld('companionDesktop', {
  invoke(command, payload) {
    if (!channel || !allowed.has(command)) return Promise.resolve({ ok: false, code: 'INVALID_INPUT', message: '无效桌面操作' });
    return ipcRenderer.invoke(channel, command, payload);
  },
  onChange(listener) {
    const handler = () => listener();
    ipcRenderer.on('companions:desktop-changed', handler);
    return () => ipcRenderer.removeListener('companions:desktop-changed', handler);
  }
});
