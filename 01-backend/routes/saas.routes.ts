import { Request, Response, Router } from 'express';
import multer from 'multer';
import { randomBytes } from 'node:crypto';
import { saveBuffer } from '../utils/fileStore.js';
import { AppDataSource } from '../config/database';
import { User } from '../entities/user.entity';
import { Tenant, TenantStatus } from '../entities/tenant.entity';
import { Kiosk, KioskStatus } from '../entities/kiosk.entity';
import {
  generateTotpSecret,
  buildOtpAuthUrl,
  verifyTotp,
} from '../utils/totp';
import { PayoutSchedule } from '../entities/payoutSchedule.entity';
import { Payout, PayoutTrigger, PayoutStatus } from '../entities/payout.entity';
import { Transaction } from '../entities/transaction.entity';
import {
  signupTenant,
  verifyOwnerEmail,
  resendOwnerVerification,
  SlugUnavailableError,
  EmailTakenError,
  ValidationError,
} from '../services/onboarding.service';
import {
  getAvailableBalance,
  initiatePayout,
} from '../services/payout.service';
import { PaystackService } from '../services/paystack.service';
import { KioskService } from '../services/kiosk.service';
import { authenticate } from '../middleware/auth.middleware';
import { resolveTenant } from '../middleware/tenant.middleware';
import { requireVerifiedEmail } from '../middleware/verifiedEmail.middleware';
import editorRoutes from './editor.routes';

const router = Router();
const paystack = new PaystackService();
const kioskService = new KioskService();
const INSTANT_PAYOUT_FEE_NAIRA = 100;

function publicKiosk(k: Kiosk) {
  const ONLINE_MS = 5 * 60 * 1000;
  const online =
    k.status === KioskStatus.ACTIVE &&
    k.lastSeenAt &&
    Date.now() - new Date(k.lastSeenAt).getTime() < ONLINE_MS;
  return {
    id: k.id,
    name: k.name,
    location: k.location ?? null,
    printerName: k.printerName ?? null,
    status: k.status,
    online: Boolean(online),
    lastSeenAt: k.lastSeenAt ?? null,
    testPrintPassedAt: k.testPrintPassedAt ?? null,
    totalJobsPrinted: k.totalJobsPrinted ?? 0,
    capColor: k.capColor ?? null,
    capDuplex: k.capDuplex ?? null,
    capA3: k.capA3 ?? null,
    capUpdatedAt: k.capUpdatedAt ?? null,
    createdAt: k.createdAt,
  };
}

async function ownedKiosk(req: Request, id: string): Promise<Kiosk | null> {
  return kioskService.getKioskById(id, req.tenant!.id);
}

router.post('/signup', async (req: Request, res: Response) => {
  try {
    const result = await signupTenant({
      businessName: req.body?.businessName,
      slug: req.body?.slug,
      ownerFirstName: req.body?.ownerFirstName,
      ownerLastName: req.body?.ownerLastName,
      ownerEmail: req.body?.ownerEmail,
      ownerPhone: req.body?.ownerPhone,
      ownerPassword: req.body?.ownerPassword,
      address: req.body?.address,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    if (err instanceof ValidationError) {
      res.status(400).json({ success: false, message: err.message });
      return;
    }
    if (err instanceof SlugUnavailableError) {
      res.status(409).json({
        success: false,
        message: err.message,
        code: 'SLUG_TAKEN',
      });
      return;
    }
    if (err instanceof EmailTakenError) {
      res.status(409).json({
        success: false,
        message: err.message,
        code: 'EMAIL_TAKEN',
      });
      return;
    }
    console.error('Signup error:', err);
    res.status(500).json({
      success: false,
      message: err?.message || 'Signup failed',
    });
  }
});

router.post('/check-slug', async (req: Request, res: Response) => {
  const slug = String(req.body?.slug || '').toLowerCase().trim();
  if (!slug) {
    res.json({ available: false, reason: 'empty' });
    return;
  }
  if (!/^[a-z][a-z0-9-]{1,28}[a-z0-9]$/.test(slug)) {
    res.json({ available: false, reason: 'invalid-format' });
    return;
  }
  const existing = await AppDataSource.getRepository(Tenant).findOne({
    where: { slug },
  });
  res.json({ available: !existing });
});

router.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const token = String(req.body?.token || '').trim();
    const email = req.body?.email
      ? String(req.body.email).trim()
      : undefined;
    const result = await verifyOwnerEmail({ token, email });
    if (!result.verified) {
      res
        .status(400)
        .json({ success: false, message: 'Invalid or expired token' });
      return;
    }
    res.json({ success: true, data: result });
  } catch (err: any) {
    if (err instanceof ValidationError) {
      res.status(400).json({ success: false, message: err.message });
      return;
    }
    console.error('Verify-email error:', err);
    res
      .status(500)
      .json({ success: false, message: err?.message || 'Verification failed' });
  }
});

router.post('/resend-verification', async (req: Request, res: Response) => {
  try {
    const email = String(req.body?.email || '').trim();
    const tenantSlug = req.body?.tenantSlug
      ? String(req.body.tenantSlug).trim()
      : undefined;
    if (!email) {
      res.status(400).json({ success: false, message: 'email is required' });
      return;
    }
    await resendOwnerVerification({ email, tenantSlug });
    res.json({ success: true });
  } catch (err: any) {
    console.error('Resend-verification error:', err);
    res.json({ success: true });
  }
});

router.post(
  '/setup/paystack-subaccount',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const { businessName, settlementBank, accountNumber, percentageCharge } =
        req.body || {};
      if (!businessName || !settlementBank || !accountNumber) {
        res.status(400).json({
          success: false,
          message: 'businessName, settlementBank, accountNumber are required',
        });
        return;
      }
      const created = await paystack.createSubaccount({
        businessName,
        settlementBank,
        accountNumber,
        percentageCharge,
      });
      tenant.paystackSubaccountCode = created.subaccountCode;
      await AppDataSource.getRepository(Tenant).save(tenant);
      res.json({
        success: true,
        data: {
          subaccountCode: created.subaccountCode,
          accountName: created.accountName,
        },
      });
    } catch (err: any) {
      console.error('Subaccount setup error:', err?.response?.data || err);
      res.status(500).json({
        success: false,
        message: err?.message || 'Subaccount setup failed',
      });
    }
  },
);

