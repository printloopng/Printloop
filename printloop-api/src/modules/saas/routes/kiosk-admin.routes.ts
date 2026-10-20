import { Router, type Request, type Response } from 'express';
import {
  createKiosk,
  listKiosks,
  getKiosk,
  updateKioskStatus,
  updateKiosk,
  regenerateApiKey,
  getOfflineKiosks,
  deleteKiosk,
  testKioskConnection,
} from '@/modules/saas/controllers/kiosk.controller';
import { requireTenantRole } from '@/common/middleware/tenant.middleware';
import { TenantMemberRole } from '@/database/entities/tenantMember.entity';
import { AppDataSource } from '@/config/data-source';
import { Kiosk } from '@/database/entities/kiosk.entity';

const router = Router();
const manager = requireTenantRole(TenantMemberRole.OWNER, TenantMemberRole.ADMIN);

router.get('/', listKiosks);
router.get('/offline', getOfflineKiosks);
router.get('/:id', getKiosk);

router.post('/', manager, createKiosk);
router.patch('/:id/status', manager, updateKioskStatus);
router.patch('/:id', manager, updateKiosk);
router.post('/:id/regenerate-key', manager, regenerateApiKey);
router.post('/:id/test-connection', testKioskConnection);

router.post(
  '/:id/test-print-pass',
  manager,
  async (req: Request, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(Kiosk);
      const kiosk = await repo.findOne({ where: { id: req.params.id } });
      if (!kiosk) {
        res
          .status(404)
          .json({ success: false, message: 'Kiosk not found' });
        return;
      }
      if (req.tenant && kiosk.tenantId !== req.tenant.id) {
        res.status(404).json({ success: false, message: 'Kiosk not found' });
        return;
      }
      kiosk.testPrintPassedAt = new Date();
      await repo.save(kiosk);
      res.json({
        success: true,
        data: { id: kiosk.id, testPrintPassedAt: kiosk.testPrintPassedAt },
      });
    } catch (err: any) {
      console.error('[kiosks/test-print-pass] error:', err);
      res.status(500).json({
        success: false,
        message: err?.message || 'Failed to mark test print passed',
      });
    }
  },
);

router.delete('/:id', manager, deleteKiosk);

export default router;
