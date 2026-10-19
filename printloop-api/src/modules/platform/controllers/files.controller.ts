import { Request, Response, NextFunction } from 'express';
import { hasS3, s3Client, UPLOAD_DIR, isStorageKey, insideUploadDir } from '@/core/utils/fileStore';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import path from 'node:path';
import fs from 'node:fs';

const INLINE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

/**
 * Serves files saved by saveBuffer. The key carries a random UUID, so the
 * link itself is the access credential; only well-formed upload keys are
 * served (no paths, no other objects in the bucket).
 */
export class FilesController {
  getByKey = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Express has already URL-decoded the param once; don't decode again.
      const key = String(req.params.key || '');
      if (!isStorageKey(key)) {
        res.status(404).json({ success: false, message: 'File not found' });
        return;
      }

      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      if (hasS3 && s3Client) {
        try {
          const command = new GetObjectCommand({
            Bucket: process.env.S3_BUCKET!,
            Key: key,
          });
          const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
          res.redirect(302, presignedUrl);
          return;
        } catch (err) {
          console.error('[files] S3 presign failed, falling back to local:', err);
        }
      }

      const filePath = insideUploadDir(path.join(UPLOAD_DIR, key));
      if (filePath && fs.existsSync(filePath)) {
        // Only images render inline; everything else downloads, so an
        // uploaded file can never run as a page on the API's origin.
        const ext = path.extname(key).toLowerCase();
        if (!INLINE_EXT.has(ext)) {
          res.setHeader('Content-Disposition', `attachment; filename="${key.split('__')[1]}"`);
        }
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
