import { Config } from '@/config';
import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '@/config/data-source';
import { Tenant, TenantStatus } from '@/database/entities/tenant.entity';
import { UserRole } from '@/database/entities/user.entity';
import { TenantMemberRole } from '@/database/entities/tenantMember.entity';
import { isPlatformStaff } from '@/common/middleware/impersonation';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenant?: Tenant;
    }
  }
}

export const resolveTenant = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const scoped = req.impersonatingTenantId ?? null;
    const slug = scoped ? null : pickTenantSlug(req);
    const customDomain = scoped ? null : pickCustomDomain(req);
    const requestedExplicitTenant = Boolean(slug || customDomain);
    const authenticatedTenantId = scoped ?? pickAuthenticatedTenantId(req);

    const repo = AppDataSource.getRepository(Tenant);
    let tenant: Tenant | null = null;

    if (customDomain) {
      tenant = await repo.findOne({ where: { customDomain } });
    }
    if (!tenant && slug) {
      tenant = await repo.findOne({ where: { slug } });
    }
    if (!tenant && requestedExplicitTenant) {
      res.status(404).json({
        success: false,
        message: 'Tenant not found',
      });
      return;
    }
    if (!tenant && authenticatedTenantId) {
      tenant = await repo.findOne({ where: { id: authenticatedTenantId } });
    }
    if (
      tenant &&
      authenticatedTenantId &&
      !requestCanAccessTenant(req, tenant)
    ) {
      const ownTenant = await repo.findOne({ where: { id: authenticatedTenantId } });
      if (ownTenant) tenant = ownTenant;
    }
    if (!tenant) {
      res.status(400).json({
        success: false,
        message: 'Choose a print shop first.',
        code: 'TENANT_REQUIRED',
      });
      return;
    }

    if (tenant.status === TenantStatus.SUSPENDED) {
      res.status(403).json({
        success: false,
        message: 'Tenant is suspended',
        reason: tenant.suspendReason ?? undefined,
      });
      return;
    }

    if (tenant.status === TenantStatus.CLOSED) {
      res.status(410).json({
        success: false,
        message: 'Tenant has been closed',
      });
      return;
    }

    if (!requestCanAccessTenant(req, tenant)) {
      res.status(403).json({
        success: false,
        message: 'Not a member of this tenant',
        code: 'NOT_TENANT_MEMBER',
      });
      return;
    }

    req.tenant = tenant;
    next();
  } catch (error) {
    console.error('Tenant middleware error:', error);
    res.status(500).json({ success: false, message: 'Tenant resolution failed' });
  }
};

export const optionalTenant = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const slug = pickTenantSlug(req);
    const customDomain = pickCustomDomain(req);
    if (!slug && !customDomain) return next();
    const repo = AppDataSource.getRepository(Tenant);
    const tenant =
      (customDomain && (await repo.findOne({ where: { customDomain } }))) ||
      (slug && (await repo.findOne({ where: { slug } })));
    if (
      tenant &&
      tenant.status !== TenantStatus.SUSPENDED &&
      tenant.status !== TenantStatus.CLOSED &&
      requestCanAccessTenant(req, tenant)
    ) {
      req.tenant = tenant;
    }
    next();
  } catch {
    next();
  }
};

export function tenantRoleOf(req: Request, tenantId: string): TenantMemberRole | null {
  const user = (req as any).user;
  if (!user) return null;
  if (isPlatformStaff(req)) return TenantMemberRole.OWNER;
  const memberships = (req.tenantMemberships || []).filter((m) => m.tenantId === tenantId);
  const order = [TenantMemberRole.OWNER, TenantMemberRole.ADMIN, TenantMemberRole.STAFF];
  const best = order.find((r) => memberships.some((m) => m.role === r));
  return best ?? null;
}

export const requireTenantRole =
  (...roles: TenantMemberRole[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    const tenantId = req.tenant?.id;
    if (isPlatformStaff(req)) return next();
    const memberships = (req.tenantMemberships || []).filter((m) => m.tenantId === tenantId);
    if (memberships.some((m) => roles.includes(m.role))) return next();
    res.status(403).json({
      success: false,
      message: 'Only the shop owner or an admin can do this.',
      code: 'TENANT_ROLE_REQUIRED',
    });
  };

export function requestCanAccessTenant(req: Request, tenant: Tenant): boolean {
  const user = (req as any).user;
  if (!user) return true;
  if (isPlatformStaff(req)) return true;

  const isCustomerRoute = 
    req.baseUrl.startsWith('/api/customer') || 
    req.baseUrl.startsWith('/api/wallet') || 
    req.baseUrl.startsWith('/api/payments') ||
    req.baseUrl.startsWith('/api/groups') ||
    req.path.startsWith('/customer') ||
    req.path.startsWith('/wallet') ||
    req.path.startsWith('/payments');

  if (isCustomerRoute) {
    return true;
  }

  if (user.role === UserRole.USER) {
    return false;
  }

  const memberships = req.tenantMemberships || [];
  return memberships.some((m) => m.tenantId === tenant.id);
}

function pickAuthenticatedTenantId(req: Request): string | null {
  const user = (req as any).user;
  const memberships = req.tenantMemberships ?? [];
  if (user?.tenantId && memberships.some((m) => m.tenantId === user.tenantId)) return user.tenantId;
  if (user?.tenantId && user.role === UserRole.USER) return user.tenantId;
  return memberships[0]?.tenantId ?? null;
}

function pickTenantSlug(req: Request): string | null {
  const host = (req.header('host') || '').toLowerCase().split(':')[0];
  const apex = ownedApexForHost(host);
  if (host && apex && host !== apex) {
    const suffix = `.${apex}`;
    const sub = host.endsWith(suffix) ? host.slice(0, -suffix.length) : '';
    if (sub && sub !== 'www' && sub !== 'api') {
      return sub;
    }
  }

  const header = (req.header('x-tenant-slug') || '').toLowerCase().trim();
  if (header) return header;

  return null;
}

function pickCustomDomain(req: Request): string | null {
  const host = (req.header('host') || '').toLowerCase().split(':')[0];
  return customDomainOf(host) ?? customDomainOf((req.header('x-tenant-domain') || '').toLowerCase().trim());
}

function customDomainOf(host: string): string | null {
  if (!host || isApexOrLocal(host)) return null;
  const ourApexes = configuredApexes();
  if (ourApexes.some((apex) => host === apex || host.endsWith('.' + apex))) {
    return null;
  }
  return host;
}

function configuredApexes(): string[] {
  return Config.apexDomains;
}

function ownedApexForHost(host: string): string | null {
  if (!host || isLocalHost(host)) return null;
  return configuredApexes().find((apex) => host.endsWith(`.${apex}`)) ?? null;
}

function isApexOrLocal(host: string): boolean {
  return isLocalHost(host) || configuredApexes().includes(host);
}

function isLocalHost(host: string): boolean {
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}