router.post(
  '/setup/bank-account',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const { accountName, accountNumber, bankCode } = req.body || {};
      if (!accountName || !accountNumber || !bankCode) {
        res.status(400).json({
          success: false,
          message: 'accountName, accountNumber, bankCode are required',
        });
        return;
      }
      const { recipientCode } = await paystack.createTransferRecipient({
        name: accountName,
        accountNumber,
        bankCode,
      });
      const scheduleRepo = AppDataSource.getRepository(PayoutSchedule);
      let schedule = await scheduleRepo.findOne({
        where: { tenantId: tenant.id },
      });
      if (!schedule) {
        schedule = scheduleRepo.create({
          tenantId: tenant.id,
        });
      }
      schedule.accountName = accountName;
      schedule.accountNumber = accountNumber;
      schedule.bankCode = bankCode;
      schedule.recipientCode = recipientCode;
      await scheduleRepo.save(schedule);
      res.json({
        success: true,
        data: { recipientCode, accountName, bankCode },
      });
    } catch (err: any) {
      console.error('Bank account setup error:', err?.response?.data || err);
      res.status(500).json({
        success: false,
        message: err?.message || 'Bank account setup failed',
      });
    }
  },
);

router.get(
  '/me',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    const tenant = req.tenant!;
    const { TenantBranding } = await import('../entities/tenantBranding.entity');
    const [schedule, branding] = await Promise.all([
      AppDataSource.getRepository(PayoutSchedule).findOne({
        where: { tenantId: tenant.id },
      }),
      AppDataSource.getRepository(TenantBranding).findOne({
        where: { tenantId: tenant.id },
      }),
    ]);
    const brandingSet = Boolean(
      branding &&
        (branding.wordmark ||
          branding.logoUrl ||
          branding.primaryColor),
    );
    res.json({
      success: true,
      data: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        commissionPct: Number(tenant.commissionPct),
        customDomain: tenant.customDomain,
        address: tenant.address,
        lat: tenant.lat,
        lng: tenant.lng,
        isDiscoverable: Boolean(tenant.isDiscoverable),
        availability: tenant.availability,
        onboarding: {
          subaccountSet: Boolean(tenant.paystackSubaccountCode),
          bankAccountSet: Boolean(schedule?.recipientCode),
          brandingSet,
          locationSet: Boolean(tenant.lat != null && tenant.lng != null),
        },
        payoutSchedule: schedule
          ? {
              cadence: schedule.cadence,
              dayOfWeek: schedule.dayOfWeek,
              minPayoutAmount: Number(schedule.minPayoutAmount),
              accountName: schedule.accountName,
              accountNumber: schedule.accountNumber,
              bankCode: schedule.bankCode,
            }
          : null,
      },
    });
  },
);

router.get(
  '/ops/summary',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const now = Date.now();
      const ONLINE_MS = 5 * 60 * 1000;
      const STUCK_MS = 10 * 60 * 1000;
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const { PrintJob, PrintJobStatus } = await import(
        '../entities/printJob.entity'
      );
      const kioskRepo = AppDataSource.getRepository(Kiosk);
      const jobRepo = AppDataSource.getRepository(PrintJob);
      const txRepo = AppDataSource.getRepository(Transaction);

      const [kiosks, jobsToday, activeJobs, stuckList, revenueRow] =
        await Promise.all([
          kioskRepo.find({ where: { tenantId: tenant.id } }),
          jobRepo
            .createQueryBuilder('j')
            .where('j.tenantId = :tid', { tid: tenant.id })
            .andWhere('j.createdAt >= :s', { s: startOfToday.toISOString() })
            .getCount(),
          jobRepo
            .createQueryBuilder('j')
            .where('j.tenantId = :tid', { tid: tenant.id })
            .andWhere('j.status IN (:...st)', {
              st: [
                PrintJobStatus.RENDERING,
                PrintJobStatus.READY,
                PrintJobStatus.RELEASING,
                PrintJobStatus.PRINTING,
              ],
            })
            .getCount(),
          jobRepo
            .createQueryBuilder('j')
            .where('j.tenantId = :tid', { tid: tenant.id })
            .andWhere('j.status = :r', { r: PrintJobStatus.RENDERING })
            .getMany(),
          txRepo
            .createQueryBuilder('tx')
            .select(`COALESCE(SUM(CAST(tx.amount AS REAL)), 0)`, 'gross')
            .addSelect(
              `COALESCE(SUM(CAST(tx.commissionAmount AS REAL)), 0)`,
              'commission',
            )
            .where('tx.tenantId = :tid', { tid: tenant.id })
            .andWhere('tx.createdAt >= :s', { s: startOfToday.toISOString() })
            .getRawOne<{ gross: string; commission: string }>(),
        ]);

      const kioskRows = kiosks.map((k) => {
        const online =
          k.status === KioskStatus.ACTIVE &&
          k.lastSeenAt &&
          now - new Date(k.lastSeenAt).getTime() < ONLINE_MS;
        return {
          id: k.id,
          name: k.name,
          location: k.location ?? null,
          printerName: k.printerName ?? null,
          status: k.status,
          online: Boolean(online),
          lastSeenAt: k.lastSeenAt ?? null,
          testPrintPassedAt: k.testPrintPassedAt ?? null,
          totalJobsPrinted: k.totalJobsPrinted ?? 0,
        };
      });

      const onlineCount = kioskRows.filter((k) => k.online).length;
      const testPrintReady = kioskRows.some((k) => k.testPrintPassedAt);
      const stuckRenders = stuckList.filter(
        (j) => now - new Date(j.createdAt).getTime() > STUCK_MS,
      ).length;

      const liveGate = {
        locationSet: tenant.lat != null && tenant.lng != null,
        statusActive: tenant.status === TenantStatus.ACTIVE,
        testPrintDone: testPrintReady,
        kioskOnline: onlineCount > 0,
        isDiscoverable: Boolean(tenant.isDiscoverable),
      };
      const liveGateMet =
        liveGate.locationSet &&
        liveGate.statusActive &&
        liveGate.testPrintDone &&
        liveGate.kioskOnline;

      res.json({
        success: true,
        data: {
          kiosks: kioskRows,
          kioskCount: kioskRows.length,
          onlineCount,
          jobsToday,
          activeJobs,
          stuckRenders,
          revenueTodayGross: Number(revenueRow?.gross ?? 0),
          commissionTodayPaid: Number(revenueRow?.commission ?? 0),
          liveGate,
          liveGateMet,
        },
      });
    } catch (err: any) {
      console.error('[saas/ops/summary] error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Ops summary failed' });
    }
  },
);

router.get(
  '/kiosks',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const kiosks = await kioskService.listKiosks({ tenantId: req.tenant!.id });
      res.json({ success: true, data: { kiosks: kiosks.map(publicKiosk) } });
    } catch (err: any) {
      console.error('[saas/kiosks:list]', err);
      res.status(500).json({ success: false, message: 'Could not list printers' });
    }
  },
);

