import { repos } from '@/config/repos';
import { Tenant, TenantStatus } from '@/database/entities/tenant.entity';

export async function closeTenant(
  tenantId: string,
  reason: string,
): Promise<Tenant> {
  const repo = repos.tenant();
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
  const tenant = await repos.tenant().findOne({
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

  const balance = await repos.tenantBalance().findOne({ where: { tenantId } });
  if (!opts?.force && balance && Number(balance.availableBalance) > 0) {
    throw new Error(
      `Tenant ${tenantId} has ₦${balance.availableBalance} outstanding. Pay out or force=true.`,
    );
  }

  const deleted = await repos.tenant().hardDeleteAllData(tenantId);
  return { tenantId, deleted };
}
