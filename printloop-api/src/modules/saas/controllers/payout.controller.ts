import { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { Tenant } from '@/database/entities/tenant.entity';
import { PayoutSchedule } from '@/database/entities/payoutSchedule.entity';
import { Payout, PayoutTrigger, PayoutStatus } from '@/database/entities/payout.entity';
import { Transaction } from '@/database/entities/transaction.entity';
import {
  getAvailableBalance,
  initiatePayout,
} from '@/modules/saas/services/payout.service';

const INSTANT_PAYOUT_FEE_NAIRA = 100;

export class PayoutController {
  constructor(private ds: DataSource) {}

  getBalance = async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const txRepo = this.ds.getRepository(Transaction);
      const payoutRepo = this.ds.getRepository(Payout);

      const [available, lifetime, pending] = await Promise.all([
        getAvailableBalance(tenant.id),
        txRepo
          .createQueryBuilder('tx')
          .select(
            `COALESCE(SUM(CAST(tx.commissionAmount AS REAL)), 0)`,
            'total',
          )
          .where('tx.tenantId = :tid', { tid: tenant.id })
          .getRawOne<{ total: string }>(),
        payoutRepo
          .createQueryBuilder('p')
          .select(`COALESCE(SUM(CAST(p.amount AS REAL)), 0)`, 'total')
          .where('p.tenantId = :tid', { tid: tenant.id })
          .andWhere('p.status IN (:...states)', {
            states: [PayoutStatus.PENDING, PayoutStatus.PROCESSING],
          })
          .getRawOne<{ total: string }>(),
      ]);

      res.json({
        success: true,
        data: {
          currency: 'NGN',
          availableBalance: available,
          pendingPayout: Number(pending?.total ?? 0),
          lifetimeCommissionPaidToPlatform: Number(lifetime?.total ?? 0),
          commissionPct: Number(tenant.commissionPct),
        },
      });
    } catch (err: any) {
      console.error('Balance read error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Failed to read balance' });
    }
  };

  listPayouts = async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const limit = Math.min(100, Math.max(1, Number(req.query?.limit ?? 20)));
      const before = req.query?.before ? new Date(String(req.query.before)) : null;
      const qb = this.ds
        .getRepository(Payout)
        .createQueryBuilder('p')
        .where('p.tenantId = :tid', { tid: tenant.id })
        .orderBy('p.createdAt', 'DESC')
        .limit(limit);
      if (before && !Number.isNaN(before.getTime())) {
        qb.andWhere('p.createdAt < :before', { before });
      }
      const rows = await qb.getMany();
      res.json({
        success: true,
        data: {
          items: rows.map((p) => ({
            id: p.id,
            amount: Number(p.amount),
            feeAmount: Number(p.feeAmount),
            currency: p.currency,
            status: p.status,
            trigger: p.trigger,
            reference: p.paystackTransferReference,
            failureReason: p.failureReason,
            requestedAt: p.requestedAt,
            paidAt: p.paidAt,
            createdAt: p.createdAt,
          })),
          nextCursor:
            rows.length === limit ? rows[rows.length - 1].createdAt : null,
        },
      });
    } catch (err: any) {
      console.error('Payouts list error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Failed to list payouts' });
    }
  };

  listTransactions = async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const limit = Math.min(200, Math.max(1, Number(req.query?.limit ?? 50)));
      const before = req.query?.before ? new Date(String(req.query.before)) : null;
      const qb = this.ds
        .getRepository(Transaction)
        .createQueryBuilder('tx')
        .where('tx.tenantId = :tid', { tid: tenant.id })
        .orderBy('tx.createdAt', 'DESC')
        .limit(limit);
      if (before && !Number.isNaN(before.getTime())) {
        qb.andWhere('tx.createdAt < :before', { before });
      }
      const rows = await qb.getMany();
      res.json({
        success: true,
        data: {
          items: rows.map((tx) => ({
            id: tx.id,
            type: tx.type,
            amount: Number(tx.amount),
            commissionAmount: Number(tx.commissionAmount),
            description: tx.description,
            balanceAfter: Number(tx.balanceAfter),
            reference: tx.reference,
            createdAt: tx.createdAt,
          })),
          nextCursor:
            rows.length === limit ? rows[rows.length - 1].createdAt : null,
        },
      });
    } catch (err: any) {
      console.error('Transactions list error:', err);
      res.status(500).json({
        success: false,
        message: err?.message || 'Failed to list transactions',
      });
    }
  };

  instantPayout = async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const scheduleRepo = this.ds.getRepository(PayoutSchedule);
      const schedule = await scheduleRepo.findOne({
        where: { tenantId: tenant.id },
      });
      if (!schedule?.recipientCode) {
        res.status(409).json({
          success: false,
          message: 'Add a bank account before requesting a payout',
          code: 'NO_BANK_ACCOUNT',
        });
        return;
      }

      const available = await getAvailableBalance(tenant.id);
      const minRequired =
        Number(schedule.minPayoutAmount) + INSTANT_PAYOUT_FEE_NAIRA;
      if (available < minRequired) {
        res.status(402).json({
          success: false,
          message: `Available balance is ₦${available}; minimum for instant payout is ₦${minRequired} (includes ₦${INSTANT_PAYOUT_FEE_NAIRA} fee)`,
          code: 'INSUFFICIENT_BALANCE',
          data: {
            available,
            minRequired,
            fee: INSTANT_PAYOUT_FEE_NAIRA,
          },
        });
        return;
      }

      const netPayout = available - INSTANT_PAYOUT_FEE_NAIRA;
      const payout = await initiatePayout({
        tenantId: tenant.id,
        amount: netPayout,
        recipientCode: schedule.recipientCode,
        trigger: PayoutTrigger.INSTANT,
        notes: `Instant payout (fee ₦${INSTANT_PAYOUT_FEE_NAIRA})`,
      });
      payout.feeAmount = INSTANT_PAYOUT_FEE_NAIRA;
      await this.ds.getRepository(Payout).save(payout);

      res.status(201).json({
        success: true,
        data: {
          id: payout.id,
          amount: Number(payout.amount),
          feeAmount: Number(payout.feeAmount),
          status: payout.status,
          reference: payout.paystackTransferReference,
        },
      });
    } catch (err: any) {
      console.error('Instant-payout error:', err?.response?.data || err);
      res.status(500).json({
        success: false,
        message: err?.message || 'Instant payout failed',
      });
    }
  };
}
