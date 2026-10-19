import { repos } from '@/config/repos';
import { PrintJob, PrintJobStatus } from '@/database/entities/printJob.entity';
import { computeCost } from '@/modules/public/services/pricing.service';
import { computeCommissionSplit } from './commission.service';
import { applyTransactionDelta } from './tenantBalance.service';
import { PaystackService } from '@/core/services/paystack.service';
import { Like } from 'typeorm';

export interface RenderCostResult {
  updated: boolean;
  reason?: string;
  finalCost?: number;
  delta?: number;
  action?: 'none' | 'write-off' | 'shortfall';
}

export interface ShortfallSettlement {
  settled: boolean;
  reason?: string;
  shortfall?: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function computeFinalCost(job: PrintJob, pageCount: number): Promise<number> {
  const cfg: any = job.printConfiguration || {};
  return computeCost({
    pageCount,
    paper: cfg.paper,
    color: cfg.color === 'color' ? 'color' : 'bw',
    sided: cfg.sided === 'double' ? 'double' : 'single',
    qualityDpi: [100, 300, 600].includes(Number(cfg.qualityDpi))
      ? (Number(cfg.qualityDpi) as 100 | 300 | 600)
      : 300,
    copies: Number(cfg.copies) || 1,
  });
}

export async function applyRenderCostReconciliation(
  job: PrintJob,
  opts: {
    pageCount: number;
    renderedKey: string;
    renderedPdfUrl: string;
    previewImageUrls: string[];
    bytes: number;
    durationMs?: number;
  },
): Promise<RenderCostResult> {
  const isFirstCallback = job.finalCost == null;
  const finalCost = await computeFinalCost(job, opts.pageCount);
  const paid = Math.max(0, Number(job.cost) || 0);
  const delta = round2(finalCost - paid);

  await repos.printJob().persistRenderReconciliation(job, {
    pageCount: opts.pageCount,
    renderedKey: opts.renderedKey,
    renderedPdfUrl: opts.renderedPdfUrl,
    previewImageUrls: opts.previewImageUrls,
    isFirstCallback,
    finalCost,
  });

  if (isFirstCallback && delta < 0 && job.tenantId) {
    const writeOff = -delta;
    try {
      const tenant = await repos.tenant().findOne({
        where: { id: job.tenantId },
      });
      if (tenant) {
        const split = computeCommissionSplit(tenant, writeOff);
        await applyTransactionDelta(job.tenantId, -writeOff, -split.commissionAmount);
      }
    } catch (e) {
      console.error('[reconcile] tenant ledger write-off reversal failed:', e);
    }
  }

  return {
    updated: true,
    finalCost,
    delta,
    action: delta < 0 ? 'write-off' : delta > 0 ? 'shortfall' : 'none',
  };
}

export function shortfallFor(job: PrintJob): number {
  if (job.finalCost == null) return 0;
  return Math.max(0, round2(Number(job.finalCost) - Number(job.cost || 0)));
}

export async function settleShortfall(printJobId: string): Promise<ShortfallSettlement> {
  const jobRepo = repos.printJob();
  const job = await jobRepo.findOne({ where: { id: printJobId } });
  if (!job) return { settled: false, reason: 'not-found' };

  const shortfall = shortfallFor(job);
  if (shortfall <= 0) return { settled: false, reason: 'no-shortfall' };

  const payment = await repos.payment().findForPrintJob(job);
  if (!payment) return { settled: false, reason: 'no-payment', shortfall };

  const prior = await repos.transaction().findOne({
    where: { reference: Like(`DELTA_${job.id}_%`) },
  });
  if (prior) {
    job.cost = Number(job.finalCost);
    await jobRepo.save(job);
    return { settled: true, shortfall };
  }

  const user = job.userId
    ? await repos.user().findOne({ where: { id: job.userId } })
    : null;
  if (!user) return { settled: false, reason: 'no-user', shortfall };
  if (!payment.authorizationCode) {
    return { settled: false, reason: 'no-card-on-file', shortfall };
  }

  const tenant = job.tenantId
    ? await repos.tenant().findOne({ where: { id: job.tenantId } })
    : null;
  const reference = `DELTA_${job.id}_${Date.now()}`;

  const paystack = new PaystackService();
  let charge;
  try {
    charge = await paystack.chargeAuthorization({
      authorizationCode: payment.authorizationCode,
      amountNaira: shortfall,
      email: user.email,
      reference,
      tenant,
      metadata: { jobId: job.id, printJobId: job.id },
    });
  } catch (err: any) {
    console.error('[reconcile] charge_authorization call failed:', err?.message);
    return { settled: false, reason: 'charge-failed', shortfall };
  }

  const status: string | undefined = charge?.status;
  if (status !== 'success') {
    console.error(
      `[reconcile] delta charge declined for job ${job.id}: ${status} ${
        charge?.gateway_response || charge?.message || ''
      }`,
    );
    return { settled: false, reason: 'charge-failed', shortfall };
  }

  const commissionAmount = tenant
    ? computeCommissionSplit(tenant, shortfall).commissionAmount
    : 0;

  await jobRepo.applyShortfallSettlement({
    job,
    payment,
    shortfall,
    commissionAmount,
    reference,
  });

  if (tenant && job.tenantId) {
    try {
      await applyTransactionDelta(job.tenantId, shortfall, commissionAmount);
    } catch (e) {
      console.error('[reconcile] tenant ledger credit failed:', e);
    }
  }

  return { settled: true, shortfall };
}
