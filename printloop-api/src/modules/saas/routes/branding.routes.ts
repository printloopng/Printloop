import { Router } from 'express';
import { allowUploadTicket } from '@/common/middleware/uploadTicket.middleware';
import { DataSource } from 'typeorm';
import { authenticate } from '@/common/middleware/auth.middleware';
import { resolveTenant, requireTenantRole } from '@/common/middleware/tenant.middleware';
import { TenantMemberRole } from '@/database/entities/tenantMember.entity';
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
    requireTenantRole(TenantMemberRole.OWNER, TenantMemberRole.ADMIN),
    ctrl.putBranding,
  );
  router.post(
    '/me/photos',
    allowUploadTicket('branding-photo'),
    authenticate,
    resolveTenant,
    requireTenantRole(TenantMemberRole.OWNER, TenantMemberRole.ADMIN),
    photoUpload.single('photo'),
    ctrl.uploadPhoto,
  );
  router.delete('/me/photos', authenticate, resolveTenant, requireTenantRole(TenantMemberRole.OWNER, TenantMemberRole.ADMIN), ctrl.deletePhoto);

  return router;
}
