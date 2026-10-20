const LOCAL: Record<string, string> = {
  LANDING_URL: 'http://localhost:3000',
  CUSTOMER_APP_URL: 'http://localhost:3001',
  SHOP_APP_URL: 'http://localhost:3002',
  BACKOFFICE_URL: 'http://localhost:3003',
};

const pick = (name: string) => (process.env[name] || process.env.FRONTEND_URL || LOCAL[name] || '').replace(/\/+$/, '');

export const appUrls = {
  get landing() {
    return pick('LANDING_URL');
  },
  get customer() {
    return pick('CUSTOMER_APP_URL');
  },
  get shop() {
    return pick('SHOP_APP_URL');
  },
  get backoffice() {
    return pick('BACKOFFICE_URL');
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
  if (local) return process.env.NODE_ENV !== 'production' && (url.protocol === 'http:' || url.protocol === 'https:');
  if (url.protocol !== 'https:') return false;
  const known = [appUrls.landing, appUrls.customer, appUrls.shop, appUrls.backoffice].map(hostOf).filter(Boolean);
  if (known.includes(host)) return true;
  if (customDomain && host === customDomain.toLowerCase()) return true;
  const apexes = (process.env.PRINTLOOP_APEX_DOMAINS || 'printloop.app')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return apexes.some((apex) => host === apex || host.endsWith(`.${apex}`));
}
