import { Router } from 'express';
import multer from 'multer';
import { customerPrintController } from '@/modules/customer/controllers/print.controller';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.post(
  '/print-jobs',
  upload.single('file'),
  customerPrintController.createPrintJob,
);

router.post(
  '/print-jobs/batch',
  upload.array('files', 50),
  customerPrintController.createPrintJobBatch,
);

router.get('/print-jobs', customerPrintController.listPrintJobs);

router.get('/print-token', customerPrintController.getPrintToken);

router.post('/print-token/rotate', customerPrintController.rotatePrintToken);

router.get('/pricing', customerPrintController.getPricing);

router.post('/print-jobs/quote', customerPrintController.quotePrintJob);

router.get('/stations', customerPrintController.listStations);

router.get('/print-jobs/options', customerPrintController.getPrintJobOptions);

router.post('/shops/:slug/reviews', customerPrintController.createShopReview);

router.post('/disputes', customerPrintController.createDispute);

export default router;
