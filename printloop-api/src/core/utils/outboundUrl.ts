import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * Guard for URLs the server calls on a tenant's behalf (webhooks): public
 * hosts only, so a tenant can't aim PrintLoop at internal services or
 * cloud metadata endpoints. Checked at save time and again before each
 * delivery (DNS can change in between).
 */
export class UnsafeUrlError extends Error {}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local / cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224 // multicast / reserved
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
  const prod = process.env.NODE_ENV === 'production';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && !prod)) {
    throw new UnsafeUrlError(prod ? 'Webhook URL must use https://' : 'URL must be http(s)://');
  }
  if (url.username || url.password) throw new UnsafeUrlError('URL must not contain credentials');
  // Local targets are allowed outside production for development.
  if (!prod) return url;

  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host)
    ? [host]
    : (await dns.lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addrs.length === 0) throw new UnsafeUrlError(`Cannot resolve ${host}`);
  if (addrs.some(isPrivateIp)) throw new UnsafeUrlError('URL points to a private or internal address');
  return url;
}
