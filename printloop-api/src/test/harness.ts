import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import type { Server } from 'node:http';
import { checkContract, contractViolations } from './contract';

export const WEBHOOK_SECRET = 'whsec_test_suite';

export interface TestApi {
  base: string;
  close: () => Promise<void>;
  call: (method: string, p: string, opts?: CallOpts) => Promise<CallResult>;
  login: (email: string, password: string) => Promise<string>;
}

export interface CallOpts {
  token?: string | null;
  body?: unknown;
  form?: FormData;
  raw?: string;
  headers?: Record<string, string>;
}

export interface CallResult {
  status: number;
  body: any;
  text: string;
  headers: Headers;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

export async function startTestApi(): Promise<TestApi> {
  const port = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'printloop-test-'));
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: '',
    DATABASE_FILE: path.join(dir, 'test.sqlite'),
    SEED_DEMO: '1',
    PORT: String(port),
    PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
    PRINT_DISPATCH_MODE: 'kiosk-pull',
    PAYSTACK_SECRET_KEY: '',
    PAYSTACK_WEBHOOK_SECRET: WEBHOOK_SECRET,
    REDIS_URL: '',
    REDIS_HOST: '',
    DISABLE_RATE_LIMIT: '1',
    LOG_LEVEL: 'error',
  });
  const { createApp, initApp } = await import('@/app');
  const app = createApp();
  await initApp(app);
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(port, '127.0.0.1', () => resolve(s));
  });
  const { editorCollaborationService } = await import('@/modules/saas/services/editorCollaboration.service');
  await editorCollaborationService.initialize(server);
  const base = `http://127.0.0.1:${port}`;
  let ip = 1;

  const call = async (method: string, p: string, opts: CallOpts = {}): Promise<CallResult> => {
    const headers: Record<string, string> = {
      'X-Forwarded-For': `10.${(ip >> 16) & 255}.${(ip >> 8) & 255}.${ip++ & 255}`,
      ...(opts.headers || {}),
    };
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    if (opts.body !== undefined || opts.raw !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(p.startsWith('http') ? p : `${base}/api${p}`, {
      method,
      headers,
      body: opts.form ?? opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
    const text = await res.text();
    let body: any = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    if (!p.startsWith('http')) checkContract(method, p, res.status, body);
    return { status: res.status, body, text, headers: res.headers };
  };

  const login = async (email: string, password: string): Promise<string> => {
    const r = await call('POST', '/customer/auth/login', { body: { email, password } });
    const token = r.body?.data?.tokens?.accessToken;
    if (!token) throw new Error(`login failed for ${email}: HTTP ${r.status} ${r.text.slice(0, 120)}`);
    return token;
  };

  const close = async () => {
    const violations = contractViolations();
    await editorCollaborationService.shutdown();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const { AppDataSource } = await import('@/config/data-source');
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
    if (violations.length && process.env.CONTRACT_STRICT !== '0') {
      throw new Error(`Responses that do not match the OpenAPI contract:\n  ${violations.join('\n  ')}`);
    }
  };

  return { base, close, call, login };
}

export async function pdfBytes(pages: number, lines: string[] = []): Promise<Buffer> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Page ${i + 1}`, { x: 50, y: 800 });
    lines.forEach((line, n) => page.drawText(line, { x: 50, y: 760 - n * 16, size: 12 }));
  }
  return Buffer.from(await doc.save());
}

export function pdfForm(bytes: Buffer, name = 'doc.pdf', fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), name);
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return form;
}

export const DEFAULT_CONFIG = JSON.stringify({ copies: 1, paper: 'A4', color: 'bw', sided: 'single', qualityDpi: 300 });

export function paystackEvent(jobId: string, reference: string, amountKobo: number) {
  const raw = JSON.stringify({
    event: 'charge.success',
    data: { reference, amount: amountKobo, currency: 'NGN', metadata: { type: 'print_job_payment', jobId } },
  });
  const signature = crypto.createHmac('sha512', WEBHOOK_SECRET).update(raw).digest('hex');
  return { raw, headers: { 'x-paystack-signature': signature } };
}

export const DEMO_SHOP = 'campus-print';

let seq = 0;
export async function newCustomer(api: TestApi, label = 'cust', shop: string | null = DEMO_SHOP): Promise<{ email: string; token: string }> {
  const email = `${label}+${Date.now()}${seq++}@example.com`;
  const r = await api.call('POST', '/customer/auth/register', {
    headers: shop ? { 'X-Tenant-Slug': shop } : undefined,
    body: { email, password: 'Str0ng!Passw0rd', firstName: 'Test', lastName: 'User', phoneNumber: '+2348030000000' },
  });
  if (r.status !== 201) throw new Error(`register failed: ${r.status} ${r.text.slice(0, 120)}`);
  return { email, token: await api.login(email, 'Str0ng!Passw0rd') };
}

export async function paidJob(api: TestApi, token: string, pages = 2): Promise<{ id: string; cost: number; code: string }> {
  const up = await api.call('POST', '/customer/print-jobs', {
    token,
    form: pdfForm(await pdfBytes(pages), 'doc.pdf', { printConfiguration: DEFAULT_CONFIG }),
  });
  const job = up.body?.data?.job;
  if (!job) throw new Error(`upload failed: ${up.status} ${up.text.slice(0, 120)}`);
  const ev = paystackEvent(job.id, `ref_${job.id}`, Math.round(Number(job.cost) * 100));
  await api.call('POST', '/webhooks/paystack', { raw: ev.raw, headers: ev.headers });
  const list = await api.call('GET', '/customer/print-jobs', { token });
  const paid = (list.body?.data?.jobs || []).find((j: any) => j.id === job.id);
  return { id: job.id, cost: Number(job.cost), code: paid?.code };
}
