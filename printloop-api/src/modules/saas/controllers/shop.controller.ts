import { randomBytes } from 'node:crypto';
import { tenantRoleOf } from '@/common/middleware/tenant.middleware';
import { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { User } from '@/database/entities/user.entity';
import { Tenant, TenantStatus } from '@/database/entities/tenant.entity';
import { Kiosk, KioskStatus } from '@/database/entities/kiosk.entity';
import { Transaction } from '@/database/entities/transaction.entity';
import { PayoutSchedule } from '@/database/entities/payoutSchedule.entity';
import {
  generateTotpSecret,
  buildOtpAuthUrl,
  verifyTotp,
} from '@/core/utils/totp';
import { assertLiveGateMet } from '@/modules/saas/helpers/liveGate';
import {
  availabilityBodySchema,
  locationPatchBodySchema,
  totpCodeBodySchema,
} from '@/modules/saas/validation/shop.validation';

export class ShopController {
  constructor(private ds: DataSource) {}

  getMe = async (req: Request, res: Response) => {
    const tenant = req.tenant!;
    const { TenantBranding } = await import('@/database/entities/tenantBranding.entity');
    const [schedule, branding] = await Promise.all([
      this.ds.getRepository(PayoutSchedule).findOne({
        where: { tenantId: tenant.id },
      }),
      this.ds.getRepository(TenantBranding).findOne({
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
        myRole: tenantRoleOf(req, tenant.id),
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
  };

  opsSummary = async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const now = Date.now();
      const ONLINE_MS = 5 * 60 * 1000;
      const STUCK_MS = 10 * 60 * 1000;
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const { PrintJob, PrintJobStatus } = await import(
        '@/database/entities/printJob.entity'
      );
      const kioskRepo = this.ds.getRepository(Kiosk);
      const jobRepo = this.ds.getRepository(PrintJob);
      const txRepo = this.ds.getRepository(Transaction);

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
  };

  getLmsStatus = async (req: Request, res: Response) => {
    try {
      const row = await this.ds.getRepository(Tenant).findOneOrFail({
        where: { id: req.tenant!.id },
      });
      res.json({ success: true, data: { keySet: Boolean(row.lmsKey) } });
    } catch (err: any) {
      console.error('[saas/me/lms]', err?.message);
      res.status(500).json({ success: false, message: 'Could not load LMS link status' });
    }
  };

  regenerateLmsKey = async (req: Request, res: Response) => {
    try {
      const repo = this.ds.getRepository(Tenant);
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
  };

  patchLocation = async (req: Request, res: Response) => {
    try {
      locationPatchBodySchema.safeParse(req.body ?? {});
      const tenant = req.tenant!;
      const body = req.body || {};
      const tenantRepo = this.ds.getRepository(Tenant);
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
            const { getGeocoder } = await import('@/modules/public/services/geocoding.service');
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
  };

  patchAvailability = async (req: Request, res: Response) => {
    try {
      const parsed = availabilityBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          message: "availability must be 'open', 'busy' or 'closed'",
        });
        return;
      }
      const { availability } = parsed.data;
      const tenantRepo = this.ds.getRepository(Tenant);
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
  };

  getStatement = async (req: Request, res: Response) => {
    try {
      const { parseMonth, buildMonthlyStatementCsv } = await import(
        '@/modules/saas/services/statement.service'
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
  };

  setup2fa = async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as User;
      const repo = this.ds.getRepository(User);
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
  };

  enable2fa = async (req: Request, res: Response) => {
    try {
      totpCodeBodySchema.safeParse(req.body ?? {});
      const user = (req as any).user as User;
      const repo = this.ds.getRepository(User);
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
  };

  disable2fa = async (req: Request, res: Response) => {
    try {
      totpCodeBodySchema.safeParse(req.body ?? {});
      const user = (req as any).user as User;
      const repo = this.ds.getRepository(User);
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
  };
}
