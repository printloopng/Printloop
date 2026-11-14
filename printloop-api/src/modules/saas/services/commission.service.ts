import { Tenant } from '@/database/entities/tenant.entity';
import { SystemSetting } from '@/database/entities/systemSetting.entity';
import { AppDataSource } from '@/config/data-source';
import { Config } from '@/config';

export const COMMISSION_SETTING_KEY = 'commissionPctDefault';
export const MAX_COMMISSION_RATE = 0.5;
const REFRESH_AFTER_MS = 15_000;

let platformRate = Config.commissionPctDefault;
let loadedAt = 0;
let refreshing: Promise<void> | null = null;

export function refreshPlatformCommissionRate(): Promise<void> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const row = await AppDataSource.getRepository(SystemSetting).findOne({ where: { key: COMMISSION_SETTING_KEY } });
        const percent = row ? Number(row.value) : NaN;
        platformRate = Number.isFinite(percent) ? clampRate(percent / 100) : Config.commissionPctDefault;
        loadedAt = Date.now();
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

export function platformCommissionRate(): number {
  if (Date.now() - loadedAt > REFRESH_AFTER_MS) void refreshPlatformCommissionRate().catch(() => undefined);
  return platformRate;
}

export function effectiveCommissionRate(tenant: Pick<Tenant, 'commissionPct'>): number {
  const own = tenant.commissionPct === null || tenant.commissionPct === undefined ? null : Number(tenant.commissionPct);
  return clampRate(own !== null && Number.isFinite(own) ? own : platformCommissionRate());
}

export interface CommissionSplit {
  
  grossAmount: number;
  
  commissionAmount: number;
  
  tenantNetAmount: number;
  
  rateUsed: number;
}

export function computeCommissionSplit(
  tenant: Tenant,
  grossAmount: number,
): CommissionSplit {
  if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
    throw new Error(`Invalid gross amount: ${grossAmount}`);
  }
  const rate = effectiveCommissionRate(tenant);
  const commissionRaw = grossAmount * rate;
  const commissionAmount = round2(commissionRaw);
  const tenantNetAmount = round2(grossAmount - commissionAmount);
  return {
    grossAmount: round2(grossAmount),
    commissionAmount,
    tenantNetAmount,
    rateUsed: rate,
  };
}

export function commissionInKobo(split: CommissionSplit): number {
  return Math.floor(split.commissionAmount * 100);
}

export function tenantNetFromTransaction(
  grossAmount: number,
  commissionAmount: number,
): number {
  return round2(grossAmount - commissionAmount);
}

function clampRate(rate: number): number {
  if (!Number.isFinite(rate) || rate < 0) return 0;
  if (rate > MAX_COMMISSION_RATE) return MAX_COMMISSION_RATE;
  return rate;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
