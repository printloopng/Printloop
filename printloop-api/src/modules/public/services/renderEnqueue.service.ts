import { Config } from '@/config';
import { renderQueue } from '@/workers/queues';
import { storageKeyFromUrl } from '@/core/utils/fileStore';
import { REDIS_ENABLED } from '@/config/redis';
import { PrintJob, PrintJobStatus, JobType } from '@/database/entities/printJob.entity';
import { repos } from '@/config/repos';
import { applyRenderCostReconciliation } from '@/modules/saas/services/costReconciliation.service';
import { stuckRendersGauge } from '@/core/services/metrics';

export async function enqueueRender(printJobId: string): Promise<{
  enqueued: boolean;
  reason?: string;
}> {
  if (!REDIS_ENABLED || !Config.render.enabled) {
    return { enqueued: false, reason: 'render-disabled' };
  }

  const repo = repos.printJob();
  const job = await repo.findOne({ where: { id: printJobId }, relations: ['file'] });
  if (!job) return { enqueued: false, reason: 'not-found' };

  if (job.jobType === JobType.PERSONAL_BATCH) {
    return { enqueued: false, reason: 'batch-parent' };
  }

  const TRIGGER_STATES = new Set<PrintJobStatus>([
    PrintJobStatus.PENDING,
    PrintJobStatus.AWAITING_ACCEPT,
  ]);
  if (!TRIGGER_STATES.has(job.status)) {
    return { enqueued: false, reason: `bad-status:${job.status}` };
  }

  const prevStatus = job.status;
  job.status = PrintJobStatus.RENDERING;
  job.renderingStatus = 'processing';
  job.renderingStartedAt = new Date();
  job.renderingError = null;
  job.renderingCompletedAt = null;
  await repo.save(job);

  try {
    const fileURL = job.file?.watermarkedUrl || job.file?.fileURL || null;
    const fileName = job.fileName || job.file?.fileName || 'document.pdf';

    const { resolveProfileForJob, resolveProfileRenderOpts } = await import(
      '@/modules/saas/services/printerProfile.service'
    );
    const profile = await resolveProfileForJob({
      tenantId: job.tenantId,
      printerProfileId: job.printerProfileId,
    });
    const profileOpts = profile
      ? resolveProfileRenderOpts(profile, job.printConfiguration)
      : null;

    await renderQueue.add('render', {
      printJobId: job.id,
      tenantId: job.tenantId,
      sourceFileKey: job.fileId,
      sourceStorageKey: storageKeyFromUrl(fileURL),
      sourceFileUrl: fileURL,
      fileName: fileName,
      printConfiguration: job.printConfiguration,
      watermarkId: job.watermarkId,
      printerProfileId: profile?.id ?? null,
      printerProfile: profileOpts,
    });
    return { enqueued: true };
  } catch (err) {
    job.status = prevStatus;
    job.renderingStatus = 'pending';
    job.renderingStartedAt = null;
    await repo.save(job);
    throw err;
  }
}

export async function enqueueRenderOrReady(printJobId: string): Promise<{
  path: 'rendering' | 'ready-direct';
  reason?: string;
}> {
  const result = await enqueueRender(printJobId);
  if (result.enqueued) return { path: 'rendering' };

  const repo = repos.printJob();
  const job = await repo.findOne({ where: { id: printJobId } });
  if (!job) return { path: 'ready-direct', reason: 'not-found' };
  if (job.status === PrintJobStatus.PENDING) {
    job.status = job.requiresAccept
      ? PrintJobStatus.AWAITING_ACCEPT
      : PrintJobStatus.READY;
    await repo.save(job);
  }
  return { path: 'ready-direct', reason: result.reason };
}

export async function applyRenderResult(opts: {
  printJobId: string;
  renderedKey: string;
  renderedPdfUrl: string;
  previewImageUrls: string[];
  pageCount: number;
  bytes: number;
  durationMs?: number;
}): Promise<
  import('@/modules/saas/services/costReconciliation.service').RenderCostResult
> {
  const repo = repos.printJob();
  const job = await repo.findOne({ where: { id: opts.printJobId } });
  if (!job) return { updated: false, reason: 'not-found' };
  if (job.status !== PrintJobStatus.RENDERING) {
    return { updated: false, reason: `bad-status:${job.status}` };
  }
  return applyRenderCostReconciliation(job, opts);
}

export async function applyRenderFailure(opts: {
  printJobId: string;
  errorMessage: string;
}): Promise<{ updated: boolean; reason?: string }> {
  const repo = repos.printJob();
  const job = await repo.findOne({ where: { id: opts.printJobId } });
  if (!job) return { updated: false, reason: 'not-found' };
  if (job.status !== PrintJobStatus.RENDERING) {
    return { updated: false, reason: `bad-status:${job.status}` };
  }
  job.status = job.requiresAccept ? PrintJobStatus.AWAITING_ACCEPT : PrintJobStatus.READY;
  job.renderingStatus = 'failed';
  job.renderingError = opts.errorMessage;
  job.renderingCompletedAt = new Date();
  await repo.save(job);
  console.warn(`[render] job ${job.id} render failed (${opts.errorMessage}); falling back to PDF`);
  return { updated: true };
}

export async function reconcileStuckRenders(opts?: {
  
  thresholdMs?: number;
  
  reenqueue?: boolean;
}): Promise<{
  found: number;
  reenqueued: number;
  failed: number;
  recovered: number;
}> {
  const thresholdMs = opts?.thresholdMs ?? 15 * 60 * 1000;
  const reenqueue = opts?.reenqueue ?? true;
  const cutoff = new Date(Date.now() - thresholdMs);

  const repo = repos.printJob();
  const stuck = await repos.printJob().findStuckRenderingBefore(cutoff);

  stuckRendersGauge.set(stuck.length);

  let reenqueued = 0;
  let failed = 0;
  let recovered = 0;

  for (const job of stuck) {
    try {
      if (!reenqueue) {
        const r = await applyRenderFailure({
          printJobId: job.id,
          errorMessage: 'Reconciliation: stuck in RENDERING',
        });
        if (r.updated) failed++;
        continue;
      }
      job.status = PrintJobStatus.PENDING;
      await repo.save(job);
      const r = await enqueueRenderOrReady(job.id);
      if (r.path === 'rendering') reenqueued++;
      else recovered++;
    } catch (err) {
      console.error(
        `[reconcile] failed to recover stuck job ${job.id}:`,
        err,
      );
      try {
        await applyRenderFailure({
          printJobId: job.id,
          errorMessage: `Reconciliation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        });
        failed++;
      } catch (dlqErr) {
        console.error(`[reconcile] failed to move job ${job.id} to DLQ:`, dlqErr);
      }
    }
  }

  return {
    found: stuck.length,
    reenqueued,
    failed,
    recovered,
  };
}
