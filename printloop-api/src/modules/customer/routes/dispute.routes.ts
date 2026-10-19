import { Router } from 'express';
import { authenticate } from '@/common/middleware/auth.middleware';
import { resolveTenant } from '@/common/middleware/tenant.middleware';
import { requirePermission, Permission } from '@/common/middleware/rbac.middleware';
import { disputeController } from '@/modules/customer/controllers/dispute.controller';

const router = Router();

router.get(
  '/',
  authenticate,
  resolveTenant,
  requirePermission(Permission.VIEW_JOBS),
  disputeController.list,
);

router.post(
  '/:id/resolve',
  authenticate,
  resolveTenant,
  requirePermission(Permission.ISSUE_REFUNDS),
  disputeController.resolve,
);

export default router;
