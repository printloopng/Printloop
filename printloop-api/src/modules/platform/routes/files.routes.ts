import { Router } from 'express';
import { filesController } from '@/modules/platform/controllers/files.controller';

const router = Router();

router.get('/:key', filesController.getByKey);

export default router;
