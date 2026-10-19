import { Router } from 'express';
import { DataSource } from 'typeorm';
import { authenticate } from '@/common/middleware/auth.middleware';
import { resolveTenant, requireTenantRole } from '@/common/middleware/tenant.middleware';
import { TenantMemberRole } from '@/database/entities/tenantMember.entity';
import { requireVerifiedEmail } from '@/common/middleware/verifiedEmail.middleware';
import { OnboardingController } from '@/modules/saas/controllers/onboarding.controller';

export function createOnboardingRoutes(ds: DataSource): Router {
  const router = Router();
  const ctrl = new OnboardingController(ds);

  router.post('/signup', ctrl.signup);
  router.post('/check-slug', ctrl.checkSlug);
  router.post('/verify-email', ctrl.verifyEmail);
  router.post('/resend-verification', ctrl.resendVerification);
  router.post(
    '/setup/paystack-subaccount',
    authenticate,
    requireVerifiedEmail,
    resolveTenant,
    requireTenantRole(TenantMemberRole.OWNER, TenantMemberRole.ADMIN),
    ctrl.setupPaystackSubaccount,
  );
  router.post(
    '/setup/bank-account',
    authenticate,
    requireVerifiedEmail,
    resolveTenant,
    requireTenantRole(TenantMemberRole.OWNER, TenantMemberRole.ADMIN),
    ctrl.setupBankAccount,
  );

  return router;
}
