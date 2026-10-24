import { contextBridge, ipcRenderer } from 'electron';
import type { AppBridge } from '../../../../packages/shared-types/src/app';

const bridge: AppBridge = {
  invoke: (feature, command, payload = {}) => ipcRenderer.invoke('lingjing:invoke', { feature, command, payload }),
  subscribe(name, listener) {
    const wrapped = (_event: unknown, event: { name: string; payload: unknown }) => { if (event?.name === name) listener(event.payload); };
    ipcRenderer.on('lingjing:event', wrapped);
    return () => ipcRenderer.removeListener('lingjing:event', wrapped);
  },
  window: { minimize: () => ipcRenderer.send('lingjing:window', 'minimize'), maximize: () => ipcRenderer.send('lingjing:window', 'maximize'), close: () => ipcRenderer.send('lingjing:window', 'close') }
};
contextBridge.exposeInMainWorld('lingjing', bridge);
