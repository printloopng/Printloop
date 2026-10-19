import React, { useState, useEffect } from 'react';

interface SettingsScreenProps {
  onSave: () => void;
  settings: {
    apiKey: string;
    printerUri: string;
    pollInterval: number;
    kioskName: string;
  };
  onUpdateSetting: (key: string, value: unknown) => void;
  printers: Array<{ uri: string; name: string; makeAndModel: string; state: string; isDefault: boolean }>;
  onRefreshPrinters: () => void;
  onTestPrinter: (printerUri: string) => Promise<{ success: boolean; error?: string }>;
}

export function SettingsScreen({
  onSave,
  settings,
  onUpdateSetting,
  printers,
  onRefreshPrinters,
  onTestPrinter,
}: SettingsScreenProps) {
  const [formData, setFormData] = useState(settings);
  const [testingPrinter, setTestingPrinter] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  useEffect(() => {
    setFormData(settings);
  }, [settings]);

  const handleChange = (key: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    for (const [key, value] of Object.entries(formData)) {
      await onUpdateSetting(key, value);
    }
    onSave();
  };

  const handleTest = async (printerUri: string) => {
    setTestingPrinter(printerUri);
    setTestResult(null);
    const result = await onTestPrinter(printerUri);
    setTestResult(result);
    setTestingPrinter(null);
  };

  return (
    <div className="screen settings">
      <header className="header">
        <button className="back-btn" onClick={onSave} aria-label="Back">←</button>
        <h1>Kiosk Settings</h1>
        <div className="spacer" />
      </header>
      
      <main className="main">
        <div className="card">
          <section className="settings-section">
            <h2>Cloud Connection</h2>
            <div className="form-group">
              <label htmlFor="apiKey">API Key</label>
              <input
                id="apiKey"
                type="password"
                value={formData.apiKey}
                onChange={(e) => handleChange('apiKey', e.target.value)}
                placeholder="kiosk_..."
              />
              <p className="form-hint">Tenant is resolved by the server from this key.</p>
            </div>
            <div className="form-group">
              <label htmlFor="kioskName">Kiosk Name</label>
              <input
                id="kioskName"
                type="text"
                value={formData.kioskName}
                onChange={(e) => handleChange('kioskName', e.target.value)}
                placeholder="Main Kiosk"
              />
            </div>
          </section>

          <section className="settings-section">
            <h2>Printer</h2>
            <div className="form-group">
              <div className="form-row">
                <label htmlFor="printerUri">Printer IPP address</label>
                <button className="btn btn-secondary" onClick={onRefreshPrinters}>
                  Refresh
                </button>
              </div>
              <input
                id="printerUri"
                type="text"
                list="known-printers"
                value={formData.printerUri}
                onChange={(e) => handleChange('printerUri', e.target.value.trim())}
                placeholder="ipp://192.168.1.50/ipp/print"
              />
              <datalist id="known-printers">
                {printers.map((p) => (
                  <option key={p.uri} value={p.uri}>
                    {p.name} ({p.makeAndModel}) · {p.state}
                  </option>
                ))}
              </datalist>
              <p className="form-hint">
                Network printers: ipp://&lt;printer-ip&gt;/ipp/print. Local CUPS:
                ipp://localhost:631/printers/&lt;queue-name&gt;.
              </p>
              {formData.printerUri && (
                <div className="printer-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleTest(formData.printerUri!)}
                    disabled={testingPrinter === formData.printerUri}
                  >
                    {testingPrinter ? 'Checking...' : 'Check Printer'}
                  </button>
                  {testResult && (
                    <span className={testResult.success ? 'success' : 'error'}>
                      {testResult.success ? '✓ Test successful' : `✗ ${testResult.error}`}
                    </span>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="settings-section">
            <h2>Advanced</h2>
            <div className="form-group">
              <label htmlFor="pollInterval">Job check interval (ms)</label>
              <input
                id="pollInterval"
                type="number"
                value={formData.pollInterval}
                onChange={(e) => handleChange('pollInterval', parseInt(e.target.value, 10))}
                min="3000"
                max="60000"
                step="1000"
              />
              <p className="form-hint">
                How often the kiosk asks PrintLoop for released jobs. The server speeds this up
                automatically while jobs are queued.
              </p>
            </div>
          </section>

          <div className="actions">
            <button className="btn btn-primary btn-large" onClick={handleSave}>
              Save Settings
            </button>
            <button className="btn btn-secondary btn-large" onClick={onSave}>
              Cancel
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}