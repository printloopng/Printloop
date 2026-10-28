import { Config } from '@/config';
export const appUrls = {
  get landing() {
    return Config.urls.landing;
  },
  get customer() {
    return Config.urls.customer;
  },
  get shop() {
    return Config.urls.shop;
  },
  get backoffice() {
    return Config.urls.backoffice;
  },
};

function hostOf(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isTrustedReturnUrl(value: unknown, customDomain?: string | null): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const local = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
  if (local) return Config.nodeEnv !== 'production' && (url.protocol === 'http:' || url.protocol === 'https:');
  if (url.protocol !== 'https:') return false;
  const known = [appUrls.landing, appUrls.customer, appUrls.shop, appUrls.backoffice].map(hostOf).filter(Boolean);
  if (known.includes(host)) return true;
  if (customDomain && host === customDomain.toLowerCase()) return true;
  return Config.apexDomains.some((apex) => host === apex || host.endsWith(`.${apex}`));
}
