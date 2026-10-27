import { Router } from 'express';
import { DataSource } from 'typeorm';
import { authenticate } from '@/common/middleware/auth.middleware';
import { resolveTenant, requireTenantRole } from '@/common/middleware/tenant.middleware';
import { TenantMemberRole } from '@/database/entities/tenantMember.entity';
import { requireVerifiedEmail } from '@/common/middleware/verifiedEmail.middleware';
import { GdprController } from '@/modules/saas/controllers/gdpr.controller';

export function createGdprRoutes(ds: DataSource): Router {
  const router = Router();
  const ctrl = new GdprController(ds);

  router.post(
    '/me/export',
    authenticate,
    requireVerifiedEmail,
    resolveTenant,
    requireTenantRole(TenantMemberRole.OWNER, TenantMemberRole.ADMIN),
    ctrl.exportTenant,
  );
  router.delete(
    '/me',
    authenticate,
    requireVerifiedEmail,
    resolveTenant,
    requireTenantRole(TenantMemberRole.OWNER),
    ctrl.deleteTenant,
  );

  return router;
}
