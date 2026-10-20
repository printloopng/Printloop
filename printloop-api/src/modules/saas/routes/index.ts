import { Router } from 'express';
import { DataSource } from 'typeorm';
import { authenticate } from '@/common/middleware/auth.middleware';
import { resolveTenant } from '@/common/middleware/tenant.middleware';
import {
  signupLimiter,
  otpLimiter,
} from '@/common/middleware/rateLimit.middleware';
import editorRoutes from './editor.routes';
import kioskAdminRoutes from './kiosk-admin.routes';
import shopJobsRoutes from './shop-jobs.routes';
import shopAdminRoutes from './shop-admin.routes';
import { createOnboardingRoutes } from './onboarding.routes';
import { createShopRoutes } from './shop.routes';
import { createBrandingRoutes } from './branding.routes';
import { createWebhooksRoutes } from './webhooks.routes';
import { createDomainsRoutes } from './domains.routes';
import { createPayoutsRoutes } from './payouts.routes';
import { createGdprRoutes } from './gdpr.routes';
import { createSaasKioskRoutes } from './saas-kiosks.routes';
import { createEditsRoutes } from './edits.routes';

export const createSaasRoutes = (dataSource: DataSource) => {
  const router = Router();

  router.use('/signup', signupLimiter);
  router.use('/verify-email', otpLimiter);
  router.use('/resend-verification', otpLimiter);

  router.use(createOnboardingRoutes(dataSource));
  router.use(createShopRoutes(dataSource));
  router.use(createBrandingRoutes(dataSource));
  router.use(createWebhooksRoutes());
  router.use(createDomainsRoutes());
  router.use(createPayoutsRoutes(dataSource));
  router.use(createGdprRoutes(dataSource));
  router.use(createSaasKioskRoutes(dataSource));
  router.use(createEditsRoutes(dataSource));

  router.use('/editor', editorRoutes);

  router.use('/kiosks', authenticate, resolveTenant, kioskAdminRoutes);
  router.use('/jobs', authenticate, resolveTenant, shopJobsRoutes);
  router.use(authenticate, resolveTenant, shopAdminRoutes);

  return router;
};
