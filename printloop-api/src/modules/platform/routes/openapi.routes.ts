import { Router } from 'express';
import { openApiController } from '@/modules/platform/controllers/openapi.controller';

const router = Router();

router.get('/openapi.json', openApiController.getSpec);
router.get('/docs', openApiController.getDocs);

export default router;
