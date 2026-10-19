import { contextBridge, ipcRenderer } from 'electron';

// Window.electronAPI's type lives in src/renderer/types.ts.
contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),
  quit: () => ipcRenderer.send('app:quit'),
  restart: () => ipcRenderer.send('app:restart'),
  onKioskEvent: (callback: (event: string, data: unknown) => void) => {
    const listener = (_event: unknown, eventName: string, data: unknown) => callback(eventName, data);
    ipcRenderer.on('kiosk:event', listener);
    return () => ipcRenderer.removeListener('kiosk:event', listener);
  },
  printJob: {
    fetch: (code: string) => ipcRenderer.invoke('print-job:fetch', code),
    release: (code: string) => ipcRenderer.invoke('print-job:release', code),
  },
  queue: {
    status: () => ipcRenderer.invoke('queue:status'),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
  },
  printer: {
    list: () => ipcRenderer.invoke('printer:list'),
    test: (printerUri: string) => ipcRenderer.invoke('printer:test', printerUri),
  },
});
