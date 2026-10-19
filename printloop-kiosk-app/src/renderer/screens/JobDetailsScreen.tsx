import React from 'react';
import type { PrintJobData } from '../types';

interface JobDetailsScreenProps {
  job: PrintJobData;
  busy: boolean;
  onPrint: () => void;
  onBack: () => void;
}

const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });

export function JobDetailsScreen({ job, busy, onPrint, onBack }: JobDetailsScreenProps) {
  const cfg = job.printConfig || {};
  const copies = cfg.copies || 1;

  return (
    <div className="screen job-details">
      <header className="header">
        <button className="back-btn" onClick={onBack} aria-label="Back">←</button>
        <h1>Print Job Details</h1>
        <div className="spacer" />
      </header>

      <main className="main">
        <div className="card">
          <div className="job-info">
            <div className="info-row">
              <span className="label">Document:</span>
              <span className="value">{job.fileName || 'Document'}</span>
            </div>
            <div className="info-row">
              <span className="label">Pages:</span>
              <span className="value">
                {job.totalPages}
                {copies > 1 ? ` × ${copies} copies` : ''}
              </span>
            </div>
            <div className="info-row">
              <span className="label">Paper:</span>
              <span className="value">
                {cfg.paper || 'A4'}, {cfg.sided === 'double' ? 'Double-sided' : 'Single-sided'},{' '}
                {cfg.color === 'color' ? 'Colour' : 'Black & white'}
              </span>
            </div>
            <div className="info-row total">
              <span className="label">Paid:</span>
              <span className="value">{naira.format(job.cost)}</span>
            </div>
          </div>

          <div className="actions">
            <button className="btn btn-primary btn-large" onClick={onPrint} disabled={busy}>
              {busy ? 'Starting…' : 'Print Now'}
            </button>
            <button className="btn btn-secondary btn-large" onClick={onBack} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
