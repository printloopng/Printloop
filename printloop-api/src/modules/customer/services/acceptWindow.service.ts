import { Config } from '@/config';
import { repos } from '@/config/repos';
import { PrintJob, PrintJobStatus } from '@/database/entities/printJob.entity';
import { Tenant } from '@/database/entities/tenant.entity';
import { KioskStatus } from '@/database/entities/kiosk.entity';
import { billablePages } from '@/modules/public/services/documentConvert.service';
import { computeCost } from '@/modules/public/services/pricing.service';
import { scheduledQueue } from '@/workers/queues';

export const ACCEPT_WINDOW_MS = 2 * 60 * 1000;

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export async function findRerouteCandidates(
  job: PrintJob,
  limit = 5,
): Promise<Tenant[]> {
  const current = job.tenantId
    ? await repos.tenant().findOne({
        where: { id: job.tenantId },
      })
    : null;

  const tenants = await repos.tenant().findDiscoverableActive();

  const kiosks = await repos.kiosk().find({
    where: { status: KioskStatus.ACTIVE },
  });
  const now = Date.now();
  const onlineKioskByTenant = new Map<string, boolean>();
  for (const k of kiosks) {
    if (!k.tenantId) continue;
    const online =
      Config.seedDemo ||
      Config.nodeEnv !== 'production' ||
      (k.lastSeenAt && now - new Date(k.lastSeenAt).getTime() < ONLINE_WINDOW_MS);
    if (online) onlineKioskByTenant.set(k.tenantId, true);
  }

  const withKiosk = tenants.filter(
    (t) =>
      t.id !== job.tenantId &&
      Boolean(t.paystackSubaccountCode) &&
      onlineKioskByTenant.has(t.id),
  );

  if (!current?.lat || !current?.lng) return withKiosk.slice(0, limit);

  return withKiosk
    .filter((t) => t.lat != null && t.lng != null)
    .sort(
      (a, b) =>
        haversineKm(
          { lat: current.lat!, lng: current.lng! },
          { lat: a.lat!, lng: a.lng! },
        ) -
        haversineKm(
          { lat: current.lat!, lng: current.lng! },
          { lat: b.lat!, lng: b.lng! },
        ),
    )
    .concat(withKiosk.filter((t) => t.lat == null || t.lng == null))
    .slice(0, limit);
}

export async function armAcceptWindow(printJobId: string): Promise<void> {
  try {
    await scheduledQueue.add(
      'accept-window',
      { printJobId },
      {
        delay: ACCEPT_WINDOW_MS,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        jobId: `accept-window:${printJobId}`,
      },
    );
  } catch (e: any) {
    console.error('[accept-window] arm failed:', e?.message);
  }
}

async function repriceForTenant(job: PrintJob, tenantId: string): Promise<number> {
  const cfg: any = job.printConfiguration || {};
  return computeCost({
    tenantId,
    pageCount: billablePages(job.totalPages || 0, cfg),
    copies: Number(cfg.copies) || 1,
    paper: cfg.paper || 'A4',
    color: cfg.color === 'color' ? 'color' : 'bw',
    sided: cfg.sided === 'double' ? 'double' : 'single',
    qualityDpi: [100, 300, 600].includes(Number(cfg.qualityDpi))
      ? (Number(cfg.qualityDpi) as 100 | 300 | 600)
      : 300,
  });
}

export async function enforceAcceptWindow(
  printJobId: string,
): Promise<{
  action: 'noop' | 'rerouted' | 'unaccepted';
  toTenantId?: string | null;
}> {
  const jobRepo = repos.printJob();
  const job = await jobRepo.findOne({
    where: { id: printJobId },
  });
  if (!job) return { action: 'noop' };
  if (job.status !== PrintJobStatus.AWAITING_ACCEPT) return { action: 'noop' };
  if (job.paymentReference) return { action: 'noop' };

  const candidates = await findRerouteCandidates(job);
  if (candidates.length === 0) {
    job.status = PrintJobStatus.FAILED;
    job.renderingError = 'No shop accepted this job, so you were not charged.';
    await jobRepo.save(job);
    return { action: 'unaccepted' };
  }

  const next = candidates[0];
  const fromTenantId = job.tenantId;
  job.tenantId = next.id;
  job.reroutedFromTenantId = fromTenantId;
  job.requiresAccept = true;
  const price = await repriceForTenant(job, next.id);
  job.cost = price;
  job.finalCost = price;
  await jobRepo.save(job);
  await armAcceptWindow(job.id);

  return { action: 'rerouted', toTenantId: next.id };
}

export async function acceptJob(printJobId: string): Promise<{
  accepted: boolean;
  status?: PrintJobStatus;
  reason?: string;
}> {
  const repo = repos.printJob();
  const job = await repo.findOne({ where: { id: printJobId } });
  if (!job) return { accepted: false, reason: 'not-found' };
  if (job.status !== PrintJobStatus.AWAITING_ACCEPT) {
    return { accepted: false, reason: `bad-status:${job.status}` };
  }

  job.status = job.paymentReference
    ? PrintJobStatus.READY
    : PrintJobStatus.AWAITING_PAYMENT;
  await repo.save(job);
  return { accepted: true, status: job.status };
}
