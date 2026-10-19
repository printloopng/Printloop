import { repos } from '@/config/repos';
import { PrintJob, PrintJobStatus } from '@/database/entities/printJob.entity';
import { Tenant } from '@/database/entities/tenant.entity';
import { KioskStatus } from '@/database/entities/kiosk.entity';
import { computeCommissionSplit } from '@/modules/saas/services/commission.service';
import { applyTransactionDelta } from '@/modules/saas/services/tenantBalance.service';
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
      process.env.SEED_DEMO === '1' ||
      process.env.NODE_ENV !== 'production' ||
      (k.lastSeenAt && now - new Date(k.lastSeenAt).getTime() < ONLINE_WINDOW_MS);
    if (online) onlineKioskByTenant.set(k.tenantId, true);
  }

  const withKiosk = tenants.filter(
    (t) =>
      t.id !== job.tenantId && onlineKioskByTenant.has(t.id),
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

export async function reverseJobCredit(
  tenantId: string,
  job: PrintJob,
): Promise<void> {
  const tenant = await repos.tenant().findOne({
    where: { id: tenantId },
  });
  if (!tenant) return;
  const amount = Number(job.cost) || 0;
  const split = computeCommissionSplit(tenant, amount);
  try {
    await applyTransactionDelta(tenantId, -amount, -split.commissionAmount);
  } catch (e) {
    console.error('[accept-window] ledger reversal failed:', e);
  }
}

export async function creditJobToTenant(
  tenantId: string,
  job: PrintJob,
): Promise<void> {
  const tenant = await repos.tenant().findOne({
    where: { id: tenantId },
  });
  if (!tenant) return;
  const amount = Number(job.cost) || 0;
  const split = computeCommissionSplit(tenant, amount);

  if (job.userId) {
    await repos.transaction().recordPrintForWalletUser({
      userId: job.userId,
      tenantId,
      amount,
      commissionAmount: split.commissionAmount,
      description: `Rerouted print accepted (${job.fileName || 'job'})`,
      reference: job.paymentReference || job.id,
    });
  }

  try {
    await applyTransactionDelta(tenantId, amount, split.commissionAmount);
  } catch (e) {
    console.error('[accept-window] ledger credit failed:', e);
  }
}

export async function enforceAcceptWindow(
  printJobId: string,
): Promise<{
  action: 'noop' | 'rerouted' | 'auto-accepted';
  toTenantId?: string | null;
}> {
  const jobRepo = repos.printJob();
  const job = await jobRepo.findOne({
    where: { id: printJobId },
  });
  if (!job) return { action: 'noop' };
  if (job.status !== PrintJobStatus.AWAITING_ACCEPT) return { action: 'noop' };

  const candidates = await findRerouteCandidates(job);
  if (candidates.length === 0) {
    job.status = PrintJobStatus.READY;
    job.reroutedFromTenantId = null;
    await jobRepo.save(job);
    return { action: 'auto-accepted' };
  }

  const next = candidates[0];
  const fromTenantId = job.tenantId;
  if (fromTenantId) await reverseJobCredit(fromTenantId, job);

  job.tenantId = next.id;
  job.reroutedFromTenantId = fromTenantId;
  await jobRepo.save(job);

  try {
    await scheduledQueue.add(
      'accept-window',
      { printJobId: job.id },
      {
        delay: ACCEPT_WINDOW_MS,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        jobId: `accept-window:${job.id}`,
      },
    );
  } catch (e: any) {
    console.error('[accept-window] re-arm failed:', e?.message);
  }

  return { action: 'rerouted', toTenantId: next.id };
}

export async function acceptJob(printJobId: string): Promise<{
  accepted: boolean;
  reason?: string;
}> {
  const repo = repos.printJob();
  const job = await repo.findOne({ where: { id: printJobId } });
  if (!job) return { accepted: false, reason: 'not-found' };
  if (job.status !== PrintJobStatus.AWAITING_ACCEPT) {
    return { accepted: false, reason: `bad-status:${job.status}` };
  }

  if (job.reroutedFromTenantId && job.tenantId) {
    await creditJobToTenant(job.tenantId, job);
  }

  job.status = PrintJobStatus.READY;
  job.reroutedFromTenantId = null;
  await repo.save(job);
  return { accepted: true };
}
