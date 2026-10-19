import { AppDataSource } from '../config/database';
import { Tenant, TenantStatus } from '../entities/tenant.entity';
import { TenantMember } from '../entities/tenantMember.entity';
import { TenantBranding } from '../entities/tenantBranding.entity';
import { TenantBalance } from '../entities/tenantBalance.entity';
import { User } from '../entities/user.entity';
import { Wallet } from '../entities/wallet.entity';
import { Kiosk } from '../entities/kiosk.entity';
import { PrintJob } from '../entities/printJob.entity';
import { PrintJobItem } from '../entities/printJobItem.entity';
import { Payment } from '../entities/payment.entity';
import { Transaction } from '../entities/transaction.entity';
import { File } from '../entities/file.entity';
import { PricingConfig } from '../entities/pricingConfig.entity';
import { Promotion } from '../entities/promotion.entity';
import { GroupSession } from '../entities/groupSession.entity';
import { GroupParticipant } from '../entities/groupParticipant.entity';
import { Payout } from '../entities/payout.entity';
import { PayoutSchedule } from '../entities/payoutSchedule.entity';
import { AuditLog } from '../entities/auditLog.entity';

export async function closeTenant(
  tenantId: string,
  reason: string,
): Promise<Tenant> {
  const repo = AppDataSource.getRepository(Tenant);
  const tenant = await repo.findOne({ where: { id: tenantId } });
  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
  tenant.status = TenantStatus.CLOSED;
  tenant.suspendReason = reason || 'Closed by owner';
  tenant.suspendedAt = tenant.suspendedAt ?? new Date();
  return repo.save(tenant);
}

export interface HardDeleteResult {
  tenantId: string;
  deleted: Record<string, number>;
}

export async function hardDeleteTenant(
  tenantId: string,
  opts?: { force?: boolean },
): Promise<HardDeleteResult> {
  const ds = AppDataSource;
  const tenant = await ds.getRepository(Tenant).findOne({
    where: { id: tenantId },
  });
  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

  if (tenant.status !== TenantStatus.CLOSED && !opts?.force) {
    throw new Error(
      `Tenant ${tenantId} must be CLOSED before hard-delete. Call closeTenant first or pass force=true.`,
    );
  }
  if (tenant.suspendedAt && !opts?.force) {
    const ageMs = Date.now() - new Date(tenant.suspendedAt).getTime();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    if (ageMs < thirtyDays) {
      throw new Error(
        `Tenant ${tenantId} is in the 30-day cooling-off window. Pass force=true to override.`,
      );
    }
  }

  const balance = await ds
    .getRepository(import('../entities/tenantBalance.entity').then((m) => m.TenantBalance) as any)
    .findOne({ where: { tenantId } })
    .catch(() => null);
  if (!opts?.force && balance && Number(balance.availableBalance) > 0) {
    throw new Error(
      `Tenant ${tenantId} has ₦${balance.availableBalance} outstanding. Pay out or force=true.`,
    );
  }

  const deleted: Record<string, number> = {};

  const sessions = await ds
    .getRepository(GroupSession)
    .find({ where: { tenantId } as any });
  const sessionIds = sessions.map((s) => s.id);
  if (sessionIds.length) {
    const r = await ds
      .getRepository(GroupParticipant)
      .createQueryBuilder()
      .delete()
      .from(GroupParticipant)
      .where('groupSessionId IN (:...ids)', { ids: sessionIds })
      .execute();
    deleted.groupParticipants = r.affected ?? 0;
  }

  for (const Repo of [
    AuditLog,
    Promotion,
    PricingConfig,
    File,
    Transaction,
    Payment,
    PrintJobItem,
    PrintJob,
    Kiosk,
    Wallet,
    User,
    Payout,
    PayoutSchedule,
    GroupSession,
    TenantBalance,
    TenantBranding,
    TenantMember,
  ] as any[]) {
    const r = await ds
      .getRepository(Repo)
      .createQueryBuilder()
      .delete()
      .where('tenantId = :tid', { tid: tenantId })
      .execute();
    deleted[Repo.name] = r.affected ?? 0;
  }

  await ds.getRepository(Tenant).delete({ id: tenantId });
  deleted.Tenant = 1;

  return { tenantId, deleted };
}
