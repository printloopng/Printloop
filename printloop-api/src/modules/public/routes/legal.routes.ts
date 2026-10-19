import { Router } from 'express';
import { publicLegalController } from '@/modules/public/controllers/legal.controller';

const router = Router();

router.get('/dpa', publicLegalController.getDpa);
router.get('/terms', publicLegalController.getTerms);
router.get('/privacy', publicLegalController.getPrivacy);

export default router;
