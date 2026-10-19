import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const here = __dirname;

export const UPLOAD_DIR = path.resolve(here, '..', 'data', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const PUBLIC_BASE =
  process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 4000}`;

const hasCloudinary = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (hasCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

const hasS3 = Boolean(
  process.env.S3_ENDPOINT &&
  process.env.S3_BUCKET &&
  process.env.S3_ACCESS_KEY_ID &&
  process.env.S3_SECRET_ACCESS_KEY,
);

let s3Client: S3Client | null = null;
if (hasS3) {
  s3Client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || 'auto',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  });
}

export { hasS3, s3Client };

export interface StoredFile {
  key: string;
  fileName: string;
  absPath: string;
  
  url: string;
  sizeBytes: number;
}

function sanitize(name: string): string {
  return (name || 'document').replace(/[^\w.-]+/g, '_').slice(0, 80);
}

export async function saveBuffer(buf: Buffer, originalName: string): Promise<StoredFile> {
  const fileName = sanitize(originalName);
  const key = `${randomUUID()}__${fileName}`;

  if (hasS3 && s3Client) {
    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET!,
          Key: key,
          Body: buf,
          ContentType: 'application/octet-stream',
        }),
      );
      const publicBase = process.env.S3_PUBLIC_URL || process.env.S3_ENDPOINT;
      const url = `${publicBase}/${process.env.S3_BUCKET}/${encodeURIComponent(key)}`;
      return {
        key,
        fileName,
        absPath: '',
        url,
        sizeBytes: buf.length,
      };
    } catch (err) {
      console.error('[fileStore] S3 upload failed, falling back:', err);
    }
  }

  if (hasCloudinary) {
    try {
      const uploadResult = await new Promise<any>((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              resource_type: 'raw',
              folder: 'printloop/documents',
              public_id: key,
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            },
          )
          .end(buf);
      });

      return {
        key,
        fileName,
        absPath: '',
        url: uploadResult.secure_url,
        sizeBytes: buf.length,
      };
    } catch (err) {
      console.error('[fileStore] Cloudinary upload failed, falling back to local disk:', err);
    }
  }

  const absPath = path.join(UPLOAD_DIR, key);
  fs.writeFileSync(absPath, buf);
  return {
    key,
    fileName,
    absPath,
    url: `${PUBLIC_BASE}/api/files/${encodeURIComponent(key)}`,
    sizeBytes: buf.length,
  };
}

export async function loadDocumentBytes(src: string): Promise<Buffer | null> {
  if (!src) return null;
  try {
    const m = src.match(/\/api\/files\/([^?#]+)/);
    if (m) {
      const p = path.join(UPLOAD_DIR, decodeURIComponent(m[1]));
      return fs.existsSync(p) ? fs.readFileSync(p) : null;
    }
    if (src.startsWith('file://')) return fs.readFileSync(fileURLToPath(src));
    if (/^[a-zA-Z]:[\\/]/.test(src) || src.startsWith('/')) {
      return fs.existsSync(src) ? fs.readFileSync(src) : null;
    }
    if (/^https?:\/\//i.test(src)) {
      const r = await axios.get(src, { responseType: 'arraybuffer' });
      return Buffer.from(r.data);
    }
  } catch {
    return null;
  }
  return null; // local:// , dev:// , etc.
}