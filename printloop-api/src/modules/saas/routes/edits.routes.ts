import { Router } from 'express';
import { DataSource } from 'typeorm';
import { authenticate } from '@/common/middleware/auth.middleware';
import { resolveTenant } from '@/common/middleware/tenant.middleware';
import { requireVerifiedEmail } from '@/common/middleware/verifiedEmail.middleware';
import { EditController } from '@/modules/saas/controllers/edit.controller';

export function createEditsRoutes(ds: DataSource): Router {
  const router = Router();
  const ctrl = new EditController(ds);

  router.post(
    '/edit-pricing',
    authenticate,
    requireVerifiedEmail,
    resolveTenant,
    ctrl.upsertEditPricing,
  );
  router.get('/edit-pricing', authenticate, resolveTenant, ctrl.getEditPricing);
  router.get('/edit-queue', authenticate, resolveTenant, ctrl.getEditQueue);
  router.post(
    '/edit/:jobId/start',
    authenticate,
    resolveTenant,
    ctrl.startEdit,
  );
  router.post(
    '/edit/:jobId/upload',
    authenticate,
    resolveTenant,
    ctrl.uploadEdit,
  );
  router.post(
    '/edit/:jobId/complete',
    authenticate,
    resolveTenant,
    ctrl.completeEdit,
  );
  router.post('/edit/:jobId/confirm', authenticate, ctrl.confirmEdit);
  router.post('/edit/:jobId/reject', authenticate, ctrl.rejectEdit);
  router.post(
    '/edit/:jobId/confirm-payment',
    authenticate,
    resolveTenant,
    ctrl.confirmPayment,
  );
  router.get('/edit/:jobId', authenticate, ctrl.getEditJob);

  return router;
}
