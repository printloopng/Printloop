import { Router } from 'express';
import { authenticate } from '@/common/middleware/auth.middleware';
import { customerPaymentsController } from '@/modules/customer/controllers/payments.controller';

const router = Router();

router.post(
  '/initialize-job-payment',
  authenticate,
  customerPaymentsController.initializeJobPayment,
);


export default router;
