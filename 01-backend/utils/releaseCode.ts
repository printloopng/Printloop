import crypto from 'node:crypto';

export const RELEASE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeCode(n = 6): string {
  const b = crypto.randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += RELEASE_CODE_ALPHABET[b[i] % RELEASE_CODE_ALPHABET.length];
  return s;
}