router.post(
  '/kiosks',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const name = String((req.body || {}).name || '').trim();
      if (!name) {
        res.status(400).json({ success: false, message: 'Printer name is required' });
        return;
      }
      const kiosk = await kioskService.createKiosk({
        name,
        tenantId: req.tenant!.id,
        location: req.body?.location?.trim() || undefined,
        printerName: req.body?.printerName?.trim() || undefined,
      });
      res.status(201).json({
        success: true,
        data: { kiosk: { ...publicKiosk(kiosk), apiKey: kiosk.apiKey } },
      });
    } catch (err: any) {
      console.error('[saas/kiosks:create]', err);
      res.status(500).json({ success: false, message: 'Could not add printer' });
    }
  },
);

router.patch(
  '/kiosks/:id/status',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    const k = await ownedKiosk(req, req.params.id);
    if (!k) {
      res.status(404).json({ success: false, message: 'Printer not found' });
      return;
    }
    const want = String((req.body || {}).status || '').toUpperCase();
    if (!(want in KioskStatus)) {
      res.status(400).json({ success: false, message: 'Invalid status' });
      return;
    }
    const updated = await kioskService.updateKioskStatus(
      k.id,
      KioskStatus[want as keyof typeof KioskStatus],
    );
    res.json({ success: true, data: updated ? publicKiosk(updated) : null });
  },
);

router.post(
  '/kiosks/:id/regenerate-key',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    const k = await ownedKiosk(req, req.params.id);
    if (!k) {
      res.status(404).json({ success: false, message: 'Printer not found' });
      return;
    }
    const updated = await kioskService.regenerateApiKey(k.id);
    res.json({
      success: true,
      data: { id: k.id, apiKey: updated?.apiKey },
    });
  },
);

router.post(
  '/kiosks/:id/test-print',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    const k = await ownedKiosk(req, req.params.id);
    if (!k) {
      res.status(404).json({ success: false, message: 'Printer not found' });
      return;
    }
    const repo = AppDataSource.getRepository(Kiosk);
    k.testPrintPassedAt = new Date();
    await repo.save(k);
    res.json({
      success: true,
      data: { id: k.id, testPrintPassedAt: k.testPrintPassedAt },
    });
  },
);

router.delete(
  '/kiosks/:id',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    const k = await ownedKiosk(req, req.params.id);
    if (!k) {
      res.status(404).json({ success: false, message: 'Printer not found' });
      return;
    }
    const ok = await kioskService.deleteKiosk(k.id);
    res.json({ success: ok });
  },
);

router.get(
  '/balance',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const txRepo = AppDataSource.getRepository(Transaction);
      const payoutRepo = AppDataSource.getRepository(Payout);

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
  },
);

router.get(
  '/payouts',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const limit = Math.min(100, Math.max(1, Number(req.query?.limit ?? 20)));
      const before = req.query?.before ? new Date(String(req.query.before)) : null;
      const qb = AppDataSource.getRepository(Payout)
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
  },
);

router.get(
  '/transactions',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const limit = Math.min(200, Math.max(1, Number(req.query?.limit ?? 50)));
      const before = req.query?.before ? new Date(String(req.query.before)) : null;
      const qb = AppDataSource.getRepository(Transaction)
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
  },
);

router.post(
  '/payouts/instant',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const scheduleRepo = AppDataSource.getRepository(PayoutSchedule);
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
      await AppDataSource.getRepository(Payout).save(payout);

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
  },
);

router.post(
  '/me/export',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const { exportTenant } = await import('../services/tenantExport.service');
      const archive = await exportTenant(req.tenant!.id);
      const { writeAudit } = await import('../services/audit.service');
      await writeAudit(req, 'tenant.export', `tenant:${req.tenant!.id}`, {
        slug: req.tenant!.slug,
        rowsApprox:
          archive.users.length +
          archive.printJobs.length +
          archive.transactions.length,
      });
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="printloop-export-${req.tenant!.slug}-${new Date()
          .toISOString()
          .slice(0, 10)}.json"`,
      );
      res.send(JSON.stringify(archive, null, 2));
    } catch (err: any) {
      console.error('Export error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Export failed' });
    }
  },
);

router.delete(
  '/me',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const confirmSlug = String(req.body?.confirmSlug || '').trim();
      const reason = String(req.body?.reason || '').slice(0, 255) || null;
      const tenant = req.tenant!;
      if (confirmSlug !== tenant.slug) {
        res.status(400).json({
          success: false,
          message: `Type "${tenant.slug}" in the confirmSlug field to delete this tenant`,
          code: 'CONFIRM_SLUG_MISMATCH',
        });
        return;
      }
      if (tenant.status === TenantStatus.CLOSED) {
        res
          .status(409)
          .json({ success: false, message: 'Tenant already closed' });
        return;
      }
      const { closeTenant } = await import('../services/tenantDelete.service');
      await closeTenant(tenant.id, reason || 'Owner-initiated close');
      const { writeAudit } = await import('../services/audit.service');
      await writeAudit(req, 'tenant.close', `tenant:${tenant.id}`, {
        slug: tenant.slug,
        reason,
      });
      res.json({
        success: true,
        message:
          'Tenant closed. 30-day cooling-off window started. Contact support to reverse, otherwise data will be deleted.',
        data: { id: tenant.id, status: TenantStatus.CLOSED },
      });
    } catch (err: any) {
      console.error('Tenant close error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Close failed' });
    }
  },
);

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const URL_RE = /^https?:\/\/.+/i;

router.get(
  '/me/branding',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    const { TenantBranding } = await import('../entities/tenantBranding.entity');
    const repo = AppDataSource.getRepository(TenantBranding);
    const row =
      (await repo.findOne({ where: { tenantId: req.tenant!.id } })) ??
      repo.create({ tenantId: req.tenant!.id });
    res.json({ success: true, data: row });
  },
);

router.put(
  '/me/branding',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      for (const f of ['primaryColor', 'secondaryColor', 'accentColor']) {
        if (body[f] != null && !COLOR_RE.test(String(body[f]))) {
          res.status(400).json({
            success: false,
            message: `${f} must be a 7-char #RRGGBB hex (got "${body[f]}")`,
          });
          return;
        }
      }
      for (const f of ['logoUrl', 'faviconUrl']) {
        if (body[f] != null && !URL_RE.test(String(body[f]))) {
          res.status(400).json({
            success: false,
            message: `${f} must be an http(s):// URL`,
          });
          return;
        }
      }
      const { TenantBranding } = await import('../entities/tenantBranding.entity');
      const repo = AppDataSource.getRepository(TenantBranding);
      let row = await repo.findOne({ where: { tenantId: req.tenant!.id } });
      if (!row) row = repo.create({ tenantId: req.tenant!.id });
      const fields = [
        'wordmark',
        'tagline',
        'logoUrl',
        'faviconUrl',
        'primaryColor',
        'secondaryColor',
        'accentColor',
        'emailFromName',
        'supportEmail',
        'supportPhone',
      ] as const;
      for (const f of fields) {
        if (f in body) (row as any)[f] = body[f] === '' ? null : body[f];
      }
      const saved = await repo.save(row);
      res.json({ success: true, data: saved });
    } catch (err: any) {
      console.error('Branding update error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Failed to save branding' });
    }
  },
);

