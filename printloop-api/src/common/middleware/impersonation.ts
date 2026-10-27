import { Request } from 'express';
import { UserRole } from '@/database/entities/user.entity';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      impersonatingTenantId?: string;
    }
  }
}

export function isPlatformStaff(req: Request): boolean {
  const user = (req as any).user;
  return user?.role === UserRole.SUPER_ADMIN && !req.impersonatingTenantId;
}

const SUPPORT_BLOCKED: Array<{ methods: string[] | null; path: RegExp }> = [
  { methods: null, path: /^\/api\/saas\/me\/2fa(\/|$)/ },
  { methods: null, path: /^\/api\/customer\/auth\/(password|export)$/ },
  { methods: ['PUT', 'PATCH', 'DELETE'], path: /^\/api\/customer\/auth\/me$/ },
  { methods: ['DELETE'], path: /^\/api\/saas\/me$/ },
  { methods: null, path: /^\/api\/saas\/setup(\/|$)/ },
  { methods: null, path: /^\/api\/saas\/payouts\/instant$/ },
];

export function isBlockedInSupportSession(req: Request): boolean {
  if (!req.impersonatingTenantId) return false;
  const path = req.originalUrl.split('?')[0].replace(/\/+$/, '');
  return SUPPORT_BLOCKED.some((rule) => rule.path.test(path) && (!rule.methods || rule.methods.includes(req.method)));
}
