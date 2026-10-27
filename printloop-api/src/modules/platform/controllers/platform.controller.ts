import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/config/data-source';
import { Tenant, TenantStatus } from '@/database/entities/tenant.entity';
import { TenantMember, TenantMemberRole } from '@/database/entities/tenantMember.entity';
import { Kiosk } from '@/database/entities/kiosk.entity';
import { PrintJob, PrintJobStatus } from '@/database/entities/printJob.entity';
import { User, UserRole } from '@/database/entities/user.entity';
import { Payment } from '@/database/entities/payment.entity';
import { writeAudit } from '@/core/services/audit.service';
import { signAccessToken } from '@/core/utils/jwt';

export class PlatformController {

  listTenants = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query?.limit ?? 50)));
    const before = req.query?.before
      ? new Date(String(req.query.before))
      : null;
    const status = (req.query?.status as string) || undefined;
    const qb = AppDataSource.getRepository(Tenant)
      .createQueryBuilder('t')
      .orderBy('t.createdAt', 'DESC')
      .limit(limit);
    if (status) qb.andWhere('t.status = :s', { s: status });
    if (before && !Number.isNaN(before.getTime())) {
      qb.andWhere('t.createdAt < :before', { before });
    }
    const rows = await qb.getMany();
    res.json({
      success: true,
      data: {
        items: rows.map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          status: t.status,
          commissionPct: Number(t.commissionPct),
          customDomain: t.customDomain,
          paystackSubaccountCode: t.paystackSubaccountCode,
          suspendedAt: t.suspendedAt,
          suspendReason: t.suspendReason,
          createdAt: t.createdAt,
        })),
        nextCursor:
          rows.length === limit ? rows[rows.length - 1].createdAt : null,
      },
    });
  } catch (err: any) {
    console.error('[platform] list tenants:', err);
    res
      .status(500)
      .json({ success: false, message: err?.message || 'Failed to list tenants' });
  }
};

  getTenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenant = await AppDataSource.getRepository(Tenant).findOne({
      where: { id: req.params.id },
    });
    if (!tenant) {
      res.status(404).json({ success: false, message: 'Tenant not found' });
      return;
    }
    const tid = tenant.id;
    const [kiosks, jobs, customers, gmv, memberRows] = await Promise.all([
      AppDataSource.getRepository(Kiosk).find({ where: { tenantId: tid } }),
      AppDataSource.getRepository(PrintJob).count({ where: { tenantId: tid } }),
      AppDataSource.getRepository(User).count({ where: { tenantId: tid, role: UserRole.USER } }),
      AppDataSource.getRepository(Payment)
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.amount), 0)', 'total')
        .where('p.tenantId = :tid AND p.status = :s', { tid, s: 'SUCCESS' })
        .getRawOne(),
      AppDataSource.getRepository(TenantMember).find({ where: { tenantId: tid }, relations: { user: true } }),
    ]);
    const cutoff = Date.now() - 15 * 60 * 1000;
    res.json({
      success: true,
      data: {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          commissionPct: Number(tenant.commissionPct),
          customDomain: tenant.customDomain,
          paystackSubaccountCode: tenant.paystackSubaccountCode,
          address: tenant.address,
          lat: tenant.lat,
          lng: tenant.lng,
          isDiscoverable: Boolean(tenant.isDiscoverable),
          availability: tenant.availability,
          suspendedAt: tenant.suspendedAt,
          suspendReason: tenant.suspendReason,
          createdAt: tenant.createdAt,
        },
        stats: {
          kioskCount: kiosks.length,
          onlineKiosks: kiosks.filter((k) => k.lastSeenAt && new Date(k.lastSeenAt).getTime() >= cutoff).length,
          jobCount: jobs,
          customerCount: customers,
          gmv: parseFloat(gmv?.total || '0'),
        },
        members: memberRows.map((m) => ({
          userId: m.userId,
          role: m.role,
          email: m.user?.email ?? '',
          name: [m.user?.firstName, m.user?.lastName].filter(Boolean).join(' '),
        })),
      },
    });
  } catch (err: any) {
    console.error('[platform] get tenant:', err);
    res
      .status(500)
      .json({ success: false, message: err?.message || 'Failed to load tenant' });
  }
};

  suspendTenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const repo = AppDataSource.getRepository(Tenant);
    const tenant = await repo.findOne({ where: { id: req.params.id } });
    if (!tenant) {
      res.status(404).json({ success: false, message: 'Tenant not found' });
      return;
    }
    if (tenant.status === TenantStatus.SUSPENDED) {
      res.status(409).json({
        success: false,
        message: 'Tenant is already suspended',
      });
      return;
    }
    const reason = String(req.body?.reason || '').slice(0, 255) || null;
    tenant.status = TenantStatus.SUSPENDED;
    tenant.suspendedAt = new Date();
    tenant.suspendReason = reason;
    await repo.save(tenant);
    await writeAudit(req, 'tenant.suspended', `tenant:${tenant.id}`, {
      reason,
      slug: tenant.slug,
    });
    res.json({
      success: true,
      data: {
        id: tenant.id,
        status: tenant.status,
        suspendedAt: tenant.suspendedAt,
        suspendReason: tenant.suspendReason,
      },
    });
  } catch (err: any) {
    console.error('[platform] suspend:', err);
    res
      .status(500)
      .json({ success: false, message: err?.message || 'Failed to suspend tenant' });
  }
};

  reactivateTenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const repo = AppDataSource.getRepository(Tenant);
    const tenant = await repo.findOne({ where: { id: req.params.id } });
    if (!tenant) {
      res.status(404).json({ success: false, message: 'Tenant not found' });
      return;
    }
    if (tenant.status === TenantStatus.CLOSED) {
      res.status(409).json({
        success: false,
        message: 'Tenant is closed and cannot be reactivated',
      });
      return;
    }
    tenant.status = TenantStatus.ACTIVE;
    tenant.suspendedAt = null;
    tenant.suspendReason = null;
    await repo.save(tenant);
    await writeAudit(req, 'tenant.reactivated', `tenant:${tenant.id}`, {
      slug: tenant.slug,
    });
    res.json({
      success: true,
      data: { id: tenant.id, status: tenant.status },
    });
  } catch (err: any) {
    console.error('[platform] reactivate:', err);
    res
      .status(500)
      .json({ success: false, message: err?.message || 'Failed to reactivate tenant' });
  }
};

  impersonateTenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenant = await AppDataSource.getRepository(Tenant).findOne({
      where: { id: req.params.id },
    });
    if (!tenant) {
      res.status(404).json({ success: false, message: 'Tenant not found' });
      return;
    }
    if (tenant.status === TenantStatus.CLOSED) {
      res.status(410).json({
        success: false,
        message: 'Cannot impersonate a closed tenant',
      });
      return;
    }
    const platformAdmin = (req as any).user;
    const ttlSeconds = Math.min(
      4 * 3600,
      Math.max(60, Number(req.query?.ttl ?? 3600)),
    );

    const token = signAccessToken(
      {
        userId: platformAdmin.id,
        role: platformAdmin.role,
        memberships: [
          { tenantId: tenant.id, role: TenantMemberRole.OWNER },
        ],
        impersonating: {
          tenantId: tenant.id,
          actorUserId: platformAdmin.id,
        },
      },
      { expiresIn: ttlSeconds },
    );

    await writeAudit(req, 'tenant.impersonate.start', `tenant:${tenant.id}`, {
      slug: tenant.slug,
      ttlSeconds,
    });
    res.json({
      success: true,
      data: {
        token,
        ttlSeconds,
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
        },
      },
    });
  } catch (err: any) {
    console.error('[platform] impersonate:', err);
    res
      .status(500)
      .json({ success: false, message: err?.message || 'Failed to mint token' });
  }
};

  deleteTenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const force = String(req.query?.force ?? '') === 'true';
    const { hardDeleteTenant } = await import(
      '@/modules/saas/services/tenantDelete.service'
    );
    await writeAudit(req, 'tenant.hard_delete', `tenant:${req.params.id}`, {
      force,
    });
    const result = await hardDeleteTenant(req.params.id, { force });
    res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('[platform] hard-delete:', err);
    res.status(400).json({
      success: false,
      message: err?.message || 'Hard-delete failed',
    });
  }
};

  reliability = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const kioskRepo = AppDataSource.getRepository(Kiosk);
    const jobRepo = AppDataSource.getRepository(PrintJob);

    const allKiosks = await kioskRepo.find();
    const activeKiosks = allKiosks.filter(k => k.status !== 'DISABLED');
    
    const cutoffTime = new Date(Date.now() - 15 * 60 * 1000);
    const onlineKiosks = activeKiosks.filter(k => k.lastSeenAt && new Date(k.lastSeenAt) >= cutoffTime);

    const completedCount = await jobRepo.count({ where: { status: PrintJobStatus.DONE } });
    const failedCount = await jobRepo.count({ where: { status: PrintJobStatus.FAILED } });
    const totalFinished = completedCount + failedCount;
    const failureRate = totalFinished > 0 ? (failedCount / totalFinished) * 100 : 0;
    const successRate = totalFinished > 0 ? (completedCount / totalFinished) * 100 : 0;

    const unredeemedReady = await jobRepo.count({ where: { status: PrintJobStatus.READY } });
    const unredeemedRendering = await jobRepo.count({ where: { status: PrintJobStatus.RENDERING } });
    const unredeemedReleasing = await jobRepo.count({ where: { status: PrintJobStatus.RELEASING } });
    const unredeemedPrinting = await jobRepo.count({ where: { status: PrintJobStatus.PRINTING } });
    const totalPaidUnredeemed = unredeemedReady + unredeemedRendering + unredeemedReleasing + unredeemedPrinting;

    res.json({
      success: true,
      data: {
        agentUptime: {
          totalActiveKiosks: activeKiosks.length,
          onlineKiosksCount: onlineKiosks.length,
          onlineRatePct: activeKiosks.length > 0 ? (onlineKiosks.length / activeKiosks.length) * 100 : 0,
        },
        jobSuccessRate: {
          completedJobsCount: completedCount,
          failedJobsCount: failedCount,
          successRatePct: successRate,
          failureRatePct: failureRate,
        },
        paidUnredeemed: {
          readyCount: unredeemedReady,
          renderingCount: unredeemedRendering,
          releasingCount: unredeemedReleasing,
          printingCount: unredeemedPrinting,
          totalPaidUnredeemed,
        }
      }
    });
  } catch (err: any) {
    console.error('[platform] reliability stats error:', err);
    res.status(500).json({
      success: false,
      message: err?.message || 'Failed to compute reliability stats',
    });
  }
};

}

export const platformController = new PlatformController();
