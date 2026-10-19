import type { Request } from 'express';
import { AppDataSource } from '../config/database';
import { AuditLog } from '../entities/auditLog.entity';

export async function writeAudit(
  req: Request,
  action: string,
  target: string,
  detail?: any,
): Promise<void> {
  try {
    const repo = AppDataSource.getRepository(AuditLog);
    const user = (req as any).user;
    let actorName = user
      ? `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
        (user.email || 'admin')
      : 'system';
    const memberships = req.tenantMemberships;
    const impersonatorId = (req as any).impersonatingActorUserId;
    if (impersonatorId) {
      actorName = `${actorName} [impersonated by platform:${impersonatorId}]`;
    }
    void memberships;
    await repo.save(
      repo.create({
        tenantId: req.tenant?.id ?? null,
        actorId: (req as any).admin?.id || user?.id || null,
        actorName,
        action,
        target,
        detail: detail ?? null,
        ipAddress: req.ip || (req.socket as any)?.remoteAddress || null,
      } as any),
    );
  } catch (err) {
    console.error('Audit write failed:', err);
  }
}
