import { Router } from 'express';
import multer from 'multer';
import { kioskCupsController } from '@/modules/kiosk/controllers/cups.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/print', upload.single('file'), kioskCupsController.print);

export default router;
