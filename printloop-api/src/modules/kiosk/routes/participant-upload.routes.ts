import { Router } from 'express';
import { validate } from '@/common/middleware/validation';
import { kioskParticipantUploadController } from '@/modules/kiosk/controllers/participantUpload.controller';
import { participantUploadBodySchema } from '@/modules/kiosk/validation/participantUpload.validation';

const router = Router();

router.post(
  '/upload',
  validate(participantUploadBodySchema),
  kioskParticipantUploadController.upload,
);

export default router;
