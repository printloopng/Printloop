import { Router } from 'express';
import { kioskAuth } from '@/common/middleware/kioskAuth.middleware';
import { bruteForceProtection } from '@/common/middleware/bruteForce.middleware';
import { kioskPrinterExtensionsController } from '@/modules/kiosk/controllers/printerExtensions.controller';
import { kioskPrinterController } from '@/modules/kiosk/controllers/printer.controller';

const router = Router();

router.get('/heartbeat', kioskAuth, kioskPrinterExtensionsController.heartbeat);
router.post(
  '/validate-code',
  kioskAuth,
  bruteForceProtection,
  kioskPrinterExtensionsController.validateCode,
);
router.post('/get-job', kioskAuth, kioskPrinterExtensionsController.getJob);
router.patch('/progress', kioskAuth, kioskPrinterExtensionsController.updateProgress);
router.post('/complete', kioskAuth, kioskPrinterController.complete);
router.post('/complete-batch', kioskAuth, kioskPrinterController.completeBatch);

export default router;
