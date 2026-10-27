import { resolveTenant } from '@/common/middleware/tenant.middleware';
import { Router } from 'express';
import multer from 'multer';
import { customerPrintController } from '@/modules/customer/controllers/print.controller';
import { customerReleaseController } from '@/modules/customer/controllers/release.controller';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.post(
  '/print-jobs',
  resolveTenant,
  upload.single('file'),
  customerPrintController.createPrintJob,
);

router.post(
  '/print-jobs/batch',
  resolveTenant,
  upload.array('files', 50),
  customerPrintController.createPrintJobBatch,
);

router.get('/print-jobs', customerPrintController.listPrintJobs);
router.get('/print-jobs/:id/kiosks', customerReleaseController.kiosksForJob);
router.post('/print-jobs/:id/release', customerReleaseController.release);

router.get('/print-token', customerPrintController.getPrintToken);

router.post('/print-token/rotate', customerPrintController.rotatePrintToken);

router.get('/pricing', resolveTenant, customerPrintController.getPricing);

router.post('/print-jobs/quote', resolveTenant, customerPrintController.quotePrintJob);

router.get('/stations', resolveTenant, customerPrintController.listStations);

router.get('/print-jobs/options', resolveTenant, customerPrintController.getPrintJobOptions);

router.post('/shops/:slug/reviews', customerPrintController.createShopReview);

router.get('/disputes', customerPrintController.listMyDisputes);
router.post('/disputes', customerPrintController.createDispute);

export default router;
