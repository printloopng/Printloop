import { Router } from 'express';
import { kioskAuth } from '@/common/middleware/kioskAuth.middleware';
import { validate } from '@/common/middleware/validation';
import { kioskAgentController } from '@/modules/kiosk/controllers/agent.controller';
import {
  agentCompleteBodySchema,
  agentFailedBodySchema,
  agentCapabilitiesBodySchema,
} from '@/modules/kiosk/validation/agent.validation';

const router = Router();

router.get('/jobs/ready', kioskAuth, kioskAgentController.listReadyJobs);
router.get('/jobs/:id/file', kioskAgentController.downloadJobFile);
router.post('/jobs/:id/start', kioskAuth, kioskAgentController.startJob);
router.post(
  '/jobs/:id/complete',
  kioskAuth,
  validate(agentCompleteBodySchema),
  kioskAgentController.completeJob,
);
router.post(
  '/printer/capabilities',
  kioskAuth,
  validate(agentCapabilitiesBodySchema),
  kioskAgentController.storeCapabilities,
);
router.post(
  '/jobs/:id/failed',
  kioskAuth,
  validate(agentFailedBodySchema),
  kioskAgentController.failedJob,
);

export default router;
