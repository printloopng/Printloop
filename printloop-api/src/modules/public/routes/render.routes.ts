import { Router } from 'express';
import { renderCallbackController } from '@/modules/public/controllers/render.controller';

const router = Router();

router.post('/callback', renderCallbackController.callback);
router.post('/failure', renderCallbackController.failure);

export default router;
