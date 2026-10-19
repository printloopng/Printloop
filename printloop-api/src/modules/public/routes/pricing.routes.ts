import { Router } from 'express';
import { publicPricingController } from '@/modules/public/controllers/pricing.controller';

const router = Router();

router.get('/', publicPricingController.getMatrix);

export default router;
