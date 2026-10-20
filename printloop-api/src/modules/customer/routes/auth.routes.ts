import { Router } from 'express';
import { authenticate } from '@/common/middleware/auth.middleware';
import { validate } from '@/common/middleware/validation';
import { customerAuthController } from '@/modules/customer/controllers/auth.controller';
import {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  closeAccountSchema,
  validateAuthBody,
} from '@/modules/customer/validation/auth.validation';

const router = Router();

router.post(
  '/register',
  validateAuthBody(registerSchema),
  customerAuthController.register,
);

router.post('/login', validateAuthBody(loginSchema), customerAuthController.login);

router.post('/verify-email', customerAuthController.verifyEmail);
router.post('/resend-verification', customerAuthController.resendVerification);

router.get('/me', authenticate, customerAuthController.me);

router.put(
  '/me',
  authenticate,
  validateAuthBody(updateProfileSchema),
  customerAuthController.updateProfile,
);

router.put(
  '/password',
  authenticate,
  validateAuthBody(changePasswordSchema),
  customerAuthController.changePassword,
);

router.post('/export', authenticate, customerAuthController.exportData);

router.delete(
  '/me',
  authenticate,
  validate(closeAccountSchema),
  customerAuthController.closeAccount,
);

export default router;
