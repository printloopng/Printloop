import crypto from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { API_URL, APPS, WEBHOOK_SECRET } from "../playwright.config";

export const STUDENT = { email: "student@printloop.test", password: "Password1!" };
export const SHOP_OWNER = { email: "owner@printloop.test", password: "Admin1234!" };
export const SHOP_ADMIN = { email: "ops@printloop.test", password: "Admin1234!" };
export const STAFF = { email: "admin@printloop.test", password: "Admin1234!" };
export const DEMO_SHOP = "campus-print";

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

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function totp(secret: string, atMs = Date.now()): string {
  let bits = "";
  for (const ch of secret.replace(/=+$/, "").toUpperCase()) bits += BASE32.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 30_000)));
  const mac = crypto.createHmac("sha1", key).update(counter).digest();
  const offset = mac[mac.length - 1] & 0xf;
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

export async function signIn(page: Page, app: keyof typeof APPS, who: { email: string; password: string; totpSecret?: string }, next = "/") {
  page.on("response", async (res) => {
    if (res.url().endsWith("/api/auth/login")) console.log("LOGIN", who.email, res.status(), (await res.text().catch(() => "")).slice(0, 200));
  });
  await page.goto(`${APPS[app]}/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password", { exact: true }).fill(who.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  if (who.totpSecret) {
    await page.getByLabel("Authenticator code").fill(totp(who.totpSecret));
    await page.getByRole("button", { name: /sign in/i }).click();
  }
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

export async function signUpShop(name: string): Promise<{ slug: string; id: string; email: string }> {
  const suffix = Date.now().toString(36);
  const slug = `e2e-${suffix}`;
  const email = `owner-${suffix}@example.com`;
  const res = await fetch(`${API_URL}/api/saas/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ businessName: name, slug, ownerFirstName: "E2E", ownerLastName: "Owner", ownerEmail: email, ownerPhone: "+2348031234567", ownerPassword: "Str0ng!Passw0rd", address: "Yaba, Lagos" }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`signup failed: ${res.status} ${body?.message}`);
  return { slug, id: body.data.tenantId, email };
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