const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.post(
  '/me/photos',
  authenticate,
  resolveTenant,
  photoUpload.single('photo'),
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, message: 'No image file uploaded' });
        return;
      }
      if (!file.mimetype.startsWith('image/')) {
        res.status(400).json({ success: false, message: 'Uploaded file must be an image' });
        return;
      }
      const stored = await saveBuffer(file.buffer, file.originalname);
      const tenant = req.tenant!;
      tenant.photos = tenant.photos || [];
      tenant.photos.push(stored.url);
      await AppDataSource.getRepository(Tenant).save(tenant);
      res.json({ success: true, photos: tenant.photos });
    } catch (err: any) {
      console.error('Photo upload error:', err);
      res.status(500).json({ success: false, message: err.message || 'Failed to upload photo' });
    }
  }
);

router.delete(
  '/me/photos',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const { url } = req.body || {};
      if (!url) {
        res.status(400).json({ success: false, message: 'Photo URL is required' });
        return;
      }
      const tenant = req.tenant!;
      if (!tenant.photos || !tenant.photos.includes(url)) {
        res.status(404).json({ success: false, message: 'Photo not found in shop profile' });
        return;
      }
      tenant.photos = tenant.photos.filter(p => p !== url);
      await AppDataSource.getRepository(Tenant).save(tenant);
      res.json({ success: true, photos: tenant.photos });
    } catch (err: any) {
      console.error('Photo delete error:', err);
      res.status(500).json({ success: false, message: err.message || 'Failed to delete photo' });
    }
  }
);

const LIVE_ONLINE_WINDOW_MS = 5 * 60 * 1000;
async function assertLiveGateMet(
  tenant: Tenant,
): Promise<{ code: string; message: string } | null> {
  if (tenant.lat == null || tenant.lng == null) {
    return {
      code: 'LOCATION_MISSING',
      message:
        'Set a shop address first — discoverability needs coordinates.',
    };
  }
  if (tenant.status !== TenantStatus.ACTIVE) {
    return {
      code: 'TENANT_NOT_ACTIVE',
      message:
        'Your account is still in trial. A PrintLoop operator will activate it after verification.',
    };
  }
  const kiosks = await AppDataSource.getRepository(Kiosk).find({
    where: { tenantId: tenant.id },
  });
  if (!kiosks.some((k) => k.testPrintPassedAt != null)) {
    return {
      code: 'TEST_PRINT_MISSING',
      message:
        'Run a test print first — at least one kiosk needs to confirm it printed successfully.',
    };
  }
  const cutoff = Date.now() - LIVE_ONLINE_WINDOW_MS;
  const onlineNow = kiosks.some(
    (k) =>
      k.status === KioskStatus.ACTIVE &&
      k.lastSeenAt &&
      new Date(k.lastSeenAt).getTime() > cutoff,
  );
  if (!onlineNow) {
    return {
      code: 'NO_KIOSK_ONLINE',
      message:
        'No kiosk is online right now. Bring your kiosk app online and try again.',
    };
  }
  return null;
}

router.get(
  '/me/lms',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const row = await AppDataSource.getRepository(Tenant).findOneOrFail({
        where: { id: req.tenant!.id },
      });
      res.json({ success: true, data: { keySet: Boolean(row.lmsKey) } });
    } catch (err: any) {
      console.error('[saas/me/lms]', err?.message);
      res.status(500).json({ success: false, message: 'Could not load LMS link status' });
    }
  },
);

router.post(
  '/me/lms/regenerate',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(Tenant);
      const row = await repo.findOneOrFail({ where: { id: req.tenant!.id } });
      row.lmsKey = randomBytes(24).toString('hex');
      await repo.save(row);

      const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
      const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || '';
      const url =
        `${proto}://${host}/api/integrations/lms/handoff` +
        `?slug=${encodeURIComponent(row.slug)}&key=${row.lmsKey}`;
      res.json({
        success: true,
        data: {
          key: row.lmsKey,
          url,
          urlWithEmail: `${url}&email={{student_email}}`,
        },
      });
    } catch (err: any) {
      console.error('[saas/me/lms/regenerate]', err?.message);
      res.status(500).json({ success: false, message: 'Could not generate LMS link' });
    }
  },
);

router.patch(
  '/me/location',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const body = req.body || {};
      const tenantRepo = AppDataSource.getRepository(Tenant);
      const row = await tenantRepo.findOneOrFail({ where: { id: tenant.id } });

      if ('address' in body) {
        const raw = body.address == null ? '' : String(body.address);
        const trimmed = raw.trim();
        if (!trimmed) {
          row.address = null;
          row.lat = null;
          row.lng = null;
        } else if (trimmed !== row.address) {
          row.address = trimmed;
          row.lat = null;
          row.lng = null;
          try {
            const { getGeocoder } = await import('../services/geocoding.service');
            const coords = await getGeocoder().geocode(trimmed);
            if (coords) {
              row.lat = coords.lat;
              row.lng = coords.lng;
            }
          } catch (err) {
            console.warn('[me/location] geocode threw, continuing:', err);
          }
        }
      }

      if ('isDiscoverable' in body) {
        const want = Boolean(body.isDiscoverable);
        if (want) {
          const reason = await assertLiveGateMet(row);
          if (reason) {
            res.status(400).json({
              success: false,
              message: reason.message,
              code: 'LIVE_GATE_NOT_MET',
              reason: reason.code,
            });
            return;
          }
        }
        row.isDiscoverable = want;
      }

      const saved = await tenantRepo.save(row);
      res.json({
        success: true,
        data: {
          address: saved.address,
          lat: saved.lat,
          lng: saved.lng,
          isDiscoverable: Boolean(saved.isDiscoverable),
        },
      });
    } catch (err: any) {
      console.error('[me/location] error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Update failed' });
    }
  },
);

router.patch(
  '/me/availability',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const { availability } = req.body || {};
      if (!['open', 'busy', 'closed'].includes(availability)) {
        res.status(400).json({
          success: false,
          message: "availability must be 'open', 'busy' or 'closed'",
        });
        return;
      }
      const tenantRepo = AppDataSource.getRepository(Tenant);
      const row = await tenantRepo.findOneOrFail({ where: { id: req.tenant!.id } });
      row.availability = availability;
      const saved = await tenantRepo.save(row);
      res.json({ success: true, data: { availability: saved.availability } });
    } catch (err: any) {
      console.error('[me/availability] error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Update failed' });
    }
  },
);

