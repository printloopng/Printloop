import crypto from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { API_URL, APPS, WEBHOOK_SECRET } from "../playwright.config";

export const STUDENT = { email: "student@printloop.test", password: "Password1!" };
export const SHOP_OWNER = { email: "ops@printloop.test", password: "Admin1234!" };
export const ADMIN = { email: "admin@printloop.test", password: "Admin1234!" };

export async function pdf(pages: number, title = "PrintLoop test"): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`${title} · page ${i + 1}`, { x: 60, y: 760, size: 18, font });
    page.drawText("The quick brown fox jumps over the lazy dog.", { x: 60, y: 720, size: 12, font });
  }
  return Buffer.from(await doc.save());
}

export async function signIn(page: Page, app: keyof typeof APPS, who: { email: string; password: string }, next = "/") {
  await page.goto(`${APPS[app]}/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password", { exact: true }).fill(who.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

export async function payJob(jobId: string, amountNaira: number) {
  const raw = JSON.stringify({
    event: "charge.success",
    data: {
      reference: `e2e_${jobId}_${Date.now()}`,
      amount: Math.round(amountNaira * 100),
      currency: "NGN",
      metadata: { type: "print_job_payment", jobId },
    },
  });
  const signature = crypto.createHmac("sha512", WEBHOOK_SECRET).update(raw).digest("hex");
  const res = await fetch(`${API_URL}/api/webhooks/paystack`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-paystack-signature": signature },
    body: raw,
  });
  expect(res.ok).toBeTruthy();
}

export async function apiLogin(who: { email: string; password: string }): Promise<string> {
  const res = await fetch(`${API_URL}/api/customer/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(who),
  });
  const body = await res.json();
  return body.data.tokens.accessToken as string;
}

export async function api<T = any>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${path}: ${res.status} ${body?.message}`);
  return body.data as T;
}

export async function seedNearbyShops() {
  await fetch(`${API_URL}/api/discovery/shops/seed-demo-nearby`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lat: 6.5158, lng: 3.3898 }),
  });
}
