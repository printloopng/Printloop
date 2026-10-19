import { Router } from 'express';
import { shopJobsController as ctrl } from '@/modules/saas/controllers/shopJobs.controller';

// Mounted at /saas/jobs behind authenticate + resolveTenant (see index.ts).
const router = Router();

router.get('/', ctrl.list);
router.post('/:id/accept', ctrl.accept);
router.post('/:id/release', ctrl.release);
router.patch('/:id/requeue', ctrl.requeue);
router.patch('/:id/status', ctrl.setStatus);

export default router;
