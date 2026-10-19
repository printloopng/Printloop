import { useState, useEffect, useCallback, useMemo } from 'react';
import type { KioskSettings, PrintJobData, PrinterInfo, TestPrintResult, PrintResult } from '../types';

const EMPTY_SETTINGS: KioskSettings = {
  apiKey: '',
  printerUri: '',
  heartbeatInterval: 15000,
  kioskName: 'PrintLoop Kiosk',
};

export function useKiosk() {
  const [settings, setSettings] = useState<KioskSettings>(EMPTY_SETTINGS);
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [job, setJob] = useState<PrintJobData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConfigured = useMemo(
    () => !!(settings.apiKey && settings.printerUri),
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
    setError(null);
    try {
      const jobData = await window.electronAPI?.printJob.fetch(code);
      if (!jobData) throw new Error('No job data returned');
      setJob(jobData);
      return jobData;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch job';
      setError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePrintJob = useCallback(async (): Promise<PrintResult> => {
    if (!job) return { success: false, jobId: '', error: 'No job loaded' };

    setLoading(true);
    try {
      const result = await window.electronAPI?.printJob.print(job.id, job.artifactKey);
      return result || { success: false, jobId: job.id, error: 'Print failed' };
    } catch (err) {
      return {
        success: false,
        jobId: job.id,
        error: err instanceof Error ? err.message : 'Print failed',
      };
    } finally {
      setLoading(false);
    }
  }, [job]);

  useEffect(() => {
    reloadSettings();
    refreshPrinters();
  }, [reloadSettings, refreshPrinters]);

  return {
    settings,
    printers,
    job,
    loading,
    error,
    isConfigured,
    fetchJob,
    printJob: handlePrintJob,
    refreshPrinters,
    testPrinter: handleTestPrinter,
    updateSetting,
  };
}
