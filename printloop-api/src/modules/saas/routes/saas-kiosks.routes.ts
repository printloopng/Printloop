import { Router } from 'express';
import { DataSource } from 'typeorm';
import { authenticate } from '@/common/middleware/auth.middleware';
import { requireTenantRole, resolveTenant } from '@/common/middleware/tenant.middleware';
import { TenantMemberRole } from '@/database/entities/tenantMember.entity';
import { requireVerifiedEmail } from '@/common/middleware/verifiedEmail.middleware';
import { SaasKioskController } from '@/modules/saas/controllers/saasKiosk.controller';

export function createSaasKioskRoutes(ds: DataSource): Router {
  const router = Router();
  const ctrl = new SaasKioskController(ds);
  const manager = requireTenantRole(TenantMemberRole.OWNER, TenantMemberRole.ADMIN);

  router.get('/kiosks', authenticate, resolveTenant, ctrl.listKiosks);
  router.post(
    '/kiosks',
    authenticate,
    requireVerifiedEmail,
    resolveTenant,
    manager,
    ctrl.createKiosk,
  );
  router.patch(
    '/kiosks/:id/status',
    authenticate,
    requireVerifiedEmail,
    resolveTenant,
    manager,
    ctrl.updateStatus,
  );
  router.post(
    '/kiosks/:id/regenerate-key',
    authenticate,
    requireVerifiedEmail,
    resolveTenant,
    manager,
    ctrl.regenerateKey,
  );
  router.post(
    '/kiosks/:id/test-print',
    authenticate,
    requireVerifiedEmail,
    resolveTenant,
    manager,
    ctrl.testPrint,
  );
  router.delete(
    '/kiosks/:id',
    authenticate,
    requireVerifiedEmail,
    resolveTenant,
    manager,
    ctrl.deleteKiosk,
  );

  return router;
}
