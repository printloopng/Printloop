import { ipcMain, BrowserWindow } from 'electron';
import { getSettings, setSetting, KioskSettings } from './settings';
import { fetchPrintJob, releasePrintJob } from './printJob';
import { listPrinters, testPrinter } from './ipp';
import { getQueueStatus, pollNow } from './jobPoller';

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(window: BrowserWindow | null) {
  mainWindow = window;
}

export function setupIpcHandlers() {
  ipcMain.handle('settings:get', async () => {
    return getSettings();
  });

  ipcMain.handle('settings:set', async (_event, key: keyof KioskSettings, value: unknown) => {
    await setSetting(key, String(value));
    pollNow();
  });

  ipcMain.handle('print-job:fetch', async (_event, code: string) => {
    return fetchPrintJob(code);
  });

  ipcMain.handle('print-job:release', async (_event, code: string) => {
    return releasePrintJob(code);
  });

  ipcMain.handle('queue:status', async () => {
    return getQueueStatus();
  });

  ipcMain.handle('printer:list', async () => {
    return listPrinters();
  });

  ipcMain.handle('printer:test', async (_event, printerUri: string) => {
    return testPrinter(printerUri);
  });
}

export function emitKioskEvent(event: string, data: unknown) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('kiosk:event', event, data);
  }
}
