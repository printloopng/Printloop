import axios from 'axios';
import { logger } from '../utils/logger';
import { getSettings, isConfigured } from './settings';
import { emitKioskEvent } from './ipc';
import { kioskApi, unwrap, apiErrorMessage, httpStatus } from './api';
import { getPrinterState, printDocument, PrinterState } from './ipp';

export interface AgentJobItem {
  fileId: string;
  fileName: string;
  downloadUrl: string;
  printConfiguration: any;
  totalPages: number;
}

export interface AgentJob {
  id: string;
  code: string | null;
  jobType: string;
  totalPages: number;
  items: AgentJobItem[];
}

interface PollResponse {
  jobs: AgentJob[];
  revoked: string[];
  counts: { claimed: number; printing: number; queued: number; waitingForPickup: number; requeued: number };
  nextPollMs: number;
}

export interface QueueStatus {
  online: boolean;
  printer: PrinterState | 'unknown';
  printerReasons?: string;
  queued: number;
  waitingForPickup: number;
  current: JobUpdate | null;
  lastPollAt: string | null;
  error?: string;
}

export interface JobUpdate {
  jobId: string;
  code: string | null;
  state: 'printing' | 'done' | 'failed' | 'requeued';
  item?: number;
  totalItems?: number;
  pagesCompleted?: number;
  totalPages?: number;
  error?: string;
}

type Report = { kind: 'complete' | 'failed'; body: Record<string, unknown> };

const MAX_BACKOFF_MS = 60_000;
const AUTH_BACKOFF_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const CLAIM_PAUSE_MS = 30_000;

const queue: AgentJob[] = [];
const pendingReports = new Map<string, Report>();
const revoked = new Set<string>();
let current: AgentJob | null = null;

let running = false;
let polling = false;
let pollAgain = false;
let failures = 0;
let claimPausedUntil = 0;
let timer: NodeJS.Timeout | null = null;

const status: QueueStatus = {
  online: false,
  printer: 'unknown',
  queued: 0,
  waitingForPickup: 0,
  current: null,
  lastPollAt: null,
};

export function getQueueStatus(): QueueStatus {
  return status;
}

export function startJobPoller(): void {
  if (running) return;
  running = true;
  logger.info({ interval: getSettings().pollInterval }, 'Job poller started');
  schedule(0);
}

export function stopJobPoller(): void {
  running = false;
  if (timer) clearTimeout(timer);
  timer = null;
  logger.info('Job poller stopped');
}

export function pollNow(): void {
  if (!running) return;
  if (polling) pollAgain = true;
  else schedule(0);
}

function schedule(ms: number): void {
  if (timer) clearTimeout(timer);
  const delay = ms > 0 ? Math.round(ms * (0.9 + Math.random() * 0.2)) : 0;
  timer = setTimeout(tick, delay);
}

function emitStatus(): void {
  emitKioskEvent('queue:status', status);
}

function emitJob(update: JobUpdate): void {
  status.current = update.state === 'printing' ? update : null;
  emitKioskEvent('job:update', update);
  emitStatus();
}

function inFlightIds(): string[] {
  const ids = new Set<string>(queue.map((j) => j.id));
  if (current) ids.add(current.id);
  for (const id of pendingReports.keys()) ids.add(id);
  return [...ids];
}

async function tick(): Promise<void> {
  timer = null;
  polling = true;
  const settings = getSettings();
  let next = settings.pollInterval;

  try {
    if (!isConfigured()) {
      status.online = false;
      status.error = 'Kiosk not configured';
      return;
    }

    await flushReports();

    const printer = await getPrinterState(settings.printerUri);
    status.printer = printer.state;
    status.printerReasons = printer.reasons;
    const printerOk = printer.state === 'idle' || printer.state === 'processing';
    const idle = !current && queue.length === 0 && Date.now() >= claimPausedUntil;

    const res = await kioskApi().post('/agent/poll', {
      inFlight: inFlightIds(),
      max: idle && printerOk ? 1 : 0,
    });
    const data = unwrap<PollResponse>(res.data);

    failures = 0;
    status.online = true;
    status.error = undefined;
    status.lastPollAt = new Date().toISOString();
    status.queued = data.counts.queued;
    status.waitingForPickup = data.counts.waitingForPickup;

    for (const id of data.revoked) revoke(id);
    if (data.jobs.length) {
      logger.info({ jobs: data.jobs.map((j) => j.code ?? j.id) }, 'Claimed print job(s)');
      queue.push(...data.jobs);
      void runWorker();
    }
    next = data.nextPollMs || next;
  } catch (err) {
    failures++;
    const code = httpStatus(err);
    status.online = false;
    status.error = apiErrorMessage(err);
    next =
      code === 401 || code === 403
        ? AUTH_BACKOFF_MS
        : Math.min(MAX_BACKOFF_MS, settings.pollInterval * 2 ** Math.min(failures, 3));
    logger.warn({ err: status.error, status: code, retryInMs: next }, 'Job poll failed');
  } finally {
    polling = false;
    emitStatus();
    if (running) schedule(pollAgain ? 0 : next);
    pollAgain = false;
  }
}

