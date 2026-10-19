import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../entities/user.entity';
import { TenantMemberRole } from '../entities/tenantMember.entity';

export enum Permission {
  VIEW_DASHBOARD = 'view_dashboard',

  VIEW_KIOSKS = 'view_kiosks',
  MANAGE_KIOSKS = 'manage_kiosks',

  VIEW_JOBS = 'view_jobs',
  REQUEUE_JOBS = 'requeue_jobs',
  CANCEL_JOBS = 'cancel_jobs',

  VIEW_PRICING = 'view_pricing',
  MANAGE_PRICING = 'manage_pricing',

  VIEW_PROMOTIONS = 'view_promotions',
  MANAGE_PROMOTIONS = 'manage_promotions',

  MANAGE_BLOG = 'manage_blog',

  VIEW_TRANSACTIONS = 'view_transactions',
  ISSUE_REFUNDS = 'issue_refunds',

  VIEW_USERS = 'view_users',
  MANAGE_USERS = 'manage_users',
  BLOCK_USERS = 'block_users',

  VIEW_REPORTS = 'view_reports',
  EXPORT_REPORTS = 'export_reports',

  VIEW_SETTINGS = 'view_settings',
  MANAGE_SETTINGS = 'manage_settings',
  MANAGE_ROLES = 'manage_roles',

  VIEW_AUDIT_LOG = 'view_audit_log',

  SUPER_ADMIN = 'super_admin',
}

export interface AuthedAdmin {
  id: string;
  userId: string;
  role: UserRole;
  permissions: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AuthedAdmin;
    }
  }
}

function permissionsForUser(user: any): string[] {
  if (!user) return [];
  if (user.role === UserRole.SUPER_ADMIN) {
    return Object.values(Permission);
  }
  if (user.role === UserRole.ADMIN) {
    return Array.isArray(user.adminPrivileges) ? user.adminPrivileges : [];
  }
  return [];
}

export const requirePermission = (...required: Permission[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;

    if (!user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
      return;
    }

    const permissions = permissionsForUser(user);
    const isSuper = user.role === UserRole.SUPER_ADMIN;

    if (!isSuper) {
      const missing = required.filter((p) => !permissions.includes(p));
      if (missing.length > 0) {
        res.status(403).json({
          success: false,
          message: 'Insufficient permissions',
          required,
          missing,
        });
        return;
      }
    }

    if (!isSuper && req.tenant) {
      const memberships = req.tenantMemberships || [];
      const hasMembership = memberships.some(
        (m) => m.tenantId === req.tenant!.id,
      );
      if (!hasMembership) {
        res.status(403).json({
          success: false,
          message: 'Not a member of this tenant',
          code: 'NOT_TENANT_MEMBER',
        });
        return;
      }
    }

    req.admin = {
      id: user.id,
      userId: user.id,
      role: user.role,
      permissions,
    };

    next();
  };
};

export const requireTenantMembership = (
  ...allowedRoles: TenantMemberRole[]
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }
    if (!req.tenant) {
      res.status(400).json({
        success: false,
        message: 'Tenant could not be resolved for this request',
      });
      return;
    }
    if (user.role === UserRole.SUPER_ADMIN) {
      next();
      return;
    }
    const memberships = req.tenantMemberships || [];
    const membership = memberships.find(
      (m) => m.tenantId === req.tenant!.id,
    );
    if (!membership) {
      res.status(403).json({
        success: false,
        message: 'Not a member of this tenant',
        code: 'NOT_TENANT_MEMBER',
      });
      return;
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(membership.role)) {
      res.status(403).json({
        success: false,
        message: `Tenant role '${membership.role}' is not authorised; need one of ${allowedRoles.join(', ')}`,
        code: 'INSUFFICIENT_TENANT_ROLE',
      });
      return;
    }
    next();
  };
};
