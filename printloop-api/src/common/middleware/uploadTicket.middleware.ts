import { Request, Response, NextFunction } from 'express';

export const UPLOAD_PURPOSES = ['print-document', 'review-photo', 'edited-document', 'branding-photo'] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

export const allowUploadTicket =
  (purpose: UploadPurpose, match: (req: Request) => boolean = () => true) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!match(req)) return next();
    const ticket = req.header('x-upload-ticket');
    if (ticket && !req.header('authorization')) req.headers.authorization = `Bearer ${ticket}`;
    (req as any).uploadScope = `upload:${purpose}`;
    next();
  };
