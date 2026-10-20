import { Router } from 'express';
import { allowUploadTicket } from '@/common/middleware/uploadTicket.middleware';
import { DataSource } from 'typeorm';
import { authenticate } from '@/common/middleware/auth.middleware';
import { resolveTenant } from '@/common/middleware/tenant.middleware';
import { requireVerifiedEmail } from '@/common/middleware/verifiedEmail.middleware';
import {
  BrandingController,
  photoUpload,
} from '@/modules/saas/controllers/branding.controller';

export function createBrandingRoutes(ds: DataSource): Router {
  const router = Router();
  const ctrl = new BrandingController(ds);

  router.get('/me/branding', authenticate, resolveTenant, ctrl.getBranding);
  router.put(
    '/me/branding',
    authenticate,
    requireVerifiedEmail,
    resolveTenant,
    ctrl.putBranding,
  );
  router.post(
    '/me/photos',
    allowUploadTicket('branding-photo'),
    authenticate,
    resolveTenant,
    photoUpload.single('photo'),
    ctrl.uploadPhoto,
  );
  router.delete('/me/photos', authenticate, resolveTenant, ctrl.deletePhoto);

  return router;
}
