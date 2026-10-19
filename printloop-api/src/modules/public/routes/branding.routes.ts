import { Router } from 'express';
import { publicBrandingController } from '@/modules/public/controllers/branding.controller';

const router = Router();

router.get('/', publicBrandingController.getBranding);

export default router;
