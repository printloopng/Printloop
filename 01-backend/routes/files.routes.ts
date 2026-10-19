import { Router, type Request, type Response } from 'express';
import { hasS3, s3Client, UPLOAD_DIR } from '../utils/fileStore.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';

const router = Router();

router.get('/:key', async (req: Request, res: Response) => {
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
});

export default router;