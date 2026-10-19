import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.middleware';
import {
  createGroupSession,
  getSessionByShareId,
  joinSession,
  getHostSessionDetails,
  listHostSessions,
  closeSession,
} from '../controllers/groupSession.controller';

const router = Router();

router.get('/share/:shareId', getSessionByShareId);
router.post('/:shareId/join', optionalAuth, joinSession);

router.post('/', optionalAuth, createGroupSession);
router.get('/', optionalAuth, listHostSessions);
router.get('/:id', optionalAuth, getHostSessionDetails);
router.post('/:id/close', optionalAuth, closeSession);

export default router;
