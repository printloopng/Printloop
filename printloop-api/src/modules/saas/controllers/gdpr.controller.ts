import { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { Tenant, TenantStatus } from '@/database/entities/tenant.entity';
import { deleteTenantBodySchema } from '@/modules/saas/validation/gdpr.validation';

export class GdprController {
  constructor(private ds: DataSource) {}

  exportTenant = async (req: Request, res: Response) => {
    try {
      const { exportTenant } = await import('@/modules/saas/services/tenantExport.service');
      const archive = await exportTenant(req.tenant!.id);
      const { writeAudit } = await import('@/core/services/audit.service');
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
  };

  deleteTenant = async (req: Request, res: Response) => {
    try {
      deleteTenantBodySchema.safeParse(req.body ?? {});
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
      const { closeTenant } = await import('@/modules/saas/services/tenantDelete.service');
      await closeTenant(tenant.id, reason || 'Owner-initiated close');
      const { writeAudit } = await import('@/core/services/audit.service');
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
  };
}
