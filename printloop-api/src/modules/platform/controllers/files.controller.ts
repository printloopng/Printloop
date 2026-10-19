import { Request, Response, NextFunction } from 'express';
import { hasS3, s3Client, UPLOAD_DIR } from '@/core/utils/fileStore';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import path from 'node:path';
import fs from 'node:fs';

export class FilesController {
  getByKey = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = decodeURIComponent(req.params.key);

      if (hasS3 && s3Client) {
        try {
          const command = new GetObjectCommand({
            Bucket: process.env.S3_BUCKET!,
            Key: key,
          });
          const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
          res.redirect(302, presignedUrl);
          return;
        } catch (err) {
          console.error('[files] S3 presign failed, falling back to local:', err);
        }
      }

      const filePath = path.join(UPLOAD_DIR, key);
      if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
        return;
      }

      res.status(404).json({ success: false, message: 'File not found' });
    } catch (err) {
      next(err);
    }
  };
}

export const filesController = new FilesController();
