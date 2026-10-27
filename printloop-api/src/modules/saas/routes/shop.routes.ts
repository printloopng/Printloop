import { Router } from 'express';
import { DataSource } from 'typeorm';
import { authenticate } from '@/common/middleware/auth.middleware';
import { resolveTenant, requireTenantRole } from '@/common/middleware/tenant.middleware';
import { TenantMemberRole } from '@/database/entities/tenantMember.entity';
import { requireVerifiedEmail } from '@/common/middleware/verifiedEmail.middleware';
import { ShopController } from '@/modules/saas/controllers/shop.controller';

export function createShopRoutes(ds: DataSource): Router {
  const router = Router();
  const ctrl = new ShopController(ds);

  router.get('/me', authenticate, resolveTenant, ctrl.getMe);
  router.get('/ops/summary', authenticate, resolveTenant, ctrl.opsSummary);
  router.get('/me/lms', authenticate, requireVerifiedEmail, resolveTenant, ctrl.getLmsStatus);
  router.post(
    '/me/lms/regenerate',
    authenticate,
    requireVerifiedEmail,
    resolveTenant,
    requireTenantRole(TenantMemberRole.OWNER, TenantMemberRole.ADMIN),
    ctrl.regenerateLmsKey,
  );
  router.patch(
    '/me/location',
    authenticate,
    requireVerifiedEmail,
    resolveTenant,
    requireTenantRole(TenantMemberRole.OWNER, TenantMemberRole.ADMIN),
    ctrl.patchLocation,
  );
  router.patch(
    '/me/availability',
    authenticate,
    requireVerifiedEmail,
    resolveTenant,
    ctrl.patchAvailability,
  );
  router.get('/me/statement', authenticate, resolveTenant, ctrl.getStatement);
  router.post('/me/2fa/setup', authenticate, ctrl.setup2fa);
  router.post('/me/2fa/enable', authenticate, ctrl.enable2fa);
  router.post('/me/2fa/disable', authenticate, ctrl.disable2fa);

  return router;
}
