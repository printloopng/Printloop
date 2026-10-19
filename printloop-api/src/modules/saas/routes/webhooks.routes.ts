import { Router } from 'express';
import { authenticate } from '@/common/middleware/auth.middleware';
import { resolveTenant, requireTenantRole } from '@/common/middleware/tenant.middleware';
import { TenantMemberRole } from '@/database/entities/tenantMember.entity';
import { requireVerifiedEmail } from '@/common/middleware/verifiedEmail.middleware';
import { WebhookController } from '@/modules/saas/controllers/webhook.controller';

export function createWebhooksRoutes(): Router {
  const router = Router();
  const ctrl = new WebhookController();

  router.get('/me/webhooks', authenticate, resolveTenant, ctrl.listWebhooks);
  router.post(
    '/me/webhooks',
    authenticate,
    requireVerifiedEmail,
    resolveTenant,
    requireTenantRole(TenantMemberRole.OWNER, TenantMemberRole.ADMIN),
    ctrl.createWebhook,
  );
  router.patch(
    '/me/webhooks/:id',
    authenticate,
    requireVerifiedEmail,
    resolveTenant,
    requireTenantRole(TenantMemberRole.OWNER, TenantMemberRole.ADMIN),
    ctrl.patchWebhook,
  );
  router.delete(
    '/me/webhooks/:id',
    authenticate,
    requireVerifiedEmail,
    resolveTenant,
    requireTenantRole(TenantMemberRole.OWNER, TenantMemberRole.ADMIN),
    ctrl.deleteWebhook,
  );

  return router;
}
