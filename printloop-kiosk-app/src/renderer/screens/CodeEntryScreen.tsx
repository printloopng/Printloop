import React, { useState, useEffect, useRef } from 'react';
import type { QueueStatus } from '../types';

interface CodeEntryScreenProps {
  queue: QueueStatus;
  onSubmit: (code: string) => void;
  onSettings: () => void;
}

function QueueStrip({ queue }: { queue: QueueStatus }) {
  const printerDown = queue.printer === 'unreachable' || queue.printer === 'stopped';
  const tone = !queue.online ? 'down' : printerDown ? 'warn' : '';
  const label = !queue.online
    ? 'Offline — reconnecting…'
    : printerDown
      ? `Printer ${queue.printer}${queue.printerReasons ? `: ${queue.printerReasons}` : ''}`
      : queue.current
        ? `Printing ${queue.current.code ?? ''}`
        : 'Online';
  return (
    <div className="queue-strip" role="status">
      <span>
        <span className={`dot ${tone}`} />
        {label}
      </span>
      {queue.online && <span>{queue.queued} in queue</span>}
      {queue.online && <span>{queue.waitingForPickup} awaiting pickup</span>}
    </div>
  );
}

// Same alphabet the API issues codes from (core/utils/releaseCode.ts):
// no 0/O or 1/I, so nothing on the keypad can be misread.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const KEY_ROWS = ['23456789', 'ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'];

export function CodeEntryScreen({ queue, onSubmit, onSettings }: CodeEntryScreenProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const update = (next: string) => {
    const clean = next
      .toUpperCase()
      .split('')
      .filter((c) => CODE_ALPHABET.includes(c))
      .join('')
      .slice(0, CODE_LENGTH);
    setError(null);
    setCode(clean);
    if (clean.length === CODE_LENGTH) onSubmit(clean);
  };

  const submit = () => {
    if (code.length === CODE_LENGTH) onSubmit(code);
    else setError(`Please enter all ${CODE_LENGTH} characters of your code`);
  };

  return (
    <div className="screen code-entry">
      <header className="header">
        <h1>PrintLoop Kiosk</h1>
        <button className="settings-btn" onClick={onSettings} aria-label="Settings">
          ⚙
        </button>
      </header>
      <QueueStrip queue={queue} />

      <main className="main">
        <div className="card">
          <h2>Enter Your Code</h2>
          
          <div className="code-display">
            {code.split('').map((char, i) => (
              <span key={i} className="code-char">{char || '◻'}</span>
            ))}
            {code.length < 6 && (
              <span className="code-char cursor">▌</span>
            )}
          </div>
          
          {error && <div className="error">{error}</div>}
          
          {/* Physical keyboards / barcode scanners type into this. */}
          <input
            ref={inputRef}
            type="text"
            value={code}
            onChange={(e) => update(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            maxLength={CODE_LENGTH}
            className="hidden-input"
            autoComplete="off"
            spellCheck={false}
          />

          <div className="keypad alnum">
            {KEY_ROWS.join('').split('').map((key) => (
              <button key={key} className="key" onClick={() => update(code + key)}>
                {key}
              </button>
            ))}
            <button className="key clear wide" onClick={() => update('')}>
              Clear
            </button>
            <button className="key backspace wide" onClick={() => update(code.slice(0, -1))} aria-label="Delete">
              ⌫
            </button>
            <button className="key enter wide" onClick={submit}>
              Continue
            </button>
          </div>

          <p className="hint">Enter the {CODE_LENGTH}-character code from your receipt, SMS or email</p>
        </div>
      </main>
    </div>
  );
}