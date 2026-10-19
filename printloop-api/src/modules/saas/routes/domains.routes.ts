import { Router } from 'express';
import { authenticate } from '@/common/middleware/auth.middleware';
import { resolveTenant } from '@/common/middleware/tenant.middleware';
import { requireVerifiedEmail } from '@/common/middleware/verifiedEmail.middleware';
import { DomainController } from '@/modules/saas/controllers/domain.controller';

export function createDomainsRoutes(): Router {
  const router = Router();
  const ctrl = new DomainController();

  router.get('/me/domains', authenticate, resolveTenant, ctrl.listDomains);
  router.post(
    '/me/domains',
    authenticate,
    requireVerifiedEmail,
    resolveTenant,
    ctrl.claimDomain,
  );
  router.post(
    '/me/domains/:id/verify',
    authenticate,
    requireVerifiedEmail,
    resolveTenant,
    ctrl.verifyDomain,
  );
  router.delete(
    '/me/domains/:id',
    authenticate,
    requireVerifiedEmail,
    resolveTenant,
    ctrl.removeDomain,
  );

  return router;
}
