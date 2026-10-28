import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

export const WEBHOOK_SECRET = 'whsec_test_suite';

export const TEST_SERVER_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';

export const TEST_DB_NAME = `printloop_test_${crypto.randomBytes(6).toString('hex')}`;

export function urlWithDatabase(serverUrl: string, name: string): string {
  const u = new URL(serverUrl);
  u.pathname = `/${name}`;
  return u.toString();
}

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: urlWithDatabase(TEST_SERVER_URL, TEST_DB_NAME),
  DB_SSL: 'false',
  SEED_DEMO: '1',
  PRINT_DISPATCH_MODE: 'kiosk-pull',
  SMTP_HOST: '',
  TERMII_API_KEY: '',
  CLOUDINARY_CLOUD_NAME: '',
  PAYSTACK_SECRET_KEY: '',
  PAYSTACK_WEBHOOK_SECRET: WEBHOOK_SECRET,
  REDIS_URL: '',
  REDIS_HOST: '',
  DISABLE_RATE_LIMIT: '1',
  LOG_LEVEL: 'error',
});
