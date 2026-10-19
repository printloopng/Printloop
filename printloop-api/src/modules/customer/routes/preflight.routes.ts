import { Router } from 'express';
import { optionalTenant } from '@/common/middleware/tenant.middleware';
import {
  preflightController,
  preflightUpload,
} from '@/modules/customer/controllers/preflight.controller';

const router = Router();

router.post('/analyze', optionalTenant, preflightUpload.single('file'), preflightController.analyze);
router.post('/fix', optionalTenant, preflightUpload.single('file'), preflightController.fix);
router.post('/quote', optionalTenant, preflightController.quote);
router.get('/capabilities', preflightController.capabilities);
router.post(
  '/apply-fix',
  optionalTenant,
  preflightUpload.single('file'),
  preflightController.applyFix,
);

export default router;
