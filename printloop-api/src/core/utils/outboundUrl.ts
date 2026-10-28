import { Config } from '@/config';
import dns from 'node:dns/promises';
import net from 'node:net';

export class UnsafeUrlError extends Error {}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
  return (
    v6 === '::' ||
    v6 === '::1' ||
    v6.startsWith('fc') ||
    v6.startsWith('fd') ||
    v6.startsWith('fe80')
  );
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('Invalid URL');
  }
  const allowPrivate = Config.allowPrivateWebhooks;
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && allowPrivate)) {
    throw new UnsafeUrlError('Webhook URL must use https://');
  }
  if (url.username || url.password) throw new UnsafeUrlError('URL must not contain credentials');
  if (allowPrivate) return url;

  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host)
    ? [host]
    : (await dns.lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addrs.length === 0) throw new UnsafeUrlError(`Cannot resolve ${host}`);
  if (addrs.some(isPrivateIp)) throw new UnsafeUrlError('URL points to a private or internal address');
  return url;
}
