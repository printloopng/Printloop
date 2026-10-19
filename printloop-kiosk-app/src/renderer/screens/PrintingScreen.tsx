import React, { useEffect, useState } from 'react';
import type { JobUpdate, PrintJobData, QueueStatus, ReleaseResult } from '../types';

interface PrintingScreenProps {
  job: PrintJobData;
  mode: ReleaseResult['mode'];
  update: JobUpdate | null;
  queue: QueueStatus;
  onComplete: (success: boolean, error?: string) => void;
}

const DONE_RETURN_MS = 6_000;
const SLOW_AFTER_MS = 90_000;

export function PrintingScreen({ job, mode, update, queue, onComplete }: PrintingScreenProps) {
  const [slow, setSlow] = useState(false);
  const state = mode === 'cloud-push' ? 'done' : update?.state;

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (state === 'failed') onComplete(false, update?.error || 'Print failed');
    if (state === 'done') {
      const t = setTimeout(() => onComplete(true), DONE_RETURN_MS);
      return () => clearTimeout(t);
    }
  }, [state, update, onComplete]);

  const printerDown = queue.printer === 'unreachable' || queue.printer === 'stopped';
  const total = update?.totalPages || job.totalPages || 1;
  const progress =
    state === 'done' ? 100 : state === 'printing' ? Math.max(5, Math.round(((update?.pagesCompleted ?? 0) / total) * 100)) : 0;

  let message: string;
  if (state === 'done') message = 'Done! Please collect your pages.';
  else if (state === 'printing' && (update?.totalItems ?? 1) > 1)
    message = `Printing file ${update?.item} of ${update?.totalItems}…`;
  else if (state === 'printing') message = 'Printing…';
  else if (state === 'requeued') message = 'The printer had a hiccup. Retrying shortly…';
  else if (printerDown)
    message = `Printer is unavailable${queue.printerReasons ? ` (${queue.printerReasons})` : ''}. Your job is saved and will print once it is back.`;
  else message = 'Sending your job to the printer…';

  return (
    <div className="screen printing">
      <header className="header">
        <h1>{state === 'done' ? 'Printed' : 'Printing'}</h1>
      </header>

      <main className="main">
        <div className="card printing-card">
          <div className="printer-icon">{state === 'done' ? '✅' : '🖨️'}</div>
          <p className="job-code">Code {job.code}</p>

          <div className="progress-container">
            <div className="progress-bar">
              <div
                className={`progress-fill ${state ? '' : 'indeterminate'}`}
                style={{ width: state ? `${progress}%` : '30%' }}
              />
            </div>
            {state && <div className="progress-text">{progress}%</div>}
          </div>

          <p className="status">{message}</p>

          {(state === 'done' || (slow && !state)) && (
            <div className="actions">
              {slow && !state && (
                <p className="hint">
                  Your job is queued and will print automatically. Ask a staff member if you can't wait.
                </p>
              )}
              <button className="btn btn-primary btn-large" onClick={() => onComplete(true)}>
                Done
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