router.get(
  '/me/webhooks',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    const { TenantWebhook } = await import('../entities/tenantWebhook.entity');
    const rows = await AppDataSource.getRepository(TenantWebhook).find({
      where: { tenantId: req.tenant!.id },
      order: { createdAt: 'DESC' },
    });
    res.json({
      success: true,
      data: rows.map((r) => ({ ...r, secret: '***' })),
    });
  },
);

router.post(
  '/me/webhooks',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const { TenantWebhook, WebhookEvent } = await import(
        '../entities/tenantWebhook.entity'
      );
      const { generateWebhookSecret } = await import(
        '../services/tenantWebhook.service'
      );
      const { name, url, events } = req.body || {};
      if (!name || !url) {
        res
          .status(400)
          .json({ success: false, message: 'name and url are required' });
        return;
      }
      if (!/^https?:\/\/.+/i.test(String(url))) {
        res
          .status(400)
          .json({ success: false, message: 'url must be http(s)://...' });
        return;
      }
      const allowed = Object.values(WebhookEvent) as string[];
      const cleaned: any[] = Array.isArray(events)
        ? events.filter((e: string) => allowed.includes(e))
        : [];
      const repo = AppDataSource.getRepository(TenantWebhook);
      const row = repo.create({
        tenantId: req.tenant!.id,
        name: String(name).slice(0, 100),
        url: String(url).slice(0, 1024),
        secret: generateWebhookSecret(),
        events: cleaned,
        isActive: true,
      });
      const saved = await repo.save(row);
      res.status(201).json({ success: true, data: saved });
    } catch (err: any) {
      console.error('Webhook create error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Create failed' });
    }
  },
);

router.patch(
  '/me/webhooks/:id',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const { TenantWebhook, WebhookEvent } = await import(
        '../entities/tenantWebhook.entity'
      );
      const repo = AppDataSource.getRepository(TenantWebhook);
      const row = await repo.findOne({
        where: { id: req.params.id, tenantId: req.tenant!.id },
      });
      if (!row) {
        res.status(404).json({ success: false, message: 'Webhook not found' });
        return;
      }
      const { name, events, isActive } = req.body || {};
      if (name != null) row.name = String(name).slice(0, 100);
      if (Array.isArray(events)) {
        const allowed = Object.values(WebhookEvent) as string[];
        row.events = events.filter((e: string) => allowed.includes(e)) as any;
      }
      if (typeof isActive === 'boolean') row.isActive = isActive;
      const saved = await repo.save(row);
      res.json({ success: true, data: { ...saved, secret: '***' } });
    } catch (err: any) {
      console.error('Webhook patch error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Update failed' });
    }
  },
);

router.delete(
  '/me/webhooks/:id',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const { TenantWebhook } = await import('../entities/tenantWebhook.entity');
      const repo = AppDataSource.getRepository(TenantWebhook);
      const row = await repo.findOne({
        where: { id: req.params.id, tenantId: req.tenant!.id },
      });
      if (!row) {
        res.status(404).json({ success: false, message: 'Webhook not found' });
        return;
      }
      await repo.remove(row);
      res.json({ success: true });
    } catch (err: any) {
      console.error('Webhook delete error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Delete failed' });
    }
  },
);

router.get(
  '/me/domains',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    const { listDomains } = await import('../services/customDomain.service');
    const rows = await listDomains(req.tenant!.id);
    res.json({ success: true, data: rows });
  },
);

router.post(
  '/me/domains',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const { claimDomain } = await import('../services/customDomain.service');
      const result = await claimDomain(req.tenant!.id, req.body?.domain);
      res.status(201).json({
        success: true,
        data: {
          id: result.row.id,
          domain: result.row.domain,
          status: result.row.status,
          dns: {
            txt: result.txtRecord,
            cname: { name: result.row.domain, value: result.cname },
          },
        },
      });
    } catch (err: any) {
      if (err?.name === 'DomainError') {
        res
          .status(err.httpStatus || 400)
          .json({ success: false, message: err.message, code: err.code });
        return;
      }
      console.error('Domain claim error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Claim failed' });
    }
  },
);

router.post(
  '/me/domains/:id/verify',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const { verifyDomain } = await import('../services/customDomain.service');
      const result = await verifyDomain(req.tenant!.id, req.params.id);
      if (!result.verified) {
        res.status(422).json({
          success: false,
          message: result.reason || 'Verification failed',
          code: 'DOMAIN_NOT_VERIFIED',
        });
        return;
      }
      res.json({ success: true, data: { verified: true } });
    } catch (err: any) {
      if (err?.name === 'DomainError') {
        res
          .status(err.httpStatus || 400)
          .json({ success: false, message: err.message, code: err.code });
        return;
      }
      console.error('Domain verify error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Verify failed' });
    }
  },
);

router.delete(
  '/me/domains/:id',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const { removeDomain } = await import('../services/customDomain.service');
      await removeDomain(req.tenant!.id, req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      if (err?.name === 'DomainError') {
        res
          .status(err.httpStatus || 400)
          .json({ success: false, message: err.message, code: err.code });
        return;
      }
      console.error('Domain delete error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Delete failed' });
    }
  },
);

router.get(
  '/me/statement',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const { parseMonth, buildMonthlyStatementCsv } = await import(
        '../services/statement.service'
      );
      const m = parseMonth(req.query?.month as string | undefined);
      const { csv, filename } = await buildMonthlyStatementCsv(
        req.tenant!.id,
        req.tenant!.slug,
        m,
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (err: any) {
      console.error('Statement error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Statement failed' });
    }
  },
);

router.post(
  '/me/2fa/setup',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as User;
      const repo = AppDataSource.getRepository(User);
      if (user.totpEnabled) {
        res.status(409).json({
          success: false,
          message: '2FA already enabled; disable it first to re-enrol',
          code: 'TOTP_ALREADY_ENABLED',
        });
        return;
      }
      const secret = generateTotpSecret();
      user.totpSecret = secret;
      await repo.save(user);
      res.json({
        success: true,
        data: {
          secret,
          otpauthUrl: buildOtpAuthUrl({
            secret,
            accountName: user.email,
            issuer: 'PrintLoop',
          }),
        },
      });
    } catch (err: any) {
      console.error('2FA setup error:', err);
      res.status(500).json({ success: false, message: '2FA setup failed' });
    }
  },
);

