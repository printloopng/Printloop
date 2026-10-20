import { Router } from 'express';
import { requireTenantRole } from '@/common/middleware/tenant.middleware';
import { TenantMemberRole } from '@/database/entities/tenantMember.entity';
import { shopAdminController as ctrl } from '@/modules/saas/controllers/shopAdmin.controller';

const manager = requireTenantRole(TenantMemberRole.OWNER, TenantMemberRole.ADMIN);
const router = Router();

router.get('/dashboard/stats', ctrl.dashboardStats);
router.get('/group-sessions', ctrl.groupSessions);

router.get('/pricing', ctrl.listPricing);
router.post('/pricing', manager, ctrl.createPricing);
router.patch('/pricing/:id', manager, ctrl.updatePricing);
router.delete('/pricing/:id', manager, ctrl.deletePricing);

router.get('/promotions', ctrl.listPromotions);
router.post('/promotions', manager, ctrl.createPromotion);
router.patch('/promotions/:id', manager, ctrl.updatePromotion);
router.delete('/promotions/:id', manager, ctrl.deletePromotion);

router.get('/printer-profiles', ctrl.listPrinterProfiles);
router.post('/printer-profiles', manager, ctrl.createPrinterProfile);
router.patch('/printer-profiles/:id', manager, ctrl.updatePrinterProfile);
router.delete('/printer-profiles/:id', manager, ctrl.deletePrinterProfile);

router.get('/payments', ctrl.listPayments);
router.get('/disputes', ctrl.listDisputes);
router.post('/disputes/:id/resolve', manager, ctrl.resolveDispute);

router.get('/reports/revenue', manager, ctrl.revenueReport);
router.get('/reports/kiosks', manager, ctrl.kioskReport);
router.get('/audit-logs', manager, ctrl.auditLogs);

router.get('/customers', ctrl.listCustomers);
router.get('/customers/:id', ctrl.getCustomer);
router.patch('/customers/:id/block', manager, ctrl.blockCustomer);

router.get('/team', ctrl.listTeam);
router.post('/team', manager, ctrl.inviteMember);
router.patch('/team/:userId', manager, ctrl.updateMember);
router.delete('/team/:userId', manager, ctrl.removeMember);

export default router;
