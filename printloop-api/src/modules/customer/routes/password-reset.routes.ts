import { Router } from 'express';
import { passwordResetController } from '@/modules/customer/controllers/passwordReset.controller';

const router = Router();

router.post('/forgot-password', passwordResetController.forgotPassword);
router.post('/reset-password', passwordResetController.resetPassword);

export default router;
