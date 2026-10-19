import { Router } from 'express';
import { authenticate } from '@/common/middleware/auth.middleware';
import { resolveTenant } from '@/common/middleware/tenant.middleware';
import { customerPaymentsController } from '@/modules/customer/controllers/payments.controller';

const router = Router();

router.post(
  '/initialize-job-payment',
  authenticate,
  resolveTenant,
  customerPaymentsController.initializeJobPayment,
);

router.post('/webhook', customerPaymentsController.webhook);
router.post('/paystack', customerPaymentsController.webhook);

export default router;