router.post(
  '/me/2fa/enable',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as User;
      const repo = AppDataSource.getRepository(User);
      if (!user.totpSecret) {
        res.status(400).json({
          success: false,
          message: 'Run 2FA setup first',
          code: 'TOTP_NOT_SET_UP',
        });
        return;
      }
      const code = String(req.body?.code || '');
      if (!verifyTotp(user.totpSecret, code)) {
        res.status(422).json({
          success: false,
          message: 'Code did not verify — check your authenticator clock',
          code: 'TOTP_INVALID',
        });
        return;
      }
      user.totpEnabled = true;
      await repo.save(user);
      res.json({ success: true, data: { enabled: true } });
    } catch (err: any) {
      console.error('2FA enable error:', err);
      res.status(500).json({ success: false, message: '2FA enable failed' });
    }
  },
);

router.post(
  '/me/2fa/disable',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as User;
      const repo = AppDataSource.getRepository(User);
      if (!user.totpEnabled || !user.totpSecret) {
        res.json({ success: true, data: { enabled: false } });
        return;
      }
      const code = String(req.body?.code || '');
      if (!verifyTotp(user.totpSecret, code)) {
        res.status(422).json({
          success: false,
          message: 'Current 2FA code required to disable',
          code: 'TOTP_INVALID',
        });
        return;
      }
      user.totpEnabled = false;
      user.totpSecret = null;
await repo.save(user);
      res.json({ success: true, data: { enabled: false } });
    } catch (err: any) {
      console.error('2FA disable error:', err);
      res.status(500).json({ success: false, message: '2FA disable failed' });
    }
  },
);

import { DocumentEdit, DocumentEditStatus } from '../entities/documentEdit.entity';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';
import { EditPricingConfig, EditComplexityTier } from '../entities/editPricingConfig.entity';
import { notificationQueue } from '../workers/queues';
import { etherpadService } from '../services/etherpad.service';

router.post(
  '/edit-pricing',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const {
        baseFee,
        perPageFee,
        complexityTierFees,
        maxShopAdjustmentPct,
        editingEnabled,
        bankAccountName,
        bankAccountNumber,
        bankName,
        bankSortCode,
      } = req.body || {};

      const repo = AppDataSource.getRepository(EditPricingConfig);
      let config = await repo.findOne({ where: { tenantId: tenant.id } });

      if (!config) {
        config = repo.create({ tenantId: tenant.id });
      }

      if (baseFee !== undefined) config.baseFee = baseFee;
      if (perPageFee !== undefined) config.perPageFee = perPageFee;
      if (complexityTierFees !== undefined) config.complexityTierFees = complexityTierFees;
      if (maxShopAdjustmentPct !== undefined) config.maxShopAdjustmentPct = maxShopAdjustmentPct;
      if (editingEnabled !== undefined) config.editingEnabled = editingEnabled;
      if (bankAccountName !== undefined) config.bankAccountName = bankAccountName;
      if (bankAccountNumber !== undefined) config.bankAccountNumber = bankAccountNumber;
      if (bankName !== undefined) config.bankName = bankName;
      if (bankSortCode !== undefined) config.bankSortCode = bankSortCode;

      await repo.save(config);

      res.json({ success: true, data: config });
    } catch (err: any) {
      console.error('[saas/edit-pricing] error:', err);
      res.status(500).json({ success: false, message: err?.message || 'Failed to save edit pricing' });
    }
  },
);

router.get(
  '/edit-pricing',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const repo = AppDataSource.getRepository(EditPricingConfig);
      const config = await repo.findOne({ where: { tenantId: tenant.id } });

      if (!config) {
        res.json({
          success: true,
          data: {
            baseFee: 500,
            perPageFee: 100,
            complexityTierFees: {},
            maxShopAdjustmentPct: 0,
            editingEnabled: true,
            bankAccountName: null,
            bankAccountNumber: null,
            bankName: null,
            bankSortCode: null,
          },
        });
        return;
      }

      res.json({ success: true, data: config });
    } catch (err: any) {
      console.error('[saas/edit-pricing:get] error:', err);
      res.status(500).json({ success: false, message: 'Failed to get edit pricing' });
    }
  },
);

router.get(
  '/edit-queue',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const status = req.query.status as DocumentEditStatus | undefined;
      const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));

      const qb = AppDataSource.getRepository(DocumentEdit)
        .createQueryBuilder('de')
        .leftJoinAndSelect('de.printJob', 'pj')
        .leftJoinAndSelect('pj.user', 'u')
        .where('de.shopId = :tid', { tid: tenant.id });

      if (status) {
        qb.andWhere('de.status = :status', { status });
      } else {
        qb.andWhere('de.status IN (:...statuses)', {
          statuses: [DocumentEditStatus.PENDING_SHOP, DocumentEditStatus.IN_PROGRESS],
        });
      }

      qb.orderBy('de.createdAt', 'ASC').limit(limit);

      const edits = await qb.getMany();

      res.json({
        success: true,
        data: {
          items: edits.map((e) => ({
            id: e.id,
            printJobId: e.printJobId,
            status: e.status,
            editOperations: e.editOperations,
            originalDocumentMeta: e.originalDocumentMeta,
            editedDocumentMeta: e.editedDocumentMeta,
            totalEditFee: e.totalEditFee,
            shopNotes: e.shopNotes,
            customerRejectionReason: e.customerRejectionReason,
            createdAt: e.createdAt,
            printJob: e.printJob
              ? {
                  id: e.printJob.id,
                  code: e.printJob.code,
                  status: e.printJob.status,
                  customerName: e.printJob.user
                    ? `${e.printJob.user.firstName} ${e.printJob.user.lastName}`
                    : 'Unknown',
                  customerEmail: e.printJob.user?.email,
                  originalDocumentUrl: e.printJob.renderedPdfUrl,
                  editingInstructions: e.printJob.editingInstructions,
                  pageCount: e.printJob.totalPages,
                  colorMode: e.printJob.printConfiguration?.color,
                  paperSize: e.printJob.printConfiguration?.paper,
                }
              : null,
          })),
        },
      });
    } catch (err: any) {
      console.error('[saas/edit-queue] error:', err);
      res.status(500).json({ success: false, message: 'Failed to list edit queue' });
    }
  },
);

