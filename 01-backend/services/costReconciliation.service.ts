import { AppDataSource } from '../config/database';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';
import { Wallet } from '../entities/wallet.entity';
import { Transaction, TransactionType } from '../entities/transaction.entity';
import { Payment } from '../entities/payment.entity';
import { Tenant } from '../entities/tenant.entity';
import { User } from '../entities/user.entity';
import { computeCost } from './pricing.service';
import { computeCommissionSplit } from './commission.service';
import { applyTransactionDelta } from './tenantBalance.service';
import { PaystackService } from './paystack.service';
import { Like, type EntityManager } from 'typeorm';

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

async function findPayment(em: EntityManager, job: PrintJob): Promise<Payment | null> {
  const repo = em.getRepository(Payment);
  if (job.paymentReference) {
    const p = await repo.findOne({ where: { reference: job.paymentReference } });
    if (p) return p;
  }
  if (job.code) {
    const p = await repo.findOne({ where: { reference: job.code } });
    if (p) return p;
  }
  return null;
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

  await AppDataSource.transaction(async (em) => {
    job.totalPages = opts.pageCount;
    job.renderedKey = opts.renderedKey;
    job.renderedPdfUrl = opts.renderedPdfUrl;
    job.previewImageUrls = opts.previewImageUrls;
    job.renderingStatus = 'ready';
    job.renderingCompletedAt = new Date();
    job.status = job.requiresAccept
      ? PrintJobStatus.AWAITING_ACCEPT
      : PrintJobStatus.READY;
    if (isFirstCallback) {
      job.finalCost = finalCost;
      job.costReconciledAt = new Date();
    }
    await em.save(PrintJob, job);
  });

  if (isFirstCallback && delta < 0 && job.tenantId) {
    const writeOff = -delta;
    try {
      const tenant = await AppDataSource.getRepository(Tenant).findOne({
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
  const jobRepo = AppDataSource.getRepository(PrintJob);
  const job = await jobRepo.findOne({ where: { id: printJobId } });
  if (!job) return { settled: false, reason: 'not-found' };

  const shortfall = shortfallFor(job);
  if (shortfall <= 0) return { settled: false, reason: 'no-shortfall' };

  const payment = await findPayment(AppDataSource.manager, job);
  if (!payment) return { settled: false, reason: 'no-payment', shortfall };

  const deltaTxRepo = AppDataSource.getRepository(Transaction);
  const prior = await deltaTxRepo.findOne({
    where: { reference: Like(`DELTA_${job.id}_%`) },
  });
  if (prior) {
    job.cost = Number(job.finalCost);
    await jobRepo.save(job);
    return { settled: true, shortfall };
  }

  const user = job.userId
    ? await AppDataSource.getRepository(User).findOne({ where: { id: job.userId } })
    : null;
  if (!user) return { settled: false, reason: 'no-user', shortfall };
  if (!payment.authorizationCode) {
    return { settled: false, reason: 'no-card-on-file', shortfall };
  }

  const tenant = job.tenantId
    ? await AppDataSource.getRepository(Tenant).findOne({ where: { id: job.tenantId } })
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

  await AppDataSource.transaction(async (em) => {
    const wallet = job.userId
      ? await em.findOne(Wallet, { where: { userId: job.userId! } })
      : null;
    if (wallet) {
      await em.save(
        Transaction,
        em.create(Transaction, {
          walletId: wallet.id,
          tenantId: job.tenantId,
          type: TransactionType.PRINT,
          amount: shortfall,
          commissionAmount,
          description: `Print price adjustment (${job.fileName || 'job'}) — final cost`,
          balanceAfter: Number(wallet.balance),
          reference,
        }),
      );
    }

    job.cost = job.finalCost!;
    await em.save(PrintJob, job);

    payment.amount = round2(Number(payment.amount) + shortfall);
    await em.save(Payment, payment);
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
