import { Router } from 'express';
import { authenticate } from '@/common/middleware/auth.middleware';
import { requirePlatformAdmin } from '@/common/middleware/platformAdmin.middleware';
import { platformController } from '@/modules/platform/controllers/platform.controller';
import { platformAdminController as admin } from '@/modules/platform/controllers/platformAdmin.controller';

const router = Router();

router.use(authenticate, requirePlatformAdmin);

router.get('/tenants', platformController.listTenants);
router.get('/tenants/:id', platformController.getTenant);
router.post('/tenants/:id/suspend', platformController.suspendTenant);
router.post('/tenants/:id/reactivate', platformController.reactivateTenant);
router.post('/tenants/:id/impersonate', platformController.impersonateTenant);
router.delete('/tenants/:id', platformController.deleteTenant);
router.get('/reliability', platformController.reliability);
router.get('/users', admin.listUsers);
router.get('/users/:id', admin.getUser);
router.patch('/users/:id/block', admin.blockUser);
router.patch('/users/:id/role', admin.setUserRole);
router.get('/settings', admin.listSettings);
router.patch('/settings/:key', admin.updateSetting);
router.get('/blog', admin.listBlog);
router.post('/blog', admin.createBlogPost);
router.patch('/blog/:id', admin.updateBlogPost);
router.delete('/blog/:id', admin.deleteBlogPost);
router.get('/disputes', admin.listDisputes);
router.post('/disputes/:id/resolve', admin.resolveDispute);
router.get('/reports/summary', admin.summaryReport);
router.get('/audit-logs', admin.auditLogs);
router.get('/kiosks', admin.kioskFleet);
router.get('/payouts', admin.listPayouts);

export default router;
