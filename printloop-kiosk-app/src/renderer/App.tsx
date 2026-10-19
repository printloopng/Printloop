import React, { useState, useCallback } from 'react';
import { CodeEntryScreen } from './screens/CodeEntryScreen';
import { JobDetailsScreen } from './screens/JobDetailsScreen';
import { PrintingScreen } from './screens/PrintingScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ErrorScreen } from './screens/ErrorScreen';
import { useKiosk } from './hooks/useKiosk';
import type { ReleaseResult } from './types';

type Screen = 'code-entry' | 'job-details' | 'printing' | 'settings' | 'error';

const App: React.FC = () => {
  const [screen, setScreen] = useState<Screen>('code-entry');
  const [error, setError] = useState<string | null>(null);
  const [releaseMode, setReleaseMode] = useState<ReleaseResult['mode']>('kiosk-pull');

  const {
    job,
    queue,
    lastUpdate,
    loading,
    fetchJob,
    releaseJob,
    clearJob,
    isConfigured,
    settings,
    printers,
    refreshPrinters,
    testPrinter,
    updateSetting,
  } = useKiosk();

  const showError = useCallback((err: unknown, fallback: string) => {
    setError(err instanceof Error ? err.message : fallback);
    setScreen('error');
  }, []);

  const handleCodeSubmit = useCallback(async (code: string) => {
    try {
      setError(null);
      await fetchJob(code);
      setScreen('job-details');
    } catch (err) {
      showError(err, 'Failed to fetch job');
    }
  }, [fetchJob, showError]);

  const handlePrint = useCallback(async () => {
    try {
      const { mode } = await releaseJob();
      setReleaseMode(mode);
      setScreen('printing');
    } catch (err) {
      showError(err, 'Could not start printing');
    }
  }, [releaseJob, showError]);

  const handlePrintComplete = useCallback((success: boolean, err?: string) => {
    if (success) {
      clearJob();
      setScreen('code-entry');
    } else {
      showError(new Error(err || 'Print failed'), 'Print failed');
    }
  }, [clearJob, showError]);

  const handleBack = useCallback(() => {
    clearJob();
    setError(null);
    setScreen('code-entry');
  }, [clearJob]);

  const settingsScreen = (
    <SettingsScreen
      onSave={handleBack}
      settings={settings}
      onUpdateSetting={(key, value) => updateSetting(key as any, value)}
      printers={printers}
      onRefreshPrinters={refreshPrinters}
      onTestPrinter={testPrinter}
    />
  );

  if (!isConfigured) return settingsScreen;

  switch (screen) {
    case 'job-details':
      return job ? (
        <JobDetailsScreen job={job} busy={loading} onPrint={handlePrint} onBack={handleBack} />
      ) : null;
    case 'printing':
      return job ? (
        <PrintingScreen
          job={job}
          mode={releaseMode}
          update={lastUpdate?.jobId === job.jobId ? lastUpdate : null}
          queue={queue}
          onComplete={handlePrintComplete}
        />
      ) : null;
    case 'settings':
      return settingsScreen;
    case 'error':
      return <ErrorScreen error={error || 'Unknown error'} onRetry={handleBack} onBack={handleBack} />;
    default:
      return (
        <CodeEntryScreen queue={queue} onSubmit={handleCodeSubmit} onSettings={() => setScreen('settings')} />
      );
  }
};

export default App;
