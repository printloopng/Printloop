import { Router } from 'express';
import { DataSource } from 'typeorm';
import { authenticate } from '@/common/middleware/auth.middleware';
import { resolveTenant } from '@/common/middleware/tenant.middleware';
import { requireVerifiedEmail } from '@/common/middleware/verifiedEmail.middleware';
import { SaasKioskController } from '@/modules/saas/controllers/saasKiosk.controller';

export function createSaasKioskRoutes(ds: DataSource): Router {
  const router = Router();
  const ctrl = new SaasKioskController(ds);

  router.get('/kiosks', authenticate, resolveTenant, ctrl.listKiosks);
  router.post(
    '/kiosks',
    authenticate,
    requireVerifiedEmail,
    resolveTenant,
    ctrl.createKiosk,
  );
  router.patch(
    '/kiosks/:id/status',
    authenticate,
    requireVerifiedEmail,
    resolveTenant,
    ctrl.updateStatus,
  );
  router.post(
    '/kiosks/:id/regenerate-key',
    authenticate,
    requireVerifiedEmail,
    resolveTenant,
    ctrl.regenerateKey,
  );
  router.post(
    '/kiosks/:id/test-print',
    authenticate,
    requireVerifiedEmail,
    resolveTenant,
    ctrl.testPrint,
  );
  router.delete(
    '/kiosks/:id',
    authenticate,
    requireVerifiedEmail,
    resolveTenant,
    ctrl.deleteKiosk,
  );

  return router;
}