router.post(
  '/edit/:jobId/start',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const user = (req as any).user as any;
      const { jobId } = req.params;

      const editRepo = AppDataSource.getRepository(DocumentEdit);
      const jobRepo = AppDataSource.getRepository(PrintJob);

      const edit = await editRepo.findOne({
        where: { printJobId: jobId, shopId: tenant.id },
        relations: ['printJob'],
      });

      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }

      if (edit.status !== DocumentEditStatus.PENDING_SHOP) {
        res.status(400).json({ success: false, message: `Edit job is ${edit.status}, cannot start` });
        return;
      }

      edit.status = DocumentEditStatus.IN_PROGRESS;
      edit.editedBy = user.id;
      await editRepo.save(edit);

      const job = edit.printJob;
      job.status = PrintJobStatus.AWAITING_EDIT;
      await jobRepo.save(job);

      const padId = `edit-${edit.id}`;
      let editorUrl = '';
      try {
        const initialText = edit.printJob.editingInstructions
          ? `Editing Instructions:\n${edit.printJob.editingInstructions}\n\n---\nOriginal Document: ${edit.printJob.fileName || 'document.pdf'}\nPages: ${edit.printJob.totalPages}\n\n[Document content would be extracted from PDF here]`
          : `Editing document: ${edit.printJob.fileName || 'document.pdf'}\nPages: ${edit.printJob.totalPages}\n\n[Document content would be extracted from PDF here]`;

        await etherpadService.createPad(padId, initialText);

        const etherpadUrl = process.env.ETHERPAD_URL || 'http://localhost:9001';
        editorUrl = `${etherpadUrl}/p/${padId}?showControls=true&showChat=true&showLineNumbers=true&useMonospaceFont=false`;

        edit.editOperations = [{ type: 'etherpad_created', padId, createdAt: new Date().toISOString() }];
        await editRepo.save(edit);
      } catch (e: any) {
        console.error('[saas/edit/start] Etherpad error:', e);
      }

      await notificationQueue.add('edit-started', {
        userId: job.userId,
        printJobId: job.id,
        editId: edit.id,
        shopName: tenant.name,
      });

      res.json({ success: true, data: { editId: edit.id, status: edit.status, editorUrl } });
    } catch (err: any) {
      console.error('[saas/edit/start] error:', err);
      res.status(500).json({ success: false, message: 'Failed to start edit' });
    }
  },
);

router.post(
  '/edit/:jobId/upload',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const { jobId } = req.params;
      const { documentUrl, pageCount, fileSize, editOperations, shopNotes } = req.body || {};

      if (!documentUrl) {
        res.status(400).json({ success: false, message: 'Edited document URL is required' });
        return;
      }

      const editRepo = AppDataSource.getRepository(DocumentEdit);
      const jobRepo = AppDataSource.getRepository(PrintJob);

      const edit = await editRepo.findOne({
        where: { printJobId: jobId, shopId: tenant.id },
        relations: ['printJob'],
      });

      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }

      if (edit.status !== DocumentEditStatus.IN_PROGRESS) {
        res.status(400).json({ success: false, message: `Edit job is ${edit.status}, cannot upload` });
        return;
      }

      edit.editedDocumentMeta = { pageCount: pageCount || 0, fileSize: fileSize || 0 };
      edit.editOperations = editOperations || [];
      edit.shopNotes = shopNotes || null;
      edit.status = DocumentEditStatus.PENDING_CUSTOMER;
      await editRepo.save(edit);

      const job = edit.printJob;
      job.editedDocumentUrl = documentUrl;
      job.status = PrintJobStatus.EDIT_COMPLETE;
      await jobRepo.save(job);

      await notificationQueue.add('edit-complete', {
        userId: job.userId,
        printJobId: job.id,
        editId: edit.id,
        editedDocumentUrl: documentUrl,
        shopName: tenant.name,
        totalEditFee: edit.totalEditFee,
      });

      res.json({ success: true, data: { editId: edit.id, status: edit.status } });
    } catch (err: any) {
      console.error('[saas/edit/upload] error:', err);
      res.status(500).json({ success: false, message: 'Failed to upload edited document' });
    }
  },
);

router.post(
  '/edit/:jobId/complete',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const { jobId } = req.params;

      const editRepo = AppDataSource.getRepository(DocumentEdit);
      const jobRepo = AppDataSource.getRepository(PrintJob);

      const edit = await editRepo.findOne({
        where: { printJobId: jobId, shopId: tenant.id },
        relations: ['printJob'],
      });

      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }

      if (edit.status !== DocumentEditStatus.IN_PROGRESS && edit.status !== DocumentEditStatus.PENDING_CUSTOMER) {
        res.status(400).json({ success: false, message: `Edit job is ${edit.status}, cannot complete` });
        return;
      }

      const job = edit.printJob;

      const padId = `edit-${edit.id}`;
      let documentUrl = job.editedDocumentUrl;
      let pageCount = 0;
      let fileSize = 0;

      try {
        const pdfBuffer = await etherpadService.exportAsPDF(padId);
        
        const { saveBuffer } = await import('../utils/fileStore');
        const stored = await saveBuffer(pdfBuffer, `edited-${edit.printJobId}.pdf`);
        documentUrl = stored.url;
        fileSize = pdfBuffer.length;
        
        pageCount = Math.max(1, Math.ceil(fileSize / 3000));
        
        edit.editedDocumentMeta = { pageCount, fileSize };
      } catch (e: any) {
        console.error('[saas/edit/complete] Etherpad export error:', e);
        if (!job.editedDocumentUrl) {
          res.status(400).json({ 
            success: false, 
            message: 'Could not export from Etherpad. Please upload the edited PDF manually.' 
          });
          return;
        }
      }

      edit.editOperations = [
        ...(edit.editOperations || []),
        { type: 'etherpad_exported', padId, exportedAt: new Date().toISOString() }
      ];
      edit.status = DocumentEditStatus.PENDING_CUSTOMER;
      await editRepo.save(edit);

      job.editedDocumentUrl = documentUrl;
      job.status = PrintJobStatus.EDIT_COMPLETE;
      await jobRepo.save(job);

      await notificationQueue.add('edit-complete', {
        userId: job.userId,
        printJobId: job.id,
        editId: edit.id,
        editedDocumentUrl: documentUrl,
        shopName: tenant.name,
        totalEditFee: edit.totalEditFee,
      });

      res.json({ success: true, data: { editId: edit.id, status: edit.status, documentUrl } });
    } catch (err: any) {
      console.error('[saas/edit/complete] error:', err);
      res.status(500).json({ success: false, message: 'Failed to complete edit' });
    }
  },
);