function revoke(id: string): void {
  pendingReports.delete(id);
  const idx = queue.findIndex((j) => j.id === id);
  if (idx >= 0) queue.splice(idx, 1);
  if (current?.id === id) revoked.add(id);
}

async function runWorker(): Promise<void> {
  if (current) return;
  while (running && queue.length) {
    current = queue.shift()!;
    try {
      await printJob(current);
    } finally {
      revoked.delete(current.id);
      current = null;
      emitStatus();
    }
  }
  pollNow();
}

async function printJob(job: AgentJob): Promise<void> {
  const { printerUri } = getSettings();
  const totalItems = job.items.length;
  const totalPages = job.items.reduce((sum, it) => sum + (it.totalPages || 0), 0);
  let pagesCompleted = 0;
  const base = { jobId: job.id, code: job.code, totalItems, totalPages };

  try {
    for (const [i, item] of job.items.entries()) {
      if (revoked.has(job.id)) {
        logger.warn({ job: job.code }, 'Job cancelled mid-print; stopping');
        emitJob({ ...base, state: 'failed', pagesCompleted, error: 'Cancelled by the shop' });
        return;
      }
      emitJob({ ...base, state: 'printing', item: i + 1, pagesCompleted });

      const file = await axios.get<ArrayBuffer>(item.downloadUrl, {
        responseType: 'arraybuffer',
        timeout: DOWNLOAD_TIMEOUT_MS,
      });
      const mimeType = String(file.headers['content-type'] || 'application/pdf').split(';')[0];
      const cfg = item.printConfiguration || {};

      const { jobId } = await printDocument(printerUri, Buffer.from(file.data), {
        mimeType,
        jobName: `${job.code ?? job.id} · ${item.fileName}`,
        copies: Number(cfg.copies) || 1,
        sided: cfg.sided,
        color: cfg.color,
        paper: cfg.paper,
      });
      logger.info({ job: job.code, item: item.fileName, printerJobId: jobId }, 'Sent to printer');

      pagesCompleted += item.totalPages || 0;
      void reportProgress(job.id, pagesCompleted);
    }

    await report(job.id, {
      kind: 'complete',
      body: {
        confirmation: 'unconfirmed',
        method: 'none',
        detail: `${totalItems} file(s) accepted by printer`,
      },
    });
    emitJob({ ...base, state: 'done', pagesCompleted: totalPages });
  } catch (err) {
    const reason = apiErrorMessage(err);
    const retryable = pagesCompleted === 0 && isTransient(err);
    logger.error({ job: job.code, err: reason, retryable }, 'Print job failed');
    if (retryable) claimPausedUntil = Date.now() + CLAIM_PAUSE_MS;
    await report(job.id, { kind: 'failed', body: { reason, retryable } });
    emitJob({ ...base, state: retryable ? 'requeued' : 'failed', pagesCompleted, error: reason });
  }
}

function isTransient(err: unknown): boolean {
  const code = httpStatus(err);
  if (code !== undefined) return code >= 500 || code === 429;
  const msg = err instanceof Error ? `${(err as any).code ?? ''} ${err.message}` : String(err);
  return /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|EAI_AGAIN|did not respond|server-error-(busy|service-unavailable|not-accepting-jobs|temporary-error)/i.test(
    msg,
  );
}

async function reportProgress(jobId: string, pagesCompleted: number): Promise<void> {
  try {
    await kioskApi().post(`/agent/jobs/${jobId}/progress`, { pagesCompleted });
  } catch (err) {
    if (httpStatus(err) === 409) revoked.add(jobId);
    else logger.debug({ err: apiErrorMessage(err) }, 'Progress report failed');
  }
}

async function report(jobId: string, r: Report): Promise<void> {
  try {
    await kioskApi().post(`/agent/jobs/${jobId}/${r.kind}`, r.body);
    pendingReports.delete(jobId);
  } catch (err) {
    const code = httpStatus(err);
    if (code === 403 || code === 404 || code === 409) {
      pendingReports.delete(jobId);
      return;
    }
    pendingReports.set(jobId, r);
    logger.warn({ jobId, kind: r.kind, err: apiErrorMessage(err) }, 'Report failed; will retry');
  }
}

async function flushReports(): Promise<void> {
  for (const [jobId, r] of [...pendingReports]) await report(jobId, r);
}
