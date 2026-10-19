import { Router } from 'express';
import { authenticate } from '@/common/middleware/auth.middleware';
import { requirePlatformAdmin } from '@/common/middleware/platformAdmin.middleware';
import { platformController } from '@/modules/platform/controllers/platform.controller';

const router = Router();

router.use(authenticate, requirePlatformAdmin);

router.get('/tenants', platformController.listTenants);
router.get('/tenants/:id', platformController.getTenant);
router.post('/tenants/:id/suspend', platformController.suspendTenant);
router.post('/tenants/:id/reactivate', platformController.reactivateTenant);
router.post('/tenants/:id/impersonate', platformController.impersonateTenant);
router.delete('/tenants/:id', platformController.deleteTenant);
router.get('/reliability', platformController.reliability);

export default router;