router.post(
  '/edit/:jobId/confirm',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as any;
      const { jobId } = req.params;

      const editRepo = AppDataSource.getRepository(DocumentEdit);
      const jobRepo = AppDataSource.getRepository(PrintJob);

      const edit = await editRepo.findOne({
        where: { printJobId: jobId },
        relations: ['printJob'],
      });

      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }

      if (edit.printJob.userId !== user.id) {
        res.status(403).json({ success: false, message: 'Not authorized' });
        return;
      }

      if (edit.status !== DocumentEditStatus.PENDING_CUSTOMER) {
        res.status(400).json({ success: false, message: `Edit job is ${edit.status}, cannot confirm` });
        return;
      }

      edit.status = DocumentEditStatus.APPROVED;
      edit.approvedBy = user.id;
      edit.approvedAt = new Date();
      await editRepo.save(edit);

      const job = edit.printJob;
      job.status = PrintJobStatus.AWAITING_PAYMENT;
      await jobRepo.save(job);

      await notificationQueue.add('edit-approved', {
        shopId: edit.shopId,
        printJobId: job.id,
        editId: edit.id,
        customerName: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
      });

      res.json({ success: true, data: { editId: edit.id, status: edit.status, printJobStatus: job.status } });
    } catch (err: any) {
      console.error('[saas/edit/confirm] error:', err);
      res.status(500).json({ success: false, message: 'Failed to confirm edit' });
    }
  },
);

router.post(
  '/edit/:jobId/reject',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as any;
      const { jobId } = req.params;
      const { reason } = req.body || {};

      const editRepo = AppDataSource.getRepository(DocumentEdit);
      const jobRepo = AppDataSource.getRepository(PrintJob);

      const edit = await editRepo.findOne({
        where: { printJobId: jobId },
        relations: ['printJob'],
      });

      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }

      if (edit.printJob.userId !== user.id) {
        res.status(403).json({ success: false, message: 'Not authorized' });
        return;
      }

      if (edit.status !== DocumentEditStatus.PENDING_CUSTOMER) {
        res.status(400).json({ success: false, message: `Edit job is ${edit.status}, cannot reject` });
        return;
      }

      edit.status = DocumentEditStatus.REJECTED;
      edit.customerRejectionReason = reason || 'Customer rejected the edited document';
      await editRepo.save(edit);

      const job = edit.printJob;
      job.status = PrintJobStatus.AWAITING_EDIT;
      await jobRepo.save(job);

      await notificationQueue.add('edit-rejected', {
        shopId: edit.shopId,
        printJobId: job.id,
        editId: edit.id,
        reason: edit.customerRejectionReason,
      });

      res.json({ success: true, data: { editId: edit.id, status: edit.status } });
    } catch (err: any) {
      console.error('[saas/edit/reject] error:', err);
      res.status(500).json({ success: false, message: 'Failed to reject edit' });
    }
  },
);

router.post(
  '/edit/:jobId/confirm-payment',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const { jobId } = req.params;

      const editRepo = AppDataSource.getRepository(DocumentEdit);
      const jobRepo = AppDataSource.getRepository(PrintJob);

      const edit = await editRepo.findOne({
        where: { printJobId: jobId, shopId: tenant.id },
        relations: ['printJob'],
      });

      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }

      if (edit.status !== DocumentEditStatus.APPROVED) {
        res.status(400).json({ success: false, message: `Edit job is ${edit.status}, cannot confirm payment` });
        return;
      }

      const job = edit.printJob;
      if (job.status !== PrintJobStatus.AWAITING_PAYMENT) {
        res.status(400).json({ success: false, message: `Print job is ${job.status}, cannot confirm payment` });
        return;
      }

      edit.status = DocumentEditStatus.COMPLETED;
      edit.completedAt = new Date();
      await editRepo.save(edit);

      job.status = PrintJobStatus.PAID;
      await jobRepo.save(job);

      await notificationQueue.add('edit-payment-confirmed', {
        userId: job.userId,
        printJobId: job.id,
        editId: edit.id,
      });

      res.json({ success: true, data: { editId: edit.id, status: edit.status, printJobStatus: job.status } });
    } catch (err: any) {
      console.error('[saas/edit/confirm-payment] error:', err);
      res.status(500).json({ success: false, message: 'Failed to confirm payment' });
    }
  },
);

router.get(
  '/edit/:jobId',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as any;
      const { jobId } = req.params;

      const editRepo = AppDataSource.getRepository(DocumentEdit);
      const edit = await editRepo.findOne({
        where: { printJobId: jobId },
        relations: ['printJob', 'printJob.user', 'shop'],
      });

      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }

      const isShop = edit.shopId === req.tenant?.id;
      const isCustomer = edit.printJob.userId === user.id;

      if (!isShop && !isCustomer) {
        res.status(403).json({ success: false, message: 'Not authorized' });
        return;
      }

      let bankDetails = null;
      if (isCustomer && edit.printJob.status === PrintJobStatus.AWAITING_PAYMENT) {
        const pricingRepo = AppDataSource.getRepository(EditPricingConfig);
        const pricing = await pricingRepo.findOne({ where: { tenantId: edit.shopId } });
        if (pricing) {
          bankDetails = {
            accountName: pricing.bankAccountName,
            accountNumber: pricing.bankAccountNumber,
            bankName: pricing.bankName,
            sortCode: pricing.bankSortCode,
          };
        }
      }

      res.json({
        success: true,
        data: {
          id: edit.id,
          printJobId: edit.printJobId,
          status: edit.status,
          editOperations: edit.editOperations,
          originalDocumentMeta: edit.originalDocumentMeta,
          editedDocumentMeta: edit.editedDocumentMeta,
          baseEditFee: edit.baseEditFee,
          perPageFee: edit.perPageFee,
          complexityFee: edit.complexityFee,
          shopAdjustedFee: edit.shopAdjustedFee,
          totalEditFee: edit.totalEditFee,
          shopNotes: edit.shopNotes,
          customerRejectionReason: edit.customerRejectionReason,
          approvedAt: edit.approvedAt,
          completedAt: edit.completedAt,
          createdAt: edit.createdAt,
          bankDetails,
          editorUrl: isShop && (edit.status === DocumentEditStatus.IN_PROGRESS || edit.status === DocumentEditStatus.PENDING_CUSTOMER)
            ? `${process.env.ETHERPAD_URL || 'http://localhost:9001'}/p/edit-${edit.id}?showControls=true&showChat=true&showLineNumbers=true&useMonospaceFont=false`
            : null,
          printJob: edit.printJob
            ? {
                id: edit.printJob.id,
                code: edit.printJob.code,
                status: edit.printJob.status,
                documentUrl: edit.printJob.renderedPdfUrl,
                editedDocumentUrl: edit.printJob.editedDocumentUrl,
                editingInstructions: edit.printJob.editingInstructions,
                pageCount: edit.printJob.totalPages,
                colorMode: edit.printJob.printConfiguration?.color,
                paperSize: edit.printJob.printConfiguration?.paper,
              }
            : null,
        },
      });
    } catch (err: any) {
      console.error('[saas/edit/get] error:', err);
      res.status(500).json({ success: false, message: 'Failed to get edit job' });
    }
  },
);

router.use('/editor', editorRoutes);

export default router;
