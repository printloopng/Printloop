import React, { useState, useEffect, useRef } from 'react';

interface SettingsScreenProps {
  onSave: () => void;
  canExit: boolean;
  settings: {
    apiKey: string;
    printerUri: string;
    pollInterval: number;
    kioskName: string;
  };
  onUpdateSetting: (key: string, value: unknown) => Promise<void>;
  printers: Array<{ uri: string; name: string; makeAndModel: string; state: string; isDefault: boolean }>;
  onRefreshPrinters: () => void;
  onTestPrinter: (printerUri: string) => Promise<{ success: boolean; error?: string }>;
}

export function SettingsScreen({
  onSave,
  canExit,
  settings,
  onUpdateSetting,
  printers,
  onRefreshPrinters,
  onTestPrinter,
}: SettingsScreenProps) {
  const [formData, setFormData] = useState(settings);
  const [testingPrinter, setTestingPrinter] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!savingRef.current) setFormData(settings);
  }, [settings]);

  const handleChange = (key: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (savingRef.current) return;
    setSaveError(null);

    if (!formData.apiKey.trim() || !formData.printerUri.trim()) {
      setSaveError('Enter the API key and the printer address to continue.');
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      for (const [key, value] of Object.entries(formData)) {
        await onUpdateSetting(key, value);
      }
      savingRef.current = false;
      onSave();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save settings';
      setSaveError(msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleTest = async (printerUri: string) => {
    setTestingPrinter(printerUri);
    setTestResult(null);
    const result = await onTestPrinter(printerUri);
    setTestResult(result);
    setTestingPrinter(null);
  };

  const checking = testingPrinter !== null;
  const pollSeconds = Number.isFinite(formData.pollInterval)
    ? Math.round(formData.pollInterval / 1000)
    : null;

  return (
    <div className="screen settings">
      <header className="header settings-header">
        {canExit ? (
          <button className="back-btn" onClick={onSave} aria-label="Back">←</button>
        ) : (
          <div className="spacer" />
        )}
        <div className="settings-title">
          <span className="editorial-label">{canExit ? 'Kiosk setup' : 'First-time setup'}</span>
          <h1>Settings</h1>
        </div>
        <div className="spacer" />
      </header>

      <main className="settings-main">
        <div className="settings-stack">
          <section className="settings-card">
            <div className="settings-card-intro">
              <span className="settings-index">01</span>
              <h2>Cloud connection</h2>
              <p>Links this kiosk to your shop on PrintLoop.</p>
            </div>
            <div className="settings-card-fields">
              <div className="form-group">
                <label htmlFor="apiKey">API key</label>
                <div className="input-with-action">
                  <input
                    id="apiKey"
                    type={showKey ? 'text' : 'password'}
                    value={formData.apiKey}
                    onChange={(e) => handleChange('apiKey', e.target.value)}
                    placeholder="kiosk_..."
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-compact"
                    onClick={() => setShowKey((v) => !v)}
                  >
                    {showKey ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p className="form-hint">The shop is resolved by the server from this key.</p>
              </div>
              <div className="form-group">
                <label htmlFor="kioskName">Kiosk name</label>
                <input
                  id="kioskName"
                  type="text"
                  value={formData.kioskName}
                  onChange={(e) => handleChange('kioskName', e.target.value)}
                  placeholder="Main Kiosk"
                />
                <p className="form-hint">Shown to shop staff in the dashboard.</p>
              </div>
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-intro">
              <span className="settings-index">02</span>
              <h2>Printer</h2>
              <p>Where released jobs are sent to print.</p>
            </div>
            <div className="settings-card-fields">
              <div className="form-group">
                <div className="form-row">
                  <label htmlFor="printerUri">Printer IPP address</label>
                  <button
                    type="button"
                    className="btn btn-secondary btn-compact"
                    onClick={onRefreshPrinters}
                  >
                    Refresh
                  </button>
                </div>
                <input
                  id="printerUri"
                  type="text"
                  value={formData.printerUri}
                  onChange={(e) => handleChange('printerUri', e.target.value.trim())}
                  placeholder="ipp://192.168.1.50/ipp/print"
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="form-hint">
                  Network: <code>ipp://&lt;printer-ip&gt;/ipp/print</code> · Local CUPS:{' '}
                  <code>ipp://localhost:631/printers/&lt;queue&gt;</code>
                </p>
              </div>

              {printers.length > 0 && (
                <div className="form-group">
                  <span className="field-label">Detected printers</span>
                  <ul className="printer-list">
                    {printers.map((p) => (
                      <li key={p.uri}>
                        <button
                          type="button"
                          className={`printer-option${
                            formData.printerUri === p.uri ? ' selected' : ''
                          }`}
                          onClick={() => handleChange('printerUri', p.uri)}
                        >
                          <span className="printer-option-main">
                            <strong>{p.name}</strong>
                            <span>{p.makeAndModel}</span>
                          </span>
                          <span className="chip">{p.state}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {formData.printerUri && (
                <div className="printer-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-compact"
                    onClick={() => handleTest(formData.printerUri)}
                    disabled={checking}
                  >
                    {checking ? 'Checking…' : 'Check printer'}
                  </button>
                  {testResult && (
                    <span className={`test-result ${testResult.success ? 'ok' : 'fail'}`}>
                      {testResult.success ? 'Printer responded' : testResult.error}
                    </span>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-intro">
              <span className="settings-index">03</span>
              <h2>Advanced</h2>
              <p>Tuning for how often this kiosk checks in.</p>
            </div>
            <div className="settings-card-fields">
              <div className="form-group">
                <label htmlFor="pollInterval">Job check interval</label>
                <div className="input-with-suffix">
                  <input
                    id="pollInterval"
                    type="number"
                    value={Number.isFinite(formData.pollInterval) ? formData.pollInterval : ''}
                    onChange={(e) => handleChange('pollInterval', parseInt(e.target.value, 10))}
                    min="3000"
                    max="60000"
                    step="1000"
                  />
                  <span className="suffix">ms{pollSeconds ? ` · ${pollSeconds}s` : ''}</span>
                </div>
                <p className="form-hint">
                  How often the kiosk asks PrintLoop for released jobs (3–60 seconds). The server
                  speeds this up automatically while jobs are queued.
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="settings-footer">
        <div className="settings-footer-inner">
          {saveError ? (
            <div className="settings-error" role="alert">{saveError}</div>
          ) : (
            <span className="settings-footer-note">
              {canExit
                ? 'Changes apply when you save.'
                : 'Add an API key and a printer to start using this kiosk.'}
            </span>
          )}
          <div className="settings-footer-actions">
            {canExit && (
              <button type="button" className="btn btn-secondary" onClick={onSave}>
                Cancel
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}