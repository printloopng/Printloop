import { AppDataSource } from '../config/database';
import { Tenant, TenantStatus } from '../entities/tenant.entity';
import { Transaction, TransactionType } from '../entities/transaction.entity';
import {
  Payout,
  PayoutStatus,
  PayoutTrigger,
} from '../entities/payout.entity';
import {
  PayoutSchedule,
  PayoutCadence,
} from '../entities/payoutSchedule.entity';
import { PaystackService } from './paystack.service';
import { applyPayoutTransition } from './tenantBalance.service';

export async function getAvailableBalance(
  tenantId: string,
): Promise<number> {
  const txRepo = AppDataSource.getRepository(Transaction);
  const payoutRepo = AppDataSource.getRepository(Payout);

  const txTotal = await txRepo
    .createQueryBuilder('tx')
    .select(
      `COALESCE(SUM(CAST(tx.amount AS REAL) - CAST(tx.commissionAmount AS REAL)), 0)`,
      'net',
    )
    .where('tx.tenantId = :tid', { tid: tenantId })
    .andWhere('tx.type IN (:...types)', {
      types: [
        TransactionType.TOPUP,
        TransactionType.PRINT,
        TransactionType.REFUND,
      ],
    })
    .getRawOne<{ net: string }>();

  const payoutTotal = await payoutRepo
    .createQueryBuilder('p')
    .select(`COALESCE(SUM(CAST(p.amount AS REAL)), 0)`, 'total')
    .where('p.tenantId = :tid', { tid: tenantId })
    .andWhere('p.status IN (:...states)', {
      states: [
        PayoutStatus.PENDING,
        PayoutStatus.PROCESSING,
        PayoutStatus.PAID,
      ],
    })
    .getRawOne<{ total: string }>();

  const balance = Number(txTotal?.net ?? 0) - Number(payoutTotal?.total ?? 0);
  return Math.max(0, Math.round(balance * 100) / 100);
}

export async function processDuePayouts(now: Date = new Date()): Promise<{
  considered: number;
  processed: number;
  skipped: number;
  failed: number;
}> {
  const dayOfWeek = now.getUTCDay();
  const scheduleRepo = AppDataSource.getRepository(PayoutSchedule);
  const tenantRepo = AppDataSource.getRepository(Tenant);

  const dueSchedules = await scheduleRepo
    .createQueryBuilder('s')
    .where(
      `(s.cadence = :daily) OR (s.cadence = :weekly AND s.dayOfWeek = :dow)`,
      {
        daily: PayoutCadence.DAILY,
        weekly: PayoutCadence.WEEKLY,
        dow: dayOfWeek,
      },
    )
    .getMany();

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const schedule of dueSchedules) {
    try {
      const tenant = await tenantRepo.findOne({
        where: { id: schedule.tenantId },
      });
      if (!tenant || tenant.status !== TenantStatus.ACTIVE) {
        skipped++;
        continue;
      }
      if (!schedule.recipientCode) {
        skipped++;
        continue;
      }
      const available = await getAvailableBalance(schedule.tenantId);
      if (available < Number(schedule.minPayoutAmount)) {
        skipped++;
        continue;
      }
      await initiatePayout({
        tenantId: schedule.tenantId,
        amount: available,
        recipientCode: schedule.recipientCode,
        trigger: PayoutTrigger.SCHEDULED,
      });
      processed++;
    } catch (err) {
      console.error(
        `[payouts] failed for tenant ${schedule.tenantId}:`,
        err,
      );
      failed++;
    }
  }

  return {
    considered: dueSchedules.length,
    processed,
    skipped,
    failed,
  };
}

export async function initiatePayout(opts: {
  tenantId: string;
  amount: number;
  recipientCode: string;
  trigger: PayoutTrigger;
  notes?: string;
}): Promise<Payout> {
  const paystack = new PaystackService();
  const payoutRepo = AppDataSource.getRepository(Payout);

  let payout = await payoutRepo.save(
    payoutRepo.create({
      tenantId: opts.tenantId,
      amount: opts.amount,
      feeAmount: 0,
      currency: 'NGN',
      status: PayoutStatus.PENDING,
      trigger: opts.trigger,
      paystackTransferReference: null,
      failureReason: null,
      requestedAt: new Date(),
      paidAt: null,
      notes: opts.notes ?? null,
    }),
  );

  const previousStatus = PayoutStatus.PENDING;
  try {
    const { reference, status } = await paystack.initiateTransfer({
      amountKobo: Math.floor(opts.amount * 100),
      recipientCode: opts.recipientCode,
      reason: `PrintLoop payout ${payout.id}`,
      reference: `PAY_${payout.id}`,
    });
    payout.paystackTransferReference = reference;
    payout.status =
      status === 'success' ? PayoutStatus.PAID : PayoutStatus.PROCESSING;
    if (status === 'success') payout.paidAt = new Date();
    payout = await payoutRepo.save(payout);
    try {
      await applyPayoutTransition(opts.tenantId, payout, previousStatus);
    } catch (e) {
      console.error('[tenant_balance] applyPayoutTransition failed:', e);
    }
  } catch (err: any) {
    payout.status = PayoutStatus.FAILED;
    payout.failureReason =
      err?.response?.data?.message || err?.message || 'Unknown error';
    payout = await payoutRepo.save(payout);
    try {
      await applyPayoutTransition(opts.tenantId, payout, previousStatus);
    } catch (e) {
      console.error('[tenant_balance] applyPayoutTransition failed:', e);
    }
    throw err;
  }
  return payout;
}

export async function applyTransferWebhook(event: {
  type: 'transfer.success' | 'transfer.failed' | 'transfer.reversed';
  reference: string;
  failureReason?: string;
}): Promise<{ updated: boolean }> {
  const payoutRepo = AppDataSource.getRepository(Payout);
  const payout = await payoutRepo.findOne({
    where: { paystackTransferReference: event.reference },
  });
  if (!payout) return { updated: false };

  const previousStatus = payout.status;

  if (event.type === 'transfer.success' && payout.status !== PayoutStatus.PAID) {
    payout.status = PayoutStatus.PAID;
    payout.paidAt = new Date();
    await payoutRepo.save(payout);
    try {
      await applyPayoutTransition(payout.tenantId, payout, previousStatus);
    } catch (e) {
      console.error('[tenant_balance] applyPayoutTransition failed:', e);
    }
    try {
      const { emitTenantEvent } = await import('./tenantWebhook.service');
      const { WebhookEvent } = await import('../entities/tenantWebhook.entity');
      emitTenantEvent(payout.tenantId, WebhookEvent.PAYOUT_PAID, {
        payoutId: payout.id,
        amount: Number(payout.amount),
        feeAmount: Number(payout.feeAmount),
        currency: payout.currency,
        reference: payout.paystackTransferReference,
        paidAt: payout.paidAt,
      });
    } catch (e) {
      console.error('[webhook] payout.paid emit failed:', e);
    }
    return { updated: true };
  }
  if (
    (event.type === 'transfer.failed' || event.type === 'transfer.reversed') &&
    payout.status !== PayoutStatus.FAILED
  ) {
    payout.status = PayoutStatus.FAILED;
    payout.failureReason = event.failureReason ?? null;
    await payoutRepo.save(payout);
    try {
      await applyPayoutTransition(payout.tenantId, payout, previousStatus);
    } catch (e) {
      console.error('[tenant_balance] applyPayoutTransition failed:', e);
    }
    return { updated: true };
  }
  return { updated: false };
}
