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
} from '../controllers/kiosk.controller';
import { Permission, requirePermission } from '../middleware/rbac.middleware';
import { AppDataSource } from '../config/database.js';
import { Kiosk } from '../entities/kiosk.entity.js';

const router = Router();

router.get('/', requirePermission(Permission.VIEW_KIOSKS), listKiosks);
router.get('/offline', requirePermission(Permission.VIEW_KIOSKS), getOfflineKiosks);
router.get('/:id', requirePermission(Permission.VIEW_KIOSKS), getKiosk);

router.post('/', requirePermission(Permission.MANAGE_KIOSKS), createKiosk);
router.patch('/:id/status', requirePermission(Permission.MANAGE_KIOSKS), updateKioskStatus);
router.patch('/:id', requirePermission(Permission.MANAGE_KIOSKS), updateKiosk);
router.post('/:id/regenerate-key', requirePermission(Permission.MANAGE_KIOSKS), regenerateApiKey);
router.post('/:id/test-connection', requirePermission(Permission.VIEW_KIOSKS), testKioskConnection);

router.post(
  '/:id/test-print-pass',
  requirePermission(Permission.MANAGE_KIOSKS),
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

router.delete('/:id', requirePermission(Permission.MANAGE_KIOSKS), deleteKiosk);

export default router;
