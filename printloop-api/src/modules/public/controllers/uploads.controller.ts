import { Request, Response, NextFunction } from 'express';
import { signAccessToken } from '@/core/utils/jwt';
import { saveBuffer } from '@/core/utils/fileStore';
import { UPLOAD_PURPOSES, type UploadPurpose } from '@/common/middleware/uploadTicket.middleware';
import { isPrintableDocument, ALLOWED_LABEL } from '@/modules/public/services/documentConvert.service';

const TICKET_TTL_SECONDS = 10 * 60;
const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

export class UploadsController {
  issueTicket = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const purpose = String(req.body?.purpose || '') as UploadPurpose;
      if (!UPLOAD_PURPOSES.includes(purpose)) {
        res.status(400).json({ success: false, message: `purpose must be one of: ${UPLOAD_PURPOSES.join(', ')}` });
        return;
      }
      const user = (req as any).user;
      const ticket = signAccessToken(
        { userId: user.id, role: user.role, memberships: req.tenantMemberships || [], scope: `upload:${purpose}` } as any,
        { expiresIn: TICKET_TTL_SECONDS },
      );
      res.json({
        success: true,
        data: { ticket, purpose, expiresAt: new Date(Date.now() + TICKET_TTL_SECONDS * 1000).toISOString() },
      });
    } catch (err) {
      next(err);
    }
  };

  reviewPhoto = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const file = req.file;
      if (!file || !IMAGE_MIME.has(file.mimetype)) {
        res.status(400).json({ success: false, message: 'Upload a PNG, JPEG or WebP image' });
        return;
      }
      const stored = await saveBuffer(file.buffer, file.originalname || 'photo.jpg');
      res.status(201).json({ success: true, data: { fileURL: stored.url, size: stored.sizeBytes } });
    } catch (err) {
      next(err);
    }
  };

  editedDocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const file = req.file;
      if (!file || !isPrintableDocument(file.originalname || '', file.mimetype)) {
        res.status(415).json({ success: false, message: `PrintLoop prints ${ALLOWED_LABEL} only.` });
        return;
      }
      const stored = await saveBuffer(file.buffer, file.originalname || 'edited.pdf');
      res.status(201).json({ success: true, data: { fileURL: stored.url, size: stored.sizeBytes } });
    } catch (err) {
      next(err);
    }
  };
}

export const uploadsController = new UploadsController();
