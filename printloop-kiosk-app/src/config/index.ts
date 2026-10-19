import dotenv from 'dotenv';
dotenv.config();

export function getApiUrl(): string {
  const url = process.env.API_URL?.trim();
  if (!url) {
    throw new Error('API_URL is required. Set it in .env (see .env.example).');
  }
  return url.replace(/\/$/, '');
}

export const config = {
  get apiUrl() {
    return getApiUrl();
  },
  s3: {
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || undefined,
    bucket: process.env.S3_BUCKET || 'printloop-renders',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    pretty: process.env.NODE_ENV !== 'production',
  },
};
