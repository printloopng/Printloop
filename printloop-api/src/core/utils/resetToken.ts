import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const RESET_TTL_MS = 60 * 60 * 1000;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const OTP_TTL_MS = 30 * 60 * 1000;

export function mintToken(ttlMs = RESET_TTL_MS): { token: string; expiresAtMs: number } {
  const secret = randomBytes(32).toString('hex');
  const expiresAtMs = Date.now() + ttlMs;
  return { token: `${secret}.${expiresAtMs}`, expiresAtMs };
}

export function mintOtp(ttlMs = OTP_TTL_MS): { code: string; stored: string } {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  return { code, stored: `${code}.${Date.now() + ttlMs}` };
}

export function parseToken(token: string): { secret: string; expiresAtMs: number } | null {
  if (typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;
  const secret = token.slice(0, dot);
  const expiresAtMs = Number(token.slice(dot + 1));
  if (!secret || !Number.isFinite(expiresAtMs)) return null;
  return { secret, expiresAtMs };
}

export function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

export function verifyStoredToken(stored: string | null | undefined, presented: string): boolean {
  const s = parseToken(String(stored || ''));
  if (!s || s.expiresAtMs < Date.now()) return false;
  const p = parseToken(presented);
  const secret = p ? p.secret : presented;
  return secretsMatch(s.secret, secret);
}
