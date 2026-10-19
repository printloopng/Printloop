import { Router } from 'express';
import { integrationsController } from '@/modules/public/controllers/integrations.controller';

const router = Router();

router.get('/lms/handoff', integrationsController.lmsHandoff);

export default router;
