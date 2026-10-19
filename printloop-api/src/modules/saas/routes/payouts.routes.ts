import { Router } from 'express';
import { DataSource } from 'typeorm';
import { authenticate } from '@/common/middleware/auth.middleware';
import { resolveTenant } from '@/common/middleware/tenant.middleware';
import { requireVerifiedEmail } from '@/common/middleware/verifiedEmail.middleware';
import { PayoutController } from '@/modules/saas/controllers/payout.controller';

export function createPayoutsRoutes(ds: DataSource): Router {
  const router = Router();
  const ctrl = new PayoutController(ds);

  router.get('/balance', authenticate, resolveTenant, ctrl.getBalance);
  router.get('/payouts', authenticate, resolveTenant, ctrl.listPayouts);
  router.get('/transactions', authenticate, resolveTenant, ctrl.listTransactions);
  router.post(
    '/payouts/instant',
    authenticate,
    requireVerifiedEmail,
    resolveTenant,
    ctrl.instantPayout,
  );

  return router;
}
