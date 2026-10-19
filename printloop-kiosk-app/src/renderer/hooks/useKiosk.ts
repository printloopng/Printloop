import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  KioskSettings,
  PrintJobData,
  PrinterInfo,
  TestPrintResult,
  QueueStatus,
  JobUpdate,
  ReleaseResult,
} from '../types';

const EMPTY_SETTINGS: KioskSettings = {
  apiUrl: '',
  apiKey: '',
  printerUri: '',
  pollInterval: 10000,
  kioskName: 'PrintLoop Kiosk',
};

const EMPTY_QUEUE: QueueStatus = {
  online: false,
  printer: 'unknown',
  queued: 0,
  waitingForPickup: 0,
  current: null,
  lastPollAt: null,
};

export function useKiosk() {
  const [settings, setSettings] = useState<KioskSettings>(EMPTY_SETTINGS);
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [job, setJob] = useState<PrintJobData | null>(null);
  const [queue, setQueue] = useState<QueueStatus>(EMPTY_QUEUE);
  const [lastUpdate, setLastUpdate] = useState<JobUpdate | null>(null);
  const [loading, setLoading] = useState(false);

  const isConfigured = useMemo(
    () => !!(settings.apiUrl && settings.apiKey && settings.printerUri),
    [settings],
  );

  const reloadSettings = useCallback(async () => {
    try {
      const next = await window.electronAPI?.settings.get();
      if (next) setSettings(next);
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }, []);

  const refreshPrinters = useCallback(async () => {
    try {
      const printerList = (await window.electronAPI?.printer.list()) || [];
      setPrinters(printerList);
    } catch (err) {
      console.error('Failed to refresh printers:', err);
    }
  }, []);

  const handleTestPrinter = useCallback(async (printerUri: string): Promise<TestPrintResult> => {
    try {
      const result = await window.electronAPI?.printer.test(printerUri);
      return result || { success: false, error: 'Test failed' };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Test failed' };
    }
  }, []);

  const updateSetting = useCallback(
    async (key: keyof KioskSettings, value: unknown) => {
      await window.electronAPI?.settings.set(key, String(value));
      await reloadSettings();
    },
    [reloadSettings],
  );

  const fetchJob = useCallback(async (code: string): Promise<PrintJobData> => {
    setLoading(true);
    try {
      const jobData = await window.electronAPI?.printJob.fetch(code);
      if (!jobData) throw new Error('No job data returned');
      setJob(jobData);
      setLastUpdate(null);
      return jobData;
    } catch (err) {
      throw new Error(cleanIpcError(err, 'Failed to fetch job'));
    } finally {
      setLoading(false);
    }
  }, []);

  const releaseJob = useCallback(async (): Promise<ReleaseResult> => {
    if (!job) throw new Error('No job loaded');
    setLoading(true);
    try {
      return await window.electronAPI.printJob.release(job.code);
    } catch (err) {
      throw new Error(cleanIpcError(err, 'Could not start printing'));
    } finally {
      setLoading(false);
    }
  }, [job]);

  const clearJob = useCallback(() => {
    setJob(null);
    setLastUpdate(null);
  }, []);

  useEffect(() => {
    reloadSettings();
    refreshPrinters();
    window.electronAPI?.queue.status().then(setQueue).catch(() => {});
    return window.electronAPI?.onKioskEvent((event, data) => {
      if (event === 'queue:status') setQueue({ ...(data as QueueStatus) });
      if (event === 'job:update') setLastUpdate(data as JobUpdate);
    });
  }, [reloadSettings, refreshPrinters]);

  return {
    settings,
    printers,
    job,
    queue,
    lastUpdate,
    loading,
    isConfigured,
    fetchJob,
    releaseJob,
    clearJob,
    refreshPrinters,
    testPrinter: handleTestPrinter,
    updateSetting,
  };
}

// Electron prefixes errors thrown across IPC with "Error invoking remote method ...: Error: ".
function cleanIpcError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : '';
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') || fallback;
}
