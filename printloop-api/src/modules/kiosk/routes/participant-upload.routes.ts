import { Router } from 'express';
import multer from 'multer';
import { validate } from '@/common/middleware/validation';
import { kioskParticipantUploadController } from '@/modules/kiosk/controllers/participantUpload.controller';
import { participantUploadBodySchema } from '@/modules/kiosk/validation/participantUpload.validation';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post(
  '/upload',
  upload.single('file'),
  validate(participantUploadBodySchema),
  kioskParticipantUploadController.upload,
);

export default router;
