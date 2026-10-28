import { Config } from '@/config';
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

const PUBLIC_BASE = Config.publicBaseUrl || `http://localhost:${Config.port}`;

const hasCloudinary = Boolean(
  Config.cloudinary.cloudName &&
  Config.cloudinary.apiKey &&
  Config.cloudinary.apiSecret
);

if (hasCloudinary) {
  cloudinary.config({
    cloud_name: Config.cloudinary.cloudName,
    api_key: Config.cloudinary.apiKey,
    api_secret: Config.cloudinary.apiSecret,
  });
}

const hasS3 = Boolean(
  Config.s3.endpoint &&
  Config.s3.bucket &&
  Config.s3.accessKeyId &&
  Config.s3.secretAccessKey,
);

let s3Client: S3Client | null = null;
if (hasS3) {
  s3Client = new S3Client({
    endpoint: Config.s3.endpoint,
    region: Config.s3.region,
    credentials: {
      accessKeyId: Config.s3.accessKeyId,
      secretAccessKey: Config.s3.secretAccessKey,
    },
    forcePathStyle: Config.s3.forcePathStyle,
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
          Bucket: Config.s3.bucket,
          Key: key,
          Body: buf,
          ContentType: 'application/octet-stream',
        }),
      );
      const publicBase = Config.s3.publicUrl || Config.s3.endpoint;
      const url = `${publicBase}/${Config.s3.bucket}/${encodeURIComponent(key)}`;
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
              type: 'authenticated',
              folder: 'printloop/documents',
              public_id: key.replace(/\.[^.]+$/, ''),
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

const STORAGE_KEY_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}__[\w.-]{1,80}$/i;
const RENDER_KEY_RE = /^renders\/[0-9a-f-]{36}\/[\w.-]{1,120}$/i;
const MAX_FETCH_BYTES = 100 * 1024 * 1024;

export function isStorageKey(key: string): boolean {
  return STORAGE_KEY_RE.test(key) && !key.includes('..');
}

function isReadableKey(key: string): boolean {
  return isStorageKey(key) || (RENDER_KEY_RE.test(key) && !key.includes('..'));
}

export function storageKeyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const last = url.split(/[?#]/)[0].split('/').pop() || '';
  let key: string;
  try {
    key = decodeURIComponent(last);
  } catch {
    return null;
  }
  return isStorageKey(key) ? key : null;
}

export function insideUploadDir(p: string): string | null {
  const resolved = path.resolve(p);
  return resolved.startsWith(UPLOAD_DIR + path.sep) ? resolved : null;
}

export async function loadStoredObject(key: string): Promise<Buffer | null> {
  if (!isReadableKey(key)) return null;
  if (hasS3 && s3Client) {
    try {
      const out = await s3Client.send(
        new GetObjectCommand({ Bucket: Config.s3.bucket, Key: key }),
      );
      if (out.Body) return Buffer.from(await out.Body.transformToByteArray());
    } catch (err: any) {
      if (err?.name !== 'NoSuchKey') console.warn('[fileStore] S3 read failed:', err?.message);
    }
  }
  const p = insideUploadDir(path.join(UPLOAD_DIR, key));
  return p && fs.existsSync(p) ? fs.readFileSync(p) : null;
}

const CLOUDINARY_PATH_RE = /\/raw\/authenticated\/(?:s--[\w-]+--\/)?(?:v\d+\/)?([^?#]+)$/;

export function cloudinaryPublicId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(CLOUDINARY_PATH_RE);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

export function signedCloudinaryUrl(publicId: string): string {
  return cloudinary.url(publicId, {
    resource_type: 'raw',
    type: 'authenticated',
    sign_url: true,
    secure: true,
  });
}

export async function destroyCloudinaryDocument(url: string | null | undefined): Promise<boolean> {
  const publicId = cloudinaryPublicId(url);
  if (!publicId || !hasCloudinary) return false;
  const res = await cloudinary.uploader.destroy(publicId, {
    resource_type: 'raw',
    type: 'authenticated',
    invalidate: true,
  });
  return res.result === 'ok';
}

export async function loadDocumentBytes(src: string): Promise<Buffer | null> {
  if (!src) return null;
  try {
    const cloud = Config.cloudinary.cloudName;
    if (hasCloudinary && cloud && src.startsWith(`https://res.cloudinary.com/${cloud}/`)) {
      const publicId = cloudinaryPublicId(src);
      if (!publicId) return null;
      const r = await axios.get(signedCloudinaryUrl(publicId), {
        responseType: 'arraybuffer',
        timeout: 30_000,
        maxRedirects: 0,
        maxContentLength: MAX_FETCH_BYTES,
      });
      return Buffer.from(r.data);
    }
    const key = storageKeyFromUrl(src);
    if (key) return await loadStoredObject(key);
    if (src.startsWith('file://') || path.isAbsolute(src)) {
      const p = insideUploadDir(src.startsWith('file://') ? fileURLToPath(src) : src);
      return p && fs.existsSync(p) ? fs.readFileSync(p) : null;
    }
  } catch {
    return null;
  }
  return null;
}